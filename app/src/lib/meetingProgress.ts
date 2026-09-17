// 학생별 미팅 진행률 계산 (계약 시작일 기준 12개월 주기)
//
// 대부분의 학생은 연간 24회의 미팅을 진행하므로 기본 목표치를 24로 둔다.
// 학생별로 다르면 contractDetails.annualMeetingTarget 로 개별 재정의할 수 있다.

export const DEFAULT_ANNUAL_MEETING_TARGET = 24

/**
 * 미팅 횟수(진행분)에 포함되는 상태.
 *
 * 노쇼는 학생 사정으로 불발된 것이라 컨설턴트는 시간을 비워 두고 준비까지 마쳤다.
 * 그래서 '진행한 것'으로 세고, 미팅 일지(리포트)도 요구하지 않는다.
 * 취소·예약·일정변경은 포함하지 않는다.
 */
export const COMPLETED_MEETING_STATUSES = ['held', 'no_show'] as const

/** 미팅 횟수에 포함되는 상태인가 (노쇼 포함). */
export function isCompletedMeetingStatus(status?: string): boolean {
  return (COMPLETED_MEETING_STATUSES as readonly string[]).includes(status || '')
}

/** 노쇼인가 — 화면에서 빨간색으로 구분하고, 리포트 요구에서 빼는 기준. */
export function isNoShowStatus(status?: string): boolean {
  return status === 'no_show'
}

/** 월 단위 가감 (말일 오버플로우는 이전 달 말일로 보정). */
export function addMonths(base: string | Date, months: number): Date {
  const d = typeof base === 'string' ? new Date(base) : new Date(base.getTime())
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d
}

/**
 * 주어진 날짜가 계약 몇 년차(1-index)에 속하는지 반환.
 * 계약 시작일 전이거나 값이 없으면 1년차로 처리.
 */
export function contractYearOf(startISO: string | undefined, dateISO: string | undefined): number {
  if (!startISO || !dateISO) return 1
  const start = new Date(startISO)
  const date = new Date(dateISO)
  if (isNaN(start.getTime()) || isNaN(date.getTime()) || date < start) return 1
  let year = 1
  while (year < 30 && date >= addMonths(start, year * 12)) year++
  return year
}

/** 한 계약연차의 완료 미팅 집계. */
export interface MeetingYearCount {
  /** 계약 연차 (1-index) */
  year: number
  /** 진행분 미팅 수 (정상 진행 + 노쇼) */
  completed: number
  /** 그중 노쇼 — 화면에서 빨간색으로 구분한다 */
  noShow: number
  /** 목표를 넘겨 추가로 진행한 횟수 (목표 이하면 0) */
  extra: number
}

/** 연차 집계에 넘기는 미팅 한 건. */
export interface CompletedMeetingEntry {
  date: string
  /** 노쇼 여부 (기본 false) */
  noShow?: boolean
}

/**
 * 완료 미팅 날짜들을 계약연차별로 집계해, 현재 연차와 지난 연차들을 나눠 준다.
 *
 * 계약연차는 시작일부터 12개월 단위라, 해가 넘어가면 카운트가 0부터 다시 시작한다.
 * 그때 지난 연차에 몇 회를 진행했는지(특히 목표 초과분)가 화면에서 사라지지 않도록
 * 지난 연차 집계를 함께 돌려준다.
 *
 * 현재 연차 집계는 기존 화면과 정확히 같은 기준이다(현재 연차에 속한 완료 미팅만).
 * 시작일이 비어 있으면 contractYearOf 가 항상 1을 주므로 전부 1년차로 잡힌다.
 *
 * @param held 진행분 미팅들(정상 진행 + 노쇼). 상태 필터는 호출 쪽 책임이다.
 */
export function heldByContractYear(
  startDate: string | undefined,
  held: readonly CompletedMeetingEntry[],
  target: number,
  todayISO: string,
): {
  currentYear: number
  current: MeetingYearCount
  /** 1년차부터 직전 연차까지 (오름차순) */
  past: MeetingYearCount[]
  /** 현재 연차보다 뒤로 잡힌 완료 미팅 수 — 날짜가 잘못 들어간 경우라 어디에도 세지 않는다 */
  future: number
} {
  const currentYear = contractYearOf(startDate, todayISO)
  const counts = new Map<number, { total: number; noShow: number }>()
  let future = 0
  for (const m of held) {
    const y = contractYearOf(startDate, m.date)
    if (y > currentYear) { future++; continue }
    const c = counts.get(y) || { total: 0, noShow: 0 }
    c.total += 1
    if (m.noShow) c.noShow += 1
    counts.set(y, c)
  }
  const at = (year: number): MeetingYearCount => {
    const c = counts.get(year) || { total: 0, noShow: 0 }
    return { year, completed: c.total, noShow: c.noShow, extra: Math.max(0, c.total - target) }
  }
  const past: MeetingYearCount[] = []
  for (let y = 1; y < currentYear; y++) past.push(at(y))
  return { currentYear, current: at(currentYear), past, future }
}
