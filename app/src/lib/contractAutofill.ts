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
  schoolName?: string
  gradeAtContract?: string
  address?: string
  phone?: string
  contractDate?: string
  expiryDate?: string
  serviceStartDate?: string
  serviceEndDate?: string
  contractType?: string
  applicationCount?: number
  additionalServices?: string
}

export interface StudentTarget {
  parentName?: string
  contact?: string
  school?: string
  grade?: string
  address?: string
  startDate?: string
  endDate?: string
  contractType?: string
  applicationCount?: number
  additionalServices?: string
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

/** 날짜는 YYYY-MM-DD 로 맞춘다(타임스탬프가 섞여 들어와도). */
const day = (v?: string) => (v || '').slice(0, 10)

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

  push('parentName', '학부모 이름', cleanParentName(contract.contractorName))
  push('contact', '연락처', (contract.phone || '').trim())
  push('school', '학교', (contract.schoolName || '').trim())
  push('grade', '학년', (contract.gradeAtContract || '').trim())
  push('address', '주소', (contract.address || '').trim())
  // 서비스 기간이 따로 적혀 있으면 그쪽이 맞다. 없으면 계약일·만료일로 갈음한다.
  push('startDate', '시작일', day(contract.serviceStartDate) || day(contract.contractDate))
  push('endDate', '종료일', day(contract.serviceEndDate) || day(contract.expiryDate))
  push('contractType', '계약유형', (contract.contractType || '').trim())
  push('applicationCount', '원서 지원수',
    typeof contract.applicationCount === 'number' && contract.applicationCount > 0 ? contract.applicationCount : undefined,
    typeof contract.applicationCount === 'number' ? `${contract.applicationCount}개` : undefined)
  push('additionalServices', '추가 서비스', (contract.additionalServices || '').trim())

  return out
}

/** 고른 칸만 모아 저장용 객체로. */
export function autofillPayload(fields: readonly AutofillField[], picked: ReadonlySet<AutofillKey>): Partial<StudentTarget> {
  const out: Record<string, string | number> = {}
  for (const f of fields) if (picked.has(f.key)) out[f.key] = f.value
  return out as Partial<StudentTarget>
}
