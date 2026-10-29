/** Canonicalize partner/academy names so mistyped duplicates collapse to one.
 *  Keyed by space-stripped name so "아트앤 아이디자인" etc. also map. */
const PARTNER_NAME_ALIASES: Record<string, string> = {
  '아트앤아이디자인': '아트앤디자인랩',
  // 같은 곳인데 '김효진' · '김효진수학' · '김효진 수학' 세 가지로 적혀 있었다.
  // 인보이스 줄이 서로 다른 학원처럼 보이고, 파트너사 수수료율도 '김효진' 쪽만
  // 따로 놀았다. ('김효진 수학' 은 띄어쓰기를 지운 키로 아래 항목에 걸린다.)
  '김효진': '김효진수학',
  '김효진수학': '김효진수학',
}

export function canonicalPartnerName(name?: string): string {
  const n = (name || '').trim()
  if (!n) return n
  const key = n.replace(/\s+/g, '')
  return PARTNER_NAME_ALIASES[key] || PARTNER_NAME_ALIASES[n] || n
}
