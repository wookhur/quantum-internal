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
  summaryScore: number; summaryHave?: number; summaryTotal?: number
  reportsScore: number; reportsPresent?: number; reportsTotal?: number
  followupScore: number; followupHave?: number; followupTotal?: number
} | undefined): string {
  if (!sk) return 'KPI — (데이터 없음)'
  const n1 = (v: number) => (Math.round(v * 10) / 10).toString()
  const mTotal = sk.summaryTotal ?? sk.meetings30d   // 최근 30일 미팅 수
  const lines: string[] = [`관리지수 ${n1(sk.score)} / 10  (지난 30일 기준)`, '']
  const actions: string[] = []

  // ① 미팅 횟수
  if (sk.meetingsScore >= 4) {
    lines.push(`✓ 미팅 횟수 ${n1(sk.meetingsScore)}/4 — 지난 30일 ${sk.meetings30d}회 (충분)`)
  } else {
    const need = 2 - sk.meetings30d
    lines.push(`△ 미팅 횟수 ${n1(sk.meetingsScore)}/4 — 지난 30일 ${sk.meetings30d}회 (기준 2회)`)
    lines.push(`   → 미팅 ${need}회 더 진행·기록하면 +${n1(need * 2)}`)
    actions.push(`미팅 ${need}회(+${n1(need * 2)})`)
  }

  // ② 미팅 요약 리포트 (미팅에 리포트 링크가 있는가)
  if (mTotal === 0) {
    lines.push(`— 미팅 요약 리포트 0/2 — 지난 30일 미팅이 없어 평가 불가`)
  } else if (sk.summaryScore >= 2) {
    lines.push(`✓ 미팅 요약 리포트 ${n1(sk.summaryScore)}/2 — ${sk.summaryHave}/${mTotal} 미팅에 리포트 있음`)
  } else {
    const miss = mTotal - (sk.summaryHave ?? 0)
    lines.push(`△ 미팅 요약 리포트 ${n1(sk.summaryScore)}/2 — ${sk.summaryHave ?? 0}/${mTotal} 미팅만 리포트 있음`)
    lines.push(`   → 리포트 링크 없는 미팅 ${miss}건에 리포트 등록`)
    actions.push(`리포트 ${miss}건`)
  }

  // ③ 필수 리포트 항목
  if (sk.reportsScore >= 2) {
    lines.push(`✓ 필수 리포트 항목 ${n1(sk.reportsScore)}/2 — ${sk.reportsPresent}/${sk.reportsTotal} 갖춤`)
  } else {
    const miss = (sk.reportsTotal ?? 0) - (sk.reportsPresent ?? 0)
    lines.push(`△ 필수 리포트 항목 ${n1(sk.reportsScore)}/2 — ${sk.reportsPresent ?? 0}/${sk.reportsTotal ?? 0} 갖춤`)
    lines.push(`   → 빠진 필수 리포트 ${miss}개 등록`)
    actions.push(`필수 리포트 ${miss}개`)
  }

  // ④ 다음 미팅 일정 (미팅 리포트에 다음 일정을 적었는가)
  if (mTotal === 0) {
    lines.push(`— 다음 미팅 일정 0/2 — 지난 30일 미팅이 없어 평가 불가`)
  } else if (sk.followupScore >= 2) {
    lines.push(`✓ 다음 미팅 일정 ${n1(sk.followupScore)}/2 — ${sk.followupHave}/${mTotal} 미팅에 기록됨`)
  } else {
    const miss = mTotal - (sk.followupHave ?? 0)
    lines.push(`△ 다음 미팅 일정 ${n1(sk.followupScore)}/2 — ${sk.followupHave ?? 0}/${mTotal} 미팅만 기록`)
    lines.push(`   → 다음 일정 안 적은 미팅 ${miss}건에 다음 미팅 일정 입력`)
    actions.push(`다음 일정 ${miss}건`)
  }

  if (actions.length) { lines.push('', `▶ 지금 올리려면: ${actions.join(' · ')}`) }
  else lines.push('', '▶ 모든 항목 충족 👍')
  return lines.join('\n')
}
