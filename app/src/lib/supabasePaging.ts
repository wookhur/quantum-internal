/**
 * Supabase(PostgREST)는 한 요청에 최대 1000행만 돌려준다.
 * 전량이 필요한 조회(금액 합계·집계 등)에서 이 제한을 넘으면 **에러 없이 조용히 잘려서**
 * 숫자가 틀리게 나온다. 전량 조회가 필요한 곳에서는 아래 헬퍼로 페이지네이션한다.
 */

/** PostgREST 한 페이지 최대 행 수 */
export const SUPABASE_PAGE_SIZE = 1000

/**
 * `.in('col', ids)` 목록을 나눌 크기.
 * id가 많아지면 GET 요청 URL이 너무 길어져 414로 실패하므로 나눠서 조회한다.
 */
export const IN_FILTER_CHUNK_SIZE = 300

/**
 * 안전장치: build() 가 `.range(from, to)` 를 빠뜨리면 같은 행이 계속 돌아와
 * 무한 루프에 빠진다. 그 경우 탭이 멈추는 대신 바로 에러를 내도록 페이지 수를 제한한다.
 */
const MAX_PAGES = 500

type PageResponse<T> = { data: T[] | null; error: { message: string } | null }

/**
 * `build(from, to)`가 돌려주는 쿼리를 `.range(from, to)` 단위로 반복 호출해 전량을 모은다.
 *
 * ```ts
 * const rows = await fetchAllRows((from, to) =>
 *   supabase.from('payment_installments').select('*').range(from, to),
 * )
 * ```
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  build: (from: number, to: number) => PromiseLike<PageResponse<T>>,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `fetchAllRows: ${MAX_PAGES}페이지를 넘었습니다. build() 가 .range(from, to) 를 적용하는지 확인하세요.`,
      )
    }
    const { data, error } = await build(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    // 빈 페이지가 나올 때까지 실제로 받은 행 수만큼 전진한다.
    // 서버의 max-rows 가 SUPABASE_PAGE_SIZE 보다 작게 잡혀 있어도 안전하도록,
    // "요청한 만큼 못 받았으니 끝"이라고 단정하지 않는다.
    if (batch.length === 0) return rows
    from += batch.length
  }
}

/**
 * id 목록을 나눠 조회한 뒤 합친다. 각 조각은 다시 페이지네이션된다.
 * 중복 id는 제거하며, 목록이 비면 요청 없이 빈 배열을 돌려준다.
 *
 * ```ts
 * const rows = await fetchAllRowsByIds(contractIds, (chunk, from, to) =>
 *   supabase.from('payment_installments').select('*').in('contract_id', chunk).range(from, to),
 * )
 * ```
 */
export async function fetchAllRowsByIds<T = Record<string, unknown>>(
  ids: readonly string[],
  build: (chunk: string[], from: number, to: number) => PromiseLike<PageResponse<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const rows: T[] = []
  for (let i = 0; i < unique.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + IN_FILTER_CHUNK_SIZE)
    rows.push(...(await fetchAllRows<T>((from, to) => build(chunk, from, to))))
  }
  return rows
}
