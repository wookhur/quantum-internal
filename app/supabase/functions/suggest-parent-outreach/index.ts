// Supabase Edge Function: suggest-parent-outreach
//
// 미팅 다이어리를 읽고, 담당 컨설턴트가 학부모에게 '먼저' 연락하면 좋을 지점을
// 짚어 준다. 사람이 쓰는 초안을 만드는 것이지 학부모에게 바로 나가는 글이 아니다.
//
// 입력은 화면에서 모아 보낸다(이 함수는 DB 를 읽지 않는다 — 서비스 키를 들고
// 있지 않아도 되고, 무엇을 보냈는지가 화면 코드에 그대로 드러난다).

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `당신은 한국 유학 컨설팅 회사 '퀀텀어드미션즈'의 시니어 슈퍼바이저 '로드'입니다.
담당 컨설턴트가 올린 미팅 다이어리를 읽고, 그 컨설턴트가 학부모에게 **먼저** 연락하면
좋을 지점을 짚어 줍니다. 학부모가 먼저 묻기 전에 선수를 치는 것이 목적입니다.

반드시 지킬 것:
1. 근거는 **주어진 기록에서만** 가져옵니다. 기록에 없는 사정을 지어내지 마세요.
   (예: 성적, 합격 가능성, 가족 사정 등은 기록에 적혀 있을 때만 씁니다.)
2. 각 제안에는 어느 날짜 기록의 무엇을 보고 그렇게 판단했는지 적습니다.
3. 짚을 것이 없으면 억지로 만들지 말고 priority 를 "none" 으로 두세요.
   연락할 이유가 없는데 연락하라고 하는 것이 가장 나쁜 조언입니다.
4. 초안은 한국어 존댓말, 카카오톡으로 보낼 만한 3~5문장. 단정적인 약속
   ("반드시 합격합니다" 등)은 쓰지 마세요.
5. 학생이 미팅에서 한 말을 학부모에게 그대로 옮기는 제안은 하지 마세요.
   학생의 신뢰가 깨집니다. 꼭 필요하면 먼저 학생과 상의하라고 적으세요.

우선순위 기준:
- high: 지금 주에 연락하지 않으면 학부모가 먼저 불안해하거나 화낼 만한 것
  (기록된 우려가 해소되지 않음, 약속한 것이 늦어짐, 마감이 임박함, 노쇼가 쌓임)
- medium: 2~3주 안에 하면 좋을 것 (진행 상황 공유, 다음 단계 안내)
- low: 여유 있을 때 (관계 관리, 가벼운 근황)
- none: 지금 연락할 이유가 없음

응답은 JSON 배열만. 코드펜스·설명 금지. 각 원소:
{
  "studentId": "입력으로 받은 id 그대로",
  "priority": "high" | "medium" | "low" | "none",
  "concern": "학부모가 지금 품고 있을(또는 곧 품을) 우려 한 문장",
  "basis": "그렇게 본 근거 — 어느 날짜 기록의 무엇인지 함께",
  "suggestion": "컨설턴트가 무엇을 하면 좋을지 1~2문장",
  "draftMessage": "학부모에게 보낼 카톡 초안 (priority 가 none 이면 빈 문자열)"
}`

interface DiaryIn {
  entryDate?: string
  agendaItems?: string
  meetingSummary?: string
  extracurricularNotes?: string
  identityNarrativeNotes?: string
  questionsConcerns?: string
  nextMeetingAgenda?: string
  nextMeetingDate?: string
  followUpCommitments?: string
  assignments?: string
  criticalDates?: string
  criticalIssue?: string
}

interface StudentIn {
  id: string
  name?: string
  koreanName?: string
  grade?: string
  school?: string
  majorDetail?: string
  contractType?: string
  consultantName?: string
  parentName?: string
  meetingsDone?: number
  meetingsTarget?: number
  noShows?: number
  lastMeetingDate?: string
  diaries?: DiaryIn[]
}

