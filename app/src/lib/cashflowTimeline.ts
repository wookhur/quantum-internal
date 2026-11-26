/**
 * 자금 흐름표 — 날짜순으로 돈이 들고 나는 것을 늘어놓고 잔액을 따라간다.
 *
 * 월별 합계만 보면 '이번 달은 플러스'인데 15일에 통장이 비는 것을 못 본다.
 * 급여는 5일에 나가고 수금은 말일에 들어오기 때문이다. 그래서 날짜 단위로 센다.
 *
 * 세 갈래에서 모은다.
 *  · 수금  — 계약관리의 회차(payment_installments). 신규 계약이 생기면 회차가
 *            따라 생기므로 이 표에 저절로 들어온다. 사람이 옮겨 적지 않는다.
 *  · 고정비 — 급여·임대료·운영자금처럼 매달 같은 날 나가는 것.
 *  · 단건  — 대출 입금/상환, 인테리어 잔금처럼 한 번만 생기는 것.
 *
 * 여기서는 계산만 한다. 숫자를 어디서 가져오는지는 화면이 정한다.
 */

export type CashEventKind =
  | 'opening'      // 기준 잔고 — 이 날짜의 통장 잔고에서 출발한다
  | 'loan_in'      // 대출 받음 (+)
  | 'loan_out'     // 대출 상환 (−)
  | 'onetime_in'   // 그 밖의 일시 수입 (+)
  | 'onetime_out'  // 그 밖의 일시 지출 (−)
  | 'other'

export const CASH_EVENT_LABEL: Record<CashEventKind, string> = {
  opening: '기준 잔고',
  loan_in: '대출 입금',
  loan_out: '대출 상환',
  onetime_in: '일시 수입',
  onetime_out: '일시 지출',
  other: '기타',
}

/** 들어오는 돈으로 보는 종류 — 입력 화면에서 부호를 자동으로 잡는 데 쓴다. */
export const INFLOW_KINDS: CashEventKind[] = ['opening', 'loan_in', 'onetime_in']

export interface TimelineInstallment {
  id: string
  dueDate?: string
  label: string
  amount: number
  paidAmount: number
  status: string
  currency: 'KRW' | 'USD'
  contractorName?: string
  studentName?: string
  schoolName?: string
  /** 계약 상태 — 'cancelled'·'terminated' 면 앞으로 들어올 돈이 아니다. */
  contractStatus?: string
  /** 환불 진행 상태 — 'requested'·'completed' 면 받을 돈이 아니라 돌려줄 돈이다. */
  refundStatus?: string
}

export interface TimelineExpense {
  id: string
  name: string
  category: string
  amount: number
  currency: 'KRW' | 'USD'
  /** 매달 며칠에 나가는가 (1~31). 그 달에 없는 날이면 말일로 당긴다. */
  payDay: number
  /** 'YYYY-MM' — 이 달부터 / 이 달까지. 없으면 제한 없음. */
  startMonth?: string
  endMonth?: string
}

export interface TimelineEvent {
  id: string
  eventDate: string
  label: string
  /** 부호 포함. 나가는 돈은 음수. */
  amount: number
  kind: CashEventKind
  currency: 'KRW' | 'USD'
  settled: boolean
  notes?: string
}

export type RowSource = 'opening' | 'income' | 'expense' | 'event'

export interface TimelineRow {
  key: string
  date: string
  label: string
  detail?: string
  /** 원화 환산, 부호 포함 */
  amount: number
  source: RowSource
  /** 이 줄까지 반영한 잔액 */
  balance: number
  /** 납기가 이미 지난 수금 */
  overdue?: boolean
  /** 집행·입금이 끝난 단건 */
  settled?: boolean
  /** 외화 원금(표시용) */
  foreign?: { amount: number; currency: 'USD' }
}

export interface MonthSummary {
  month: string          // 'YYYY-MM'
  inflow: number
  outflow: number
  /** 그 달 마지막 줄까지의 잔액 */
  endBalance: number
  /** 그 달 안에서 잔액이 가장 낮았던 지점 */
  lowest: number
  lowestDate?: string
}

export interface Timeline {
  rows: TimelineRow[]
  months: MonthSummary[]
  /** 기간 전체에서 잔액이 가장 낮았던 지점 — 자금이 언제 바닥나는지 */
  lowest: number
  lowestDate?: string
  endBalance: number
  from: string
  to: string
}

export function lastDayOfMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const i = y * 12 + (m - 1) + delta
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' 과 일(day)로 실제 날짜를 만든다. 그 달에 없는 날이면 말일. */
export function dayInMonth(ym: string, day: number): string {
  const last = lastDayOfMonth(ym)
  const d = Math.min(Math.max(Math.round(day) || 1, 1), last)
  return `${ym}-${String(d).padStart(2, '0')}`
}

/** 줄을 놓는 순서 — 같은 날이면 들어온 뒤 나간다(그날 실제로 쓸 수 있는 돈 기준). */
const SOURCE_RANK: Record<RowSource, number> = { opening: 0, income: 1, event: 2, expense: 3 }

