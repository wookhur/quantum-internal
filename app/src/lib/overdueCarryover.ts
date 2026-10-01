/**
 * 월별 수금의 '이월 연체' 집계.
 *
 * 왜 필요한가: 월별 수금은 납기일이 그 달에 속한 건만 보여줬다. 그래서 9월에 받지 못한
 * 돈이 10월로 넘어가면 목록에서도, 연체 금액에서도 사라졌다. 받을 때까지 따라다녀야 하는
 * 숫자가 달력에 묶여 있던 셈이다.
 *
 * 여기서는 '선택한 달보다 앞선 납기인데 아직 안 받은 건'을 따로 모은다.
 * 통화(KRW/USD)는 섞지 않는다 — 합산은 통화별로 따로 해야 한다.
 */

export interface CarryoverInstallment {
  id: string
  contractId: string
  dueDate?: string
  amount: number
  paidAmount: number
  status: string
  currency?: string
}

/** 아직 받지 못한 금액. 음수가 나오지 않게 0 에서 끊는다(과납 처리분 보호). */
export function remainingOf(inst: CarryoverInstallment): number {
  return Math.max(inst.amount - inst.paidAmount, 0)
}

/** 수금이 끝나지 않은 건인가. */
export function isUnpaid(inst: CarryoverInstallment): boolean {
  return inst.status !== 'paid' && remainingOf(inst) > 0
}

/**
 * 선택한 달(YYYY-MM)보다 앞선 납기의 미수금 건을 오래된 순으로 돌려준다.
 * 납기일이 없는 건은 어느 달로 넣을지 알 수 없어 제외한다.
 */
export function carriedOverdue<T extends CarryoverInstallment>(
  installments: readonly T[],
  monthKey: string,
): T[] {
  const firstDay = `${monthKey}-01`
  return installments
    .filter(inst => !!inst.dueDate && inst.dueDate < firstDay && isUnpaid(inst))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
}

/** 통화별 이월 연체 합계. */
export function carriedTotals(list: readonly CarryoverInstallment[]): { krw: number; usd: number; count: number } {
  let krw = 0
  let usd = 0
  for (const inst of list) {
    if (inst.currency === 'USD') usd += remainingOf(inst)
    else krw += remainingOf(inst)
  }
  return { krw, usd, count: list.length }
}

/** 이월분이 원래 몇 월 것인지 — 표시용 라벨(예: '9월'). */
export function originMonthLabel(dueDate?: string): string {
  const m = (dueDate || '').slice(5, 7)
  return m ? `${Number(m)}월` : ''
}

/** 같은 해가 아니면 연도까지 붙인다(예: 2025년 12월분이 2026년 화면에 남은 경우). */
export function originMonthLabelFor(dueDate: string | undefined, viewMonthKey: string): string {
  if (!dueDate) return ''
  const label = originMonthLabel(dueDate)
  const dueYear = dueDate.slice(0, 4)
  const viewYear = viewMonthKey.slice(0, 4)
  return dueYear === viewYear ? label : `${dueYear}년 ${label}`
}
