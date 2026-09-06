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

/** 관리지수가 '왜 이 점수인지' 항목별 원인을 여러 줄 텍스트로 설명한다.
 *  (툴팁 title 용. 최근 30일 기준.) */
export function kpiBreakdownText(sk: {
  score: number; meetings30d: number; meetingsScore: number
  summaryScore: number; summaryHave?: number; summaryTotal?: number
  reportsScore: number; reportsPresent?: number; reportsTotal?: number
  followupScore: number; followupHave?: number; followupTotal?: number
} | undefined): string {
  if (!sk) return 'KPI — (데이터 없음)'
  const n1 = (v: number) => v.toFixed(1)
  const lines = [
    `관리지수 ${n1(sk.score)} / 10  (최근 30일)`,
    `· 미팅 횟수: ${sk.meetings30d}회 → ${n1(sk.meetingsScore)}/4  (2회 이상이면 만점)`,
    `· 미팅 요약 리포트: ${sk.summaryHave ?? 0}/${sk.summaryTotal ?? 0} → ${n1(sk.summaryScore)}/2`,
    `· 필수 리포트 항목: ${sk.reportsPresent ?? 0}/${sk.reportsTotal ?? 0} → ${n1(sk.reportsScore)}/2`,
    `· 다음 미팅 일정: ${sk.followupHave ?? 0}/${sk.followupTotal ?? 0} → ${n1(sk.followupScore)}/2`,
  ]
  // 가장 점수를 깎는 항목을 한 줄로 짚어준다.
  const gaps: { label: string; gap: number }[] = [
    { label: '미팅 횟수', gap: 4 - sk.meetingsScore },
    { label: '미팅 요약 리포트', gap: 2 - sk.summaryScore },
    { label: '필수 리포트 항목', gap: 2 - sk.reportsScore },
    { label: '다음 미팅 일정', gap: 2 - sk.followupScore },
  ].filter(g => g.gap > 0.05).sort((a, b) => b.gap - a.gap)
  if (gaps.length) lines.push(`▶ 가장 큰 감점: ${gaps[0].label} (−${n1(gaps[0].gap)})`)
  return lines.join('\n')
}
