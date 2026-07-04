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

async function fetchDrivePdfBase64(fileId: string): Promise<string | null> {
  // Works only when the file is shared "Anyone with the link".
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    // Quick PDF sniff
    if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50) return null // %P
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    return btoa(bin)
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
    let pdfBase64: string | null = null

    if (!text && url) {
      const docId = extractGoogleDocId(url)
      if (docId) {
        const fetched = await fetchGoogleDocText(docId)
        if (fetched) text = fetched
      }
      if (!text) {
        const driveId = extractDriveFileId(url)
        if (driveId) pdfBase64 = await fetchDrivePdfBase64(driveId)
      }
    }

    if (!text && !pdfBase64) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'Could not read the report from URL. Make sure the Google Doc/Drive link is shared as "Anyone with the link", or paste the text directly.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userContent: unknown[] = []
    if (pdfBase64) {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      })
      userContent.push({
        type: 'text',
        text: '위 PDF는 한 학생의 미팅 요약 보고서입니다. 10개 항목으로 요약해 JSON으로 반환해주세요.',
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
      const err = await response.text()
      return new Response(
        JSON.stringify({ ok: false, error: `Claude API ${response.status}: ${err.slice(0, 500)}` }),
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
