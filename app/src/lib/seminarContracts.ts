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
import { contractKeys, ambiguousContractNameKeys } from './contractReconcile'

/** 취소된 계약은 세지 않는다(중복·오등록 정리분이 대부분). */
const EXCLUDED_CONTRACT_STATUSES = new Set(['cancelled', 'canceled'])

export interface ContractLite {
  /** 계약 자체의 id. 한 계약에 리드가 둘 이상 붙어도 한 건으로 세는 기준. */
  id?: string
  /** 계약관리에서 리드와 직접 연결된 경우 — 이름 매칭보다 정확하므로 최우선. */
  leadId?: string
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

export interface ContractMatchIndex<T extends ContractLite = ContractLite> {
  /** 리드 id → 그 리드에 직접 연결된 계약들 */
  byLeadId: Map<string, T[]>
  /** 이름 후보 키 → 그 이름의 계약들 */
  byName: Map<string, T[]>
  /** 사람을 특정할 수 없는 키(여러 학생에게 걸림, 한 글자). 이름만으로는 잇지 않는다. */
  ambiguousNames: Set<string>
  /** 전화/이메일 키 → 그 사람의 학생기록 이름 후보 키들 */
  studentNamesByContact: Map<string, string[]>
}

export function buildContractMatchIndex<T extends ContractLite>(
  contracts: readonly T[],
  students: readonly StudentForContract[],
): ContractMatchIndex<T> {
  const byLeadId = new Map<string, T[]>()
  const byName = new Map<string, T[]>()
  for (const c of contracts) {
    if (EXCLUDED_CONTRACT_STATUSES.has((c.status || '').toLowerCase())) continue
    if (c.leadId) {
      const arr = byLeadId.get(c.leadId) || []
      arr.push(c)
      byLeadId.set(c.leadId, arr)
    }
    for (const k of contractKeys(c.studentName)) {
      const arr = byName.get(k) || []
      arr.push(c)
      byName.set(k, arr)
    }
  }
  // 'daniel' 처럼 서로 다른 학생의 계약에 동시에 걸리는 키는 이름만으로 쓸 수 없다.
  const usable = contracts.filter(c => !EXCLUDED_CONTRACT_STATUSES.has((c.status || '').toLowerCase()))
  const ambiguousNames = ambiguousContractNameKeys(usable)

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
  return { byLeadId, byName, studentNamesByContact, ambiguousNames }
}

/** 리드 한 명에 대응하는 계약을 찾는다. 없으면 null. */
export function contractForLead<T extends ContractLite>(
  lead: LeadForContract,
  index: ContractMatchIndex<T>,
  opts?: { onOrAfter?: string | null },
): T | null {
  const after0 = opts?.onOrAfter || null
  const notBefore = (c: T) =>
    // 세미나보다 먼저 맺은 계약은 그 세미나의 성과가 아니다.
    // 계약일이 비어 있으면 판단할 근거가 없으므로 그대로 인정한다.
    !(after0 && c.contractDate && c.contractDate.slice(0, 10) < after0.slice(0, 10))
  // 계약관리에서 리드를 직접 연결해 둔 경우가 가장 정확하다.
  for (const c of index.byLeadId.get(lead.id) || []) {
    if (notBefore(c)) return c
  }
  const candidates = new Set<string>()
  const own = nameKey(lead.studentName)
  if (own) candidates.add(own)
  for (const contact of [phoneKey(lead.phone), emailKey(lead.email)]) {
    if (!contact) continue
    for (const k of index.studentNamesByContact.get(contact) || []) candidates.add(k)
  }
  for (const k of candidates) {
    // 누구인지 가릴 수 없는 이름은 건너뛴다 — 잘못 이으면 남의 계약이 성과로 잡힌다.
    if (index.ambiguousNames.has(k)) continue
    for (const c of index.byName.get(k) || []) {
      if (notBefore(c)) return c
    }
  }
  return null
}

/**
 * 계약 한 건을 가리키는 키. id 가 있으면 그것, 없으면 학생명+계약일.
 * 같은 계약을 두 번 세지 않으려고 쓴다.
 */
export function contractKeyOf(c: ContractLite): string {
  if (c.id) return `id:${c.id}`
  return `n:${nameKey(c.studentName)}|${(c.contractDate || '').slice(0, 10)}`
}

export interface ContractedPair<T extends ContractLite, L extends LeadForContract = LeadForContract> {
  lead: L
  contract: T
  /** 같은 계약에 걸린 리드 수. 2 이상이면 리드가 중복 등록된 것이다. */
  leadCount: number
}

/**
 * 계약한 건들. '리드 수'가 아니라 '계약 수'로 센다.
 *
 * 한 가족이 리드로 두 번 등록되는 일이 흔하다(부모님 이름으로 한 번, 영문명으로 한 번).
 * 리드로 세면 계약 한 건이 2건으로 부풀어 계약률까지 틀어진다. 그래서 계약을 기준으로
 * 묶고, 대표로 보여 줄 리드는 학생 이름이 적힌 쪽을 고른다(빈칸인 쪽보다 알아보기 쉽다).
 */
export function contractedPairs<T extends ContractLite, L extends LeadForContract>(
  leads: readonly L[],
  index: ContractMatchIndex<T>,
  opts?: { onOrAfter?: string | null },
): ContractedPair<T, L>[] {
  const byContract = new Map<string, { contract: T; leads: L[] }>()
  for (const l of leads) {
    const c = contractForLead(l, index, opts)
    if (!c) continue
    const key = contractKeyOf(c)
    const e = byContract.get(key)
    if (e) e.leads.push(l)
    else byContract.set(key, { contract: c, leads: [l] })
  }
  const out: ContractedPair<T, L>[] = []
  byContract.forEach(({ contract, leads: ls }) => {
    const best = ls.find(l => (l.studentName || '').trim()) || ls[0]
    out.push({ lead: best, contract, leadCount: ls.length })
  })
  return out
}

/** 계약한 리드의 id 집합. 계약 건수가 아니라 '리드' 기준이 필요할 때만 쓴다. */
export function contractedLeadIds<T extends ContractLite>(
  leads: readonly LeadForContract[],
  index: ContractMatchIndex<T>,
  opts?: { onOrAfter?: string | null },
): Set<string> {
  const out = new Set<string>()
  for (const l of leads) {
    if (contractForLead(l, index, opts)) out.add(l.id)
  }
  return out
}

/** 한 세미나(또는 세션) 행이 '내 성과'라고 주장하는 계약들. */
export interface ContractClaimant<T extends ContractLite, L extends LeadForContract> {
  /** 행 식별자 */
  key: string
  /** 세미나 날짜. 없으면 null — 날짜가 있는 행에 밀린다. */
  eventDate: string | null
  pairs: readonly ContractedPair<T, L>[]
}

/** 한 계약을 두 개 이상의 세미나가 주장했을 때, 누가 가져가고 누가 양보했는지. */
export interface ContractOverlap<T extends ContractLite, L extends LeadForContract> {
  contract: T
  /** 대표 리드(가져간 행 기준) */
  lead: L
  wonBy: { key: string; eventDate: string | null }
  lostBy: { key: string; eventDate: string | null }[]
}

export interface AttributionResult<T extends ContractLite, L extends LeadForContract> {
  /** 행 키 → 그 행이 최종으로 가져간 계약들 */
  byRow: Map<string, ContractedPair<T, L>[]>
  /** 둘 이상이 주장했던 계약들. 숫자가 왜 줄었는지 설명하려면 이게 있어야 한다. */
  overlaps: ContractOverlap<T, L>[]
}

/**
 * 같은 계약을 여러 세미나가 동시에 주장할 때 하나에만 돌린다 — '계약 직전 세미나'.
 *
 * 한 사람이 7월 세미나와 8월 세미나에 모두 참석한 뒤 8월 9일에 계약하면, 두 세미나가
 * 모두 "계약일이 내 날짜보다 뒤"라는 조건을 통과해 한 건이 두 번 세어졌다. 세미나별
 * 계약률도 그만큼 부풀었다.
 *
 * 계약일에 가장 가까운(= 가장 늦은) 세미나가 실제로 계약을 끌어낸 접점이므로 거기에만
 * 싣는다. 날짜가 같으면 행 키 순서로 정해 렌더마다 결과가 흔들리지 않게 한다.
 * 날짜가 없는 행은 비교할 근거가 없어 날짜가 있는 행에 양보한다.
 *
 * 정리한 사실은 숨기지 않는다 — 어떤 계약이 어디로 갔는지 overlaps 로 함께 돌려준다.
 */
export function attributeContractsLastTouch<T extends ContractLite, L extends LeadForContract>(
  claimants: readonly ContractClaimant<T, L>[],
): AttributionResult<T, L> {
  // 계약 → 그 계약을 주장한 행들
  const claimedBy = new Map<string, { key: string; date: string; pair: ContractedPair<T, L> }[]>()
  for (const c of claimants) {
    const date = c.eventDate || ''        // 날짜 없음은 가장 약한 값
    for (const p of c.pairs) {
      const ck = contractKeyOf(p.contract)
      const arr = claimedBy.get(ck) || []
      arr.push({ key: c.key, date, pair: p })
      claimedBy.set(ck, arr)
    }
  }

  const winnerOf = new Map<string, string>()
  const overlaps: ContractOverlap<T, L>[] = []
  claimedBy.forEach((arr, ck) => {
    // 가장 늦은 날짜 → 같으면 행 키 순서
    const sorted = [...arr].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.key.localeCompare(b.key)))
    const win = sorted[0]
    winnerOf.set(ck, win.key)
    if (sorted.length > 1) {
      overlaps.push({
        contract: win.pair.contract,
        lead: win.pair.lead,
        wonBy: { key: win.key, eventDate: win.date || null },
        lostBy: sorted.slice(1).map(x => ({ key: x.key, eventDate: x.date || null })),
      })
    }
  })

  const byRow = new Map<string, ContractedPair<T, L>[]>()
  for (const c of claimants) {
    byRow.set(c.key, c.pairs.filter(p => winnerOf.get(contractKeyOf(p.contract)) === c.key))
  }
  return { byRow, overlaps }
}
