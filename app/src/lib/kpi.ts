// Management score (관리지수) tier colors.
// score is 0..KPI_MAX (10) — or undefined when there is no data → gray.
//
// 2026-08: 사전자료(준비 자료) 1점을 점수에서 제외하면서 만점이 11 → 10 으로 줄었다.
// 기준을 그대로 두면 초록이 82% → 90% 로 조용히 어려워지므로, 같은 난이도가
// 유지되도록 환산했다. (9/11≈82% → 8/10=80%, 7/11≈64% → 6/10=60%, 5/11≈45% → 4.5/10=45%)
export const KPI_TIERS = {
  green: 8,
  yellow: 6,
  red: 4.5,
} as const

export function kpiDotColor(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-300'
  if (score >= KPI_TIERS.green) return 'bg-emerald-500'
  if (score >= KPI_TIERS.yellow) return 'bg-yellow-400'
  if (score >= KPI_TIERS.red) return 'bg-red-500'
  return 'bg-black'
}
