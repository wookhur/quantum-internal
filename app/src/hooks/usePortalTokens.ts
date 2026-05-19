import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PortalToken {
  id: string
  studentId: string
  token: string
  label?: string
  isActive: boolean
  createdBy?: string
  createdAt: string
  expiresAt?: string
}

function mapToken(row: Record<string, unknown>): PortalToken {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    token: row.token as string,
    label: (row.label as string) || undefined,
    isActive: row.is_active as boolean,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    expiresAt: (row.expires_at as string) || undefined,
  }
}

/** Get all portal tokens for a student */
export function usePortalTokens(studentId?: string) {
  return useQuery({
    queryKey: ['portal_tokens', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_portal_tokens')
        .select('*')
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => mapToken(r as Record<string, unknown>))
    },
  })
}

/** Create a new portal token */
export function useCreatePortalToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      studentId: string
      label?: string
      createdBy?: string
      expiresAt?: string
    }) => {
      const { data, error } = await supabase
        .from('student_portal_tokens')
        .insert({
          student_id: params.studentId,
          label: params.label || null,
          created_by: params.createdBy || null,
          expires_at: params.expiresAt || null,
        })
        .select()
        .single()
      if (error) throw error
      return mapToken(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ['portal_tokens', v.studentId] }),
  })
}

/** Toggle token active/inactive */
export function useTogglePortalToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; studentId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('student_portal_tokens')
        .update({ is_active: params.isActive })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ['portal_tokens', v.studentId] }),
  })
}

/** Delete a portal token */
export function useDeletePortalToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; studentId: string }) => {
      const { error } = await supabase
        .from('student_portal_tokens')
        .delete()
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ['portal_tokens', v.studentId] }),
  })
}

// ─── Public (anonymous) access for the portal page ───

/** Fetch student data via portal token (no auth required) */
export function usePortalData(token?: string) {
  return useQuery({
    queryKey: ['portal_data', token],
    enabled: !!token,
    queryFn: async () => {
      // 1. Look up the token
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('student_portal_tokens')
        .select('*')
        .eq('token', token!)
        .eq('is_active', true)
        .maybeSingle()
      if (tokenErr) throw tokenErr
      if (!tokenRow) throw new Error('INVALID_TOKEN')

      // Check expiry client-side as well
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        throw new Error('TOKEN_EXPIRED')
      }

      const studentId = tokenRow.student_id as string

      // 2. Fetch student profile
      const { data: studentRow, error: studentErr } = await supabase
        .from('service_students')
        .select('*')
        .eq('id', studentId)
        .single()
      if (studentErr) throw studentErr

      // 3. Fetch meetings
      const { data: meetingsRaw, error: meetingsErr } = await supabase
        .from('service_meetings')
        .select('*')
        .eq('student_id', studentId)
        .order('meeting_date', { ascending: false, nullsFirst: false })
      if (meetingsErr) throw meetingsErr

      // 4. Fetch diary
      const { data: diaryRaw, error: diaryErr } = await supabase
        .from('service_diary')
        .select('*')
        .eq('student_id', studentId)
        .order('entry_date', { ascending: false, nullsFirst: false })
      if (diaryErr) throw diaryErr

      return {
        student: studentRow as Record<string, unknown>,
        meetings: (meetingsRaw || []) as Record<string, unknown>[],
        diary: (diaryRaw || []) as Record<string, unknown>[],
      }
    },
    retry: false,
  })
}
