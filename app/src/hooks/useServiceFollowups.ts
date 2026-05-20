import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ServiceFollowup } from '@/types'

function mapFollowup(row: Record<string, unknown>): ServiceFollowup {
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
  }
}

export function useServiceFollowups(studentId?: string) {
  return useQuery({
    queryKey: ['service_followups', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_followups')
        .select('*')
        .eq('student_id', studentId as string)
        .order('done', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapFollowup)
    },
  })
}

export function useCreateFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (f: {
      studentId: string
      diaryId?: string
      text: string
      dueDate?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_followups').insert({
        student_id: f.studentId,
        diary_id: f.diaryId || null,
        text: f.text,
        due_date: f.dueDate || null,
        created_by: f.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapFollowup(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] }),
  })
}

/** Bulk-insert several follow-up items (used by auto-diary generation). */
export function useBulkCreateFollowups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      studentId: string
      diaryId?: string
      items: string[]
      createdBy?: string
    }) => {
      if (!payload.items.length) return
      const rows = payload.items.map(text => ({
        student_id: payload.studentId,
        diary_id: payload.diaryId || null,
        text,
        created_by: payload.createdBy || null,
      }))
      const { error } = await supabase.from('service_followups').insert(rows)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] }),
  })
}

export function useToggleFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; studentId: string; done: boolean }) => {
      const { error } = await supabase
        .from('service_followups')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] }),
  })
}

export function useDeleteFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_followups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] }),
  })
}

/** Split AI-generated follow-up text into clean line items. */
export function splitFollowupText(text: string): string[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .map(line => line.replace(/^[\s•·\-*–—\d.)\]]+/, '').trim())
    .filter(line => line.length > 0 && line.length < 500)
}
