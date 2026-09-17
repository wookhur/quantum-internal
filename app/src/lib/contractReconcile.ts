/**
 * 계약관리 '서비스 진행중'(계약 건수) ↔ Student360 '활성'(학생 명수) 대조.
 *
 * 두 숫자는 단위가 다르다. 계약은 '건', 학생은 '명'이다. 그래서 다음 경우
 * 숫자가 어긋나는데, 어긋남 자체가 잘못이 아닌 것도 섞여 있다.
 *   · 장학생            → 무료라 계약이 없는 것이 정상
 *   · 재계약 등 중복 계약 → 한 학생이 진행중 계약을 2건 가지면 건수가 더 많다
 *   · 상태 미변경        → 계약은 완료·취소인데 학생 상태가 아직 '진행중'
 *   · 동명이인          → 이름으로 맞추므로 두 사람이 한 명으로 합쳐진다
 *
 * 그래서 숫자 하나만 비교하지 않고, 차이를 항목별로 분해해 어디서 몇 명/몇 건이
 * 벌어졌는지 그대로 보여준다. 아래 식은 항상 성립한다(반례가 없도록 구성했다):
 *
 *   활성학생수 − 계약없음 − 장학생 + 활성학생없는계약 + 중복계약추가분 = 진행중계약건수
 */

/** 계약관리에서 '서비스 진행중'으로 세는 상태값. ContractsPage 의 activeCount 와 같아야 한다. */
export const IN_SERVICE_CONTRACT_STATUSES = ['active', 'expiring_soon'] as const

export interface ReconcileStudent {
  name?: string
  scholarship?: boolean
}

export interface ReconcileContract {
  studentName?: string
  status?: string
}

export interface ContractReconciliation {
  /** 진행중 계약 건수 */
  contractCount: number
  /** 이름 기준 활성 학생 수 (동명이인은 한 명으로 합쳐진 값) */
  studentCount: number
  /** 활성 학생인데 진행중 계약이 없음 — 확인이 필요한 항목 */
  noContract: string[]
  /** 그중 장학생 — 무료라 계약 없음이 정상 */
  scholarshipNoContract: string[]
  /** 진행중 계약인데 대응하는 활성 학생이 없음(건수) — 360 미등록 또는 학생 상태 미변경 */
  noActiveStudent: string[]
  /** 한 학생에 진행중 계약이 2건 이상 (표시용 라벨) */
  duplicated: string[]
  /** 중복 계약 때문에 건수가 명수보다 많아진 분량 */
  duplicateExtra: number
  /** 활성 학생 중 이름이 겹치는 사람 — 계약 매칭이 잘못될 수 있다 */
  sameNameStudents: string[]
  /** 사람이 손봐야 하는 어긋남이 있는지 (장학생·중복계약은 정상이므로 제외) */
  needsAttention: boolean
}

/** 이름 매칭 키: 공백 차이를 무시한다. */
const norm = (s?: string) => (s || '').replace(/\s+/g, '')

/**
 * @param activeStudents Student360 '활성' 학생만 넘긴다(아카이브 제외).
 * @param contracts 전체 계약. 진행중 상태만 내부에서 골라낸다.
 */
export function reconcileContracts(
  activeStudents: readonly ReconcileStudent[],
  contracts: readonly ReconcileContract[],
): ContractReconciliation {
  const inService = contracts.filter(
    c => !!c.status && (IN_SERVICE_CONTRACT_STATUSES as readonly string[]).includes(c.status),
  )

  // 활성 학생을 이름 키로 모은다. 같은 이름이 둘이면 동명이인으로 따로 표시한다.
  const byStudent = new Map<string, { name: string; scholarship: boolean; count: number }>()
  for (const s of activeStudents) {
    if (!s.name) continue
    const k = norm(s.name)
    const hit = byStudent.get(k)
    if (hit) { hit.count += 1; hit.scholarship = hit.scholarship || !!s.scholarship }
    else byStudent.set(k, { name: s.name, scholarship: !!s.scholarship, count: 1 })
  }
  const sameNameStudents = [...byStudent.values()].filter(v => v.count > 1).map(v => `${v.name} (${v.count}명)`)

  // 진행중 계약을 학생 이름별로 모은다.
  const byContract = new Map<string, string[]>()
  for (const c of inService) {
    if (!c.studentName) continue
    const k = norm(c.studentName)
    const list = byContract.get(k)
    if (list) list.push(c.studentName)
    else byContract.set(k, [c.studentName])
  }

  // ① 활성 학생인데 진행중 계약이 없음 (장학생은 정상이므로 따로)
  const noContract: string[] = []
  const scholarshipNoContract: string[] = []
  for (const [k, s] of byStudent) {
    if (byContract.has(k)) continue
    if (s.scholarship) scholarshipNoContract.push(s.name)
    else noContract.push(s.name)
  }

  // ② 진행중 계약인데 활성 학생이 없음  ③ 한 학생에 진행중 계약 2건 이상
  const noActiveStudent: string[] = []
  const duplicated: string[] = []
  let duplicateExtra = 0
  for (const [k, names] of byContract) {
    if (!byStudent.has(k)) { noActiveStudent.push(...names); continue }
    if (names.length > 1) {
      duplicated.push(`${names[0]} (${names.length}건)`)
      duplicateExtra += names.length - 1
    }
  }

  return {
    contractCount: inService.length,
    studentCount: byStudent.size,
    noContract, scholarshipNoContract, noActiveStudent,
    duplicated, duplicateExtra, sameNameStudents,
    // 장학생·중복계약은 설명 가능한 정상 차이. 나머지만 사람이 손봐야 한다.
    needsAttention: noContract.length > 0 || noActiveStudent.length > 0 || sameNameStudents.length > 0,
  }
}
