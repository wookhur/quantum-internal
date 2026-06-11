import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ECActivity {
  id: string
  studentId: string
  partner?: string
  periodStart?: string
  periodEnd?: string
  program?: string
  salesContributor1?: string
  salesContributor2?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): ECActivity {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    partner: (row.partner as string) || undefined,
    periodStart: (row.period_start as string) || undefined,
    periodEnd: (row.period_end as string) || undefined,
    program: (row.program as string) || undefined,
    salesContributor1: (row.sales_contributor_1 as string) || undefined,
    salesContributor2: (row.sales_contributor_2 as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useECActivities(studentId?: string) {
  return useQuery({
    queryKey: ['ec_activities', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_ec_activities')
        .select('*')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateECActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Omit<ECActivity, 'id' | 'createdAt' | 'updatedAt'>) => {
      const { data, error } = await supabase.from('service_ec_activities').insert({
        student_id: a.studentId,
        partner: a.partner || null,
        period_start: a.periodStart || null,
        period_end: a.periodEnd || null,
        program: a.program || null,
        sales_contributor_1: a.salesContributor1 || null,
        sales_contributor_2: a.salesContributor2 || null,
        created_by: a.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ec_activities', v.studentId] }),
  })
}

export function useUpdateECActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; studentId: string } & Partial<Omit<ECActivity, 'id' | 'studentId' | 'createdBy' | 'createdAt' | 'updatedAt'>>) => {
      const { error } = await supabase.from('service_ec_activities').update({
        partner: a.partner ?? null,
        period_start: a.periodStart ?? null,
        period_end: a.periodEnd ?? null,
        program: a.program ?? null,
        sales_contributor_1: a.salesContributor1 ?? null,
        sales_contributor_2: a.salesContributor2 ?? null,
      }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ec_activities', v.studentId] }),
  })
}

export function useDeleteECActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_ec_activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['ec_activities', v.studentId] }),
  })
}
