// Supabase Edge Function: extract-meeting-diary
// 미팅 리포트(PDF url 또는 텍스트)에서 '미팅 다이어리' 6개 섹션을 자동 정리.
// 응답: { ok: true, diary: { ...6 fields } }
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// 미팅 다이어리 6개 섹션 구조
const SYSTEM_PROMPT = `당신은 미국/영국 대학 입시 컨설팅 회사의 미팅 리포트를 바탕으로 '미팅 다이어리'를 자동 정리하는 전문가입니다.
주어진 미팅 리포트(텍스트 또는 PDF)에서 아래 6개 섹션을 추출·요약하여 JSON으로 반환하세요.

필드(정확히 이 key로):
- meetingSummary: (Meeting Summary) 미팅 전체 요약 — 핵심 논의·결정사항을 3~6문장으로.
- questionsConcerns: (QnA) 미팅 중 오간 질문과 답변. 학생/학부모의 질문과 컨설턴트의 답변을 정리.
- criticalIssue: (Concerns) 우려사항·리스크·주의가 필요한 이슈.
- assignments: (Assignments) 학생에게 부여된 과제/할 일. 항목이 여러 개면 각 항목을 줄바꿈(\\n)으로 구분.
- followUpCommitments: (Follow-up Commitments) 후속 약속·컨설턴트가 하기로 한 것. 항목이 여러 개면 각 항목을 줄바꿈(\\n)으로 구분.
- nextMeetingAgenda: (Next Meeting Agenda) 다음 미팅 안건/논의 예정 사항.

규칙:
1. 반드시 유효한 JSON만 반환하세요. 다른 텍스트/설명은 포함하지 마세요.
2. 해당 내용이 리포트에 없으면 빈 문자열("")로 두세요.
3. assignments와 followUpCommitments는 항목별로 줄바꿈(\\n)으로 나누세요(체크리스트로 변환됩니다).
4. 원문 언어(한국어/영어)를 유지하되 간결하게 정리하세요.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMPTY_DIARY = {
  meetingSummary: '', questionsConcerns: '', criticalIssue: '',
  assignments: '', followUpCommitments: '', nextMeetingAgenda: '',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    if (!ANTHROPIC_API_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, 500)

    const { url, text } = await req.json()

    // 입력 구성: text 우선, 없으면 url(PDF)을 document 블록으로 전달
    let userContent: unknown[]
    if (text && typeof text === 'string' && text.trim()) {
      userContent = [{ type: 'text', text: `다음 미팅 리포트에서 6개 섹션을 정리해주세요:\n\n${text.slice(0, 20000)}` }]
    } else if (url && typeof url === 'string') {
      const res = await fetch(url)
      if (!res.ok) return json({ ok: false, error: `리포트 파일을 불러오지 못했습니다 (${res.status})` }, 400)
      const bytes = new Uint8Array(await res.arrayBuffer())
      const isPdf = url.toLowerCase().split('?')[0].endsWith('.pdf') || bytes[0] === 0x25 /* % */
      if (!isPdf) return json({ ok: false, error: 'PDF 링크만 자동 분석할 수 있습니다. 텍스트를 직접 붙여넣어 주세요.' }, 400)
      userContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } },
        { type: 'text', text: '위 미팅 리포트 PDF에서 6개 섹션을 정리해주세요.' },
      ]
    } else {
      return json({ ok: false, error: 'url 또는 text 중 하나가 필요합니다.' }, 400)
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250627',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return json({ ok: false, error: `Claude API error: ${response.status}`, details: errorText }, 502)
    }

    const result = await response.json()
    const content = result.content?.[0]?.text || '{}'
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

    let extracted: Record<string, string>
    try { extracted = JSON.parse(jsonStr) } catch { extracted = { ...EMPTY_DIARY, meetingSummary: content.slice(0, 800) } }

    // 6개 필드만 정규화해서 반환
    const diary = { ...EMPTY_DIARY }
    for (const k of Object.keys(EMPTY_DIARY) as (keyof typeof EMPTY_DIARY)[]) {
      const v = extracted[k]
      diary[k] = typeof v === 'string' ? v : (v ? String(v) : '')
    }
    return json({ ok: true, diary })
  } catch (error) {
    return json({ ok: false, error: (error as Error)?.message || 'Internal server error' }, 500)
  }
})
