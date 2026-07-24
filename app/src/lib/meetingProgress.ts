// 학생별 미팅 진행률 계산 (계약 시작일 기준 12개월 주기)
//
// 대부분의 학생은 연간 24회의 미팅을 진행하므로 기본 목표치를 24로 둔다.
// 학생별로 다르면 contractDetails.annualMeetingTarget 로 개별 재정의할 수 있다.

export const DEFAULT_ANNUAL_MEETING_TARGET = 24

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
