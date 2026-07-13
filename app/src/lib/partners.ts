/** Canonicalize partner/academy names so mistyped duplicates collapse to one.
 *  Keyed by space-stripped name so "아트앤 아이디자인" etc. also map. */
const PARTNER_NAME_ALIASES: Record<string, string> = {
  '아트앤아이디자인': '아트앤디자인랩',
}

export function canonicalPartnerName(name?: string): string {
  const n = (name || '').trim()
  if (!n) return n
  const key = n.replace(/\s+/g, '')
  return PARTNER_NAME_ALIASES[key] || PARTNER_NAME_ALIASES[n] || n
}
