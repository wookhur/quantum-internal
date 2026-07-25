import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Mentor {
  id: string
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
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['student_coaching', v.studentId] }),
  })
}

export function useDeleteCoaching() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('student_coaching').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['student_coaching', v.studentId] }),
  })
}
