/**
 * 파트너사 미팅 코멘트 정렬.
 *
 * 왜 필요한가: 정렬이 meeting_date 하나만 보고 있었는데, 이 칸이 비어 있는 코멘트가 많다.
 * Postgres 에서 같은 값(전부 NULL)끼리는 순서가 보장되지 않아, 새로 쓴 코멘트가 중간에
 * 끼어드는 것처럼 보였다.
 *
 * 그래서 정렬 키를 두 단계로 둔다.
 *   1) 미팅일(meeting_date) — 없으면 작성 시각의 날짜를 대신 쓴다
 *   2) 작성 시각(created_at) — 같은 날 여러 건일 때의 순서를 확정
 * 둘 다 같으면 id 로 갈라 항상 같은 순서가 나오게 한다(렌더링마다 순서가 바뀌지 않도록).
 */

export interface DatedMeeting {
  id: string
  meetingDate?: string
  createdAt: string
}

/** 목록에 표시하고 정렬에도 쓰는 날짜(YYYY-MM-DD). 미팅일이 없으면 작성일. */
export function meetingDisplayDate(m: DatedMeeting): string {
  const d = (m.meetingDate || '').slice(0, 10)
  return d || (m.createdAt || '').slice(0, 10)
}

/** 최신이 위로. */
export function compareMeetingsDesc(a: DatedMeeting, b: DatedMeeting): number {
  const da = meetingDisplayDate(a)
  const db = meetingDisplayDate(b)
  if (da !== db) return da < db ? 1 : -1
  const ca = a.createdAt || ''
  const cb = b.createdAt || ''
  if (ca !== cb) return ca < cb ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function sortMeetingsDesc<T extends DatedMeeting>(list: readonly T[]): T[] {
  return [...list].sort(compareMeetingsDesc)
}
