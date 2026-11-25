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

/** 'YYYY-MM-DD' 에 일수를 더한다(음수면 뺀다). 달·해를 넘어가도 맞다. */
export function shiftDays(day: string, delta: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' 두 날짜의 차이(일). b 가 뒤면 양수. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** 그 날이 속한 주의 월요일. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay()   // 0=일
  return shiftDays(day, dow === 0 ? -6 : 1 - dow)
}

/** 그 주의 월~일 7일. */
export function weekDates(day: string): string[] {
  const mon = weekStart(day)
  return Array.from({ length: 7 }, (_, i) => shiftDays(mon, i))
}
