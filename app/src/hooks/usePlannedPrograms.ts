import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PlannedProgram {
  id: string
  studentName: string
  partner?: string
  program?: string
  plannedDate?: string
  notes?: string
  status: 'planned' | 'done'
  createdAt: string
}

function mapRow(r: Record<string, unknown>): PlannedProgram {
  return {
    id: r.id as string,
    studentName: r.student_name as string,
    partner: (r.partner as string) || undefined,
    program: (r.program as string) || undefined,
    plannedDate: (r.planned_date as string) || undefined,
    notes: (r.notes as string) || undefined,
    status: (r.status as 'planned' | 'done') || 'planned',
    createdAt: r.created_at as string,
  }
}

export function usePlannedPrograms() {
  return useQuery({
    queryKey: ['planned-programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_planned_programs')
        .select('*')
        .order('planned_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useCreatePlannedProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { studentName: string; partner?: string; program?: string; plannedDate?: string; notes?: string; createdBy?: string }) => {
      const { error } = await supabase.from('service_planned_programs').insert({
        student_name: p.studentName,
        partner: p.partner || null,
        program: p.program || null,
        planned_date: p.plannedDate || null,
        notes: p.notes || null,
        created_by: p.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planned-programs'] }),
  })
}

export function useUpdatePlannedProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; studentName?: string; partner?: string; program?: string; plannedDate?: string; notes?: string; status?: 'planned' | 'done' }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (p.studentName !== undefined) row.student_name = p.studentName
      if (p.partner !== undefined) row.partner = p.partner || null
      if (p.program !== undefined) row.program = p.program || null
      if (p.plannedDate !== undefined) row.planned_date = p.plannedDate || null
      if (p.notes !== undefined) row.notes = p.notes || null
      if (p.status !== undefined) row.status = p.status
      const { error } = await supabase.from('service_planned_programs').update(row).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planned-programs'] }),
  })
}

export function useDeletePlannedProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_planned_programs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planned-programs'] }),
  })
}
