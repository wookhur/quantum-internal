import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface PartnerInstructor {
  id: string
  email: string
  academy?: string
  subject?: string        // 담당과목
  notes?: string          // 특이사항
  studentIds: string[]    // 담당학생 (service_students.id)
  enabledRoutes: string[] // 접근가능 게시판(라우트)
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): PartnerInstructor {
  return {
    id: row.id as string,
    email: (row.email as string) || '',
    academy: (row.academy as string) || undefined,
    subject: (row.subject as string) || undefined,
    notes: (row.notes as string) || undefined,
    studentIds: (row.student_ids as string[]) || [],
    enabledRoutes: (row.enabled_routes as string[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function usePartnerInstructors() {
  return useQuery({
    queryKey: ['partner-instructors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_instructors')
        .select('*')
        .order('academy', { ascending: true })
        .order('email', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

/** Apply the instructor's access to an existing login account (email match), if any. */
async function applyToProfileIfExists(email: string, academy: string | undefined, enabledRoutes: string[]) {
  const { data: prof } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  const profileId = (prof as { id?: string } | null)?.id
  if (!profileId) return
  await supabase.from('profiles').update({ is_partner: true, partner_academy: academy || null, updated_at: new Date().toISOString() }).eq('id', profileId)
  await supabase.from('feature_access').upsert({
    user_id: profileId,
    enabled_modules: [],
    enabled_routes: enabledRoutes,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}

/**
 * On login, apply the current user's own partner-instructor access (routes/academy)
 * to their account via a SECURITY DEFINER RPC. Runs once per session; no-op for
 * users who aren't registered partner instructors.
 */
export function useApplyMyInstructorAccess() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const doneFor = useRef<string | null>(null)
  useEffect(() => {
    if (!user?.id || doneFor.current === user.id) return
    doneFor.current = user.id
    ;(async () => {
      const { error } = await supabase.rpc('apply_my_instructor_access')
      if (error) return
      qc.invalidateQueries({ queryKey: ['feature-access'] })
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['my-partner-instructor'] })
    })()
  }, [user?.id, qc])
}

/** The current user's own partner-instructor record (matched by email), if any. */
export function useMyPartnerInstructor() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-partner-instructor', user?.email],
    enabled: !!user?.email,
    queryFn: async (): Promise<PartnerInstructor | null> => {
      const { data, error } = await supabase
        .from('partner_instructors')
        .select('*')
        .ilike('email', user!.email)
        .maybeSingle()
      if (error) return null
      return data ? mapRow(data as Record<string, unknown>) : null
    },
  })
}

export function useUpsertPartnerInstructor() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { id?: string; email: string; academy?: string; subject?: string; notes?: string; studentIds: string[]; enabledRoutes: string[] }) => {
      const row = {
        email: input.email.trim(),
        academy: input.academy?.trim() || null,
        subject: input.subject?.trim() || null,
        notes: input.notes?.trim() || null,
        student_ids: input.studentIds,
        enabled_routes: input.enabledRoutes,
      }
      if (input.id) {
        const { error } = await supabase.from('partner_instructors').update(row).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('partner_instructors').insert({ ...row, created_by: user?.id || null })
        if (error) throw error
      }
      // best-effort: if this email already has a login account, apply access now
      await applyToProfileIfExists(input.email.trim(), input.academy, input.enabledRoutes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-instructors'] })
      qc.invalidateQueries({ queryKey: ['feature-access'] })
    },
  })
}

export function useDeletePartnerInstructor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('partner_instructors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-instructors'] }),
  })
}
