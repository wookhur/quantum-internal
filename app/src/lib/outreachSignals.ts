/**
 * 학부모 소통이 필요해 보이는 신호 — 규칙으로만 찾는다.
 *
 * '로드'(AI)는 버튼을 눌러야 돌고, 돈이 들고, 가끔 틀린다. 그래서 '누가 지금
 * 위태로운가'를 고르는 일까지 AI 에 맡기지 않는다. 그건 기록에 이미 답이 있다 —
 * 마지막 미팅이 언제였는지, 약속한 것을 했는지, 노쇼가 쌓였는지.
 *
 * 여기서는 그 사실만 센다. 세어 놓으면 두 가지가 된다.
 *  1. 버튼을 누르지 않아도 '지금 챙길 학생'이 화면에 떠 있다.
 *  2. 로드에게는 걸린 학생만 물어보면 된다 — 전교생을 돌릴 일이 없다.
 *
 * 규칙이라 틀릴 일이 없는 대신, 기록에 없는 사정은 모른다. 학부모가 어제
 * 전화로 다 듣고 안심했어도 여기서는 '41일째 공백'으로 보인다. 판단은 사람이 한다.
 */

import { isCompletedMeetingStatus, isNoShowStatus } from './meetingProgress'
import { isOnPause, type PausableStudent } from './studentPause'

/** 마지막 미팅 이후 이만큼 비면 학부모가 먼저 불안해할 때가 됐다고 본다. */
export const GAP_DAYS = 35
/** 후속 약속을 적어 두고 이만큼 지나도록 다음 기록이 없으면 '약속이 떠 있다'. */
export const COMMITMENT_DAYS = 21
/** 리스크로 적어 둔 것은 더 빨리 본다. */
export const ISSUE_DAYS = 14
/** 미팅을 하고 이만큼 지나도록 다이어리가 없으면 기록이 빈 것이다. */
export const NO_DIARY_DAYS = 14
/** 노쇼는 이 기간 안에서 센다. */
export const NO_SHOW_WINDOW_DAYS = 90
/** 이 횟수부터 '쌓였다'고 본다. */
export const NO_SHOW_COUNT = 2

export type OutreachSignalKind = 'gap' | 'no_show' | 'issue' | 'commitment' | 'no_diary'
export type OutreachSignalLevel = 'high' | 'medium'

export interface OutreachSignal {
  kind: OutreachSignalKind
  level: OutreachSignalLevel
  /** 목록에 한 줄로 붙는 짧은 말 — '마지막 미팅 41일 전' */
  label: string
  /** 왜 걸렸는지 한 문장 */
  detail: string
}

export interface OutreachStudentSignals {
  studentId: string
  level: OutreachSignalLevel
  signals: OutreachSignal[]
  /** 마지막 완료 미팅일 (없으면 undefined) */
  lastMeetingDate?: string
  /** 정렬용 — 클수록 오래 방치됨 */
  staleDays: number
}

export interface SignalStudent extends PausableStudent {
  id: string
  status?: string
}

export interface SignalMeeting {
  studentId: string
  meetingDate?: string
  status?: string
}

export interface SignalDiary {
  studentId: string
  entryDate?: string
  followUpCommitments?: string
  criticalIssue?: string
}

/** 종료·취소된 학생은 보지 않는다. (Student360 의 분류와 같은 기준) */
function isArchived(status?: string): boolean {
  return status === 'finished' || status === 'canceled'
}

/** 'YYYY-MM-DD' 두 개의 날짜 차이(일). b 가 뒤면 양수. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

function dateOnly(v?: string): string {
  return (v || '').slice(0, 10)
}

function has(v?: string): boolean {
  return !!(v || '').trim()
}

/** 한 줄로 줄여 알림 본문에 싣는다 — 길면 벨에서 읽기 어렵다. */
function clip(s: string, n = 40): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

/**
 * 학생별 신호를 찾는다.
 *
 * meetings·diaries 는 최근 몇 달치만 넘겨도 된다. 그 안에 아무 기록이 없는
 * 학생은 '공백'으로 잡히는 대신 아예 건너뛴다 — 계약 직후라 아직 미팅을 한 번도
 * 안 한 학생을 '방치됐다'고 부를 수는 없기 때문이다.
 */
