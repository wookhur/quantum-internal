// Supabase Edge Function: extract-meeting-note
// Receives PDF text OR page images of a sales meeting note,
// calls Claude API to extract structured meeting data.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `당신은 한국 교육 컨설팅 회사의 미팅 노트 데이터 추출 전문가입니다.
주어진 미팅 노트 텍스트(또는 이미지)에서 아래 필드를 정확히 추출하여 JSON으로 반환하세요.

필드 목록:
- parentName: 학부모/보호자 이름. "어머니", "아버지", "(모)", "(부)" 등으로 표기된 사람
- studentName: 학생(자녀) 이름
- meetingDate: 미팅 날짜 (YYYY-MM-DD 형식)
- meetingNumber: 몇 차 상담인지 (숫자만. 예: 1, 2, 3). 추정이 불가하면 null
- phone: 연락처/전화번호
- currentSchool: 학교명
- grade: 학년 (예: "G10", "Year 9", "고1" 등)
- region: 거주 지역 (예: "강남", "서초", "홍콩", "싱가폴" 등)
- interestArea: 관심 분야 / 상담 주제 (예: "미국 보딩스쿨", "영국 유학", "입시 컨설팅" 등)
- sourceChannel: 유입 경로 (예: "지인 추천", "블로그", "인스타그램" 등). 없으면 null
- memo: 미팅 내용 요약. 주요 논의 사항, 학생 상황, 부모 요구사항 등을 3~5문장으로 요약
- nextMeetingDate: 다음 미팅 예정일 (YYYY-MM-DD 형식). 없으면 null
- requiredAction: 후속 조치 / 필요한 액션. 없으면 null

규칙:
1. 반드시 유효한 JSON만 반환하세요. 다른 텍스트는 포함하지 마세요.
2. 날짜는 반드시 YYYY-MM-DD 형식으로 변환하세요.
3. 확실하지 않은 필드는 null로 설정하세요.
4. memo는 미팅 노트의 핵심 내용을 간결하게 요약해주세요. 너무 길지 않게 3~5문장으로.
5. 학부모와 학생 이름이 구분되지 않으면, 전체 이름을 parentName에 넣고 studentName은 null로.
6. 미팅 노트에 여러 학생이 언급될 경우, 주요 상담 대상 학생 한 명만 추출하세요.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { text, images } = body

    let userContent: unknown[]

    if (images && Array.isArray(images) && images.length > 0) {
      const limitedImages = images.slice(0, 5)
      console.log(`Processing ${limitedImages.length} meeting note images (of ${images.length} provided)`)
      userContent = []

      for (let i = 0; i < limitedImages.length; i++) {
        userContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: limitedImages[i],
          },
        })
      }

      userContent.push({
        type: 'text',
        text: '위 미팅 노트 이미지에서 정보를 추출해주세요. 한국어 텍스트를 정확히 읽어주세요.',
      })
    } else if (text && typeof text === 'string') {
      const truncated = text.slice(0, 20000)
      userContent = [
        {
          type: 'text',
          text: `다음 미팅 노트에서 정보를 추출해주세요:\n\n${truncated}`,
        },
      ]
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing "text" or "images" field in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    console.log(`Calling Claude API for meeting note extraction, payload size: ${apiBody.length}`)

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
      const errorText = await response.text()
      console.error(`Claude API error: ${response.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: `Claude API error: ${response.status}`, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await response.json()
    const content = result.content?.[0]?.text || '{}'
    console.log(`Claude response: ${content.substring(0, 200)}`)

    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let extracted
    try {
      extracted = JSON.parse(jsonStr)
    } catch {
      console.error(`JSON parse failed. Raw: ${content}`)
      extracted = {
        parentName: null,
        studentName: null,
        meetingDate: null,
        meetingNumber: null,
        phone: null,
        currentSchool: null,
        grade: null,
        region: null,
        interestArea: null,
        sourceChannel: null,
        memo: `AI 분석 결과 (수동 입력 필요): ${content.substring(0, 500)}`,
        nextMeetingDate: null,
        requiredAction: null,
      }
    }

    return new Response(
      JSON.stringify(extracted),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
