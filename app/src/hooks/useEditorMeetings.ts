import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EditorMeeting {
  id: string
  studentId: string
  meetingDate?: string
  editor?: string
  content?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): EditorMeeting {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    meetingDate: (row.meeting_date as string) || undefined,
    editor: (row.editor as string) || undefined,
    content: (row.content as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useEditorMeetings(studentId?: string) {
  return useQuery({
    queryKey: ['editor_meetings', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_editor_meetings')
        .select('*')
        .eq('student_id', studentId as string)
        .order('meeting_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateEditorMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { studentId: string; meetingDate?: string; editor?: string; content?: string; createdBy?: string }) => {
      const { data, error } = await supabase.from('service_editor_meetings').insert({
        student_id: m.studentId,
        meeting_date: m.meetingDate || null,
        editor: m.editor || null,
        content: m.content || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['editor_meetings', v.studentId] }),
  })
}

export function useUpdateEditorMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; studentId: string; meetingDate?: string; editor?: string; content?: string }) => {
      const row: Record<string, unknown> = {}
      if (a.meetingDate !== undefined) row.meeting_date = a.meetingDate || null
      if (a.editor !== undefined) row.editor = a.editor || null
      if (a.content !== undefined) row.content = a.content || null
      const { error } = await supabase.from('service_editor_meetings').update(row).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['editor_meetings', v.studentId] }),
  })
}

export function useDeleteEditorMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_editor_meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['editor_meetings', v.studentId] }),
  })
}

export interface EditorMeetingWithStudent extends EditorMeeting {
  studentName?: string
  studentKoreanName?: string
}

/** All dated editor meetings in a month range, with the student's name joined. */
export function useAllEditorMeetingsInRange(start?: string, end?: string) {
  return useQuery({
    queryKey: ['editor_meetings_range', start, end],
    enabled: !!start && !!end,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_editor_meetings')
        .select('*, service_students:student_id(name, korean_name)')
        .gte('meeting_date', start as string)
        .lte('meeting_date', end as string)
        .order('meeting_date', { ascending: true })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown> | null
        return {
          ...mapRow(row),
          studentName: (s?.name as string) || undefined,
          studentKoreanName: (s?.korean_name as string) || undefined,
        } as EditorMeetingWithStudent
      })
    },
  })
}
