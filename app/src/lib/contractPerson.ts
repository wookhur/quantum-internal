/**
 * 계약서의 사람 정보 — 학생과 학부모를 각자의 칸에 나눠 담는다.
 *
 * 예전에는 '학부모 성명 / 학생 이름 / 연락처' 세 칸뿐이었다. 누구 번호인지 적을 데가
 * 없어서 번호가 이름 칸으로 흘러들었고(`010-7165-4123 박신춘`), 그 값이 그대로
 * Student 360 으로 넘어갔다. 그래서 계약과 학생을 이름으로 맞출 수 없게 됐다.
 */
export interface ContractPersonValues {
  studentName: string
  studentNameEn: string
  studentPhone: string
  studentEmail: string
  contractorName: string
  parentPhone: string
  parentEmail: string
}

export const EMPTY_CONTRACT_PERSON: ContractPersonValues = {
  studentName: '', studentNameEn: '', studentPhone: '', studentEmail: '',
  contractorName: '', parentPhone: '', parentEmail: '',
}

/**
 * 누구 것인지 구분 없던 옛 `phone` 칸에 넣을 값.
 * 옛 조회·엑셀·리드 매칭이 아직 이 칸을 보기 때문에 비워 두지 않는다.
 */
export function legacyContractPhone(
  v: Pick<ContractPersonValues, 'parentPhone' | 'studentPhone'>,
  fallback?: string,
): string | undefined {
  return v.parentPhone.trim() || v.studentPhone.trim() || fallback?.trim() || undefined
}
