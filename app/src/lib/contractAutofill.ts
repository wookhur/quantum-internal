/**
 * 계약서 내용으로 학생정보의 '빈칸'만 채운다.
 *
 * 계약관리에 계약서를 올리면 학부모·연락처·학교·학년·주소·기간이 계약 레코드에
 * 들어간다(업로드 시 자동 추출). 그런데 Student 360 의 학생정보는 따로 입력해야 해서,
 * 같은 내용을 두 번 적거나 빈칸으로 남는다.
 *
 * 이미 계약에 들어 있는 값을 학생정보의 빈칸에 옮긴다.
 * 적혀 있는 값은 절대 덮어쓰지 않는다 — 서비스팀이 나중에 고친 값이 더 정확할 수 있다.
 * 무엇이 채워질지 먼저 보여 주고 사람이 고른 것만 저장한다.
 */

export interface ContractSource {
  contractorName?: string
  studentName?: string
  studentNameEn?: string
  schoolName?: string
  gradeAtContract?: string
  address?: string
  /** 누구 것인지 구분 없이 하나만 적힌 번호 */
  phone?: string
  studentPhone?: string
  parentPhone?: string
  studentEmail?: string
  parentEmail?: string
}

export interface StudentTarget {
  /** 학부모연락처 칸 — '전화번호 이름' 으로 함께 적는다 */
  parentName?: string
  /** 학생 연락처 */
  contact?: string
  /** 학생 한글 이름 */
  koreanName?: string
  /** 학생 영문 이름 */
  name?: string
  email?: string
  parentEmail?: string
  school?: string
  grade?: string
  address?: string
}

/** 학생정보에 저장할 때 쓰는 키 */
export type AutofillKey = keyof StudentTarget

export interface AutofillField {
  key: AutofillKey
  label: string
  /** 화면에 보여 줄 값 */
  text: string
  /** 실제로 저장할 값 */
  value: string | number
}

const blank = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (typeof v === 'string' && v.trim() === '')

/**
 * 계약자 이름에서 관계 표시를 뗀다 — '김지현(모)' → '김지현'.
 * 괄호 안이 짧은 관계어일 때만 뗀다. '이윤지(Lee)' 같은 건 그대로 둔다.
 */
const RELATION = new Set(['모', '부', '모친', '부친', '어머니', '아버지', '학부모'])
export function cleanParentName(raw?: string): string {
  const s = (raw || '').trim()
  const m = s.match(/^(.*?)[(（]\s*([^)）]{1,3})\s*[)）]\s*$/)
  if (m && RELATION.has(m[2].trim())) return m[1].trim()
  return s
}

/**
 * 학부모연락처 칸에 넣을 한 줄 — '전화번호 이름'.
 * 360 에는 학부모 이름만 담는 칸이 없어 한 칸에 함께 적는다.
 * 번호가 따로 없으면 하나만 적힌 번호(phone)를 갈음해 쓴다.
 */
export function parentContactLine(c: ContractSource): string {
  const tel = (c.parentPhone || c.phone || '').trim()
  const name = cleanParentName(c.contractorName)
  return [tel, name].filter(Boolean).join(' ')
}

/**
 * 채울 수 있는 빈칸 목록. 학생정보가 비어 있고 계약에 값이 있는 칸만.
 * 하나도 없으면 빈 배열.
 */
export function contractAutofillFields(
  student: StudentTarget,
  contract: ContractSource,
): AutofillField[] {
  const out: AutofillField[] = []
  const push = (key: AutofillKey, label: string, value: string | number | undefined, text?: string) => {
    if (!blank(student[key])) return        // 이미 적혀 있으면 건드리지 않는다
    if (blank(value)) return                // 계약에도 없으면 채울 게 없다
    out.push({ key, label, value: value as string | number, text: text ?? String(value) })
  }

  push('school', '학교', (contract.schoolName || '').trim())
  push('grade', '학년', (contract.gradeAtContract || '').trim())
  push('koreanName', '학생 한글 이름', (contract.studentName || '').trim())
  push('name', '학생 영문 이름', (contract.studentNameEn || '').trim())
  push('email', '학생 이메일', (contract.studentEmail || '').trim())
  push('contact', '학생 연락처', (contract.studentPhone || '').trim())
  // 학부모연락처 칸 하나에 '전화번호 이름' 으로 함께 적는다 (이름만 담는 칸이 따로 없다).
  push('parentName', '학부모 연락처·이름', parentContactLine(contract))
  push('parentEmail', '학부모 이메일', (contract.parentEmail || '').trim())
  push('address', '주소', (contract.address || '').trim())

  return out
}

/** 후보에 못 든 칸과 그 이유. '왜 하나밖에 안 뜨지?' 를 화면에서 바로 알 수 있게. */
export interface SkippedField {
  label: string
  reason: 'filled' | 'missing'
}

export function contractAutofillSkipped(
  student: StudentTarget,
  contract: ContractSource,
): SkippedField[] {
  const all = contractAutofillFields({}, contract)          // 계약에 값이 있는 칸 전부
  const names = new Map(all.map(f => [f.key, f.label]))
  const fillable = new Set(contractAutofillFields(student, contract).map(f => f.key))
  const out: SkippedField[] = []
  // 계약에는 있는데 학생정보가 이미 차 있어 건너뛴 칸
  names.forEach((label, key) => {
    if (!fillable.has(key)) out.push({ label, reason: 'filled' })
  })
  // 계약서 자체에 값이 없는 칸
  const everything = contractAutofillFields({}, {
    contractorName: 'x', studentName: 'x', studentNameEn: 'x', schoolName: 'x',
    gradeAtContract: 'x', address: 'x', studentPhone: 'x', parentPhone: 'x',
    studentEmail: 'x', parentEmail: 'x',
  })
  for (const f of everything) {
    if (!names.has(f.key)) out.push({ label: f.label, reason: 'missing' })
  }
  return out
}

/** 고른 칸만 모아 저장용 객체로. */
export function autofillPayload(fields: readonly AutofillField[], picked: ReadonlySet<AutofillKey>): Partial<StudentTarget> {
  const out: Record<string, string | number> = {}
  for (const f of fields) if (picked.has(f.key)) out[f.key] = f.value
  return out as Partial<StudentTarget>
}
