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
- studentName: 학생(자녀) 한글 이름. "을", "피교육자", "수강생" 등으로 표기될 수 있음
- studentNameEn: 학생의 영문 이름. 여권/원서용 로마자 표기가 적혀 있으면 그대로. 없으면 null (한글 이름을 임의로 로마자화하지 마세요)
- studentPhone: 학생 본인 연락처
- parentPhone: 학부모(계약자) 연락처
- schoolName: 학교명 (현재 재학 중인 학교)
- gradeAtContract: 학년 (예: "G10", "Year 9", "9학년", "고1" 등)
- contractDate: 계약 체결일 (YYYY-MM-DD 형식)
- expiryDate: 계약 만료일 또는 서비스 종료일 (YYYY-MM-DD 형식)
- address: 주소. 계약서 어디에든 기재된 거주지/주소/소재지를 찾아서 추출. 영문 주소도 포함. 도로명, 지번, 해외주소 모두 해당
- phone: 연락처가 하나만 적혀 있고 누구 것인지 구분이 없을 때 그 번호. 학생/학부모가 구분돼 있으면 studentPhone·parentPhone 에 넣고 이 칸은 null
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
13. 텍스트에 '--- 7페이지 ---' 같은 쪽 표시가 있으면 그것은 문서 구조를 알려 주는 표시일 뿐, 추출할 값이 아닙니다.
14. 이름은 **끝까지** 읽으세요. '박희원'을 '박희'로 줄여 적지 마세요. 마지막 글자가 흐려 확신이 없으면, 끊어 적는 대신 null 로 두는 편이 낫습니다 — 잘린 이름이 학생정보에 박히면 사람이 알아채기 어렵습니다.
15. 연락처는 숫자와 하이픈만 남기세요('(모) 010-1234-5678' → '010-1234-5678'). 누구 번호인지 표시(모/부/학생)는 떼고, 그 구분은 studentPhone·parentPhone 중 어디에 넣을지로 나타냅니다.
16. 학생 영문 이름은 계약서에 적혀 있을 때만 넣으세요. 여권식 표기(HONG GILDONG), 영문 통용명(Chloe Kim) 모두 해당합니다. 한글 이름만 있으면 studentNameEn 은 비워 두세요.`

// 모델이 줄글로 설명하고 끝내는 일이 거듭됐다(스캔본 이미지에서 특히).
// 스키마를 주면 이 모양으로만 답할 수 있어 그 길이 막힌다.
//
// 모든 칸을 문자열로 두고 "없으면 빈 문자열"로 받는다. ['string','null'] 같은
// 합집합 타입이나 숫자 타입은 구현에 따라 거부되기도 해서, 가장 단순한 모양으로
// 받고 숫자 변환은 아래에서 우리가 한다.
const STR = { type: 'string' }
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    contractorName: STR, studentName: STR, studentNameEn: STR,
    schoolName: STR, gradeAtContract: STR,
    contractDate: STR, expiryDate: STR, address: STR,
    phone: STR, studentPhone: STR, parentPhone: STR,
    studentEmail: STR, parentEmail: STR,
    totalAmount: STR, currency: STR, paymentAccount: STR, notes: STR,
    installments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: STR, amount: STR, dueDate: STR },
        required: ['label', 'amount', 'dueDate'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'contractorName', 'studentName', 'studentNameEn', 'schoolName', 'gradeAtContract',
    'contractDate', 'expiryDate', 'address', 'phone', 'studentPhone', 'parentPhone',
    'studentEmail', 'parentEmail', 'totalAmount', 'currency',
    'paymentAccount', 'notes', 'installments',
  ],
  additionalProperties: false,
}

/**
 * 빈 문자열은 '값 없음'이다 — null 로 바꿔 돌려준다.
 * 글자도 숫자도 없는 값(`"}`, `-`, `—` 같은 찌꺼기)도 값이 아니다.
 * 모델이 빈 칸 자리에 이런 걸 흘려 넣어 학교명 칸에 `"}` 가 들어간 적이 있다.
 */
function str(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) return null
  return /[\p{L}\p{N}]/u.test(t) ? t : null
}

