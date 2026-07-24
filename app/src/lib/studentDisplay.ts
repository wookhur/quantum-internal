// 학생 선택 드롭다운 공통 표기·정렬
// 규칙: 한글이름 먼저 + 영어이름 뒤 (예: "김은서 Amy Kim"),
//       정렬은 한글이름 ㄱㄴㄷ순 (한글이름 없는 학생은 뒤로).

export interface NamedStudent { name: string; koreanName?: string }

/** "김은서 Amy Kim" 형식 (한글 먼저). 한글이 없으면 영어만. */
export function studentPickerLabel(s: NamedStudent): string {
  return [s.koreanName, s.name].filter(Boolean).join(' ')
}

/** 한글이름 ㄱㄴㄷ순 정렬(한글이름 있는 학생 우선, 없는 학생은 영어명으로 뒤에). */
export function compareStudentsKo(a: NamedStudent, b: NamedStudent): number {
  const ak = !!a.koreanName, bk = !!b.koreanName
  if (ak !== bk) return ak ? -1 : 1
  const av = a.koreanName || a.name, bv = b.koreanName || b.name
  return av.localeCompare(bv, 'ko')
}
