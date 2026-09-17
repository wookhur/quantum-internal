/**
 * 계약관리 '서비스 진행중'(계약 건수) ↔ Student360 '활성'(학생 명수) 대조.
 *
 * 두 숫자는 단위가 다르다. 계약은 '건', 학생은 '명'이다. 그래서 다음 경우
 * 숫자가 어긋나는데, 어긋남 자체가 잘못이 아닌 것도 섞여 있다.
 *   · 장학생            → 무료라 계약이 없는 것이 정상
 *   · 재계약 등 중복 계약 → 한 학생이 진행중 계약을 2건 가지면 건수가 더 많다
 *   · 상태 미변경        → 계약은 끝났는데 학생 상태가 아직 '진행중'
 *
 * ── 이름 표기가 두 표에서 다르다 (이게 가장 큰 함정) ──
 * service_students 는 영문명(name)과 한글명(korean_name)을 따로 갖지만,
 * contracts.student_name 은 한 칸에 섞여 들어온다.
 *     '김은서 | Amy', '백승수 (Jason Baek)', '김민재', '국유담 |  Ryudahm'
 * 그래서 영문명만으로 맞추면 거의 전부 실패하고, 같은 학생이 '계약 없음'과
 * '학생 없음' 양쪽 명단에 동시에 올라온다. 구분기호로 쪼개 조각마다,
 * 그리고 학생의 영문명·한글명 모두를 후보 키로 두어 맞춘다.
 */

/** 계약관리에서 '서비스 진행중'으로 세는 상태값. ContractsPage 의 activeCount 와 같아야 한다.
 *  (상태는 만료일을 반영해 이미 계산된 값이 넘어온다 — mapContract 참고) */
export const IN_SERVICE_CONTRACT_STATUSES = ['active', 'expiring_soon'] as const

export interface ReconcileStudent {
  name?: string
  koreanName?: string
  scholarship?: boolean
}

export interface ReconcileContract {
  studentName?: string
  status?: string
}

export interface ContractReconciliation {
  contractCount: number
  /** 활성 학생 수(사람 기준) */
  studentCount: number
  /** 활성 학생인데 진행중 계약이 없음 — 확인이 필요 */
  noContract: string[]
  /** 그중 장학생 — 무료라 계약 없음이 정상 */
  scholarshipNoContract: string[]
  /** 진행중 계약인데 대응하는 활성 학생이 없음(건수) */
  noActiveStudent: string[]
  /** 한 학생에 진행중 계약이 2건 이상 (표시용) */
  duplicated: string[]
  /** 중복 계약 때문에 건수가 명수보다 많아진 분량 */
  duplicateExtra: number
  /** 이름이 여러 학생에게 걸려 어느 쪽 계약인지 가릴 수 없음(건수) */
  ambiguous: string[]
  /** 이름이 겹치는 활성 학생 */
  sameNameStudents: string[]
  needsAttention: boolean
}

/** 매칭 키: 공백 제거 + 소문자(대소문자·띄어쓰기 편차를 흡수). */
const key = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()

/** 계약의 student_name 을 구분기호로 쪼개 후보 키를 만든다. 전체 문자열도 후보에 넣는다. */
function contractKeys(studentName?: string): string[] {
  const raw = studentName || ''
  const parts = raw.split(/[|()/,·\-–]/).map(key).filter(Boolean)
  const whole = key(raw)
  return [...new Set([whole, ...parts].filter(Boolean))]
}

/** 학생의 영문명·한글명을 모두 후보 키로 만든다. */
function studentKeys(s: ReconcileStudent): string[] {
  return [...new Set([key(s.name), key(s.koreanName)].filter(Boolean))]
}

interface Entry {
  label: string
  scholarship: boolean
  keys: string[]
  contracts: string[]
}

export function reconcileContracts(
  activeStudents: readonly ReconcileStudent[],
  contracts: readonly ReconcileContract[],
): ContractReconciliation {
  const inService = contracts.filter(
    c => !!c.status && (IN_SERVICE_CONTRACT_STATUSES as readonly string[]).includes(c.status),
  )

  // 학생 한 명당 항목 하나. 영문명·한글명 모든 키를 소유자 목록에 등록한다.
  const entries: Entry[] = []
  const owners = new Map<string, Entry[]>()
  for (const s of activeStudents) {
    const keys = studentKeys(s)
    if (keys.length === 0) continue
    const label = [s.name, s.koreanName].filter(Boolean).join(' · ')
    const e: Entry = { label, scholarship: !!s.scholarship, keys, contracts: [] }
    entries.push(e)
    for (const k of keys) {
      const list = owners.get(k)
      if (list) list.push(e)
      else owners.set(k, [e])
    }
  }

  // 이름이 겹치는 활성 학생(한 키에 두 명 이상)
  const sameNameStudents = [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([, list]) => list.map(e => e.label).join(' / '))
  const uniqueSameName = [...new Set(sameNameStudents)]

  // 계약을 학생에 붙인다.
  const noActiveStudent: string[] = []
  const ambiguous: string[] = []
  for (const c of inService) {
    const name = c.studentName || ''
    const hits = new Set<Entry>()
    for (const k of contractKeys(name)) {
      for (const e of owners.get(k) || []) hits.add(e)
    }
    if (hits.size === 0) { noActiveStudent.push(name || '(이름 없음)'); continue }
    if (hits.size > 1) { ambiguous.push(name || '(이름 없음)'); continue }
    const [only] = [...hits]
    only.contracts.push(name)
  }

  const noContract: string[] = []
  const scholarshipNoContract: string[] = []
  const duplicated: string[] = []
  let duplicateExtra = 0
  for (const e of entries) {
    if (e.contracts.length === 0) {
      if (e.scholarship) scholarshipNoContract.push(e.label)
      else noContract.push(e.label)
    } else if (e.contracts.length > 1) {
      duplicated.push(`${e.label} (${e.contracts.length}건)`)
      duplicateExtra += e.contracts.length - 1
    }
  }

  return {
    contractCount: inService.length,
    studentCount: entries.length,
    noContract, scholarshipNoContract, noActiveStudent,
    duplicated, duplicateExtra,
    ambiguous, sameNameStudents: uniqueSameName,
    // 장학생·재계약은 설명 가능한 정상 차이. 나머지만 사람이 손봐야 한다.
    needsAttention:
      noContract.length > 0 || noActiveStudent.length > 0 ||
      ambiguous.length > 0 || uniqueSameName.length > 0,
  }
}