/** '₩10,000,000' / '10000000' → 10000000. 숫자를 못 찾으면 null. */
function num(v: unknown): number | null {
  const digits = (typeof v === 'string' ? v : '').replace(/[^0-9.]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

/**
 * 연락처에서 숫자·하이픈·+ 만 남긴다 — '(모) 010-1234-5678' → '010-1234-5678'.
 * 누구 번호인지는 studentPhone/parentPhone 중 어디에 담겼는지로 나타낸다.
 */
function phone(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) return null
  const cleaned = t.replace(/[^0-9+-]/g, '').replace(/^-+|-+$/g, '')
  // 숫자가 너무 적으면 번호가 아니다
  return (cleaned.match(/[0-9]/g) || []).length >= 7 ? cleaned : null
}

/** 스키마로 받은 문자열 묶음을 앱이 쓰는 모양으로 되돌린다. */
function normalize(raw: Record<string, unknown>) {
  const rows = Array.isArray(raw.installments) ? raw.installments : []
  return {
    contractorName: str(raw.contractorName),
    studentName: str(raw.studentName),
    studentNameEn: str(raw.studentNameEn),
    schoolName: str(raw.schoolName),
    gradeAtContract: str(raw.gradeAtContract),
    contractDate: str(raw.contractDate),
    expiryDate: str(raw.expiryDate),
    address: str(raw.address),
    phone: phone(raw.phone),
    studentPhone: phone(raw.studentPhone),
    parentPhone: phone(raw.parentPhone),
    studentEmail: str(raw.studentEmail),
    parentEmail: str(raw.parentEmail),
    totalAmount: num(raw.totalAmount),
    currency: str(raw.currency),
    paymentAccount: str(raw.paymentAccount),
    notes: str(raw.notes),
    installments: rows
      .map((r) => {
        const o = (r || {}) as Record<string, unknown>
        return { label: str(o.label), amount: num(o.amount), dueDate: str(o.dueDate) }
      })
      .filter((r) => r.label || r.amount || r.dueDate),
  }
}

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

    // 응답을 JSON 으로 받는 길을 세 가지 두고 차례로 내려간다.
    //  ① output_config 스키마  ② 도구 호출 강제  ③ 맨몸(프롬프트만 믿기)
    // ①이 이 모델에서 거부된 적이 있어(“Schemas contain…”), 바로 ②로 넘어가
    // 헛걸음하지 않게 한다. ②는 이 모델에서 오래 쓰여 온 방식이다.
    type Mode = 'schema' | 'tool' | 'plain'

    const buildBody = (mode: Mode) => JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      ...(mode === 'schema'
        ? { output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } }
        : {}),
      ...(mode === 'tool'
        ? {
            tools: [{
              name: 'save_contract',
              description: '계약서에서 읽어낸 값을 이 도구로 넘기세요. 설명하지 말고 이 도구만 호출하세요.',
              input_schema: OUTPUT_SCHEMA,
            }],
            tool_choice: { type: 'tool', name: 'save_contract' },
          }
        : {}),
      messages: [{ role: 'user', content: userContent }],
    })

    const callClaude = (body: string) => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    })

    const modes: Mode[] = ['schema', 'tool', 'plain']
    let response: Response | null = null
    let mode: Mode = 'plain'

    for (const m of modes) {
      const body = buildBody(m)
      console.log(`Calling Claude API (mode: ${m}), payload size: ${body.length}`)
      const res = await callClaude(body)
      // 400 은 '이 요청 모양을 못 받는다'는 뜻 — 다음 방식으로 내려간다.
      if (res.status === 400 && m !== 'plain') {
        console.warn(`Mode '${m}' rejected: ${(await res.text()).slice(0, 800)}`)
        continue
      }
      response = res
      mode = m
      break
    }

    if (!response) {
      return new Response(
        JSON.stringify({ error: 'Claude API rejected every request shape' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Claude API error: ${response.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: `Claude API error: ${response.status}`, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await response.json()
    const blocks = (result.content || []) as { type?: string; text?: string; input?: unknown }[]

    // 도구 호출로 받았으면 그 입력이 곧 결과다 — 파싱할 글이 없다.
    const toolBlock = blocks.find((b) => b?.type === 'tool_use')
    if (toolBlock?.input) {
      const extracted = normalize(toolBlock.input as Record<string, unknown>)
      console.log(`Extracted (mode: ${mode}): ${JSON.stringify(extracted).slice(0, 400)}`)
      return new Response(
        JSON.stringify(extracted),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const textBlock = blocks.find((b) => b?.type === 'text')
    const content = textBlock?.text || '{}'
    console.log(`Claude response content: ${content.substring(0, 200)}`)

    // Parse the JSON from Claude's response
    // Claude might wrap it in ```json ... ``` so we strip that
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    let extracted
    try {
      extracted = normalize(JSON.parse(jsonStr) as Record<string, unknown>)
      console.log(`Extracted (mode: ${mode}): ${JSON.stringify(extracted).slice(0, 400)}`)
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
        studentNameEn: null,
        studentPhone: null,
        parentPhone: null,
        studentEmail: null,
        parentEmail: null,
        totalAmount: null,
        currency: null,
        paymentAccount: null,
        installments: [],
        notes: `AI가 읽은 내용을 칸에 담지 못했습니다. 아래 내용을 보고 직접 입력해 주세요.\n\n${content.substring(0, 1200)}`,
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
