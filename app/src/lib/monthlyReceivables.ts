import type { PaymentInstallment } from '@/types'

/**
 * 월별 미수금 집계.
 *
 * 월별 수금 화면은 한 달씩만 보여준다. 회계에서 필요한 건 "몇 월에 얼마를 못 받았고,
 * 지금 밀려 있는 돈이 얼마인가"를 여러 달에 걸쳐 한눈에 보는 표다.
 *
 * 지키는 것
 *   - 통화(KRW/USD)는 절대 섞지 않는다. 섞어 더하면 원화로 보이는 엉뚱한 수가 나온다.
 *   - 취소·해지 계약은 받을 돈이 아니다 — 전부 뺀다.
 *   - 환불 완료분은 수금에서 뺀다. 들어왔다 나간 돈은 받은 돈이 아니다.
 *   - 납기일이 없는 분납은 어느 달에 넣을지 알 수 없어 집계에서 빼고, 그 사실을 따로 센다
 *     (조용히 사라지면 합계가 안 맞는데 이유를 알 수 없다).
 */

export type Currency = 'KRW' | 'USD'

/** 아직 받지 못한 금액. 과납이 있어도 음수가 되지 않게 0 에서 끊는다. */
export function remaining(inst: PaymentInstallment): number {
  return Math.max(inst.amount - inst.paidAmount, 0)
}

/** 순수금액 — 환불 완료분을 뺀다. */
export function netCollected(inst: PaymentInstallment): number {
  const refunded = inst.refundStatus === 'completed' ? (inst.refundAmount || 0) : 0
  return Math.max(inst.paidAmount - refunded, 0)
}

/** 받을 돈으로 칠 분납인가 — 취소·해지 계약은 뺀다. */
export function isCollectable(inst: PaymentInstallment): boolean {
  const s = inst.contract?.status
  return s !== 'cancelled' && s !== 'terminated'
}

export interface ReceivableMonth {
  /** 'YYYY-MM' — 납기일이 속한 달 */
  monthKey: string
  /** 그 달에 받기로 한 금액 */
  billed: number
  /** 그중 받은 금액(환불 차감) */
  collected: number
  /** 못 받은 금액 = billed - collected */
  unpaid: number
  /** 미수 중 납기가 지난 것 */
  overdue: number
  /** 미수 중 아직 납기 전인 것 */
  notDue: number
  /** 미수가 남은 건수 */
  count: number
  /** 미수가 남은 분납 (상세 표시·엑셀용), 납기 오래된 순 */
  items: PaymentInstallment[]
}

/** 미수금 연령 분석 — 얼마나 오래 밀렸는지. 회계에서 회수 가능성을 가늠하는 기준. */
export interface AgingBuckets {
  notDue: number      // 아직 납기 전
  d1to30: number      // 1~30일 연체
  d31to60: number
  d61to90: number
  over90: number
  total: number
}

export const AGING_LABEL: Record<keyof Omit<AgingBuckets, 'total'>, string> = {
  notDue: '납기 전',
  d1to30: '1~30일',
  d31to60: '31~60일',
  d61to90: '61~90일',
  over90: '90일 초과',
}

/** 납기일이 오늘로부터 며칠 지났나. 지나지 않았으면 0. */
export function daysPastDue(dueDate: string, today: string): number {
  if (dueDate >= today) return 0
  const a = new Date(dueDate + 'T00:00:00').getTime()
  const b = new Date(today + 'T00:00:00').getTime()
  return Math.floor((b - a) / 86_400_000)
}

export interface ReceivablesResult {
  months: ReceivableMonth[]
  aging: AgingBuckets
  /** 현재 남은 미수 전체 */
  totalUnpaid: number
  totalOverdue: number
  /** 납기일이 없어 어느 달로도 넣지 못한 분납 — 숨기지 않고 알린다 */
  undated: { count: number; amount: number }
}

/**
 * 통화 하나에 대한 월별 미수금.
 *
 * @param from  'YYYY-MM' 이 달부터 (없으면 자료에 있는 가장 이른 달)
 * @param to    'YYYY-MM' 이 달까지 (없으면 가장 늦은 달)
 * @param today 'YYYY-MM-DD' 연체 판단 기준일
 */
export function monthlyReceivables(
  installments: readonly PaymentInstallment[],
  opts: { currency: Currency; from?: string; to?: string; today: string },
): ReceivablesResult {
  const { currency, from, to, today } = opts

  const mine = installments.filter(
    inst => isCollectable(inst) && (inst.currency || 'KRW') === currency,
  )

  const undated = { count: 0, amount: 0 }
  const dated: PaymentInstallment[] = []
  for (const inst of mine) {
    if (!inst.dueDate) {
      const r = remaining(inst)
      if (r > 0) { undated.count++; undated.amount += r }
      continue
    }
    dated.push(inst)
  }

  // 표에 내보낼 달의 범위. 안 주면 자료가 걸쳐 있는 전체 구간.
  const keys = dated.map(i => i.dueDate!.slice(0, 7)).sort()
  const first = from || keys[0]
  const last = to || keys[keys.length - 1]

  const byMonth = new Map<string, ReceivableMonth>()
  const blank = (monthKey: string): ReceivableMonth => ({
    monthKey, billed: 0, collected: 0, unpaid: 0, overdue: 0, notDue: 0, count: 0, items: [],
  })
  // 자료가 없는 달도 빈 줄로 둔다 — 중간이 비면 표를 읽다가 건너뛴 줄 알게 된다
  if (first && last) {
    for (const k of monthRange(first, last)) byMonth.set(k, blank(k))
  }

  const aging: AgingBuckets = { notDue: 0, d1to30: 0, d31to60: 0, d61to90: 0, over90: 0, total: 0 }
  let totalUnpaid = 0
  let totalOverdue = 0

  for (const inst of dated) {
    const key = inst.dueDate!.slice(0, 7)
    const rest = remaining(inst)

    // 연령 분석·총계는 고른 기간과 무관하게 지금 남아 있는 전부를 본다.
    // 기간을 좁혔다고 밀린 돈이 없어지는 게 아니다.
    if (rest > 0) {
      totalUnpaid += rest
      const over = daysPastDue(inst.dueDate!, today)
      if (over === 0) aging.notDue += rest
      else {
        totalOverdue += rest
        if (over <= 30) aging.d1to30 += rest
        else if (over <= 60) aging.d31to60 += rest
        else if (over <= 90) aging.d61to90 += rest
        else aging.over90 += rest
      }
      aging.total += rest
    }

    if (first && last && (key < first || key > last)) continue
    const row = byMonth.get(key) || blank(key)
    row.billed += inst.amount
    row.collected += netCollected(inst)
    if (rest > 0) {
      row.unpaid += rest
      row.count++
      row.items.push(inst)
      if (daysPastDue(inst.dueDate!, today) > 0) row.overdue += rest
      else row.notDue += rest
    }
    byMonth.set(key, row)
  }

  const months = Array.from(byMonth.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  for (const m of months) {
    m.items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  }

  return { months, aging, totalUnpaid, totalOverdue, undated }
}

/** 'YYYY-MM' 부터 'YYYY-MM' 까지의 달 목록. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  // 자료가 이상해 범위가 뒤집히거나 터무니없이 길면 멈춘다(화면이 멎지 않게)
  let guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

/** 'YYYY-MM' → '2026년 3월' */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${y}년 ${Number(m)}월`
}

/** 오늘 날짜(한국 기준) 'YYYY-MM-DD' — 집계 기준일. */
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
