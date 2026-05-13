// Supabase Edge Function: extract-contract
// Receives PDF text, calls Claude API to extract structured contract data

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `당신은 한국 교육 컨설팅 회사의 계약서 데이터 추출 전문가입니다.
주어진 계약서 텍스트에서 아래 필드를 정확히 추출하여 JSON으로 반환하세요.

필드 목록:
- contractorName: 계약자(학부모) 이름. "(모)" 또는 "(부)" 접미사 포함 가능
- studentName: 학생 이름
- schoolName: 학교명 (현재 재학중인 학교 또는 입학 목표 학교)
- gradeAtContract: 학년 (예: "G10", "9학년", "고1" 등)
- contractDate: 계약 체결일 (YYYY-MM-DD 형식)
- expiryDate: 계약 만료일 또는 서비스 종료일 (YYYY-MM-DD 형식)
- address: 주소 (없으면 null)
- phone: 연락처/전화번호 (없으면 null)
- totalAmount: 총 계약 금액 (숫자만, 콤마 제거)
- currency: "KRW" 또는 "USD"
- paymentAccount: 입금 계좌가 한국이면 "KR", 미국이면 "US"
- notes: 특이사항이나 추가 메모 (없으면 null)

규칙:
1. 반드시 유효한 JSON만 반환하세요. 다른 텍스트는 포함하지 마세요.
2. 날짜는 반드시 YYYY-MM-DD 형식으로 변환하세요.
3. 금액에서 쉼표, 원, $ 등의 기호를 제거하고 숫자만 반환하세요.
4. 확실하지 않은 필드는 null로 설정하세요.
5. 만료일이 명시되지 않은 경우 계약일로부터 1년 후로 추정하세요.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    const { text } = await req.json()

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing "text" field in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Truncate to avoid exceeding token limits
    const truncated = text.slice(0, 15000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `다음 계약서 텍스트에서 정보를 추출해주세요:\n\n${truncated}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({ error: `Claude API error: ${response.status}`, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await response.json()
    const content = result.content?.[0]?.text || '{}'

    // Parse the JSON from Claude's response
    // Claude might wrap it in ```json ... ``` so we strip that
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const extracted = JSON.parse(jsonStr)

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
