import { cleanValue } from '@/lib/placeholderValue'

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

/**
 * 계약서 PDF 에서 읽은 보조 정보. 계약 입력은 사람이 하므로, 여기 값은
 * 계약 칸이 비어 있을 때만 쓴다 — 손으로 적은 값이 언제나 우선이다.
 */
export interface PdfExtractSource {
  fields?: Record<string, string>
  extractedAt?: string
}

export interface ContractSource {
  /** 계약서 PDF 에서 읽은 값 (계약 칸이 빈 항목을 메운다) */
  pdfExtract?: PdfExtractSource
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
  /** 이 값이 어디서 왔나 — 사람이 적은 계약 칸인지, 계약서를 읽은 것인지 */
  source: 'contract' | 'pdf'
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

/** 비교할 때는 겉모양 차이를 무시한다 — 공백·하이픈·대소문자. */
function sameValue(a: string, b: string): boolean {
  const norm = (v: string) => v.replace(/[\s-]/g, '').toLowerCase()
  return norm(a) === norm(b)
}

/**
 * 학부모연락처 칸에 넣을 한 줄 — '전화번호 이름'.
 * 360 에는 학부모 이름만 담는 칸이 없어 한 칸에 함께 적는다.
 * 번호가 따로 없으면 하나만 적힌 번호(phone)를 갈음해 쓴다.
 */
export function parentContactLine(c: ContractSource, studentContact?: string): string {
  // parentPhone 이 없으면 구분 없이 적힌 phone 을 갈음해 쓴다. 다만 그 번호가 학생
  // 연락처로 이미 쓰이고 있으면 학부모 번호가 아니다 — 이름 옆에 엉뚱한 번호가
  // 붙으면 사람이 알아채기 어려우므로 그럴 땐 번호 없이 이름만 둔다.
  const fallback = sameValue((c.phone || '').trim(), (studentContact || '').trim()) ? '' : (c.phone || '')
  const tel = ((c.parentPhone || fallback) || '').trim()
  const name = cleanParentName(c.contractorName)
  return [tel, name].filter(Boolean).join(' ')
}

/** 계약서에서 뽑아 올 수 있는 값 전부 (학생정보 상태와 무관하게). */
function candidates(contract: ContractSource, student?: StudentTarget): AutofillField[] {
  const pdf = contract.pdfExtract?.fields || {}

  /** 사람이 적은 계약 칸이 먼저, 비어 있으면 계약서에서 읽은 값. */
  const pick = (manual: string | undefined, pdfKey: string): { v: string; source: 'contract' | 'pdf' } => {
    const m = cleanValue(manual)
    if (m) return { v: m, source: 'contract' }
    // 모델이 빈 칸에 `null`·'없음' 같은 글자를 흘려 넣는다 — 값으로 치지 않는다.
    const p = cleanValue(pdf[pdfKey])
    // 값이 없으면 출처를 따질 것도 없다. 'pdf' 로 두면 빈 값 때문에 줄 전체가
    // 계약서에서 온 것처럼 표시된다.
    return { v: p, source: p ? 'pdf' : 'contract' }
  }

  const out: AutofillField[] = []
  const add = (key: AutofillKey, label: string, got: { v: string; source: 'contract' | 'pdf' }) => {
    if (got.v) out.push({ key, label, value: got.v, text: got.v, source: got.source })
  }

  add('school', '학교', pick(contract.schoolName, 'schoolName'))
  add('grade', '학년', pick(contract.gradeAtContract, 'gradeAtContract'))
  add('koreanName', '학생 한글 이름', pick(contract.studentName, 'studentName'))
  add('name', '학생 영문 이름', pick(contract.studentNameEn, 'studentNameEn'))
  add('email', '학생 이메일', pick(contract.studentEmail, 'studentEmail'))
  add('contact', '학생 연락처', pick(contract.studentPhone, 'studentPhone'))

  // 학부모연락처 칸 하나에 '전화번호 이름' 으로 함께 적는다 (이름만 담는 칸이 따로 없다).
  const tel = pick(contract.parentPhone, 'parentPhone')
  const nm = pick(contract.contractorName, 'contractorName')
  const line = parentContactLine(
    { parentPhone: tel.v, phone: contract.phone, contractorName: nm.v },
    student?.contact,
  )
  // 한 쪽이라도 계약서에서 온 값이면 '계약서' 로 표시한다 — 사람이 판단할 근거가 된다.
  if (line) out.push({
    key: 'parentName', label: '학부모 연락처·이름', value: line, text: line,
    source: tel.source === 'pdf' || nm.source === 'pdf' ? 'pdf' : 'contract',
  })

  add('parentEmail', '학부모 이메일', pick(contract.parentEmail, 'parentEmail'))
  add('address', '주소', pick(contract.address, 'address'))
  return out
}

/**
 * 채울 수 있는 빈칸 목록. 학생정보가 비어 있고 계약에 값이 있는 칸만.
 * 하나도 없으면 빈 배열.
 */
export function contractAutofillFields(
  student: StudentTarget,
  contract: ContractSource,
): AutofillField[] {
  return candidates(contract, student).filter(f => blank(student[f.key]))
}

/** 지금 적힌 값과 계약서 값이 서로 다른 칸. */
export interface AutofillDiff extends AutofillField {
  /** 지금 학생정보에 적혀 있는 값 */
  current: string
}

/**
 * 이미 적혀 있지만 계약서와 값이 다른 칸.
 *
 * 빈 칸만 채우다 보니, 계약서에 더 자세한 값이 있어도(학부모 칸에 이름만 있고
 * 번호가 빠진 경우 등) 화면에 보이지도 않았다. 보여는 주되 기본은 선택하지 않는다 —
 * 서비스팀이 나중에 고친 값이 더 정확할 수 있다.
 */
export function contractAutofillDiffs(
  student: StudentTarget,
  contract: ContractSource,
): AutofillDiff[] {
  const out: AutofillDiff[] = []
  for (const f of candidates(contract, student)) {
    const cur = student[f.key]
    const curText = typeof cur === 'number' ? String(cur) : (cur || '').trim()
    if (!curText) continue                       // 빈 칸은 '채우기' 쪽에서 다룬다
    if (sameValue(curText, String(f.value))) continue
    out.push({ ...f, current: curText })
  }
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
