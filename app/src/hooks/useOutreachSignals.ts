import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'
import { todayKST } from '@/lib/date'
import { studentPickerLabel } from '@/lib/studentDisplay'
import {
  detectOutreachSignals,
  shiftDays,
  type OutreachStudentSignals,
  type SignalStudent,
  type SignalMeeting,
  type SignalDiary,
} from '@/lib/outreachSignals'

/**
 * '지금 챙겨야 할 학생' — 버튼을 누르지 않아도 떠 있는 목록.
 *
 * 로드(AI)는 걸린 학생에게만 물어본다. 누가 걸렸는지는 기록이 이미 알고 있어서
 * AI 가 필요 없다 — detectOutreachSignals() 가 규칙으로 센다.
 */

/** 얼마나 거슬러 읽을지. 이보다 오래된 공백은 '6개월+'로 뭉뚱그려도 판단이 달라지지 않는다. */
const LOOKBACK_DAYS = 180

export interface FlaggedStudent extends OutreachStudentSignals {
  name: string
  koreanName?: string
  assignedConsultant?: string
  /** '김은서 Amy Kim' — 화면·알림에 그대로 쓰는 표기 */
  label: string
}

export interface OutreachSignalsResult {
  /** 신호가 잡힌 학생 — 급한 순 */
  flagged: FlaggedStudent[]
  /** 신호를 찾을 때 본 학생 수 (휴면·종료 제외) */
  scanned: number
  /** 기준일 */
  today: string
}

async function fetchSignals(): Promise<OutreachSignalsResult> {
  const today = todayKST()
  const since = shiftDays(today, -LOOKBACK_DAYS)

  const [studentRows, meetingRows, diaryRows] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('service_students')
        .select('id, name, korean_name, status, assigned_consultant, paused, pause_return_date')
        .range(from, to),
    ),
    // 앞으로 잡힌 미팅도 봐야 한다('다음 미팅이 있으면 공백이 아니다') — 위쪽은 안 자른다
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('service_meetings')
        .select('student_id, meeting_date, status')
        .gte('meeting_date', since)
        .range(from, to),
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('service_diary')
        .select('student_id, entry_date, follow_up_commitments, critical_issue')
        .gte('entry_date', since)
        .range(from, to),
    ),
  ])

  const students: SignalStudent[] = studentRows.map(r => ({
    id: r.id as string,
    status: (r.status as string) || undefined,
    paused: !!r.paused,
    pauseReturnDate: (r.pause_return_date as string) || undefined,
  }))

  const meetings: SignalMeeting[] = meetingRows.map(r => ({
    studentId: r.student_id as string,
    meetingDate: (r.meeting_date as string) || undefined,
    status: (r.status as string) || undefined,
  }))

  const diaries: SignalDiary[] = diaryRows.map(r => ({
    studentId: r.student_id as string,
    entryDate: (r.entry_date as string) || undefined,
    followUpCommitments: (r.follow_up_commitments as string) || undefined,
    criticalIssue: (r.critical_issue as string) || undefined,
  }))

  const byId = new Map(studentRows.map(r => [r.id as string, r]))
  const flagged: FlaggedStudent[] = detectOutreachSignals({ students, meetings, diaries, today })
    .map(f => {
      const row = byId.get(f.studentId)
      const name = (row?.name as string) || ''
      const koreanName = (row?.korean_name as string) || undefined
      return {
        ...f,
        name,
        koreanName,
        assignedConsultant: (row?.assigned_consultant as string) || undefined,
        label: studentPickerLabel({ name, koreanName }),
      }
    })

  return { flagged, scanned: students.length, today }
}

export function useOutreachSignals(enabled = true) {
  return useQuery({
    queryKey: ['outreach-signals', todayKST()],
    enabled,
    // 하루에 한 번 바뀌면 충분하다 — 화면을 옮길 때마다 다시 읽을 이유가 없다
    staleTime: 30 * 60 * 1000,
    queryFn: fetchSignals,
  })
}