/** 빈 칸을 걷어내고 사람이 읽는 꼴로. 토큰도 아끼고 모델도 덜 헷갈린다. */
function renderStudent(s: StudentIn, today: string): string {
  const head = [
    `학생: ${[s.koreanName, s.name].filter(Boolean).join(' ')} (id: ${s.id})`,
    s.grade && `학년: ${s.grade}`,
    s.school && `학교: ${s.school}`,
    s.majorDetail && `희망전공: ${s.majorDetail}`,
    s.contractType && `계약: ${s.contractType}`,
    s.consultantName && `담당 컨설턴트: ${s.consultantName}`,
    s.parentName && `학부모: ${s.parentName}`,
    s.meetingsTarget ? `미팅 진행: ${s.meetingsDone ?? 0}/${s.meetingsTarget}회` : null,
    s.noShows ? `노쇼: ${s.noShows}회` : null,
    s.lastMeetingDate && `마지막 미팅: ${s.lastMeetingDate} (오늘 ${today})`,
  ].filter(Boolean).join('\n')

  const diaries = (s.diaries || []).map((d, i) => {
    const rows: [string, string | undefined][] = [
      ['안건', d.agendaItems],
      ['미팅 요약', d.meetingSummary],
      ['비교과', d.extracurricularNotes],
      ['정체성·서사', d.identityNarrativeNotes],
      ['질문·우려사항', d.questionsConcerns],
      ['다음 안건', d.nextMeetingAgenda],
      ['다음 미팅일', d.nextMeetingDate],
      ['후속 약속', d.followUpCommitments],
      ['과제', d.assignments],
      ['중요 일정', d.criticalDates],
      ['리스크·이슈', d.criticalIssue],
    ]
    const body = rows
      .filter(([, v]) => (v || '').trim())
      .map(([k, v]) => `  - ${k}: ${(v || '').trim()}`)
      .join('\n')
    return `[기록 ${i + 1}] ${d.entryDate || '날짜 미상'}\n${body || '  (내용 없음)'}`
  }).join('\n\n')

  return `${head}\n\n--- 미팅 다이어리 (최신순) ---\n${diaries || '(기록 없음)'}`
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
    const students = ((body || {}).students || []) as StudentIn[]
    if (!Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: '분석할 학생이 없습니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    // 한 번에 너무 많이 넣으면 함수가 시간 안에 못 끝낸다 — 화면에서 끊어 보낸다
    if (students.length > 6) {
      return new Response(
        JSON.stringify({ ok: false, error: '한 번에 6명까지만 분석합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    const prompt = students.map(s => renderStudent(s, today)).join('\n\n========\n\n')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        // 안전장치가 요청을 거절하면 다른 모델로 넘겨 받는다
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `아래 학생들에 대해 각각 하나씩, 학부모 선제 소통 제안을 JSON 배열로 주세요.\n\n${prompt}`,
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      let detail = err.slice(0, 600)
      try {
        const parsed = JSON.parse(err) as { error?: { message?: string } }
        if (parsed?.error?.message) detail = parsed.error.message
      } catch { /* JSON 이 아니면 그대로 */ }
      console.error('Anthropic error', response.status, err.slice(0, 1000))
      return new Response(
        JSON.stringify({ ok: false, error: `Claude API ${response.status}: ${detail}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await response.json()
    // 안전장치가 거절하면 200 으로 오고 content 가 비어 있다 — 먼저 가려낸다
    if (data.stop_reason === 'refusal') {
      return new Response(
        JSON.stringify({ ok: false, error: '안전장치가 이 요청을 거절했습니다. 기록에 민감한 내용이 있는지 확인해 주세요.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const raw = (data.content || [])
      .filter((b: { type?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b.text || '')
      .join('')
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    let suggestions: unknown
    try {
      suggestions = JSON.parse(cleaned)
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: '로드가 JSON 형식으로 답하지 않았습니다.', raw: raw.slice(0, 800) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ ok: true, suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
