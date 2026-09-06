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

/** 관리지수가 '왜 이 점수인지' + '무엇을 하면 오르는지'를 항목별로 설명한다.
 *  (팝오버 용. 최근 30일 기준.) */
export function kpiBreakdownText(sk: {
  score: number; meetings30d: number; meetingsScore: number
  meetingsThisMonth?: number; expectedMeetings?: number
  summaryScore: number; summaryHave?: number; summaryTotal?: number
  reportsScore: number; reportsPresent?: number; reportsTotal?: number; reportsMissing?: string[]
  followupScore: number; followupHave?: number; followupTotal?: number
} | undefined): string {
  if (!sk) return 'KPI — (데이터 없음)'
  const n1 = (v: number) => (Math.round(v * 10) / 10).toString()
  const mTotal = sk.summaryTotal ?? sk.meetings30d   // 최근 30일 미팅 수
  const mThis = sk.meetingsThisMonth ?? 0

  // 부족한 항목: '무엇을 하면 +N' 만 모은다.
  const gaps: { do: string; gain: number }[] = []
  if (sk.meetingsScore < 4) {
    const need = Math.max(1, 2 - mThis)
    gaps.push({ do: `이번 달 미팅 ${need}회 더 진행`, gain: 4 - sk.meetingsScore })
  }
  if (mTotal > 0 && sk.summaryScore < 2) {
    const miss = mTotal - (sk.summaryHave ?? 0)
    gaps.push({ do: `미팅 요약 리포트 ${miss}건 등록`, gain: 2 - sk.summaryScore })
  }
  if (sk.reportsScore < 2) {
    const missing = sk.reportsMissing ?? []
    gaps.push({ do: `${missing.length ? missing.join('·') : '필수 리포트'} 등록`, gain: 2 - sk.reportsScore })
  }
  if (mTotal > 0 && sk.followupScore < 2) {
    const miss = mTotal - (sk.followupHave ?? 0)
    gaps.push({ do: `다음 미팅 일정 ${miss}건 입력`, gain: 2 - sk.followupScore })
  }

  const lines: string[] = [`관리지수 ${n1(sk.score)} / 10`]
  if (gaps.length === 0) {
    lines.push('', '모든 항목 충족 👍 (더 올릴 것 없음)')
    return lines.join('\n')
  }
  const potential = Math.min(10, sk.score + gaps.reduce((s, g) => s + g.gain, 0))
  lines.push('', '보완하면 오르는 항목:')
  for (const g of gaps.sort((a, b) => b.gain - a.gain)) {
    lines.push(`· ${g.do}  → +${n1(g.gain)}`)
  }
  lines.push('', `= 다 채우면 ${n1(potential)}점`)

  // 이미 충족한 항목을 한 줄로(안심용)
  const ok: string[] = []
  if (sk.meetingsScore >= 4) ok.push('미팅 횟수')
  if (mTotal > 0 && sk.summaryScore >= 2) ok.push('미팅 요약')
  if (sk.reportsScore >= 2) ok.push('필수 리포트')
  if (mTotal > 0 && sk.followupScore >= 2) ok.push('다음 일정')
  if (ok.length) lines.push(`충족 ✓ ${ok.join(' · ')}`)
  return lines.join('\n')
}