export function detectOutreachSignals(input: {
  students: SignalStudent[]
  meetings: SignalMeeting[]
  diaries: SignalDiary[]
  today: string
}): OutreachStudentSignals[] {
  const { students, meetings, diaries, today } = input

  const meetingsBy = new Map<string, SignalMeeting[]>()
  for (const m of meetings) {
    if (!m.studentId) continue
    const arr = meetingsBy.get(m.studentId)
    if (arr) arr.push(m); else meetingsBy.set(m.studentId, [m])
  }

  const diariesBy = new Map<string, SignalDiary[]>()
  for (const d of diaries) {
    if (!d.studentId) continue
    const arr = diariesBy.get(d.studentId)
    if (arr) arr.push(d); else diariesBy.set(d.studentId, [d])
  }

  const out: OutreachStudentSignals[] = []

  for (const s of students) {
    if (isArchived(s.status)) continue
    if (isOnPause(s, today)) continue          // 휴면 중이면 연락할 일이 아니다

    const ms = (meetingsBy.get(s.id) || []).filter(m => dateOnly(m.meetingDate))
    const ds = (diariesBy.get(s.id) || [])
      .filter(d => dateOnly(d.entryDate))
      .sort((a, b) => dateOnly(b.entryDate).localeCompare(dateOnly(a.entryDate)))

    // 넘겨받은 기간 안에 아무 기록이 없으면 판단을 미룬다 (신규 계약 오탐 방지)
    if (ms.length === 0 && ds.length === 0) continue

    const signals: OutreachSignal[] = []

    // ── 마지막 미팅 / 다음 예정 ────────────────────────────────────────────
    const held = ms
      .filter(m => isCompletedMeetingStatus(m.status) && dateOnly(m.meetingDate) <= today)
      .map(m => dateOnly(m.meetingDate))
      .sort()
    const lastMeetingDate = held.length ? held[held.length - 1] : undefined

    const hasUpcoming = ms.some(m => {
      const d = dateOnly(m.meetingDate)
      return d > today && m.status !== 'canceled'
    })

    const gapDays = lastMeetingDate ? daysBetween(lastMeetingDate, today) : 0
    if (lastMeetingDate && gapDays >= GAP_DAYS && !hasUpcoming) {
      signals.push({
        kind: 'gap',
        level: 'high',
        label: `마지막 미팅 ${gapDays}일 전`,
        detail: `${lastMeetingDate} 이후 ${gapDays}일째 미팅이 없고, 잡혀 있는 다음 미팅도 없습니다.`,
      })
    }

    // ── 노쇼 누적 ─────────────────────────────────────────────────────────
    const noShowSince = shiftDays(today, -NO_SHOW_WINDOW_DAYS)
    const noShows = ms.filter(m => {
      const d = dateOnly(m.meetingDate)
      return isNoShowStatus(m.status) && d >= noShowSince && d <= today
    }).length
    if (noShows >= NO_SHOW_COUNT) {
      signals.push({
        kind: 'no_show',
        level: 'high',
        label: `노쇼 ${noShows}회`,
        detail: `최근 ${NO_SHOW_WINDOW_DAYS}일 안에 노쇼가 ${noShows}회입니다.`,
      })
    }

    // ── 최신 다이어리에 걸린 것들 ──────────────────────────────────────────
    const latest = ds[0]
    if (latest) {
      const entry = dateOnly(latest.entryDate)
      const age = daysBetween(entry, today)

      if (has(latest.criticalIssue) && age >= ISSUE_DAYS) {
        signals.push({
          kind: 'issue',
          level: 'high',
          label: '리스크 기록 후 진전 없음',
          detail: `${entry} 기록의 리스크·이슈 '${clip(latest.criticalIssue!)}' 이후 ${age}일째 새 기록이 없습니다.`,
        })
      }

      if (has(latest.followUpCommitments) && age >= COMMITMENT_DAYS) {
        signals.push({
          kind: 'commitment',
          level: 'medium',
          label: `${entry} 약속이 떠 있음`,
          detail: `${entry} 기록의 후속 약속 '${clip(latest.followUpCommitments!)}' 이 완료됐다는 기록이 없습니다.`,
        })
      }
    }

    // ── 미팅은 했는데 다이어리가 없음 ──────────────────────────────────────
    const lastHeldOnly = ms
      .filter(m => m.status === 'held' && dateOnly(m.meetingDate) <= today)
      .map(m => dateOnly(m.meetingDate))
      .sort()
      .pop()
    if (lastHeldOnly && daysBetween(lastHeldOnly, today) >= NO_DIARY_DAYS) {
      // 미팅 당일 이후(사흘 전까지 감안)에 쓰인 다이어리가 하나라도 있으면 기록된 것으로 본다
      const covered = ds.some(d => dateOnly(d.entryDate) >= shiftDays(lastHeldOnly, -3))
      if (!covered) {
        signals.push({
          kind: 'no_diary',
          level: 'medium',
          label: `${lastHeldOnly} 미팅 기록 없음`,
          detail: `${lastHeldOnly} 미팅은 진행됐는데 해당 미팅 다이어리가 없습니다.`,
        })
      }
    }

    if (!signals.length) continue

    out.push({
      studentId: s.id,
      level: signals.some(x => x.level === 'high') ? 'high' : 'medium',
      signals,
      lastMeetingDate,
      staleDays: gapDays,
    })
  }

  // 급한 것 먼저, 같은 급이면 오래 방치된 순
  return out.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'high' ? -1 : 1
    return b.staleDays - a.staleDays
  })
}

/** 'YYYY-MM-DD' 에 일수를 더한다(음수면 뺀다). */
export function shiftDays(day: string, delta: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** 그 주의 월요일 (KST 기준 날짜 문자열을 받아 같은 형식으로 돌려준다). */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay()   // 0=일
  return shiftDays(day, dow === 0 ? -6 : 1 - dow)
}
