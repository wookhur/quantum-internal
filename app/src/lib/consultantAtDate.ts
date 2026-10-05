/**
 * 그 날짜에 이 학생을 맡고 있던 컨설턴트.
 *
 * 관리비는 '학생의 현재 담당자'에게 청구되고 있었다. 그래서 10월에 인수인계가
 * 있으면 9월 미팅까지 새 담당자 인보이스에 얹혀, 실제로 9월을 맡았던 사람이
 * 받아야 할 관리비를 받지 못했다.
 *
 * 담당자 변경 이력(consultantHistory)에 언제 누구에게 넘겼는지가 남아 있으니
 * 그걸로 '그 시점의 담당자'를 되짚는다.
 *
 * 이력 한 줄은 {from: 넘긴 사람, to: 받은 사람, date: 넘긴 날}.
 * 넘긴 날 '당일부터' 새 담당자다 — 10월 1일 인수인계면 10월 1일 미팅은 새 담당자 몫.
 */

export interface ConsultantChange {
  from?: string
  to: string
  /** YYYY-MM-DD. 비어 있으면 언제 바뀐 건지 알 수 없어 시점 판정에서 뺀다. */
  date?: string
}

export interface StudentWithHistory {
  assignedConsultant?: string
  consultantHistory?: ConsultantChange[]
}

const day = (d?: string) => (d || '').slice(0, 10)

/**
 * date 시점의 담당자 id. 모르면 현재 담당자로 둔다.
 *
 *  · 그 날짜까지 일어난 변경 중 가장 마지막 것의 'to'
 *  · 그 전이라면 첫 변경의 'from'(= 원래 담당자)
 *  · 이력이 없으면 현재 담당자
 */
export function consultantAtDate(s: StudentWithHistory, date?: string): string | undefined {
  const current = s.assignedConsultant || undefined
  const d = day(date)
  const history = (s.consultantHistory || []).filter(h => h && h.to)
  if (!d || history.length === 0) return current

  // 날짜가 적힌 변경만 시점 판정에 쓴다 — 날짜가 없으면 어디에 놓을지 알 수 없다.
  const dated = history.filter(h => day(h.date)).sort((a, b) => day(a.date).localeCompare(day(b.date)))
  if (dated.length === 0) return current

  let applied: ConsultantChange | undefined
  for (const h of dated) {
    if (day(h.date) <= d) applied = h          // 넘긴 날 당일부터 새 담당자
    else break
  }
  if (applied) return applied.to || current
  // 첫 변경보다 앞선 시점 — 그때는 그 변경의 'from' 이 맡고 있었다.
  return dated[0].from || current
}
