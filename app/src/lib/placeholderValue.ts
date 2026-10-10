/**
 * '값이 없다'는 뜻으로 적힌 글자를 가려낸다.
 *
 * 계약서를 읽은 모델이 빈 칸에 빈 문자열 대신 `null`, '없음', '-' 같은 글자를
 * 흘려 넣는 일이 있다. 그대로 두면 학생정보에 '`null`' 이라는 값이 박히고,
 * 자동 채움은 빈칸만 채우므로 나중에 덮어쓰이지도 않는다.
 */

const PLACEHOLDERS = new Set([
  'null', 'none', 'nil', 'undefined', 'unknown', 'n/a', 'na', 'nan',
  'blank', 'empty', 'tbd', 'todo', '-', '--', '—',
  '없음', '없슴', '미상', '미정', '미기재', '기재없음', '해당없음', '해당사항없음',
  '공란', '빈칸', '정보없음', '확인불가', '알수없음',
])

/**
 * 따옴표·백틱 껍질을 벗긴다 — 모델이 `` `null` `` 처럼 감싸 보낸다.
 * 괄호는 벗기지 않는다. '박보람(모)' 처럼 이름의 일부인 경우가 있다.
 */
function unwrap(s: string): string {
  let t = s.trim()
  for (let i = 0; i < 3; i++) {
    const next = t.replace(/^[`'"「『]+/, '').replace(/[`'"」』]+$/, '').trim()
    if (next === t) break
    t = next
  }
  return t
}

/** 이 값은 '값 없음'인가 */
export function isPlaceholderValue(raw: unknown): boolean {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return true
  const inner = unwrap(s)
  if (!inner) return true
  // 글자도 숫자도 없으면 값이 아니다 ('"}' 같은 찌꺼기)
  if (!/[\p{L}\p{N}]/u.test(inner)) return true
  return PLACEHOLDERS.has(inner.toLowerCase().replace(/\s+/g, ''))
}

/** 값이면 다듬어 돌려주고, '값 없음'이면 빈 문자열. */
export function cleanValue(raw: unknown): string {
  if (isPlaceholderValue(raw)) return ''
  return unwrap(typeof raw === 'string' ? raw : '')
}
