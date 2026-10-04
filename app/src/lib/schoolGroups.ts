/**
 * 학교 이름 묶기.
 *
 * 학교는 자유 입력이라 같은 학교가 'Seoul Foreign School', 'seoul foreign school',
 * '  Seoul  Foreign School ' 처럼 여러 표기로 들어온다. 그대로 세면 한 학교가
 * 여러 줄로 쪼개져 인원수를 믿을 수 없다.
 *
 * 그래서 대소문자·공백·문장부호 차이만 지운 키로 묶는다. 보여줄 이름은
 * 그 학교에서 '가장 많이 쓰인 원래 표기'를 그대로 쓴다(멋대로 고쳐 쓰지 않는다).
 *
 * 약칭(SFS ↔ Seoul Foreign School)처럼 글자가 아예 다른 표기는 묶이지 않는다.
 * 그런 건 표에서 두 줄로 보이므로, 학생 정보에서 표기를 맞춰 주면 합쳐진다.
 */

const NO_SCHOOL = ''

/** 묶음 키 — 대소문자·공백·문장부호를 지운 형태. 빈 값이면 ''(미입력). */
export function schoolKey(name?: string | null): string {
  const s = (name || '').normalize('NFKC').trim()
  if (!s) return NO_SCHOOL
  return s
    .toLowerCase()
    .replace(/[.,'"`’‘“”()[\]{}·・/\\_-]/g, '')   // 문장부호
    .replace(/\s+/g, '')                          // 공백 전부
}

export interface SchoolGroup<T> {
  key: string
  /** 화면에 보여줄 이름(가장 많이 쓰인 원래 표기). 미입력이면 ''. */
  label: string
  students: T[]
}

/**
 * 학교별로 묶는다. 인원 많은 순 → 이름 순. 미입력은 항상 맨 뒤.
 */
export function groupBySchool<T>(
  students: readonly T[],
  getSchool: (s: T) => string | undefined,
): SchoolGroup<T>[] {
  const byKey = new Map<string, { students: T[]; spellings: Map<string, number> }>()
  for (const s of students) {
    const raw = (getSchool(s) || '').normalize('NFKC').trim().replace(/\s+/g, ' ')
    const key = schoolKey(raw)
    let g = byKey.get(key)
    if (!g) { g = { students: [], spellings: new Map() }; byKey.set(key, g) }
    g.students.push(s)
    if (raw) g.spellings.set(raw, (g.spellings.get(raw) || 0) + 1)
  }

  const groups: SchoolGroup<T>[] = []
  byKey.forEach((g, key) => {
    groups.push({ key, label: pickSpelling(g.spellings), students: g.students })
  })

  return groups.sort((a, b) => {
    if ((a.key === NO_SCHOOL) !== (b.key === NO_SCHOOL)) return a.key === NO_SCHOOL ? 1 : -1
    const d = b.students.length - a.students.length
    if (d !== 0) return d
    return a.label.localeCompare(b.label, 'ko')
  })
}

/** 가장 많이 쓰인 표기. 동률이면 긴 쪽(정보가 더 많다) → 가나다순. */
function pickSpelling(spellings: Map<string, number>): string {
  let best = ''
  let bestN = 0
  spellings.forEach((n, text) => {
    if (n > bestN
      || (n === bestN && text.length > best.length)
      || (n === bestN && text.length === best.length && text.localeCompare(best, 'ko') < 0)) {
      best = text; bestN = n
    }
  })
  return best
}
