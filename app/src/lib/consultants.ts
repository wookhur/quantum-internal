// Shared consultant pool used by Student 360, Service Dashboard, KPI pages,
// and incentive pages. Legacy hardcoded entries are kept so historical rows
// referencing slug IDs (e.g. 'sangbum') still resolve to a name. New
// consultants flow in automatically from the profiles table.

import { useMemo } from 'react'
import { useProfiles } from '@/hooks/useProfiles'

/** Legacy slug-id consultants used in historical DB rows. Do not remove. */
const LEGACY_CONSULTANTS = [
  { id: 'sangbum', name: '한상범' },
  { id: 'jihyun', name: '김지현' },
  { id: 'eunyoung', name: '양은영' },
  { id: 'yeonse', name: '남연서' },
  { id: 'danny', name: 'Danny' },
  { id: 'liz', name: '유리즈' },
  // 현재 컨설턴트(프로필 생성 전 수동 추가). 나중에 실제 프로필이 생기면 이름 중복으로 자동 통합됨.
  { id: 'aidan', name: 'Aidan Lee' },
] as const

/** Kept for backward compatibility with non-React consumers. */
export const CONSULTANTS = LEGACY_CONSULTANTS

/**
 * Live consultant pool for dropdowns: every profile with role='consultant'
 * (current UUID id + current display name) UNION legacy slug entries that
 * no live profile has displaced (deduped by name). Sorted by name.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same person listed under different display names → one canonical name. */
const CONSULTANT_NAME_ALIASES: Record<string, string> = {
  'julie kim': '김지현',
  'julie': '김지현',
  'evelyn': '남연서',
  'somee park': 'Soomee Park',   // 과거 표기(Somee) → 통일된 표기(Soomee Park)
  // 계정이 'ivitta' → 'Isabela Vitta' 순으로 바뀌었다. 과거 표기로 저장된 기록이
  // 남아 있어도 한 사람으로 모이도록 모두 'Isabela' 로 모은다.
  'ivitta': 'Isabela',
  'ivatta': 'Isabela',           // 오타 표기
  'isabela vitta': 'Isabela',
  // 프로필이 생기기 전에 슬러그('aidan')로 쓰던 분. 학생 담당자는 아직 그 슬러그로
  // 저장돼 있어 'Aidan Lee' 로 보이는데, 로그인 계정과 인보이스는 '이준형' 이라
  // 관리비가 서로 다른 이름에 쌓여 인보이스에서 사라졌다. 실제 프로필 이름으로 모은다.
  'aidan lee': '이준형',
  'aidan': '이준형',
}

/** Collapse alias names to their canonical form (e.g. Julie Kim → 김지현).
 *  별칭을 찾을 때는 띄어쓰기 편차를 먼저 지운다 — 'Aidan  Lee'(두 칸)처럼 저장된 값도
 *  같은 사람으로 모이게. 별칭이 없으면 적힌 표기를 그대로 돌려준다. */
export function canonicalConsultantName(name?: string): string {
  const n = (name || '').trim()
  const lookup = n.toLowerCase().replace(/\s+/g, ' ')
  return CONSULTANT_NAME_ALIASES[lookup] || n
}

/** Normalized key for name matching: canonical form, lowercased, spaces collapsed.
 *  Use on BOTH sides so case/spacing differences don't break a match. */
export function consultantNameKey(name?: string): string {
  return canonicalConsultantName(name).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 드롭다운(컨설턴트 목록)에서 제외할 은퇴/퇴사 컨설턴트 — 이름 기준.
 *  이름 해석(useConsultantName)에는 남겨 과거 배정 데이터는 계속 이름이 보이게 한다. */
const RETIRED_CONSULTANT_KEYS = new Set(['유리즈', 'Liz', 'Liz Yu'].map(consultantNameKey))

export function useConsultantPool(): { id: string; name: string }[] {
  const { data: profiles = [] } = useProfiles()
  return useMemo(() => {
    const live = profiles
      .filter(p => p.role === 'consultant' && !p.isExternal)
      .map(p => ({ id: p.id, name: canonicalConsultantName(p.name) }))
      // Skip misconfigured profiles whose name is empty or just a UUID.
      .filter(c => c.name && !UUID_RE.test(c.name))
    const legacy = LEGACY_CONSULTANTS.map(c => ({ id: c.id, name: canonicalConsultantName(c.name) }))
    // One entry per canonical name, preferring the live profile.
    const seen = new Set<string>()
    const merged: { id: string; name: string }[] = []
    for (const c of [...live, ...legacy]) {
      if (seen.has(c.name) || RETIRED_CONSULTANT_KEYS.has(consultantNameKey(c.name))) continue
      seen.add(c.name)
      merged.push(c)
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [profiles])
}

/**
 * ID → canonical name lookup, resolving legacy slug IDs and profile UUIDs.
 * Built from every consultant profile (not the deduped pool) so both an
 * aliased profile and its canonical twin still resolve.
 */
export function useConsultantName(): (id?: string) => string {
  const { data: profiles = [] } = useProfiles()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const c of LEGACY_CONSULTANTS) map.set(c.id, canonicalConsultantName(c.name))
    for (const p of profiles) {
      if ((p.name || '').trim()) map.set(p.id, canonicalConsultantName(p.name))
    }
    return (id?: string) => {
      if (!id) return '—'
      const n = map.get(id)
      if (n) return n
      return UUID_RE.test(id) ? '(이름 미설정)' : canonicalConsultantName(id)
    }
  }, [profiles])
}

/** Static fallback for non-React contexts. Only resolves legacy slug ids. */
export function consultantName(id?: string) {
  const legacy = LEGACY_CONSULTANTS.find(c => c.id === id)?.name
  if (legacy) return canonicalConsultantName(legacy)
  if (!id) return '—'
  // Never surface a raw profile UUID to the user (account has no proper name).
  return UUID_RE.test(id) ? '(이름 미설정)' : canonicalConsultantName(id)
}
