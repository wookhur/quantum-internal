import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ServiceFollowup } from '@/types'

function mapFollowup(row: Record<string, unknown>): ServiceFollowup {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    diaryId: (row.diary_id as string) || undefined,
    category: (row.category as string) || 'followup',
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

/** Structured follow-ups for a set of diary entries (weekly report etc.). */
export function useServiceFollowupsForDiaries(diaryIds: string[]) {
  const key = [...diaryIds].sort().join(',')
  return useQuery({
    queryKey: ['service_followups_diaries', key],
    enabled: diaryIds.length > 0,
    queryFn: async () => {
      const out: ServiceFollowup[] = []
      const CHUNK = 150
      for (let i = 0; i < diaryIds.length; i += CHUNK) {
        const chunk = diaryIds.slice(i, i + CHUNK)
        const { data, error } = await supabase.from('service_followups').select('*').in('diary_id', chunk)
        if (error) throw error
        out.push(...(data || []).map(r => mapFollowup(r as Record<string, unknown>)))
      }
      return out
    },
  })
}

export function useCreateFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (f: {
      studentId: string
      diaryId?: string
      category?: string
      text: string
      dueDate?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_followups').insert({
        student_id: f.studentId,
        diary_id: f.diaryId || null,
        category: f.category || 'followup',
        text: f.text,
        due_date: f.dueDate || null,
        created_by: f.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapFollowup(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_status_pending_followups'] })
    },
  })
}

/** Bulk-insert several follow-up items (used by auto-diary generation). */
export function useBulkCreateFollowups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      studentId: string
      diaryId?: string
      category?: string
      items: string[]
      createdBy?: string
    }) => {
      if (!payload.items.length) return
      const rows = payload.items.map(text => ({
        student_id: payload.studentId,
        diary_id: payload.diaryId || null,
        category: payload.category || 'followup',
        text,
        created_by: payload.createdBy || null,
      }))
      const { error } = await supabase.from('service_followups').insert(rows)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_status_pending_followups'] })
    },
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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_status_pending_followups'] })
    },
  })
}

export function useUpdateFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, text }: { id: string; studentId: string; text: string }) => {
      const { error } = await supabase
        .from('service_followups')
        .update({ text })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_status_pending_followups'] })
    },
  })
}

export function useDeleteFollowup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_followups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_followups', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_status_pending_followups'] })
    },
  })
}

/** Split AI-generated follow-up text into clean line items.
 *  Splits on newlines AND on " / " separators that the AI uses to join
 *  multiple commitments for one person, so each becomes its own checkable item.
 *  A leading "Name:" label is preserved on every split item. */
export function splitFollowupText(text: string): string[] {
  if (!text) return []
  return text
    .split(/\n+/)
    .flatMap(rawLine => {
      const line = rawLine.replace(/^[\s•·\-*–—\d.)\]]+/, '').trim()
      if (!line) return []
      // Detect an optional "Name:" / "이름:" prefix (no slash, ≤40 chars) to
      // carry across the slash-separated sub-items.
      const m = line.match(/^([^/:：]{1,40}[:：])\s*(.+)$/)
      const prefix = m ? `${m[1]} ` : ''
      const body = m ? m[2] : line
      // Only split on " / " (slash padded by whitespace) so dates like 9/15,
      // "물리/화학", or "http://" stay intact.
      const parts = body.split(/\s+\/\s+/).map(p => p.trim()).filter(Boolean)
      if (parts.length <= 1) return [line]
      return parts.map(p => prefix + p)
    })
    .filter(line => line.length > 0 && line.length < 500)
}
