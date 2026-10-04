/**
 * 2027 사업계획(매출 200억) → 월별 마케팅 목표.
 *
 * 사업계획서에는 '2027년 말 팔로워 4만', '유료 구독자 4,000명' 같은 끝점만 있고
 * 그 사이 매달 무엇을 해야 하는지는 없다. 그래서 매달 목표를 손으로 정하다 보면
 * 기준이 사람마다 달라지고, 뒤처지고 있는지도 늦게 안다.
 *
 * 여기서는 계획서의 기준점(앵커)만 적어 두고 그 사이를 자동으로 채운다.
 * 계획이 바뀌면 아래 상수만 고치면 모든 달의 목표가 다시 계산된다.
 *
 * 팔로워·구독자는 '매달 몇 명씩' 늘지 않고 '매달 몇 %씩' 늘기 때문에
 * 직선이 아니라 복리(기하) 곡선으로 잇는다. 1.15만 → 4만을 직선으로 나누면
 * 초반 목표가 지나치게 높고 후반이 너무 헐거워진다.
 *
 * ── 출처: 「2027년 사업계획 — 매출 200억 목표」 ver.2 (2026-09-18) ──
 */

export type PlanMonth = string   // 'YYYY-MM'

export interface PlanAnchor {
  month: PlanMonth
  value: number
}

/** 계획 기간 — 2026년 10월부터 2027년 12월까지 15개월. */
export const PLAN_START: PlanMonth = '2026-10'
export const PLAN_END: PlanMonth = '2027-12'

/**
 * 인스타그램 팔로워(월말 누적).
 * 계획서 ④: "현재 1만 1,500명(8개월 누적) → 2026년말 2만 → 2027년 6월말 3만 → 2027년말 4만"
 * (같은 절의 제목은 '2만 5천 명'으로 적혀 있으나, 본문의 단계 숫자를 따른다.)
 */
export const FOLLOWER_ANCHORS: PlanAnchor[] = [
  { month: '2026-09', value: 11500 },
  { month: '2026-12', value: 20000 },
  { month: '2027-06', value: 30000 },
  { month: '2027-12', value: 40000 },
]

/**
 * 구독 앱 유료 구독자(월말 누적).
 * 계획서 ③: "9월 말 런칭 → 10명 → 100명 → 1,000명 순으로 단계 검증", 2027년 목표 4,000명.
 * 단계별 날짜는 계획서에 없어 아래와 같이 둔다(검증 속도에 맞춰 조정 가능).
 */
export const SUBSCRIBER_ANCHORS: PlanAnchor[] = [
  { month: '2026-09', value: 0 },     // 런칭 직전
  { month: '2026-10', value: 10 },
  { month: '2026-12', value: 100 },
  { month: '2027-03', value: 1000 },
  { month: '2027-12', value: 4000 },
]

/** 계획서 ③: 신규 유입 대비 유지율 30% — 구독자 1명을 남기려면 가입 3.3명이 필요하다. */
export const SUBSCRIBER_RETENTION = 0.3

/** 계획서 ④: 하루 3개 × 주 7일 = 주 21개. 월 목표는 그 달의 일수 × 3. */
export const CONTENTS_PER_DAY = 3

/** 계획서 ②: 2027년 월 5명 신규 계약. 2026년 4분기도 "월 4~5명"이므로 같은 5명으로 둔다. */
export const NEW_CONTRACTS_PER_MONTH = 5

/** 계획서 인력 프로세스: NGA 100명 모집에 상담 1,000건 → 상담 10건당 1명 계약(10%). */
export const INQUIRY_TO_CONTRACT = 0.1

/** 계획서 인력 프로세스: NGA 연 상담 1,000건. 2027년 12개월에 균등 배분. */
export const NGA_CONSULTS_PER_YEAR = 1000

/** 계획서 ④: "현재 신규 문의의 80%가 인스타 유입" — 마케팅이 책임지는 몫. */
export const INSTAGRAM_SHARE = 0.8

export interface MonthlyTarget {
  month: PlanMonth
  /** 월말 누적 인스타 팔로워 */
  followers: number
  /** 그 달 순증 팔로워 */
  followerGain: number
  /** 월 콘텐츠 업로드 수 */
  contents: number
  /** 월 신규 문의(상담) 건수 — 컨설팅 + NGA */
  inquiries: number
  /** 그중 인스타에서 와야 하는 몫 */
  igInquiries: number
  /** 월말 누적 유료 구독자 */
  subscribers: number
  subscriberGain: number
  /** 그 순증을 만들려면 필요한 신규 가입(유지율 역산) */
  signups: number
}

