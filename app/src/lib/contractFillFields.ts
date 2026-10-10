/**
 * 계약관리에 이미 올려 둔 계약서로 그 계약의 빈 칸을 채운다.
 *
 * 계약서를 올린 곳이 두 군데였다. 목록 상단의 'PDF 업로드'는 AI 로 읽어 새 계약을
 * 만들고, 계약 상세의 '실물 계약서'는 파일만 붙여 둔다. 뒤쪽으로 올린 계약서는
 * 읽히지 않으니 칸이 비어 있고, Student 360 의 '계약서에서 채우기'도 채울 것이
 * 없다. 여기서는 그 붙여 둔 계약서를 읽어 계약의 빈 칸만 메운다.
 *
 * 규칙은 Student 360 쪽과 같다 — 빈 칸만 채우고, 이미 적힌 값은 건드리지 않는다.
 */

import type { Contract } from '@/types'

/** 계약서에서 읽어 올 수 있는 칸 */
export type ContractFillKey =
  | 'contractorName' | 'studentName' | 'schoolName' | 'gradeAtContract'
  | 'contractDate' | 'expiryDate' | 'address' | 'phone'
  | 'studentEmail' | 'parentEmail' | 'totalAmount'

export const CONTRACT_FILL_LABELS: Record<ContractFillKey, string> = {
  contractorName: '계약자(학부모)명',
  studentName: '학생명',
  schoolName: '학교명',
  gradeAtContract: '학년',
  contractDate: '계약일',
  expiryDate: '만료일',
  address: '주소',
  phone: '연락처',
  studentEmail: '학생 이메일',
  parentEmail: '학부모 이메일',
  totalAmount: '계약 금액',
}

/** 계약서에서 읽어 낸 값 (추출 함수의 응답 모양) */
/**
 * 통화(currency)와 입금계좌(paymentAccount)는 다루지 않는다 — 계약 레코드가 늘
 * 기본값(KRW/KR)을 들고 있어 '비어 있다'는 상태가 없고, 추측으로 덮으면 위험하다.
 */
export interface ExtractedForFill {
  contractorName?: string | null
  studentName?: string | null
  schoolName?: string | null
  gradeAtContract?: string | null
  contractDate?: string | null
  expiryDate?: string | null
  address?: string | null
  phone?: string | null
  studentEmail?: string | null
  parentEmail?: string | null
  totalAmount?: number | null
  currency?: string | null
  paymentAccount?: string | null
}

export interface ContractFillItem {
  key: ContractFillKey
  label: string
  /** 화면에 보여 줄 값 */
  display: string
  /** 저장할 값 */
  value: string | number
}

export interface ContractFillPlan {
  /** 채울 수 있는 칸 */
  fill: ContractFillItem[]
  /** 이미 적혀 있어 건너뛴 칸 */
  skippedFilled: string[]
  /** 계약서에서 값을 못 찾은 칸 */
  skippedMissing: string[]
}

const KEYS: ContractFillKey[] = [
  'contractorName', 'studentName', 'schoolName', 'gradeAtContract',
  'contractDate', 'expiryDate', 'address', 'phone',
  'studentEmail', 'parentEmail', 'totalAmount',
]

/** 지금 그 칸이 비어 있나 */
function isBlank(contract: Contract, key: ContractFillKey): boolean {
  if (key === 'totalAmount') return !contract.totalAmount
  const v = contract[key as Exclude<ContractFillKey, 'totalAmount'>]
  return !(typeof v === 'string' && v.trim())
}

/** 계약서에서 읽은 값이 쓸 만한가 */
function usable(key: ContractFillKey, raw: ExtractedForFill): string | number | null {
  if (key === 'totalAmount') {
    const n = raw.totalAmount
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
  }
  const v = raw[key as Exclude<ContractFillKey, 'totalAmount'>]
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) return null
  // 글자도 숫자도 없는 값은 찌꺼기다
  if (!/[\p{L}\p{N}]/u.test(t)) return null
  // 날짜는 YYYY-MM-DD 로 적힌 것만 받는다 — 어설픈 값이 날짜 칸에 들어가면 저장이 깨진다
  if (key === 'contractDate' || key === 'expiryDate') {
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  }
  return t
}

export function contractFillPlan(contract: Contract, extracted: ExtractedForFill): ContractFillPlan {
  const fill: ContractFillItem[] = []
  const skippedFilled: string[] = []
  const skippedMissing: string[] = []

  for (const key of KEYS) {
    const label = CONTRACT_FILL_LABELS[key]
    if (!isBlank(contract, key)) { skippedFilled.push(label); continue }
    const value = usable(key, extracted)
    if (value === null) { skippedMissing.push(label); continue }
    fill.push({
      key,
      label,
      display: key === 'totalAmount' ? Number(value).toLocaleString() : String(value),
      value,
    })
  }

  return { fill, skippedFilled, skippedMissing }
}

/** 고른 칸만 모아 업데이트 payload 로 만든다. */
export function contractFillPayload(items: ContractFillItem[], chosen: Set<ContractFillKey>) {
  const out: Record<string, string | number> = {}
  for (const it of items) {
    if (chosen.has(it.key)) out[it.key] = it.value
  }
  return out
}
