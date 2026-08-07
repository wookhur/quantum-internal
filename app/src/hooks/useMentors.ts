import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// 멘토 유형: 학습코칭(월 지급) | 전공별(회당 지급)
export type MentorType = 'coaching' | 'major'
// 전공별멘토 등급 → 회당 단가
export type MajorTier = 'college' | 'expert_lt5' | 'expert_gte5'
export const MAJOR_TIERS: { key: MajorTier; label: string; amount: number }[] = [
  { key: 'college',     label: '대학생',        amount: 50000 },
  { key: 'expert_lt5',  label: '5년이하 전문가', amount: 70000 },
  { key: 'expert_gte5', label: '5년이상 전문가', amount: 100000 },
]
export const majorTierAmount = (tier?: string | null): number =>
  MAJOR_TIERS.find(t => t.key === tier)?.amount ?? 0
export const majorTierLabel = (tier?: string | null): string =>
  MAJOR_TIERS.find(t => t.key === tier)?.label ?? '-'
// 학습코칭멘토: 학생 1인당 월 지급액
export const COACHING_MONTHLY = 300000

export interface Mentor {
  id: string
  type: MentorType
  tier?: MajorTier      // major 전용
  koreanName?: string
  englishName?: string
  birthYear?: number
  school?: string
  major?: string
  phone?: string
  email?: string
  subjects?: string   // 멘토링 가능한 과목
  notes?: string
  createdAt: string
  updatedAt: string
}

function mapMentor(r: Record<string, unknown>): Mentor {
  return {
    id: r.id as string,
    type: ((r.type as string) || 'coaching') as MentorType,
    tier: (r.tier as MajorTier) || undefined,
    koreanName: (r.korean_name as string) || undefined,
    englishName: (r.english_name as string) || undefined,
    birthYear: r.birth_year != null ? Number(r.birth_year) : undefined,
    school: (r.school as string) || undefined,
    major: (r.major as string) || undefined,
    phone: (r.phone as string) || undefined,
    email: (r.email as string) || undefined,
    subjects: (r.subjects as string) || undefined,
    notes: (r.notes as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** 멘토 표시명(한글 · 영문). */
export const mentorName = (m?: Pick<Mentor, 'koreanName' | 'englishName'> | null): string =>
  m ? ([m.koreanName, m.englishName].filter(Boolean).join(' · ') || '') : ''

export function useMentors() {
  return useQuery({
    queryKey: ['mentors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mentors').select('*').order('korean_name', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapMentor(r as Record<string, unknown>))
    },
  })
}

export function useUpsertMentor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: Partial<Mentor> & { id?: string }) => {
      const row: Record<string, unknown> = {
        type: m.type || 'coaching',
        tier: m.type === 'major' ? (m.tier || null) : null,
        korean_name: m.koreanName || null,
        english_name: m.englishName || null,
        birth_year: m.birthYear ?? null,
        school: m.school || null,
        major: m.major || null,
        phone: m.phone || null,
        email: m.email || null,
        subjects: m.subjects || null,
        notes: m.notes || null,
        updated_at: new Date().toISOString(),
      }
      if (m.id) {
        const { error } = await supabase.from('mentors').update(row).eq('id', m.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('mentors').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentors'] }),
  })
}

export function useDeleteMentor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mentors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentors'] })
      qc.invalidateQueries({ queryKey: ['student_coaching'] })
    },
  })
}

// ── 학생별 학습코칭 배정 ──
export interface StudentCoaching {
  id: string
  studentId: string
  mentorId?: string
  startDate?: string
  schedule?: string
  fieldNotes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapCoaching(r: Record<string, unknown>): StudentCoaching {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    mentorId: (r.mentor_id as string) || undefined,
    startDate: (r.start_date as string) || undefined,
    schedule: (r.schedule as string) || undefined,
    fieldNotes: (r.field_notes as string) || undefined,
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function useStudentCoaching(studentId?: string) {
  return useQuery({
    queryKey: ['student_coaching', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_coaching')
        .select('*')
        .eq('student_id', studentId as string)
        .order('start_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(r => mapCoaching(r as Record<string, unknown>))
    },
  })
}

export function useUpsertCoaching() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Partial<StudentCoaching> & { studentId: string; id?: string }) => {
      const row: Record<string, unknown> = {
        student_id: c.studentId,
        mentor_id: c.mentorId || null,
        start_date: c.startDate || null,
        schedule: c.schedule || null,
        field_notes: c.fieldNotes || null,
        updated_at: new Date().toISOString(),
      }
      if (c.id) {
        const { error } = await supabase.from('student_coaching').update(row).eq('id', c.id)
        if (error) throw error
      } else {
        row.created_by = c.createdBy || null
        const { error } = await supabase.from('student_coaching').insert(row)
        if (error) throw error
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['student_coaching', v.studentId] })
      qc.invalidateQueries({ queryKey: ['all_mentor_assignments'] })
    },
  })
}

