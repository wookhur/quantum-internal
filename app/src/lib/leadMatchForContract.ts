/**
 * 새로 만든 계약이 어느 리드의 고객인지 찾는다.
 *
 * 계약은 계약관리에서 사람이 쓰고, 리드 단계는 세일즈가 따로 옮긴다. 그래서
 * 계약서를 써도 그 리드는 세일즈 목록에 '상담 중'으로 남는 일이 생긴다.
 * 여기서 같은 사람으로 보이는 리드를 찾아 두면, 저장 직후 "이 분이 맞나요?" 하고
 * 물어 리드 단계를 맞출 수 있다. 자동으로 바꾸지는 않는다 — 잘못 짚으면 엉뚱한
 * 리드가 계약 완료로 넘어간다.
 */

export interface LeadLite {
  id: string
  parentName?: string
  studentName?: string
  phone?: string
  email?: string
  pipelineStage: string
}

export interface ContractLite {
  contractorName?: string
  studentName?: string
  phone?: string
  studentEmail?: string
  parentEmail?: string
}

/** 왜 이 리드라고 보는가 — 사람이 판단할 근거로 화면에 보여 준다. */
export type MatchReason = 'phone' | 'email' | 'bothNames' | 'studentName'

export interface LeadMatch {
  lead: LeadLite
  reason: MatchReason
}

/** 전화는 숫자만 남기고 한국 국가번호를 편다 — 82 10 … → 010 … */
export function phoneKey(raw: string | undefined | null): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('8210')) d = '0' + d.slice(2)
  else if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  return d.length >= 9 ? d : ''
}

export function emailKey(raw: string | undefined | null): string {
  return (raw || '').trim().toLowerCase()
}

/**
 * 이름 후보들. 계약서의 학생명은 '김은서 | Amy', '백승수 (Jason Baek)' 처럼
 * 한 칸에 섞여 들어오므로 구분기호로 쪼개 각각을 후보로 삼는다.
 */
export function nameKeys(raw: string | undefined | null): string[] {
  const s = (raw || '').trim()
  if (!s) return []
  const parts = s.split(/[|/·,()[\]]+/).map(p => p.replace(/\s+/g, '').toLowerCase()).filter(Boolean)
  // 너무 짧은 조각은 사람 이름으로 보기 어렵다 (이니셜 등)
  return Array.from(new Set(parts.filter(p => p.length >= 2)))
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some(x => b.includes(x))
}

/**
 * 같은 사람으로 보이는 리드를 찾는다. 확신이 센 순서로 보고, 같은 근거에서
 * 후보가 둘 이상이면 고르지 않는다 — 찍어서 엉뚱한 리드를 옮기느니 안 묻는 게 낫다.
 */
export function findLeadForContract(contract: ContractLite, leads: LeadLite[]): LeadMatch | null {
  const cPhone = phoneKey(contract.phone)
  const cEmails = [emailKey(contract.parentEmail), emailKey(contract.studentEmail)].filter(Boolean)
  const cStudent = nameKeys(contract.studentName)
  const cParent = nameKeys(contract.contractorName)

  const pick = (hits: LeadLite[], reason: MatchReason): LeadMatch | null =>
    hits.length === 1 ? { lead: hits[0], reason } : null

  // ① 전화 — 가장 강하다
  if (cPhone) {
    const hit = pick(leads.filter(l => phoneKey(l.phone) === cPhone), 'phone')
    if (hit) return hit
  }

  // ② 이메일
  if (cEmails.length) {
    const hit = pick(leads.filter(l => cEmails.includes(emailKey(l.email))), 'email')
    if (hit) return hit
  }

  // ③ 학생명 + 학부모명이 둘 다 맞을 때
  if (cStudent.length && cParent.length) {
    const hit = pick(
      leads.filter(l => overlaps(nameKeys(l.studentName), cStudent) && overlaps(nameKeys(l.parentName), cParent)),
      'bothNames',
    )
    if (hit) return hit
  }

  // ④ 학생명만 — 동명이인이 없을 때만
  if (cStudent.length) {
    const hit = pick(leads.filter(l => overlaps(nameKeys(l.studentName), cStudent)), 'studentName')
    if (hit) return hit
  }

  return null
}

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  phone: '연락처가 같습니다',
  email: '이메일이 같습니다',
  bothNames: '학생 이름과 학부모 이름이 같습니다',
  studentName: '학생 이름이 같습니다',
}
