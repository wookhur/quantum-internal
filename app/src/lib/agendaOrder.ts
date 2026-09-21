export interface OrderedItem {
  id: string
  position: number
}

/**
 * 안건을 한 칸 위/아래로 옮긴 뒤 저장해야 할 position 목록을 계산한다.
 *
 * 기존 데이터는 position 이 모두 0 인 경우가 있어(안건 추가 시 기본값이 0이라
 * created_at 순으로만 정렬되던 시기가 있었다) 단순 swap 으로는 순서가 바뀌지 않는다.
 * 그래서 화면에 보이는 순서를 기준으로 0..n-1 로 다시 매기고, 실제로 값이 달라지는
 * 행만 돌려준다.
 *
 * @param items 화면에 보이는 순서 그대로의 안건 목록
 * @param index 옮길 안건의 위치
 * @param dir   -1 = 위로, 1 = 아래로
 */
export function reorderPositions<T extends OrderedItem>(
  items: T[],
  index: number,
  dir: -1 | 1,
): { id: string; position: number }[] {
  const target = index + dir
  if (index < 0 || index >= items.length) return []
  if (target < 0 || target >= items.length) return []   // 맨 위에서 위로 / 맨 아래에서 아래로
  const next = items.slice()
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  const updates: { id: string; position: number }[] = []
  next.forEach((it, i) => { if (it.position !== i) updates.push({ id: it.id, position: i }) })
  return updates
}
