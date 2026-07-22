import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'

export interface IssueReportComment {
  id: string
  issueId: string
  content: string
  createdBy?: string
  authorName?: string
  createdAt: string
}

export interface IssueReport {
  id: string
  studentId: string
  reportDate: string
  content: string
  isPrivate: boolean
  createdBy?: string
  authorName?: string
  createdAt: string
  comments: IssueReportComment[]
}

function mapComment(r: Record<string, unknown>): IssueReportComment {
  return {
    id: r.id as string,
    issueId: r.issue_id as string,
    content: (r.content as string) || '',
    createdBy: (r.created_by as string) || undefined,
    authorName: (r.author_name as string) || undefined,
    createdAt: r.created_at as string,
  }
}

/** All issue reports for a student (private ones filtered by RLS), newest first, with comments. */
export function useIssueReports(studentId?: string) {
  return useQuery({
    queryKey: ['issue-reports', studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<IssueReport[]> => {
      const { data: reports, error } = await supabase
        .from('issue_reports')
        .select('*')
        .eq('student_id', studentId!)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (reports || []) as Record<string, unknown>[]
      const ids = rows.map((r) => r.id as string)
      let comments: IssueReportComment[] = []
      if (ids.length) {
        const { data: cdata } = await supabase
          .from('issue_report_comments')
          .select('*')
          .in('issue_id', ids)
          .order('created_at', { ascending: true })
        comments = (cdata || []).map((c) => mapComment(c as Record<string, unknown>))
      }
      return rows.map((r) => ({
        id: r.id as string,
        studentId: r.student_id as string,
        reportDate: r.report_date as string,
        content: (r.content as string) || '',
        isPrivate: !!r.is_private,
        createdBy: (r.created_by as string) || undefined,
        authorName: (r.author_name as string) || undefined,
        createdAt: r.created_at as string,
        comments: comments.filter((c) => c.issueId === (r.id as string)),
      }))
    },
  })
}

/** Notify admin-level users (admin, c_level) that an issue was reported. */
async function notifyAdminsOfIssue(studentName: string, issueId: string, studentId: string) {
  const { data } = await supabase.from('profiles').select('id').in('role', ['admin', 'c_level'])
  const ids = (data || []).map((p) => (p as { id: string }).id)
  if (!ids.length) return
  await createNotificationsForUsers(ids, {
    type: 'issue_report',
    title: '이슈 리포트 등록',
    message: `${studentName || '학생'}에 이슈가 보고되었습니다`,
    link: '/service/students',
    metadata: { issueId, studentId },
  })
}

export function useCreateIssueReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      studentId: string
      studentName?: string
      reportDate: string
      content: string
      isPrivate: boolean
      createdBy?: string
      authorName?: string
    }) => {
      const { data, error } = await supabase
        .from('issue_reports')
        .insert({
          student_id: input.studentId,
          report_date: input.reportDate,
          content: input.content,
          is_private: input.isPrivate,
          created_by: input.createdBy || null,
          author_name: input.authorName || null,
        })
        .select()
        .single()
      if (error) throw error
      try {
        await notifyAdminsOfIssue(input.studentName || '', (data as { id: string }).id, input.studentId)
      } catch {
        // notification is best-effort
      }
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['issue-reports', v.studentId] }),
  })
}

export function useUpdateIssueReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      studentId: string
      reportDate?: string
      content?: string
      isPrivate?: boolean
    }) => {
      const row: Record<string, unknown> = {}
      if (input.reportDate !== undefined) row.report_date = input.reportDate
      if (input.content !== undefined) row.content = input.content
      if (input.isPrivate !== undefined) row.is_private = input.isPrivate
      const { error } = await supabase.from('issue_reports').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['issue-reports', v.studentId] }),
  })
}

export function useDeleteIssueReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; studentId: string }) => {
      const { error } = await supabase.from('issue_reports').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['issue-reports', v.studentId] }),
  })
}

export function useCreateIssueComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      issueId: string
      studentId: string
      content: string
      createdBy?: string
      authorName?: string
    }) => {
      const { error } = await supabase.from('issue_report_comments').insert({
        issue_id: input.issueId,
        content: input.content,
        created_by: input.createdBy || null,
        author_name: input.authorName || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['issue-reports', v.studentId] }),
  })
}

export function useDeleteIssueComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; studentId: string }) => {
      const { error } = await supabase.from('issue_report_comments').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['issue-reports', v.studentId] }),
  })
}
