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
}

export interface LeadForLink {
  id?: string
  studentName?: string
  parentName?: string
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
 * 붙이는 근거는 셋 중 하나:
 *  1. 계약에 이 리드가 직접 연결돼 있다(가장 정확, 이름 안 봄)
 *  2. 계약서 학생명 조각 하나가 리드 학생명 조각과 통째로 같다 — 단, 그 조각이
 *     다른 학생의 계약에도 걸리면 쓰지 않는다
 *  3. 계약자(부모) 이름 조각이 리드 부모명 조각과 통째로 같다 — 같은 제한
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

    for (const k of contractKeys(r.studentName)) {            // ② 학생명
      if (k.length < MIN_NAME_KEY_LENGTH) continue
      if (ambiguousStudent.has(k)) continue
      if (student.has(k)) return true
    }

    for (const k of contractKeys(r.contractorName)) {         // ③ 계약자(부모)명
      if (k.length < MIN_NAME_KEY_LENGTH) continue
      if ((parentOwners.get(k)?.size ?? 0) > 1) continue      // 한 이름에 학생이 여럿이면 못 가린다
      if (parent.has(k)) return true
    }
    return false
  })
}
