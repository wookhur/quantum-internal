import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { ServiceMeeting, ServiceReportStatus, ServiceFollowup } from '@/types'

export interface DashboardMeeting extends ServiceMeeting {
  studentName: string
  studentSchool?: string
  studentGrade?: string
  studentConsultant?: string
}

export interface DashboardFollowup extends ServiceFollowup {
  studentName: string
  studentConsultant?: string
}

export function useAllServiceMeetings(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['dashboard_meetings', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_meetings')
        .select('*, service_students!inner(name, school, grade, assigned_consultant)')
        .gte('meeting_date', startDate)
        .lte('meeting_date', endDate)
        .order('meeting_date', { ascending: true })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown>
        return {
          id: row.id as string,
          studentId: row.student_id as string,
          meetingDate: (row.meeting_date as string) || undefined,
          meetingType: (row.meeting_type as string) || undefined,
          consultantId: (row.consultant_id as string) || undefined,
          summary: (row.summary as string) || undefined,
          prepUrl: (row.prep_url as string) || undefined,
          reportStatus: row.report_status as ServiceReportStatus,
          reportUrl: (row.report_url as string) || undefined,
          reportDate: (row.report_date as string) || undefined,
          status: (row.status as ServiceMeeting['status']) || 'held',
          cancellationReason: (row.cancellation_reason as string) || undefined,
          cancelledBy: (row.cancelled_by as ServiceMeeting['cancelledBy']) || undefined,
          rescheduledTo: (row.rescheduled_to as string) || undefined,
          createdBy: (row.created_by as string) || undefined,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          studentName: (s?.name as string) || '',
          studentSchool: (s?.school as string) || undefined,
          studentGrade: (s?.grade as string) || undefined,
          studentConsultant: (s?.assigned_consultant as string) || undefined,
        } as DashboardMeeting
      })
    },
  })
}

export function useAllServiceFollowupsDue(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['dashboard_followups', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_followups')
        .select('*, service_students!inner(name, assigned_consultant)')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .eq('done', false)
        .order('due_date', { ascending: true })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown>
        return {
          id: row.id as string,
          studentId: row.student_id as string,
          diaryId: (row.diary_id as string) || undefined,
          text: row.text as string,
          done: row.done as boolean,
          doneAt: (row.done_at as string) || undefined,
          dueDate: (row.due_date as string) || undefined,
          createdBy: (row.created_by as string) || undefined,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          studentName: (s?.name as string) || '',
          studentConsultant: (s?.assigned_consultant as string) || undefined,
        } as DashboardFollowup
      })
    },
  })
}

/** All follow-ups (done or not) due within the range — for QC completion rates. */
export function useAllServiceFollowupsInRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['dashboard_followups_all', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_followups')
        .select('*, service_students!inner(name, assigned_consultant)')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date', { ascending: true })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown>
        return {
          id: row.id as string,
          studentId: row.student_id as string,
          diaryId: (row.diary_id as string) || undefined,
          text: row.text as string,
          done: row.done as boolean,
          doneAt: (row.done_at as string) || undefined,
          dueDate: (row.due_date as string) || undefined,
          createdBy: (row.created_by as string) || undefined,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          studentName: (s?.name as string) || '',
          studentConsultant: (s?.assigned_consultant as string) || undefined,
        } as DashboardFollowup
      })
    },
  })
}

export interface DashboardDiary {
  id: string
  studentId: string
  entryDate?: string
  studentName: string
  studentConsultant?: string
  meetingSummary?: string
  criticalIssue?: string
  followUpCommitments?: string
}

/** Diary entries within a date range, with student + consultant — for the QC report. */
export function useAllServiceDiaryInRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['dashboard_diary', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_diary')
        .select('id, student_id, entry_date, meeting_summary, critical_issue, follow_up_commitments, service_students!inner(name, assigned_consultant)')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: false })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown>
        return {
          id: row.id as string,
          studentId: row.student_id as string,
          entryDate: (row.entry_date as string) || undefined,
          studentName: (s?.name as string) || '',
          studentConsultant: (s?.assigned_consultant as string) || undefined,
          meetingSummary: (row.meeting_summary as string) || undefined,
          criticalIssue: (row.critical_issue as string) || undefined,
          followUpCommitments: (row.follow_up_commitments as string) || undefined,
        } as DashboardDiary
      })
    },
  })
}

export interface MissingReportMeeting {
  date?: string
  type?: string
}

export interface StudentStatusFlags {
  missingReports: Set<string>
  pendingFollowups: Set<string>
  /** Per student, the meetings (last 30d) whose summary report is not submitted. */
  missingReportDetails: Map<string, MissingReportMeeting[]>
}

export function useStudentStatusFlags() {
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }, [])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const { data: missingReportRows = [] } = useQuery({
    queryKey: ['student_status_missing_reports', thirtyDaysAgo],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_meetings')
        .select('student_id, meeting_date, meeting_type')
        .neq('report_status', 'submitted')
        .is('report_url', null)
        .lte('meeting_date', today)
        .gte('meeting_date', thirtyDaysAgo)
      if (error) return []
      return (data || []) as Record<string, unknown>[]
    },
  })

  const { data: pendingFollowupIds = [] } = useQuery({
    queryKey: ['student_status_pending_followups'],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      // Only follow-up commitments count toward the warning — assignments are
      // student tasks (no completion toggle) and must not keep the flag red.
      const { data, error } = await supabase
        .from('service_followups')
        .select('student_id')
        .eq('done', false)
        .or('category.is.null,category.eq.followup')
      if (error) return []
      return (data || []).map((r: Record<string, unknown>) => r.student_id as string)
    },
  })

  return useMemo<StudentStatusFlags>(() => {
    const missingReports = new Set<string>()
    const missingReportDetails = new Map<string, MissingReportMeeting[]>()
    for (const r of missingReportRows) {
      const sid = r.student_id as string
      if (!sid) continue
      missingReports.add(sid)
      const arr = missingReportDetails.get(sid) || []
      arr.push({ date: (r.meeting_date as string) || undefined, type: (r.meeting_type as string) || undefined })
      missingReportDetails.set(sid, arr)
    }
    return {
      missingReports,
      pendingFollowups: new Set(pendingFollowupIds),
      missingReportDetails,
    }
  }, [missingReportRows, pendingFollowupIds])
}
