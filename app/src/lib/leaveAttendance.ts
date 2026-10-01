/**
 * 승인된 연차·반차를 근태 기록에 겹쳐 보일 때의 규칙.
 *
 * 예전에는 연차든 반차든 그날을 10:00–19:00 근무로 찍어 버렸다. 그래서
 *  · 연차인데 하루 종일 일한 것처럼 보이고,
 *  · 반차인데 실제로 찍은 출퇴근 시각이 10:00–19:00 으로 덮여,
 * 엑셀을 내려받아 사람이 일일이 고쳐야 했다.
 *
 * 규칙을 바꾼다.
 *  · 연차(종일) → 출근·퇴근을 비운다. 비고에 '연차 사용'만 남는다
 *  · 반차       → 실제로 찍힌 출근·퇴근을 그대로 둔다(기록이 없으면 비어 있는 채로)
 * 어느 쪽도 시각을 만들어내지 않는다.
 *
 * 이 겹치기는 화면·집계·엑셀에만 적용되고 저장된 출퇴근 기록은 건드리지 않는다.
 */

export type LeaveKind = 'full' | 'half'

export interface LeaveOverlay {
  label: string
  kind: LeaveKind
}

export interface AttendanceTimes {
  clockIn: string | null
  clockOut: string | null
}

/** 연차·반차가 걸린 날에 보여줄 출퇴근 시각. */
export function leaveTimes(kind: LeaveKind, actual: AttendanceTimes): AttendanceTimes {
  // 반차는 반나절 근무이므로 실제 기록이 곧 근무시간이다.
  if (kind === 'half') return { clockIn: actual.clockIn ?? null, clockOut: actual.clockOut ?? null }
  // 연차는 근무가 없다 — 시각을 비운다.
  return { clockIn: null, clockOut: null }
}

/** 비고에 휴가 라벨을 앞세운다. 이미 들어 있으면 그대로 둔다(중복 방지). */
export function mergeLeaveNote(note: string | null | undefined, label: string): string {
  const n = (note || '').trim()
  if (!n) return label
  return n.includes(label) ? n : `${label} · ${n}`
}
