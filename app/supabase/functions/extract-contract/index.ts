// Supabase Edge Function: extract-contract
// Receives PDF text OR page images, calls Claude API to extract structured contract data

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// 계약서는 길다 — 자르면 뒷쪽(별지·특약·개인정보 동의)에 적힌 값이 사라진다.
const MAX_TEXT_CHARS = 200000   // 200,000자 ≈ 계약서 100쪽 분량
const MAX_IMAGE_PAGES = 20      // 스캔본일 때 보내는 쪽 수

const SYSTEM_PROMPT = `당신은 한국 교육 컨설팅 회사의 계약서 데이터 추출 전문가입니다.
주어진 계약서 텍스트(또는 이미지)에서 아래 필드를 정확히 추출하여 JSON으로 반환하세요.

필드 목록:
- contractorName: 계약자(학부모/보호자) 이름. "갑", "(모)", "(부)" 등으로 표기된 사람. 계약서에 명시된 이름 그대로 추출
- studentName: 학생(자녀) 이름. "을", "피교육자", "수강생" 등으로 표기될 수 있음
- schoolName: 학교명 (현재 재학 중인 학교)
- gradeAtContract: 학년 (예: "G10", "Year 9", "9학년", "고1" 등)
- contractDate: 계약 체결일 (YYYY-MM-DD 형식)
- expiryDate: 계약 만료일 또는 서비스 종료일 (YYYY-MM-DD 형식)
- address: 주소. 계약서 어디에든 기재된 거주지/주소/소재지를 찾아서 추출. 영문 주소도 포함. 도로명, 지번, 해외주소 모두 해당
- phone: 연락처/전화번호. 국가번호(+82, +852 등) 포함 가능
- studentEmail: 학생 본인의 이메일 주소. 없으면 null
- parentEmail: 학부모(계약자)의 이메일 주소. 없으면 null
- totalAmount: 총 계약 금액 (숫자만, 콤마/₩/$/원 제거)
- currency: "KRW" 또는 "USD". ₩이나 원화면 "KRW", $면 "USD"
- paymentAccount: 입금 계좌가 한국이면 "KR", 미국이면 "US"
- notes: 특이사항이나 추가 메모. 서비스 내용 요약, 거주지역, 학생 연락처 등 유용한 정보
- installments: **[매우 중요]** 납입/지급 일정 배열. 반드시 계약서의 "Payment Schedule", "납입일정", "지급일자", "분할납부" 테이블을 찾아서 **각 행을 개별 항목으로** 추출하세요.
  예시: "1st Payment ₩20,000,000 2026/05/16" → {"label": "1st Payment", "amount": 20000000, "dueDate": "2026-05-16"}
  각 항목 형식:
  - label: 항목명 (예: "1st Payment", "2nd Payment", "계약금", "중도금", "잔금" 등 원문 그대로)
  - amount: 금액 (숫자만, 콤마/통화기호 제거)
  - dueDate: 지급일/납입일 (YYYY-MM-DD 형식, 없으면 null)

  **절대로 여러 분할 납부를 하나의 "전액"으로 합치지 마세요.** 테이블에 4행이 있으면 4개 항목, 3행이면 3개 항목을 반환하세요.
  납입 정보가 정말 없는 경우에만 빈 배열 []을 반환하세요.

규칙:
1. 반드시 유효한 JSON만 반환하세요. 다른 텍스트는 포함하지 마세요.
2. 날짜는 반드시 YYYY-MM-DD 형식으로 변환하세요. (2026/05/16 → 2026-05-16)
3. 금액에서 쉼표, 원, ₩, $ 등의 기호를 제거하고 숫자만 반환하세요.
4. 확실하지 않은 필드는 null로 설정하세요.
5. 만료일이 명시되지 않은 경우 서비스 종료일 또는 계약일로부터 1년 후로 추정하세요.
6. 납입 일정에서 "계약 시", "계약일" 등은 계약 체결일을, "입학 시" 등은 만료일을 dueDate로 사용하세요.
7. 주소는 계약서 전체를 꼼꼼히 살펴서 추출하세요. 홍콩, 싱가폴 등 해외 주소도 포함됩니다.
8. 이메일이 하나만 적혀 있고 누구 것인지 구분이 없으면 parentEmail에 넣고 studentEmail은 null로 두세요. 계약서에 서명하는 쪽은 보통 학부모입니다.
9. 퀀텀어드미션즈(공급자) 쪽 이메일은 추출하지 마세요. @quantumadmissions.com 같은 회사 도메인이거나 '담당자', '컨설턴트', '을(乙)' 란에 적힌 주소는 고객 정보가 아닙니다. 계약자·학생(갑) 쪽 주소만 추출합니다.
10. 이메일은 소문자로, 공백 없이 반환하세요. 'abc @ gmail .com'처럼 띄어 적혀 있으면 'abc@gmail.com'으로 붙이세요.
11. "이메일", "E-mail", "메일주소" 같은 라벨을 값으로 쓰지 마세요. '@'가 들어간 실제 주소만 값입니다. 확실하지 않으면 null로 두세요 — 추측한 주소가 들어가면 학생정보에 잘못된 값이 박히고, 자동 채움은 빈칸만 채우므로 나중에 덮어쓰지 않습니다.
12. **문서 끝까지 보세요.** 계약서는 10쪽을 넘기 일쑤이고, 이메일·연락처·학교·학년은 앞쪽 본문이 아니라 뒤쪽의 '개인정보 수집·이용 동의서', '수강생 정보', '별지', '특약사항', 서명란에 적혀 있는 경우가 많습니다. 앞쪽 몇 쪽만 보고 null로 두지 말고, 마지막 쪽까지 훑은 뒤에 판단하세요.
13. 텍스트에 '--- 7페이지 ---' 같은 쪽 표시가 있으면 그것은 문서 구조를 알려 주는 표시일 뿐, 추출할 값이 아닙니다.`

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

    const body = await req.json()
    const { text, images } = body

    // Build the user message content
    let userContent: unknown[]

    if (images && Array.isArray(images) && images.length > 0) {
      // Image-based extraction (scanned PDFs).
      // 계약서는 10쪽을 넘기 일쑤고 이메일·학교 같은 값이 뒷쪽에 적혀 있다.
      // 3쪽만 보던 탓에 그 값들은 모델에 닿지도 못했다.
      const limitedImages = images.slice(0, MAX_IMAGE_PAGES)
      console.log(`Processing ${limitedImages.length} images (of ${images.length} provided)`)
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
        text: '위 계약서 이미지에서 정보를 추출해주세요. 한국어 텍스트를 정확히 읽어주세요.',
      })
    } else if (text && typeof text === 'string') {
      // Text-based extraction.
      // 15,000자에서 자르던 탓에 11쪽짜리 계약서의 뒷부분이 통째로 빠졌다
      // (주소는 앞쪽에 있어 그것만 읽혔다). 계약서 한 부는 넉넉히 들어가도록 둔다.
      const truncated = text.slice(0, MAX_TEXT_CHARS)
      console.log(`Contract text: ${text.length} chars, sending ${truncated.length}`)
      userContent = [
        {
          type: 'text',
          text: `다음 계약서 텍스트에서 정보를 추출해주세요:\n\n${truncated}`,
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
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    })

    console.log(`Calling Claude API with model claude-sonnet-4-6, payload size: ${apiBody.length}`)

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
    console.log(`Claude response content: ${content.substring(0, 200)}`)

    // Parse the JSON from Claude's response
    // Claude might wrap it in ```json ... ``` so we strip that
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let extracted
    try {
      extracted = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error(`JSON parse failed. Raw content: ${content}`)
      // If Claude couldn't parse the contract, return partial result with the raw text as notes
      // instead of failing with 500
      extracted = {
        contractorName: null,
        studentName: null,
        schoolName: null,
        gradeAtContract: null,
        contractDate: null,
        expiryDate: null,
        address: null,
        phone: null,
        studentEmail: null,
        parentEmail: null,
        totalAmount: null,
        currency: null,
        paymentAccount: null,
        notes: `AI 분석 결과 (수동 입력 필요): ${content.substring(0, 300)}`,
      }
    }

    return new Response(
      JSON.stringify(extracted),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