export function useDeleteCoaching() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('student_coaching').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['student_coaching', v.studentId] })
      qc.invalidateQueries({ queryKey: ['all_mentor_assignments'] })
      qc.invalidateQueries({ queryKey: ['all_mentor_sessions'] })
    },
  })
}

// ── 전공별멘토 세션 로그 (날짜 + 코멘트 = 1회, 회당 청구 근거) ──
export interface MentorSession {
  id: string
  coachingId: string
  sessionDate: string
  comment?: string
  createdBy?: string
  createdAt: string
}

function mapSession(r: Record<string, unknown>): MentorSession {
  return {
    id: r.id as string,
    coachingId: r.coaching_id as string,
    sessionDate: r.session_date as string,
    comment: (r.comment as string) || undefined,
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
  }
}

export function useMentorSessions(coachingId?: string) {
  return useQuery({
    queryKey: ['mentor_sessions', coachingId],
    enabled: !!coachingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mentor_sessions')
        .select('*')
        .eq('coaching_id', coachingId as string)
        .order('session_date', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapSession(r as Record<string, unknown>))
    },
  })
}

export function useAddMentorSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: { coachingId: string; sessionDate: string; comment?: string; createdBy?: string }) => {
      const { error } = await supabase.from('mentor_sessions').insert({
        coaching_id: s.coachingId,
        session_date: s.sessionDate,
        comment: s.comment || null,
        created_by: s.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['mentor_sessions', v.coachingId] })
      qc.invalidateQueries({ queryKey: ['all_mentor_sessions'] })
    },
  })
}

export function useDeleteMentorSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; coachingId: string }) => {
      const { error } = await supabase.from('mentor_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['mentor_sessions', v.coachingId] })
      qc.invalidateQueries({ queryKey: ['all_mentor_sessions'] })
    },
  })
}

// ── 인보이스/게이팅용 전체 조회 ──
export interface MentorAssignmentRow {
  id: string
  studentId: string
  mentorId?: string
  startDate?: string
}

/** 모든 멘토 배정(student_coaching) — 인보이스 자동반영·멘토 게이팅용. */
export function useAllMentorAssignments() {
  return useQuery({
    queryKey: ['all_mentor_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_coaching')
        .select('id, student_id, mentor_id, start_date')
      if (error) throw error
      return (data || []).map(r => ({
        id: (r as Record<string, unknown>).id as string,
        studentId: (r as Record<string, unknown>).student_id as string,
        mentorId: ((r as Record<string, unknown>).mentor_id as string) || undefined,
        startDate: ((r as Record<string, unknown>).start_date as string) || undefined,
      })) as MentorAssignmentRow[]
    },
  })
}

export interface MentorSessionRow {
  id: string
  coachingId: string
  sessionDate: string
  comment?: string
  studentId?: string
  mentorId?: string
}

/** 모든 전공별멘토 세션 — 인보이스 회당 자동반영용(멘토·학생 조인). */
export function useAllMentorSessions() {
  return useQuery({
    queryKey: ['all_mentor_sessions'],
    queryFn: async () => {
      const map = (r: Record<string, unknown>): MentorSessionRow => {
        const sc = r.student_coaching as Record<string, unknown> | null
        return {
          id: r.id as string,
          coachingId: r.coaching_id as string,
          sessionDate: r.session_date as string,
          comment: (r.comment as string) || undefined,
          studentId: (sc?.student_id as string) || undefined,
          mentorId: (sc?.mentor_id as string) || undefined,
        }
      }
      const { data, error } = await supabase
        .from('mentor_sessions')
        .select('id, session_date, comment, coaching_id, student_coaching(student_id, mentor_id)')
      if (error) {
        // 학생/멘토 조인(FK 임베드) 실패 시에도 세션은 로드 — mentorId는 배정에서 보강됨
        const { data: d2, error: e2 } = await supabase
          .from('mentor_sessions')
          .select('id, session_date, comment, coaching_id')
        if (e2) throw e2
        return (d2 || []).map(r => map(r as Record<string, unknown>))
      }
      return (data || []).map(r => map(r as Record<string, unknown>))
    },
  })
}
