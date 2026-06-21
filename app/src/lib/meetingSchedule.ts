// Regular meeting schedule helpers.
// Schedule string format: "<weekPattern>|<koreanDay>|<time>", e.g. "1/3|월|14:00".
// weekPattern is '1/3' (1st & 3rd week of month) or '2/4' (2nd & 4th).

const DAY_NAME_TO_NUM: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

/** Does the given YYYY-MM-DD date fall on the student's regular meeting schedule? */
export function isScheduledMeetingDate(dateStr: string, schedule: string): boolean {
  const parts = schedule.split('|')
  if (parts.length < 2) return false
  const weekPattern = parts[0]
  const dayStr = parts[1]
  const d = new Date(dateStr + 'T00:00:00')
  const targetDay = DAY_NAME_TO_NUM[dayStr]
  if (targetDay === undefined || d.getDay() !== targetDay) return false
  const weekOfMonth = Math.ceil(d.getDate() / 7)
  if (weekPattern === '1/3') return weekOfMonth === 1 || weekOfMonth === 3
  if (weekPattern === '2/4') return weekOfMonth === 2 || weekOfMonth === 4
  return false
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** How many regular meetings the schedule implies between startDate and endDate (inclusive). */
export function countScheduledMeetings(
  schedule: string | undefined,
  startDate: string,
  endDate: string,
): number {
  if (!schedule || !startDate || !endDate) return 0
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  if (end < start) return 0
  let count = 0
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isScheduledMeetingDate(fmtLocal(d), schedule)) count++
  }
  return count
}
