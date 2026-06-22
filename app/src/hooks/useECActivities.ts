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
  // Billing / incentive (set by admins in External Service Fees)
  billedAmount?: number
  currency?: string
  collectionStatus?: 'pending' | 'paid'
  paidDate?: string
  contributor1Percentage?: number
  contributor2Percentage?: number
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
    billedAmount: row.billed_amount != null ? Number(row.billed_amount) : undefined,
    currency: (row.currency as string) || 'KRW',
    collectionStatus: (row.collection_status as 'pending' | 'paid') || 'pending',
    paidDate: (row.paid_date as string) || undefined,
    contributor1Percentage: row.contributor_1_percentage != null ? Number(row.contributor_1_percentage) : undefined,
    contributor2Percentage: row.contributor_2_percentage != null ? Number(row.contributor_2_percentage) : undefined,
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
      // Only set provided fields, so an admin editing billing in External Fees
      // doesn't wipe the program data entered in Student 360 (and vice versa).
      const row: Record<string, unknown> = {}
      if (a.partner !== undefined) row.partner = a.partner || null
      if (a.periodStart !== undefined) row.period_start = a.periodStart || null
      if (a.periodEnd !== undefined) row.period_end = a.periodEnd || null
      if (a.program !== undefined) row.program = a.program || null
      if (a.salesContributor1 !== undefined) row.sales_contributor_1 = a.salesContributor1 || null
      if (a.salesContributor2 !== undefined) row.sales_contributor_2 = a.salesContributor2 || null
      if (a.billedAmount !== undefined) row.billed_amount = a.billedAmount ?? null
      if (a.currency !== undefined) row.currency = a.currency || 'KRW'
      if (a.collectionStatus !== undefined) row.collection_status = a.collectionStatus
      if (a.paidDate !== undefined) row.paid_date = a.paidDate || null
      if (a.contributor1Percentage !== undefined) row.contributor_1_percentage = a.contributor1Percentage ?? null
      if (a.contributor2Percentage !== undefined) row.contributor_2_percentage = a.contributor2Percentage ?? null
      const { error } = await supabase.from('service_ec_activities').update(row).eq('id', a.id)
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
