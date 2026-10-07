/**
 * 회당 정산 관리비.
 *
 * 기존 방식은 '미팅 2회 = 1개월분'이고 금액은 발행할 때 손으로 적었다. 사람마다
 * 단가가 다르고 매번 적어야 해서 틀리기 쉬웠다.
 *
 * 새 방식은 컨설턴트마다 연 관리비를 정해 두고, 연 기준 횟수(보통 30회)로 나눈
 * 1회분 단가 × 그 달에 진행한 미팅 수로 금액이 저절로 나온다.
 * 인보이스에는 '10월 1회차', '10월 2회차' 처럼 그 달 안에서 순서대로 적는다.
 *
 * 연 관리비가 정해지지 않은 컨설턴트는 종전 방식 그대로다(이 파일을 거치지 않는다).
 */

export interface AnnualFee {
  /** 연 관리비(원) */
  annualAmount: number
  /** 연 기준 횟수 — 1회분 = annualAmount / sessions */
  sessions: number
}

/** 1회분 단가. 원 단위로 반올림한다(4,000,000 ÷ 30 = 133,333원). */
export function perSessionAmount(fee: AnnualFee): number {
  if (!fee.annualAmount || !fee.sessions || fee.sessions <= 0) return 0
  return Math.round(fee.annualAmount / fee.sessions)
}

export interface SessionLike {
  /** 미팅 id — 지급완료 표시의 키가 된다 */
  id: string
  /** YYYY-MM-DD */
  date: string
  /** 학생 표시 이름 */
  studentLabel: string
}

export interface SessionFeeLine {
  id: string
  /** '10월 2회차 · 박태현 (Taehyun Park)' */
  label: string
  amount: number
  /** 'YYYY-MM' — 소급 표시의 원래 달 */
  month: string
  /** 그 달 안에서 몇 번째인지 */
  index: number
  date: string
}

const monthOf = (d: string) => (d || '').slice(0, 7)
const monthNum = (m: string) => Number(m.slice(5, 7))

/**
 * 한 컨설턴트의 미팅들을 달별로 묶어 회차 줄로 만든다.
 *
 * 회차는 '그 달 1일부터 말일까지' 안에서 날짜순으로 1부터 센다. 달이 바뀌면 다시 1부터.
 * 같은 날 두 건이면 id 순으로 정해 렌더마다 순서가 바뀌지 않게 한다.
 */
export function sessionFeeLines(
  sessions: readonly SessionLike[],
  fee: AnnualFee,
  months?: readonly string[],
): SessionFeeLine[] {
  const unit = perSessionAmount(fee)
  const want = months ? new Set(months) : null

  const sorted = [...sessions]
    .filter(s => !!s.date)
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.id.localeCompare(b.id)))

  const seen = new Map<string, number>()      // 달 → 지금까지 센 횟수
  const out: SessionFeeLine[] = []
  for (const s of sorted) {
    const m = monthOf(s.date)
    if (!m) continue
    const index = (seen.get(m) || 0) + 1
    seen.set(m, index)                        // 범위 밖 달도 세어야 회차 번호가 밀리지 않는다
    if (want && !want.has(m)) continue
    out.push({
      id: s.id,
      label: `${monthNum(m)}월 ${index}회차 · ${s.studentLabel}`,
      amount: unit,
      month: m,
      index,
      date: s.date,
    })
  }
  return out
}