export function buildTimeline(input: {
  /** 오늘(KST). 이 날부터 그린다. */
  today: string
  /** 앞으로 몇 달 — 6이면 이번 달 포함 6개월 */
  months: number
  opening?: { date: string; amount: number }
  installments: TimelineInstallment[]
  expenses: TimelineExpense[]
  events: TimelineEvent[]
  /** 달러 환산율 (원/USD) */
  usdRate: number
}): Timeline {
  const { today, months, opening, installments, expenses, events, usdRate } = input

  const from = opening?.date && opening.date < today ? opening.date : today
  const lastMonth = addMonth(monthOf(today), Math.max(months, 1) - 1)
  const to = `${lastMonth}-${String(lastDayOfMonth(lastMonth)).padStart(2, '0')}`

  const krw = (amount: number, currency: 'KRW' | 'USD') =>
    currency === 'USD' ? Math.round(amount * usdRate) : amount

  const rows: TimelineRow[] = []

  if (opening) {
    rows.push({
      key: 'opening',
      date: from,
      label: '기준 잔고',
      amount: opening.amount,
      source: 'opening',
      balance: 0,
    })
  }

  // ── 수금 (계약관리 연동) ────────────────────────────────────────────────
  for (const it of installments) {
    if (it.status === 'paid') continue
    // 해지·환불 건은 앞으로 들어올 돈이 아니다. 납기일이 남아 있다고 그대로 세면
    // 자금이 있는 것처럼 보인다 — 실제로 그런 계약이 표에 끼어 있었다.
    if (it.contractStatus === 'cancelled' || it.contractStatus === 'terminated') continue
    if (it.refundStatus === 'requested' || it.refundStatus === 'completed') continue
    const remaining = (it.amount || 0) - (it.paidAmount || 0)
    if (remaining <= 0) continue
    const due = (it.dueDate || '').slice(0, 10)
    if (!due) continue
    if (due > to) continue
    // 납기가 지난 미수금은 사라지는 돈이 아니라 '아직 못 받은 돈'이다. 기준일로
    // 당겨 세우고 연체 표시를 달아 둔다 — 빼 버리면 잔액이 실제보다 낮게 보인다.
    const overdue = due < from
    const date = overdue ? from : due
    const who = [it.studentName, it.contractorName].filter(Boolean).join(' · ')
    rows.push({
      key: `inst-${it.id}`,
      date,
      label: [who, it.label].filter(Boolean).join(' ') || '수금',
      detail: it.schoolName || undefined,
      amount: krw(remaining, it.currency),
      source: 'income',
      balance: 0,
      overdue: overdue || undefined,
      foreign: it.currency === 'USD' ? { amount: remaining, currency: 'USD' } : undefined,
    })
  }

  // ── 고정비 (매달 같은 날) ───────────────────────────────────────────────
  const startM = monthOf(from)
  for (let i = 0; ; i++) {
    const ym = addMonth(startM, i)
    if (ym > lastMonth) break
    for (const e of expenses) {
      if (e.startMonth && ym < e.startMonth) continue
      if (e.endMonth && ym > e.endMonth) continue
      const date = dayInMonth(ym, e.payDay)
      if (date < from || date > to) continue
      rows.push({
        key: `exp-${e.id}-${ym}`,
        date,
        label: e.name,
        amount: -krw(e.amount, e.currency),
        source: 'expense',
        balance: 0,
        foreign: e.currency === 'USD' ? { amount: e.amount, currency: 'USD' } : undefined,
      })
    }
  }

  // ── 단건 (대출·일시 수입/지출) ──────────────────────────────────────────
  for (const ev of events) {
    if (ev.kind === 'opening') continue          // 기준 잔고는 위에서 따로 세웠다
    const date = (ev.eventDate || '').slice(0, 10)
    if (!date || date < from || date > to) continue
    rows.push({
      key: `ev-${ev.id}`,
      date,
      label: ev.label,
      detail: ev.notes || undefined,
      amount: krw(ev.amount, ev.currency),
      source: 'event',
      balance: 0,
      settled: ev.settled,
      foreign: ev.currency === 'USD' ? { amount: ev.amount, currency: 'USD' } : undefined,
    })
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.source !== b.source) return SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
    return a.key < b.key ? -1 : 1
  })

  // ── 잔액 따라가기 ───────────────────────────────────────────────────────
  let balance = 0
  let lowest = Infinity
  let lowestDate: string | undefined
  const byMonth = new Map<string, MonthSummary>()

  for (const r of rows) {
    balance += r.amount
    r.balance = balance

    if (r.source !== 'opening') {
      if (balance < lowest) { lowest = balance; lowestDate = r.date }
    }

    const ym = monthOf(r.date)
    let m = byMonth.get(ym)
    if (!m) {
      m = { month: ym, inflow: 0, outflow: 0, endBalance: balance, lowest: balance, lowestDate: r.date }
      byMonth.set(ym, m)
    }
    if (r.source !== 'opening') {
      if (r.amount >= 0) m.inflow += r.amount
      else m.outflow += -r.amount
    }
    m.endBalance = balance
    if (balance < m.lowest) { m.lowest = balance; m.lowestDate = r.date }
  }

  if (lowest === Infinity) {
    lowest = opening?.amount ?? 0
    lowestDate = undefined
  }

  return {
    rows,
    months: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    lowest,
    lowestDate,
    endBalance: balance,
    from,
    to,
  }
}
