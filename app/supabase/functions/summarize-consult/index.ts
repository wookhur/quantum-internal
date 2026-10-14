// Supabase Edge Function: summarize-consult
//
// 전화 상담 전사본(또는 손으로 적은 상담 메모)을 받아
// Point / Concerns / Solutions / Follow-up 네 칸으로 요약한다.
//
// 계약 후 상담 기록은 서비스팀이 나중에 읽는다. 통화 전사본은 길고 구어체여서
// 그대로는 아무도 다시 읽지 않는다. 읽히는 분량으로 줄여 주되, 사람이 화면에서
// 바로 고칠 수 있는 평범한 글로 돌려준다.
//
// 음성 파일은 여기서 받지 않는다 — Claude 는 음성을 못 읽는다. 전사는 바깥 서비스가
// 해야 하고, 그 키를 붙이면 이 함수 앞단에 전사 단계만 더하면 된다.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const MODEL = 'claude-sonnet-5-5'   // 요약은 분량이 많아 Sonnet 으로 — 번역(translate-diary)은 Opus

const SYSTEM_PROMPT = `당신은 한국 유학·입시 컨설팅 회사의 상담 기록 정리 담당자입니다.
학부모와의 전화 상담 전사본(또는 상담 메모)을 받아 네 칸으로 정리합니다.

- point: 이번 상담의 핵심. 무슨 일로 통화했고 무엇이 정해졌는지. 2~4개 항목.
- concerns: 학부모가 걱정하거나 불만을 말한 것. 말투와 온도까지 담으세요
  ("성적보다 에세이 진도가 늦는 걸 많이 불안해하심"). 없으면 빈 문자열.
- solutions: 상담자가 설명하거나 제안한 것, 그리고 그에 대한 학부모의 반응.
  없으면 빈 문자열.
- followUp: 누가 무엇을 언제까지 하기로 했는지. 약속한 것만.
  ("- 금요일까지 원서 목록 정리해 보내기 (담당 컨설턴트)") 없으면 빈 문자열.

규칙:
1. 반드시 유효한 JSON 객체만 반환하세요. 설명이나 코드블록 표시를 붙이지 마세요.
2. 네 칸 모두 한국어로. 각 칸은 '- ' 로 시작하는 줄 목록으로 적으세요.
3. 전사본에 없는 내용을 만들지 마세요. 애매하면 적지 않는 쪽을 고르세요.
   추측이 섞이면 서비스팀이 잘못된 전제로 학부모를 만나게 됩니다.
4. 학부모의 성향·말투·특이사항은 서비스팀이 가장 알고 싶어 하는 것입니다.
   concerns 에 사실만이 아니라 어떤 태도였는지도 함께 남기세요.
5. 금액·날짜·학교명·점수는 전사본에 적힌 그대로 옮기세요. 바꾸거나 반올림하지 마세요.
6. 전사본이 너무 짧거나 상담 내용이 아니면 네 칸을 모두 빈 문자열로 두세요.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const text = str(body?.text)
    // 누구와의 상담인지 알려 주면 이름을 잘못 집지 않는다
    const studentName = str(body?.studentName)
    const parentName = str(body?.parentName)

    if (text.length < 40) {
      return json({ error: '전사본이 너무 짧습니다. 40자 이상 필요합니다.' }, 400)
    }

    // 아주 긴 전사본은 앞쪽을 자른다. 통화는 뒤로 갈수록 결론이 나오므로 뒤를 남긴다.
    const MAX = 120_000
    const clipped = text.length > MAX
    const payload = clipped ? text.slice(text.length - MAX) : text

    const who = [
      studentName ? `학생: ${studentName}` : '',
      parentName ? `학부모: ${parentName}` : '',
    ].filter(Boolean).join(' / ')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            who ? `${who}\n` : '',
            clipped ? '(전사본이 길어 앞부분은 잘렸습니다. 아래는 통화 뒷부분입니다.)\n' : '',
            '--- 전사본 ---\n',
            payload,
          ].join(''),
        }],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('Anthropic API error', res.status, detail.slice(0, 500))
      return json({ error: `요약 실패 (${res.status})`, details: detail.slice(0, 300) }, 502)
    }

    const data = await res.json()
    const raw: string = data?.content?.[0]?.text ?? ''

    // 모델이 ```json 으로 감싸 보내는 경우가 있다
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) {
      console.error('No JSON in model output:', raw.slice(0, 500))
      return json({ error: '요약 결과를 읽을 수 없습니다. 다시 시도해 주세요.' }, 502)
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(m[0])
    } catch (e) {
      console.error('JSON parse failed:', e, m[0].slice(0, 500))
      return json({ error: '요약 결과를 읽을 수 없습니다. 다시 시도해 주세요.' }, 502)
    }

    return json({
      point: str(parsed.point),
      concerns: str(parsed.concerns),
      solutions: str(parsed.solutions),
      followUp: str(parsed.followUp ?? parsed.follow_up),
      clipped,
    })
  } catch (e) {
    console.error('summarize-consult failed', e)
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500)
  }
})
