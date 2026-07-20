// 연차(annual paid leave) rules + 경조사(family-event) leave table.
//
// 연차 accrual (Korean Labor Standards Act, company policy):
//  - 입사 1년 미만: 1개월 개근 시 1일, 최대 11일
//  - 1년 이상(출근율 80%+): 15일
//  - 3년 이상부터 2년에 1일씩 추가, 최대 25일  (15 + floor((years-1)/2))
//  - 상시근로자 5인 이상이 된 기준일(2025-05-23)부터 적용.
//    기준일 이전 입사자는 연차 계산 시작일을 기준일로, 이후 입사자는 입사일 기준.

export const COMPANY_LEAVE_START = '2025-05-23'

// 별도 유급휴가 연간 부여 일수 (누적 사용, 리셋 없음)
export const PAID_LEAVE_ANNUAL = 3

export type LeaveType = 'annual' | 'paid_special' | 'sick' | 'family_event' | 'other'

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: '연차',
  paid_special: '유급휴가',
  sick: '병가',
  family_event: '경조사',
  other: '기타',
}

/** 반차(0.5일) 구분: 오전 / 오후 */
export type HalfDayPeriod = 'morning' | 'afternoon'

export const HALF_DAY_LABELS: Record<HalfDayPeriod, string> = {
  morning: '오전 반차',
  afternoon: '오후 반차',
}

export interface FamilyEvent {
  key: string
  label: string
  days: number
}

// 경조사 휴가 기준 (고용노동부 표준 취업규칙 기준) — 모두 유급
export const FAMILY_EVENTS: FamilyEvent[] = [
  { key: 'marriage_self', label: '본인 결혼', days: 5 },
  { key: 'parent_death', label: '본인 및 배우자 부모 사망', days: 5 },
  { key: 'child_death', label: '자녀 및 자녀 배우자 사망', days: 3 },
  { key: 'grandparent_death', label: '본인 및 배우자 조부모·외조부모 사망', days: 3 },
  { key: 'sibling_death', label: '본인 및 배우자 형제·자매 사망', days: 3 },
]

export function familyEventLabel(key?: string): string {
  return FAMILY_EVENTS.find(e => e.key === key)?.label || key || ''
}

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`)
}

/** Whole completed months between a and b (b later). */
function monthsBetween(a: Date, b: Date): number {
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m -= 1
  return Math.max(0, m)
}

/** Whole completed years between a and b (b later). */
function yearsBetween(a: Date, b: Date): number {
  let y = b.getFullYear() - a.getFullYear()
  const anniv = new Date(a)
  anniv.setFullYear(a.getFullYear() + y)
  if (b < anniv) y -= 1
  return Math.max(0, y)
}

export interface AnnualEntitlement {
  entitlement: number
  tier: 'none' | 'under1y' | 'over1y'
  effectiveStart: string | null
  months: number
  years: number
  note: string
}

/**
 * Compute the annual-leave entitlement for a person as of `asOf`.
 * `hireDate` is the contract start date (YYYY-MM-DD).
 */
export function computeAnnualEntitlement(hireDate?: string | null, asOf: Date = new Date()): AnnualEntitlement {
  if (!hireDate) {
    return { entitlement: 0, tier: 'none', effectiveStart: null, months: 0, years: 0, note: '입사일(계약 시작일) 미설정' }
  }
  const hire = parseDate(hireDate)
  const companyStart = parseDate(COMPANY_LEAVE_START)
  const effective = hire < companyStart ? companyStart : hire
  const effectiveStart = effective.toISOString().slice(0, 10)

  const months = monthsBetween(effective, asOf)
  const years = yearsBetween(effective, asOf)

  if (years < 1) {
    const entitlement = Math.min(months, 11)
    return {
      entitlement,
      tier: 'under1y',
      effectiveStart,
      months,
      years,
      note: `입사 1년 미만 · 개근 ${months}개월 → ${entitlement}일 (최대 11일)`,
    }
  }

  const extra = Math.floor((years - 1) / 2)
  const entitlement = Math.min(15 + extra, 25)
  return {
    entitlement,
    tier: 'over1y',
    effectiveStart,
    months,
    years,
    note: `근속 ${years}년 · 15일 + 가산 ${extra}일 = ${entitlement}일 (최대 25일)`,
  }
}

/** Inclusive calendar-day count between two YYYY-MM-DD dates. */
export function dayCount(start: string, end: string): number {
  const a = parseDate(start)
  const b = parseDate(end)
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
  return Math.max(1, diff + 1)
}
