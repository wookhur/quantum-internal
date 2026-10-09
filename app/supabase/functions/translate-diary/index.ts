// Supabase Edge Function: translate-diary
// 한국어로 쓰인 미팅일지 항목들을 영어로 옮긴다.
// 읽는 사람은 해외 멘토·에디터 — 사내 기록이므로 입시 실무 용어는 그대로 둔다.
//
// 요청:  { fields: { meetingSummary: "...", ... }, target?: "en" }
// 응답:  { ok: true, translation: { meetingSummary: "...", ... }, model: "..." }

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// 번역 대상 칸 — 앱의 DIARY_TRANSLATABLE_KEYS 와 같아야 한다.
const FIELD_KEYS = [
  'agendaItems', 'meetingSummary', 'extracurricularNotes', 'identityNarrativeNotes',
  'questionsConcerns', 'nextMeetingAgenda', 'followUpCommitments', 'assignments',
  'criticalDates', 'criticalIssue',
] as const

const MODEL = 'claude-opus-5-5'

const SYSTEM_PROMPT = `You translate Korean meeting notes from a Korean university-admissions consulting firm into English.

The readers are the firm's own overseas mentors and essay editors. They work on US/UK undergraduate admissions and already know the jargon. This is an internal working record, not a letter to a family.

Rules:
1. Translate meaning, not words. Produce natural, concise professional English — the register of a colleague's handover note.
2. Do not add, remove, soften, or explain anything. If the Korean is blunt about a problem, the English is blunt about it. If a sentence is vague, leave it vague.
3. Keep admissions terminology in its standard English form: Common App, Personal Statement (PS), supplemental essays, extracurricular (EC), Early Decision / Early Action (ED/EA), Regular Decision (RD), GPA, SAT/ACT, AP/IB, letter of recommendation (LOR), UCAS, Oxbridge, portfolio, capstone, and so on. Expand a Korean term into the English one the reader expects rather than translating it literally.
4. Names and institutions: keep people's names in the romanization already present in the text; if only Hangul is given, use Revised Romanization (홍길동 → Hong Gildong). Keep school, university, program, and company names as their real English names when they have one (서울대학교 → Seoul National University), otherwise romanize. Never invent an English name you are unsure of — romanize instead.
5. Keep the shape of each field: bullets stay bullets, line breaks stay, numbered lists keep their numbers. Do not merge or reorder items.
6. Keep dates, numbers, scores, grades, and deadlines exactly as written.
7. Honorifics and titles (선생님, 어머님, 학생) become the plain English role (the consultant, the mother/parent, the student) — do not transliterate them.
8. If a field's Korean is already in English, return it unchanged.
9. Translate every key you are given, and return no other keys. A field whose input is empty returns an empty string.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const incoming = (body?.fields || {}) as Record<string, unknown>

    // 보내 준 칸 중 우리가 아는 키, 내용이 있는 것만 번역한다.
    const fields: Record<string, string> = {}
    for (const k of FIELD_KEYS) {
      const v = incoming[k]
      if (typeof v === 'string' && v.trim()) fields[k] = v
    }
    const keys = Object.keys(fields)
    if (keys.length === 0) {
      return json({ ok: false, error: '번역할 내용이 없습니다.' }, 400)
    }

    // 스키마를 주면 모델이 그 키들만, 문자열로만 돌려준다 — 코드펜스나 설명이 섞일 여지가 없다.
    const properties: Record<string, unknown> = {}
    for (const k of keys) properties[k] = { type: 'string' }

    const apiBody = JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties,
            required: keys,
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: `Translate each field below into English.\n\n${JSON.stringify(fields, null, 2)}`,
        }],
      }],
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
      return json({ ok: false, error: `Claude API ${response.status}: ${err.slice(0, 500)}` }, 500)
    }

    const data = await response.json()

    // 안전 장치가 걸려 응답이 멈춘 경우 — content 를 읽기 전에 먼저 본다.
    if (data.stop_reason === 'refusal') {
      return json({ ok: false, error: '번역이 거절되었습니다. 원문에 민감한 내용이 있는지 확인해 주세요.' }, 500)
    }
    // 잘린 응답은 JSON 이 깨져 아래에서 걸리지만, 이유를 알 수 있게 먼저 말해 준다.
    if (data.stop_reason === 'max_tokens') {
      return json({ ok: false, error: '일지가 너무 길어 번역이 중간에 끊겼습니다. 내용을 나눠서 다시 시도해 주세요.' }, 500)
    }

    const textBlock = (data.content || []).find((b: { type?: string }) => b?.type === 'text')
    const raw: string = textBlock?.text || ''
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return json({ ok: false, error: 'Claude did not return valid JSON', raw: raw.slice(0, 500) }, 500)
    }

    // 요청한 키만, 문자열만 돌려준다.
    const translation: Record<string, string> = {}
    for (const k of keys) {
      const v = parsed[k]
      if (typeof v === 'string') translation[k] = v
    }
    if (Object.keys(translation).length === 0) {
      return json({ ok: false, error: '번역 결과가 비어 있습니다.', raw: raw.slice(0, 500) }, 500)
    }

    return json({ ok: true, translation, model: data.model || MODEL })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
