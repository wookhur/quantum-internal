import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface PartnerInstructor {
  id: string
  name?: string           // 강사 이름
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
    name: (row.name as string) || undefined,
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
  // 기존 권한(모듈·라우트)을 보존하고 강사 라우트만 합집합으로 추가한다.
  // (남연서처럼 내부 계정 + 파트너 강사를 겸하는 사용자의 수동 권한이 지워지지 않도록)
  const { data: existing } = await supabase
    .from('feature_access')
    .select('enabled_modules, enabled_routes')
    .eq('user_id', profileId)
    .maybeSingle()
  const prevModules = ((existing as { enabled_modules?: string[] } | null)?.enabled_modules) || []
  const prevRoutes = ((existing as { enabled_routes?: string[] } | null)?.enabled_routes) || []
  const mergedRoutes = Array.from(new Set([...prevRoutes, ...enabledRoutes]))
  await supabase.from('feature_access').upsert({
    user_id: profileId,
    enabled_modules: prevModules,
    enabled_routes: mergedRoutes,
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
    mutationFn: async (input: { id?: string; name?: string; email: string; academy?: string; subject?: string; notes?: string; studentIds: string[]; enabledRoutes: string[] }) => {
      const row = {
        name: input.name?.trim() || null,
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

/**
 * 강사에게 로그인(매직) 링크 이메일을 보낸다. 비밀번호를 잊은 강사가 링크만 클릭하면 로그인됨.
 * 클라이언트에서 바로 호출 — 엣지 함수/서버 불필요.
 */
export function useSendInstructorMagicLink() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      })
      if (error) throw error
    },
  })
}

/** 외부 강사 비밀번호를 기본값(000000)으로 초기화 (관리자용, 서버 엣지함수 경유). */
export function useResetInstructorPassword() {
  return useMutation({
    mutationFn: async (email: string): Promise<{ success: boolean; password: string }> => {
      const { data, error } = await supabase.functions.invoke('reset-instructor-password', { body: { email } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data as { success: boolean; password: string }
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
