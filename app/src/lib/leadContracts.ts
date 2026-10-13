/**
 * 리드 상세의 '계약 정보'에 어떤 계약을 붙일지 고른다.
 *
 * 예전에는 계약서 학생명에 리드 이름이 '들어 있기만' 하면 붙였다(ilike %이름%).
 * 계약서 학생명은 '정서영 | Daniel', '김호진 | Daniel' 처럼 영문 애칭이 함께 적히는데,
 * 이름이 'Daniel'인 리드에는 서로 다른 두 가족의 계약이 모두 따라붙었다.
 * 'Kim' 같은 흔한 성이면 수십 건이 붙는다.
 *
 * 그래서 '들어 있는지'가 아니라 '이름 조각이 통째로 같은지'로 보고,
 * 그 조각이 여러 학생에게 동시에 걸리면(= 누구인지 가릴 수 없으면) 쓰지 않는다.
 * 계약관리에서 리드를 직접 연결한 계약은 이름과 무관하게 언제나 붙는다.
 */
import { contractKeys, ambiguousContractNameKeys, MIN_NAME_KEY_LENGTH } from './contractReconcile'

const key = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()

export interface LeadContractRow {
  leadId?: string
  studentName?: string
  contractorName?: string
  /** 계약서에 적힌 연락처들 — 대표/학부모/학생. 하나라도 리드와 맞아야 이름을 믿는다. */
  phone?: string
  parentPhone?: string
  studentPhone?: string
  /** 계약서에 적힌 이메일들 — 학부모/학생. */
  parentEmail?: string
  studentEmail?: string
}

export interface LeadForLink {
  id?: string
  studentName?: string
  parentName?: string
  phone?: string
  email?: string
}

/**
 * 연락처 비교용 키. 숫자만 남기고 국가번호를 국내 형식으로 맞춘다.
 * '010-5278-3204' / '01052783204' / '1052783204' / '+821052783204' 를 하나로 본다.
 * 9자리 미만은 사람을 가릴 수 없으니 버린다.
 */
export function phoneKey(raw?: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('8210')) d = '0' + d.slice(2)
  else if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  if (d.length === 10 && d.startsWith('10')) d = '0' + d
  return d.length >= 9 ? d : ''
}

const emailKey = (raw?: string) => (raw || '').trim().toLowerCase()

/**
 * 계약서와 리드가 같은 사람을 가리키는지, 이름 말고 '닿는 수단'으로 확인한다.
 * 동명이인이 흔해서 이름만으로는 못 가린다 — 김지현(모) 둘의 계약이 서로의
 * 리드에 붙어 있었다. 연락처나 이메일이 하나라도 같아야 이름을 믿는다.
 */
function contactMatches(lead: LeadForLink, r: LeadContractRow): boolean {
  const lp = phoneKey(lead.phone)
  if (lp) {
    for (const p of [r.parentPhone, r.studentPhone, r.phone]) {
      if (phoneKey(p) === lp) return true
    }
  }
  const le = emailKey(lead.email)
  if (le) {
    for (const e of [r.parentEmail, r.studentEmail]) {
      if (emailKey(e) === le) return true
    }
  }
  return false
}

/** 리드 쪽 후보 키 — 학생명·부모명을 구분기호로 쪼갠 조각들(너무 짧은 건 제외). */
function leadKeys(lead: LeadForLink): { student: Set<string>; parent: Set<string> } {
  const pick = (v?: string) =>
    new Set(contractKeys(v).filter(k => k.length >= MIN_NAME_KEY_LENGTH))
  return { student: pick(lead.studentName), parent: pick(lead.parentName) }
}

/**
 * 이 리드의 계약만 고른다.
 *
 * 붙이는 근거:
 *  1. 계약에 이 리드가 직접 연결돼 있다(가장 정확, 이름 안 봄)
 *  2·3. 연락처나 이메일이 같고, 그 위에 학생명 또는 계약자명 조각이 통째로 같다.
 *       이름만으로는 절대 붙이지 않는다 — 동명이인이 흔하다.
 *       이미 다른 리드에 연결된 계약도 이름으로 끌어오지 않는다.
 */
export function pickLeadContracts<T extends LeadContractRow>(
  lead: LeadForLink,
  rows: readonly T[],
): T[] {
  const ambiguousStudent = ambiguousContractNameKeys(rows)
  // 계약자(부모) 이름도 같은 잣대로 — 한 부모 이름이 여러 학생 계약에 걸리는 건
  // 형제·자매일 수 있으니 '학생명 기준'으로만 모호성을 따진다.
  const parentOwners = new Map<string, Set<string>>()
  for (const r of rows) {
    const whole = key(r.studentName)
    for (const k of contractKeys(r.contractorName)) {
      const set = parentOwners.get(k) || new Set<string>()
      if (whole) set.add(whole)
      parentOwners.set(k, set)
    }
  }

  const { student, parent } = leadKeys(lead)

  return rows.filter(r => {
    if (lead.id && r.leadId === lead.id) return true          // ① 직접 연결

    // 이미 다른 리드의 계약이면 이름으로 끌어오지 않는다.
    // 계약관리에서 리드를 골라 붙였거나 계약에서 리드를 만든 건은 임자가 정해졌다.
    // 그런데도 이름만 보고 가져오는 바람에, 학부모 이름이 같은 동명이인(김지현)의
    // 계약이 남의 리드에 '계약 1건'으로 떠 있었다.
    if (r.leadId) return false

    // 이름은 혼자서는 근거가 못 된다. 연락처나 이메일이 맞을 때만 이름을 본다.
    // 계약서에 연락처도 이메일도 없거나 리드 쪽이 비어 있으면 가릴 방법이 없으므로
    // 붙이지 않는다 — 계약관리에서 리드를 연결해 주면 ①로 정확히 잡힌다.
    if (!contactMatches(lead, r)) return false

    for (const k of contractKeys(r.studentName)) {            // ② 학생명 + 연락처/이메일
      if (k.length < MIN_NAME_KEY_LENGTH) continue
      if (ambiguousStudent.has(k)) continue
      if (student.has(k)) return true
    }

    for (const k of contractKeys(r.contractorName)) {         // ③ 계약자(부모)명 + 연락처/이메일
      if (k.length < MIN_NAME_KEY_LENGTH) continue
      if ((parentOwners.get(k)?.size ?? 0) > 1) continue      // 한 이름에 학생이 여럿이면 못 가린다
      if (parent.has(k)) return true
    }
    return false
  })
}
