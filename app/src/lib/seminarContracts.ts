/**
 * 세미나 성과표의 '계약' 칼럼을 계약관리(contracts)에서 직접 센다.
 *
 * 왜 바꿨나: 원래는 리드의 파이프라인 단계가 'contracted'('계약 완료')인지만 봤다.
 * 계약 업무는 계약관리에서 하고 리드 단계는 사람이 따로 옮겨야 해서, 옮기지 않으면
 * 실제로 계약한 학생이 있어도 성과표에는 0으로 남았다. 계약 사실의 원본은 계약관리이므로
 * 그쪽을 본다.
 *
 * ── 이름 맞추기 ──
 * contracts.student_name 은 '김은서 | Amy', '백승수 (Jason Baek)' 처럼 한 칸에 섞여 들어온다.
 * 리드는 studentName(영문 또는 한글) 한 칸뿐이라 그대로는 거의 맞지 않는다. 그래서
 * 계약명을 구분기호로 쪼갠 후보 키(contractKeys)와 맞춘다.
 *
 * ── 이름만으로는 부족한 경우 ──
 * 리드의 이름 표기와 계약서 표기가 다를 수 있어(영문/한글), 전화·이메일로 Student360
 * 학생기록을 거쳐 그 학생의 영문명·한글명까지 후보 키에 더한다. 전화번호가 가장 강한 키다.
 */
import { contractKeys } from './contractReconcile'

/** 취소된 계약은 세지 않는다(중복·오등록 정리분이 대부분). */
const EXCLUDED_CONTRACT_STATUSES = new Set(['cancelled', 'canceled'])

export interface ContractLite {
  studentName?: string
  contractDate?: string
  status?: string
}

export interface LeadForContract {
  id: string
  studentName?: string
  phone?: string
  email?: string
}

/** Student360 학생기록 — 리드(전화·이메일)와 계약(이름)을 잇는 다리. */
export interface StudentForContract {
  name?: string
  koreanName?: string
  contact?: string
  email?: string
  parentEmail?: string
}

const nameKey = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
const emailKey = (s?: string) => (s || '').trim().toLowerCase()
function phoneKey(raw?: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('8210')) d = '0' + d.slice(2)
  else if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  return d.length >= 9 ? d : ''      // 너무 짧은 값은 키로 쓰지 않는다
}

export interface ContractMatchIndex {
  /** 이름 후보 키 → 그 이름의 계약들 */
  byName: Map<string, ContractLite[]>
  /** 전화/이메일 키 → 그 사람의 학생기록 이름 후보 키들 */
  studentNamesByContact: Map<string, string[]>
}

export function buildContractMatchIndex(
  contracts: readonly ContractLite[],
  students: readonly StudentForContract[],
): ContractMatchIndex {
  const byName = new Map<string, ContractLite[]>()
  for (const c of contracts) {
    if (EXCLUDED_CONTRACT_STATUSES.has((c.status || '').toLowerCase())) continue
    for (const k of contractKeys(c.studentName)) {
      const arr = byName.get(k) || []
      arr.push(c)
      byName.set(k, arr)
    }
  }
  const studentNamesByContact = new Map<string, string[]>()
  for (const s of students) {
    const keys = [nameKey(s.name), nameKey(s.koreanName)].filter(Boolean)
    if (!keys.length) continue
    for (const contact of [phoneKey(s.contact), emailKey(s.email), emailKey(s.parentEmail)]) {
      if (!contact) continue
      const prev = studentNamesByContact.get(contact) || []
      studentNamesByContact.set(contact, [...new Set([...prev, ...keys])])
    }
  }
  return { byName, studentNamesByContact }
}

/** 리드 한 명에 대응하는 계약을 찾는다. 없으면 null. */
export function contractForLead(
  lead: LeadForContract,
  index: ContractMatchIndex,
  opts?: { onOrAfter?: string | null },
): ContractLite | null {
  const candidates = new Set<string>()
  const own = nameKey(lead.studentName)
  if (own) candidates.add(own)
  for (const contact of [phoneKey(lead.phone), emailKey(lead.email)]) {
    if (!contact) continue
    for (const k of index.studentNamesByContact.get(contact) || []) candidates.add(k)
  }
  const after = opts?.onOrAfter || null
  for (const k of candidates) {
    for (const c of index.byName.get(k) || []) {
      // 세미나보다 먼저 맺은 계약은 그 세미나의 성과가 아니다.
      // 계약일이 비어 있으면 판단할 근거가 없으므로 그대로 인정한다.
      if (after && c.contractDate && c.contractDate.slice(0, 10) < after.slice(0, 10)) continue
      return c
    }
  }
  return null
}

/** 계약한 리드의 id 집합. 한 사람이 여러 계약을 가져도 1명으로 센다. */
export function contractedLeadIds(
  leads: readonly LeadForContract[],
  index: ContractMatchIndex,
  opts?: { onOrAfter?: string | null },
): Set<string> {
  const out = new Set<string>()
  for (const l of leads) {
    if (contractForLead(l, index, opts)) out.add(l.id)
  }
  return out
}
