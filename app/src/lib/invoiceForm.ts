/**
 * 인보이스 폼 — 저장 전 날짜 검사
 *
 * 발행일(`<input type="date">`)과 정산월(`<input type="month">`)은 지우거나
 * 반만 입력하면 값이 빈 문자열이 된다. 그대로 보내면 Postgres 가
 * `invalid input syntax for type date: ""` 를 던지는데, 이 말로는 어느 칸이
 * 문제인지 알 수 없어 제출이 막힌 채로 끝난다.
 * 그래서 보내기 전에 여기서 걸러 어느 칸인지 한국어로 알려 준다.
 */

const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

/** 'YYYY-MM-DD' 이면서 실제로 있는 날짜인가 (2026-02-31 같은 값을 거른다) */
export function isValidDateInput(v: string | undefined | null): boolean {
  const s = (v || '').trim()
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** 'YYYY-MM' 이면서 월이 1–12 인가 */
export function isValidMonthInput(v: string | undefined | null): boolean {
  const s = (v || '').trim()
  if (!MONTH_RE.test(s)) return false
  const m = Number(s.slice(5, 7))
  return m >= 1 && m <= 12
}

/** 막는 이유를 돌려준다. 문제 없으면 null. */
export function invoiceDateError(invoiceDate: string, invoiceMonth: string): string | null {
  if (!isValidDateInput(invoiceDate)) {
    return '발행일이 비어 있거나 올바르지 않습니다. 맨 위 발행일 칸의 날짜를 확인해 주세요.'
  }
  if (!isValidMonthInput(invoiceMonth)) {
    return '정산월이 비어 있거나 올바르지 않습니다. 맨 위 정산월 칸을 확인해 주세요.'
  }
  return null
}
