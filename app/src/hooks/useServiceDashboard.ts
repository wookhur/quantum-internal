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

export interface StudentStatusFlags {
  missingReports: Set<string>
  pendingFollowups: Set<string>
}

export function useStudentStatusFlags() {
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }, [])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const { data: missingReportIds = [] } = useQuery({
    queryKey: ['student_status_missing_reports', thirtyDaysAgo],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_meetings')
        .select('student_id')
        .neq('report_status', 'submitted')
        .lte('meeting_date', today)
        .gte('meeting_date', thirtyDaysAgo)
      if (error) return []
      return (data || []).map((r: Record<string, unknown>) => r.student_id as string)
    },
  })

  const { data: pendingFollowupIds = [] } = useQuery({
    queryKey: ['student_status_pending_followups'],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_followups')
        .select('student_id')
        .eq('done', false)
      if (error) return []
      return (data || []).map((r: Record<string, unknown>) => r.student_id as string)
    },
  })

  return useMemo<StudentStatusFlags>(() => ({
    missingReports: new Set(missingReportIds),
    pendingFollowups: new Set(pendingFollowupIds),
  }), [missingReportIds, pendingFollowupIds])
}