// ───────────────────────── 달 계산 ─────────────────────────

/** 'YYYY-MM' 을 0부터 세는 월 번호로. 두 달 사이의 간격을 빼기로 구하려고. */
export function monthIndex(m: PlanMonth): number {
  const [y, mo] = m.split('-').map(Number)
  return y * 12 + (mo - 1)
}

export function monthFromIndex(i: number): PlanMonth {
  const y = Math.floor(i / 12)
  const mo = (i % 12) + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

/** start..end(양끝 포함)의 모든 달. */
export function monthRange(start: PlanMonth, end: PlanMonth): PlanMonth[] {
  const a = monthIndex(start)
  const b = monthIndex(end)
  if (b < a) return []
  const out: PlanMonth[] = []
  for (let i = a; i <= b; i++) out.push(monthFromIndex(i))
  return out
}

/** 그 달의 일수. */
export function daysInMonth(m: PlanMonth): number {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

// ──────────────────────── 곡선 채우기 ────────────────────────

/**
 * 앵커 사이를 복리로 채운다. 앵커보다 이른 달은 첫 앵커 값, 늦은 달은 마지막 앵커 값.
 * 시작이 0이면 비율을 낼 수 없어 그 구간만 직선으로 잇는다.
 */
export function interpolate(anchors: readonly PlanAnchor[], month: PlanMonth): number {
  if (anchors.length === 0) return 0
  const sorted = [...anchors].sort((x, y) => monthIndex(x.month) - monthIndex(y.month))
  const i = monthIndex(month)
  if (i <= monthIndex(sorted[0].month)) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (i >= monthIndex(last.month)) return last.value

  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k]
    const b = sorted[k + 1]
    const ai = monthIndex(a.month)
    const bi = monthIndex(b.month)
    if (i < ai || i > bi) continue
    const span = bi - ai
    const step = i - ai
    if (a.value <= 0) {
      // 0에서 출발하면 복리를 쓸 수 없다 — 그 구간만 직선.
      return round(a.value + (b.value - a.value) * (step / span))
    }
    const rate = Math.pow(b.value / a.value, 1 / span)
    return round(a.value * Math.pow(rate, step))
  }
  return last.value
}

/** 목표 숫자는 자릿수에 맞춰 둥글린다 — '19,847명'보다 '19,800명'이 목표답다. */
function round(v: number): number {
  if (v >= 10000) return Math.round(v / 100) * 100
  if (v >= 1000) return Math.round(v / 10) * 10
  return Math.round(v)
}

// ──────────────────────── 월별 목표 ────────────────────────

/** 그 달의 문의(상담) 목표. 컨설팅 신규 5명에 필요한 상담 + 2027년부터 NGA 상담. */
export function inquiryTarget(month: PlanMonth): number {
  const consulting = Math.round(NEW_CONTRACTS_PER_MONTH / INQUIRY_TO_CONTRACT)
  const year = Number(month.slice(0, 4))
  // NGA 100명은 2027년 목표 — 상담도 2027년 12개월에 나눠 싣는다.
  const nga = year >= 2027 ? Math.ceil(NGA_CONSULTS_PER_YEAR / 12) : 0
  return consulting + nga
}

export function monthlyTargets(start: PlanMonth = PLAN_START, end: PlanMonth = PLAN_END): MonthlyTarget[] {
  return monthRange(start, end).map(month => {
    const prev = monthFromIndex(monthIndex(month) - 1)
    const followers = interpolate(FOLLOWER_ANCHORS, month)
    const subscribers = interpolate(SUBSCRIBER_ANCHORS, month)
    const subscriberGain = Math.max(0, subscribers - interpolate(SUBSCRIBER_ANCHORS, prev))
    const inquiries = inquiryTarget(month)
    return {
      month,
      followers,
      followerGain: Math.max(0, followers - interpolate(FOLLOWER_ANCHORS, prev)),
      contents: daysInMonth(month) * CONTENTS_PER_DAY,
      inquiries,
      igInquiries: Math.round(inquiries * INSTAGRAM_SHARE),
      subscribers,
      subscriberGain,
      signups: Math.ceil(subscriberGain / SUBSCRIBER_RETENTION),
    }
  })
}

/** 달성률(%) — 목표가 0이면 잴 수 없어 null. */
export function attainment(actual: number, target: number): number | null {
  if (!target) return null
  return (actual / target) * 100
}
