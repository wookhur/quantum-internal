import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AcademicSupportItem {
  id: string
  studentId: string
  academyName?: string
  subject?: string
  season?: string
  periodStart?: string
  periodEnd?: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): AcademicSupportItem {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    academyName: (row.academy_name as string) || undefined,
    subject: (row.subject as string) || undefined,
    season: (row.season as string) || undefined,
    periodStart: (row.period_start as string) || undefined,
    periodEnd: (row.period_end as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useAcademicSupport(studentId?: string) {
  return useQuery({
    queryKey: ['academic_support', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_academic_support')
        .select('*')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateAcademicSupport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Omit<AcademicSupportItem, 'id' | 'createdAt' | 'updatedAt'>) => {
      const { data, error } = await supabase.from('service_academic_support').insert({
        student_id: a.studentId,
        academy_name: a.academyName || null,
        subject: a.subject || null,
        season: a.season || null,
        period_start: a.periodStart || null,
        period_end: a.periodEnd || null,
        notes: a.notes || null,
        created_by: a.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] }),
  })
}

export function useUpdateAcademicSupport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; studentId: string } & Partial<Omit<AcademicSupportItem, 'id' | 'studentId' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
      const { error } = await supabase.from('service_academic_support').update({
        academy_name: a.academyName ?? null,
        subject: a.subject ?? null,
        season: a.season ?? null,
        period_start: a.periodStart ?? null,
        period_end: a.periodEnd ?? null,
        notes: a.notes ?? null,
      }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] }),
  })
}

export function useDeleteAcademicSupport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_academic_support').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] }),
  })
}
