/**
 * 미지급 항목의 소급(이월).
 *
 * 세일즈 인센티브는 지급할 때까지 다음 달 목록에 계속 올라오고, 지급완료로 찍으면
 * 그 뒤로는 안 보인다. 그런데 관리비·원서에세이·에세이에디터·멘토 라인은 '그 달'에만
 * 만들어져서, 그 달 인보이스를 아무도 발행하지 않으면 조용히 사라졌다
 * (7월 멘토 세션이 9월 목록에 없던 건이 그 예).
 *
 * 그래서 같은 규칙을 쓴다 — 지난 몇 달 치를 함께 올리되, 지급완료로 찍힌 건은 뺀다.
 * 판정은 인센티브와 같은 표(incentive_status)를 쓴다. 라인 키만 다르다.
 *
 * 무한정 거슬러 올라가지 않는다. 오래된 달까지 다 끌어오면, 이미 다른 경로로 지급했는데
 * 지급완료 표시만 안 된 건들이 한꺼번에 되살아나 이중지급 위험이 커진다.
 */

/** 소급해서 함께 보여 줄 과거 개월 수(이번 달 포함). */
export const CARRY_OVER_MONTHS = 3

function monthIndex(m: string): number {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + (mo - 1)
}

function monthFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/**
 * 이번 달을 포함해 거슬러 올라갈 달들. 오래된 달 → 이번 달 순서.
 * count 가 1이면 이번 달만(= 소급 끄기).
 */
export function monthsUpTo(month: string, count: number = CARRY_OVER_MONTHS): string[] {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return month ? [month] : []
  const n = Math.max(1, Math.floor(count))
  const end = monthIndex(month)
  const out: string[] = []
  for (let i = end - n + 1; i <= end; i++) out.push(monthFromIndex(i))
  return out
}

export interface ReceivedState {
  received: boolean
  /** 지급완료로 찍은 달 */
  receivedMonth?: string
}

/**
 * 이 라인을 '이번 달' 목록에 올릴지.
 *
 *  · 'pending'  — 아직 미지급. 원래 달이 지났어도 계속 올린다
 *  · 'received' — 이번 달에 지급완료로 찍은 것. 기록으로 남겨 보여 준다
 *  · 'hide'     — 지난 달에 이미 지급완료. 다시 올리지 않는다
 */
export function carryState(st: ReceivedState | undefined, issueMonth: string): 'pending' | 'received' | 'hide' {
  if (!st?.received) return 'pending'
  return st.receivedMonth === issueMonth ? 'received' : 'hide'
}

/** 라인 키 — 원래 달까지 넣어야 같은 항목의 다른 달이 한 건으로 뭉치지 않는다. */
export function lineKey(kind: string, id: string, originMonth: string): string {
  return `${kind}:${id}:${originMonth}`
}
