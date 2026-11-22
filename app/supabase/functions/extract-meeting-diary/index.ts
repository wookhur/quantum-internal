// Supabase Edge Function: extract-meeting-diary
// Takes a meeting-summary-report URL or pasted text and asks Claude to
// summarize it into the 9 Meeting-Diary fields used by Student 360.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `당신은 한국 교육 컨설팅 회사의 미팅 요약 보고서 분석가입니다.
주어진 미팅 요약 텍스트를 10개 항목으로 짧게 요약하여 JSON으로만 반환하세요.

필드(영어 키 그대로 사용):
- agendaItems: 미팅 안건
- meetingSummary: 미팅 전반 요약
- extracurricularNotes: 비교과 활동(Extracurricular Development) 관련 내용
- identityNarrativeNotes: 학생 정체성·서사(Identity & Narrative Development) 관련 내용
- questionsConcerns: 질문·우려사항
- nextMeetingAgenda: 다음 미팅 안건
- followUpCommitments: 후속 약속/이행 사항
- assignments: 학생/학부모에게 배정된 과제
- criticalDates: 중요 일정·마감일
- criticalIssue: 리스크·이슈·에스컬레이션 (즉시 관리가 필요한 중요 문제. 없으면 빈 문자열)

규칙:
1. 응답은 반드시 유효한 JSON만 포함. 코드펜스/설명 텍스트 금지.
2. 각 필드 값은 한국어, 간결한 요약문(불릿 또는 1~3문장). 디테일은 줄여서.
3. 해당 내용이 없으면 빈 문자열 "".
4. 키는 위 영어 키 그대로 사용.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractGoogleDocId(url: string): string | null {
  // https://docs.google.com/document/d/<ID>/...
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

function extractDriveFileId(url: string): string | null {
  // https://drive.google.com/file/d/<ID>/view  or  ?id=<ID>
  const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m2 ? m2[1] : null
}

async function fetchGoogleDocText(docId: string): Promise<string | null> {
  // Works only when the doc is shared "Anyone with the link".
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`
  try {
    const res = await fetch(exportUrl, { redirect: 'follow' })
    if (!res.ok) return null
    const txt = await res.text()
    // If the response is the Google sign-in page, treat as failure.
    if (txt.includes('<html') && txt.toLowerCase().includes('sign in')) return null
    return txt
  } catch {
    return null
  }
}

function toBase64(buf: Uint8Array): string {
  // 한 번에 String.fromCharCode(...buf) 를 쓰면 큰 파일에서 스택이 터진다
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** 드라이브에서 받은 바이트가 무엇인지. 사인인 페이지를 파일로 착각하지 않게 가려낸다. */
function sniff(buf: Uint8Array): 'pdf' | 'png' | 'jpeg' | 'html' | 'other' {
  const b = (i: number) => buf[i]
  if (buf.length >= 4 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'pdf'  // %PDF
  if (buf.length >= 4 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png'
  if (buf.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg'
  const head = new TextDecoder().decode(buf.subarray(0, 200)).trim().toLowerCase()
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html'
  return 'other'
}

interface DriveFile { kind: 'pdf' | 'png' | 'jpeg'; base64: string }

/**
 * 드라이브 파일을 받아 온다.
 *
 * 'Anyone with the link' 로 공유돼 있어야 한다. 그렇지 않으면 구글이 파일 대신
 * 로그인 페이지(HTML)를 200 으로 돌려주는데, 종전에는 그걸 그대로 PDF 라고
 * 적어 Claude 에 보냈다 — 그래서 돌아온 것이 400 이었다.
 */
async function fetchDriveFile(fileId: string): Promise<DriveFile | null> {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    const kind = sniff(buf)
    if (kind === 'html' || kind === 'other') return null
    return { kind, base64: toBase64(buf) }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json().catch(() => ({}))
    let { text, url } = (body || {}) as { text?: string; url?: string }
    let file: DriveFile | null = null

    if (!text && url) {
      const docId = extractGoogleDocId(url)
      if (docId) {
        const fetched = await fetchGoogleDocText(docId)
        if (fetched) text = fetched
      }
      if (!text) {
        const driveId = extractDriveFileId(url)
        if (driveId) {
          file = await fetchDriveFile(driveId)
          // 드라이브에 담긴 구글 문서는 uc?export=download 로 안 나온다 —
          // 같은 id 로 문서 내보내기를 한 번 더 두드려 본다.
          if (!file) {
            const asDoc = await fetchGoogleDocText(driveId)
            if (asDoc) text = asDoc
          }
        }
      }
    }

    if (!text && !file) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            '링크에서 보고서를 읽지 못했습니다. 구글 문서·드라이브 링크를 ' +
            '"링크가 있는 모든 사용자"로 공유했는지 확인해 주세요. ' +
            '(공유 설정을 바꾸기 어려우면 아래 칸에 본문을 붙여넣으셔도 됩니다.)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userContent: unknown[] = []
    if (file) {
      // 보고서를 캡처해 올리는 경우가 있어 이미지도 받는다
      if (file.kind === 'pdf') {
        userContent.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.base64 },
        })
      } else {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: `image/${file.kind}`, data: file.base64 },
        })
      }
      userContent.push({
        type: 'text',
        text: '위 파일은 한 학생의 미팅 요약 보고서입니다. 10개 항목으로 요약해 JSON으로 반환해주세요.',
      })
    } else {
      const truncated = (text || '').slice(0, 30000)
      userContent.push({ type: 'text', text: truncated })
    }

    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: apiBody,
    })

    if (!response.ok) {
      // 상태 코드만 돌려주면 무엇이 잘못됐는지 알 길이 없다 — 본문을 함께 싣는다
      const err = await response.text()
      let detail = err.slice(0, 600)
      try {
        const parsed = JSON.parse(err) as { error?: { message?: string } }
        if (parsed?.error?.message) detail = parsed.error.message
      } catch { /* 본문이 JSON 이 아니면 그대로 쓴다 */ }
      console.error('Anthropic error', response.status, err.slice(0, 1000))
      return new Response(
        JSON.stringify({ ok: false, error: `Claude API ${response.status}: ${detail}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text || ''
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let diary: Record<string, string>
    try {
      diary = JSON.parse(cleaned)
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Claude did not return valid JSON', raw }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ ok: true, diary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
