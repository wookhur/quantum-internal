/**
 * 승인된 연차·반차를 근태 기록에 겹쳐 보일 때의 규칙.
 *
 * 예전에는 연차든 반차든 그날을 10:00–19:00 근무로 찍어 버렸다. 그래서
 *  · 연차인데 하루 종일 일한 것처럼 보이고,
 *  · 반차인데 실제로 찍은 출퇴근 시각이 10:00–19:00 으로 덮여,
 * 엑셀을 내려받아 사람이 일일이 고쳐야 했다.
 *
 * 규칙:
 *  · 연차(종일) → 근무시간으로 인정 → 10:00–19:00 으로 기록하고 비고에 '연차 사용'
 *  · 반차       → 쉬지 않은 반나절만 근무 → 오전 반차 15:00–19:00 / 오후 반차 10:00–14:00
 * 어느 쪽이든 실제로 찍힌 출퇴근이 있으면 그것이 우선이고, 안 찍힌 쪽만 기본값으로 채운다.
 *
 * 이 겹치기는 화면·집계·엑셀에만 적용되고 저장된 출퇴근 기록은 건드리지 않는다.
 */

export type LeaveKind = 'full' | 'half'
export type HalfPeriod = 'morning' | 'afternoon'

export interface LeaveOverlay {
  label: string
  kind: LeaveKind
  /** 반차일 때 어느 반나절을 쉬는지 */
  period?: HalfPeriod
}

export interface AttendanceTimes {
  clockIn: string | null
  clockOut: string | null
}

/** 기준 근무일. 연차는 근무시간으로 인정하므로 이 시간대로 기록한다. */
export const FULL_DAY_WORK = { start: '10:00', end: '19:00' }

/**
 * 반차 기본 근무시간. 기준 근무일 10:00–19:00 에서 점심 1시간을 뺀 8시간의 절반,
 * 즉 각 4시간이 되도록 둔다.
 *  · 오전 반차 = 오전을 쉬고 오후 근무 → 15:00–19:00
 *  · 오후 반차 = 오전 근무 후 퇴근     → 10:00–14:00
 */
export const HALF_DAY_WORK: Record<HalfPeriod, { start: string; end: string }> = {
  morning: { start: '15:00', end: '19:00' },
  afternoon: { start: '10:00', end: '14:00' },
}

/**
 * 연차·반차가 걸린 날에 보여줄 출퇴근 시각.
 * 어느 쪽이든 실제로 찍힌 기록이 우선이고, 안 찍힌 쪽만 기본값으로 채운다.
 */
export function leaveTimes(
  kind: LeaveKind,
  actual: AttendanceTimes,
  period?: HalfPeriod,
): AttendanceTimes {
  const base = kind === 'half' ? (period ? HALF_DAY_WORK[period] : null) : FULL_DAY_WORK
  return {
    clockIn: actual.clockIn ?? base?.start ?? null,
    clockOut: actual.clockOut ?? base?.end ?? null,
  }
}

/** 비고에 휴가 라벨을 앞세운다. 이미 들어 있으면 그대로 둔다(중복 방지). */
export function mergeLeaveNote(note: string | null | undefined, label: string): string {
  const n = (note || '').trim()
  if (!n) return label
  return n.includes(label) ? n : `${label} · ${n}`
}
