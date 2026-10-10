/**
 * 엣지 함수가 돌려준 진짜 이유를 꺼낸다.
 *
 * supabase-js 의 functions.invoke 는 2xx 가 아니면 'Edge Function returned a
 * non-2xx status code' 한 줄만 남기고 응답 본문을 버린다. 우리 함수는 본문에
 * '리포트를 열 수 없습니다 …' 같은 쓸 만한 말을 담아 보내는데 그게 가려진다.
 * 실제 Response 는 error.context 에 들어 있으므로 거기서 꺼내 쓴다.
 */

/** 함수가 보낸 본문에서 error 메시지를 꺼낸다. 못 꺼내면 null. */
export function parseEdgeFunctionError(bodyText: string): string | null {
  const s = (bodyText || '').trim()
  if (!s) return null
  try {
    const body = JSON.parse(s) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  } catch {
    // JSON 이 아니면 (런타임이 뱉은 평문 등) 앞부분만 보여 준다.
    return s.slice(0, 300)
  }
  return null
}

/**
 * invoke 가 준 error 를 사람이 읽을 메시지로 바꾼다.
 * 본문을 읽어야 해서 비동기다.
 */
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).text === 'function') {
    try {
      const text = await (ctx as Response).text()
      const parsed = parseEdgeFunctionError(text)
      if (parsed) return parsed
    } catch {
      // 본문을 이미 읽었거나 읽을 수 없으면 아래 기본 메시지로 간다.
    }
  }
  const msg = (error as { message?: string })?.message
  return msg && !/non-2xx/i.test(msg) ? msg : fallback
}
