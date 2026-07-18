// Supabase Edge Function: extract-program-brochure
// Receives a partner program brochure image (base64),
// calls Claude Vision to read it and produce an organized program guide.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SYSTEM_PROMPT = `당신은 한국 교육 컨설팅 회사의 파트너 프로그램 안내문(브로셔) 정리 전문가입니다.
주어진 브로셔 이미지를 읽고, 학부모에게 안내할 수 있도록 프로그램 내용을 깔끔하게 정리하세요.

정리 형식(한국어, 마크다운 형태의 일반 텍스트):
- 프로그램명
- 대상 (학년/연령 등)
- 일정/기간
- 장소
- 주요 내용 (핵심 커리큘럼/활동을 불릿으로)
- 비용 (있으면)
- 신청 방법/문의 (있으면)
- 기타 특이사항

규칙:
1. 이미지에 실제로 적힌 내용만 사용하세요. 없는 정보는 지어내지 마세요.
2. 해당 항목 정보가 없으면 그 항목은 생략하세요.
3. 한국어 텍스트를 정확히 읽어주세요.
4. 결과는 순수 텍스트(마크다운)로만 반환하고, 다른 설명은 붙이지 마세요.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function detectMediaType(b64: string): string {
  // Peek at the first bytes to guess PNG vs JPEG; default to jpeg.
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  if (b64.startsWith('UklGR')) return 'image/webp'
  return 'image/jpeg'
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
    const image: string | undefined = body?.image
    if (!image || typeof image !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing "image" field in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const sizeMB = image.length / (1024 * 1024)
    if (sizeMB > 5) {
      return new Response(
        JSON.stringify({ error: `이미지 크기가 너무 큽니다 (${sizeMB.toFixed(1)}MB). 5MB 이하로 업로드해주세요.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: detectMediaType(image), data: image },
      },
      { type: 'text', text: '위 브로셔 이미지를 읽고 프로그램 안내를 정리해주세요.' },
    ]

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
      const errorText = await response.text()
      console.error(`Claude API error: ${response.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: `Claude API error: ${response.status}`, details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await response.json()
    const guide = result.content?.[0]?.text?.trim() || ''

    return new Response(
      JSON.stringify({ guide }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
