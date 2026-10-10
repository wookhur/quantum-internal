// Supabase Edge Function: translate-diary
// 한국어로 쓰인 미팅일지 항목들을 영어로 옮긴다.
// 읽는 사람은 해외 멘토·에디터 — 사내 기록이므로 입시 실무 용어는 그대로 둔다.
//
// 두 가지로 부른다.
//  ① 항목별   { fields: { meetingSummary: "...", ... } }
//     → { ok: true, translation: { meetingSummary: "...", ... } }
//  ② 문서 통째 { url: "https://docs.google.com/..." }  또는  { text: "..." }
//     → { ok: true, translatedText: "..." }
//     올린 미팅리포트(구글 닥스·드라이브 PDF) 원문을 통째로 영어로 옮길 때 쓴다.

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

const DOC_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are translating a whole meeting report document, not individual fields.

Output rules for a document:
- Return only the English translation. No preamble, no "Here is the translation", no code fences, no notes about what you did.
- Keep the document's structure exactly: headings stay headings, bullets stay bullets, numbered lists keep their numbers, tables keep their rows and columns, blank lines between sections stay.
- Keep the order of everything. Do not summarize, merge sections, or drop anything — this is a full translation, not a summary.
- A line that is already in English is reproduced unchanged.`

const MAX_DOC_CHARS = 40000

function extractGoogleDocId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

function extractDriveFileId(url: string): string | null {
  const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m2 ? m2[1] : null
}

async function fetchGoogleDocText(docId: string): Promise<string | null> {
  // '링크가 있는 모든 사용자' 로 공유된 문서만 읽을 수 있다.
  try {
    const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, { redirect: 'follow' })
    if (!res.ok) return null
    const txt = await res.text()
    // 로그인 페이지가 돌아왔으면 못 읽은 것이다.
    if (txt.includes('<html') && txt.toLowerCase().includes('sign in')) return null
    return txt
  } catch {
    return null
  }
}

async function fetchDrivePdfBase64(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 4 || buf[0] !== 0x25 || buf[1] !== 0x50) return null // %P — PDF 가 아니다
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    return btoa(bin)
  } catch {
    return null
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * 오류는 code 로 돌려준다 — 화면은 code 를 보고 보는 사람의 언어로 문구를 고른다.
 * (error 문구도 함께 실어, 코드를 모르는 쪽에서도 읽을 거리는 있게 한다.)
 */
function fail(code: string, error: string, status = 500): Response {
  return new Response(JSON.stringify({ ok: false, code, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Claude 응답에서 사람이 읽을 본문만 꺼낸다. 생각 블록이 앞에 올 수 있다. */
function textOf(data: { content?: { type?: string; text?: string }[] }): string {
  const block = (data.content || []).find(b => b?.type === 'text')
  return block?.text || ''
}

/** 안전장치·길이로 끊긴 응답을 읽기 전에 걸러낸다. 문제없으면 null. */
function stopReasonError(stopReason: string | undefined): { code: string; error: string } | null {
  if (stopReason === 'refusal') {
    return { code: 'refused', error: 'The translation was declined. Check the original for sensitive content.' }
  }
  if (stopReason === 'max_tokens') {
    return { code: 'tooLong', error: 'The document was too long and the translation was cut off. Split it and try again.' }
  }
  return null
}

async function callClaude(apiBody: string): Promise<{ data?: Record<string, unknown>; error?: string }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: apiBody,
  })
  if (!response.ok) {
    const err = await response.text()
    return { error: `Claude API ${response.status}: ${err.slice(0, 500)}` }
  }
  return { data: await response.json() }
}

/** 올린 리포트(구글 닥스 / 드라이브 PDF / 붙여넣은 글)를 통째로 영어로 옮긴다. */
async function translateDocument(url?: string, text?: string): Promise<Response> {
  let docText = text
  let pdfBase64: string | null = null

  if (!docText && url) {
    const docId = extractGoogleDocId(url)
    if (docId) docText = (await fetchGoogleDocText(docId)) || undefined
    if (!docText) {
      const driveId = extractDriveFileId(url)
      if (driveId) pdfBase64 = await fetchDrivePdfBase64(driveId)
    }
  }

  if (!docText && !pdfBase64) {
    return fail(
      'reportUnreadable',
      "Could not open the report. Check that the Google Doc / Drive link is shared with 'Anyone with the link', or paste the text directly.",
      400,
    )
  }

  const userContent: unknown[] = []
  if (pdfBase64) {
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    })
    userContent.push({ type: 'text', text: 'Translate this meeting report into English in full.' })
  } else {
    const body = (docText || '').slice(0, MAX_DOC_CHARS)
    userContent.push({ type: 'text', text: `Translate this meeting report into English in full.\n\n${body}` })
  }

  const { data, error } = await callClaude(JSON.stringify({
    model: MODEL,
    max_tokens: 16000,
    system: DOC_SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: userContent }],
  }))
  if (error) return fail('apiError', error)

  const stopErr = stopReasonError(data!.stop_reason as string | undefined)
  if (stopErr) return fail(stopErr.code, stopErr.error)

  const translatedText = textOf(data as never).trim()
  if (!translatedText) {
    return fail('emptyResult', 'The translation came back empty.')
  }

  // 원문이 길어 잘렸으면 숨기지 않고 알린다.
  const truncated = !pdfBase64 && (docText || '').length > MAX_DOC_CHARS
  return json({ ok: true, translatedText, truncated, model: (data!.model as string) || MODEL })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_API_KEY) {
      return fail('noApiKey', 'ANTHROPIC_API_KEY not configured')
    }

    const body = await req.json().catch(() => ({}))

    // ── ② 문서 통째 번역 (올린 미팅리포트 원문)
    if (body?.url || body?.text) {
      return await translateDocument(body.url as string | undefined, body.text as string | undefined)
    }

    // ── ① 항목별 번역 (미팅다이어리 10개 칸)
    const incoming = (body?.fields || {}) as Record<string, unknown>

    // 보내 준 칸 중 우리가 아는 키, 내용이 있는 것만 번역한다.
    const fields: Record<string, string> = {}
    for (const k of FIELD_KEYS) {
      const v = incoming[k]
      if (typeof v === 'string' && v.trim()) fields[k] = v
    }
    const keys = Object.keys(fields)
    if (keys.length === 0) {
      return fail('noContent', 'There is nothing to translate.', 400)
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

    const { data, error } = await callClaude(apiBody)
    if (error) return fail('apiError', error)

    // 안전장치·길이로 끊긴 응답은 본문을 읽기 전에 먼저 걸러낸다.
    const stopErr = stopReasonError(data!.stop_reason as string | undefined)
    if (stopErr) return fail(stopErr.code, stopErr.error)

    const raw = textOf(data as never)
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return fail('badJson', `Claude did not return valid JSON: ${raw.slice(0, 300)}`)
    }

    // 요청한 키만, 문자열만 돌려준다.
    const translation: Record<string, string> = {}
    for (const k of keys) {
      const v = parsed[k]
      if (typeof v === 'string') translation[k] = v
    }
    if (Object.keys(translation).length === 0) {
      return fail('emptyResult', 'The translation came back empty.')
    }

    return json({ ok: true, translation, model: (data!.model as string) || MODEL })
  } catch (e) {
    return fail('unexpected', String(e))
  }
})
