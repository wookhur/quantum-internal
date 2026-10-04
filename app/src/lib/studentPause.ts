/**
 * 학생 휴면(일시중지) 판정.
 *
 * 휴면을 걸 때 '복귀예정일'을 함께 적는데, 그 날짜가 지나도 휴면이 풀리지 않아
 * 사람이 직접 해제해야 했다. 잊으면 복귀한 학생이 계속 휴면으로 남고,
 * 관리비 청구 대상에서도 빠진다.
 *
 * 그래서 날짜로 판정한다 — 복귀예정일 당일부터는 휴면이 아니다.
 * 저장된 플래그는 건드리지 않고 화면·집계에서만 그렇게 본다(되돌리기 쉽다).
 * 복귀예정일을 비워 두면 예전처럼 직접 해제할 때까지 휴면이 유지된다.
 */

export interface PausableStudent {
  paused?: boolean
  pauseReturnDate?: string   // YYYY-MM-DD
}

/** 오늘 기준으로 휴면 중인가. */
export function isOnPause(s: PausableStudent, today: string): boolean {
  if (!s.paused) return false
  const back = (s.pauseReturnDate || '').slice(0, 10)
  if (!back) return true          // 복귀예정일이 없으면 수동 해제 전까지 휴면
  return today < back             // 복귀예정일 '당일'부터 복귀한 것으로 본다
}

/** 휴면 플래그는 켜져 있는데 복귀예정일이 지나 자동 해제된 상태인가(안내 문구용). */
export function isPauseEnded(s: PausableStudent, today: string): boolean {
  return !!s.paused && !isOnPause(s, today)
}
