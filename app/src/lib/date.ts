/** Date utilities — all dates displayed in Korean Standard Time (Asia/Seoul) */

const KST = 'Asia/Seoul'

/** Returns a Date object representing "now" in KST context */
export function nowKST(): Date {
  return new Date()
}

/** Formats a Date or ISO string to YYYY-MM-DD in KST */
export function toDateStringKST(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('sv-SE', { timeZone: KST }) // sv-SE gives YYYY-MM-DD
}

/** Returns today's date as YYYY-MM-DD in KST */
export function todayKST(): string {
  return toDateStringKST(new Date())
}

/** Returns current year in KST */
export function currentYearKST(): number {
  return parseInt(new Intl.DateTimeFormat('en', { timeZone: KST, year: 'numeric' }).format(new Date()))
}

/** Returns current month (1-12) in KST */
export function currentMonthKST(): number {
  return parseInt(new Intl.DateTimeFormat('en', { timeZone: KST, month: 'numeric' }).format(new Date()))
}

/** Returns current YYYY-MM string in KST */
export function currentMonthStrKST(): string {
  const y = currentYearKST()
  const m = currentMonthKST()
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Format a datetime string to Korean display: M/D(요일) HH:MM */
export function formatDatetimeKST(dt: string | undefined): string {
  if (!dt) return '미정'
  try {
    const d = new Date(dt)
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: KST,
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    return d.toLocaleString('ko-KR', opts)
  } catch {
    return dt
  }
}

/** Format time only: HH:MM in KST */
export function formatTimeKST(dt: string): string {
  return new Date(dt).toLocaleTimeString('ko-KR', {
    timeZone: KST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Calculate days difference from today (KST) to a date string */
export function daysFromTodayKST(dateStr: string): number {
  const today = todayKST()
  const target = toDateStringKST(dateStr)
  const todayMs = new Date(today + 'T00:00:00').getTime()
  const targetMs = new Date(target + 'T00:00:00').getTime()
  return Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24))
}
