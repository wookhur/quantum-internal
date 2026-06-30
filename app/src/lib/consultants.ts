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
] as const

/** Kept for backward compatibility with non-React consumers. */
export const CONSULTANTS = LEGACY_CONSULTANTS

/**
 * Live consultant pool for dropdowns: every profile with role='consultant'
 * (current UUID id + current display name) UNION legacy slug entries that
 * no live profile has displaced (deduped by name). Sorted by name.
 */
export function useConsultantPool(): { id: string; name: string }[] {
  const { data: profiles = [] } = useProfiles()
  return useMemo(() => {
    const live = profiles
      .filter(p => p.role === 'consultant' && !p.isExternal)
      .map(p => ({ id: p.id, name: p.name }))
    const liveNames = new Set(live.map(c => c.name))
    const legacy = LEGACY_CONSULTANTS
      .filter(c => !liveNames.has(c.name))
      .map(c => ({ id: c.id, name: c.name }))
    return [...live, ...legacy].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [profiles])
}

/**
 * ID → name lookup that resolves both legacy slug IDs and current profile UUIDs.
 * Returns a stable function suitable for use inside `.map()` etc.
 */
export function useConsultantName(): (id?: string) => string {
  const pool = useConsultantPool()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const c of pool) map.set(c.id, c.name)
    return (id?: string) => (id && map.get(id)) || consultantName(id)
  }, [pool])
}

/** Static fallback for non-React contexts. Only resolves legacy slug ids. */
export function consultantName(id?: string) {
  return LEGACY_CONSULTANTS.find(c => c.id === id)?.name || id || '—'
}
