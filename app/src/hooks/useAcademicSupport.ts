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
        sales_contributor_1: a.salesContributor1 || null,
        sales_contributor_2: a.salesContributor2 || null,
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
      // Only set provided fields (partial update — billing edits in External
      // Fees must not wipe the program data from Student 360, and vice versa).
      const row: Record<string, unknown> = {}
      if (a.academyName !== undefined) row.academy_name = a.academyName || null
      if (a.subject !== undefined) row.subject = a.subject || null
      if (a.season !== undefined) row.season = a.season || null
      if (a.periodStart !== undefined) row.period_start = a.periodStart || null
      if (a.periodEnd !== undefined) row.period_end = a.periodEnd || null
      if (a.notes !== undefined) row.notes = a.notes || null
      if (a.salesContributor1 !== undefined) row.sales_contributor_1 = a.salesContributor1 || null
      if (a.salesContributor2 !== undefined) row.sales_contributor_2 = a.salesContributor2 || null
      if (a.billedAmount !== undefined) row.billed_amount = a.billedAmount ?? null
      if (a.currency !== undefined) row.currency = a.currency || 'KRW'
      if (a.collectionStatus !== undefined) row.collection_status = a.collectionStatus
      if (a.paidDate !== undefined) row.paid_date = a.paidDate || null
      if (a.contributor1Percentage !== undefined) row.contributor_1_percentage = a.contributor1Percentage ?? null
      if (a.contributor2Percentage !== undefined) row.contributor_2_percentage = a.contributor2Percentage ?? null
      const { error } = await supabase.from('service_academic_support').update(row).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] })
      qc.invalidateQueries({ queryKey: ['service-program-fees'] })
      qc.invalidateQueries({ queryKey: ['incentives'] })
    },
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
