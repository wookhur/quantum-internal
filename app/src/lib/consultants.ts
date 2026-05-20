// Shared consultant pool used by Student 360 and KPI pages.

export const CONSULTANTS = [
  { id: 'sangbum', name: '한상범' },
  { id: 'jihyun', name: '김지현' },
  { id: 'eunyoung', name: '양은영' },
  { id: 'yeonse', name: '남연서' },
  { id: 'danny', name: 'Danny' },
  { id: 'liz', name: '유리즈' },
] as const

export function consultantName(id?: string) {
  return CONSULTANTS.find(c => c.id === id)?.name || id || '—'
}
