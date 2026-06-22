import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A Student-360 program (EC activity or academic support) surfaced as an
 *  external service fee item. Contributors come from Student 360; billing and
 *  per-contributor % are set by admins on the External Service Fees page. */
export interface ServiceProgramFee {
  id: string
  source: 'ec' | 'academic'
  studentId: string
  studentName: string
  label: string          // EC: partner / Academic: academy name
  detail?: string        // EC: program / Academic: subject
  periodStart?: string
  periodEnd?: string
  contributor1?: string
  contributor2?: string
  billedAmount?: number
  currency: string
  collectionStatus: 'pending' | 'paid'
  paidDate?: string
  contributor1Percentage?: number
  contributor2Percentage?: number
}

function num(v: unknown): number | undefined {
  return v != null ? Number(v) : undefined
}

/** All EC + academic-support programs across every student, for the fees page. */
export function useAllServiceProgramFees() {
  return useQuery({
    queryKey: ['service-program-fees'],
    queryFn: async () => {
      const [ecRes, acRes] = await Promise.all([
        supabase
          .from('service_ec_activities')
          .select('*, service_students:student_id(name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('service_academic_support')
          .select('*, service_students:student_id(name)')
          .order('created_at', { ascending: false }),
      ])
      if (ecRes.error) throw ecRes.error
      if (acRes.error) throw acRes.error

      const out: ServiceProgramFee[] = []
      for (const r of ecRes.data || []) {
        const s = r.service_students as Record<string, unknown> | null
        out.push({
          id: r.id as string,
          source: 'ec',
          studentId: r.student_id as string,
          studentName: (s?.name as string) || '',
          label: (r.partner as string) || 'EC',
          detail: (r.program as string) || undefined,
          periodStart: (r.period_start as string) || undefined,
          periodEnd: (r.period_end as string) || undefined,
          contributor1: (r.sales_contributor_1 as string) || undefined,
          contributor2: (r.sales_contributor_2 as string) || undefined,
          billedAmount: num(r.billed_amount),
          currency: (r.currency as string) || 'KRW',
          collectionStatus: (r.collection_status as 'pending' | 'paid') || 'pending',
          paidDate: (r.paid_date as string) || undefined,
          contributor1Percentage: num(r.contributor_1_percentage),
          contributor2Percentage: num(r.contributor_2_percentage),
        })
      }
      for (const r of acRes.data || []) {
        const s = r.service_students as Record<string, unknown> | null
        out.push({
          id: r.id as string,
          source: 'academic',
          studentId: r.student_id as string,
          studentName: (s?.name as string) || '',
          label: (r.academy_name as string) || 'Academic',
          detail: (r.subject as string) || undefined,
          periodStart: (r.period_start as string) || undefined,
          periodEnd: (r.period_end as string) || undefined,
          contributor1: (r.sales_contributor_1 as string) || undefined,
          contributor2: (r.sales_contributor_2 as string) || undefined,
          billedAmount: num(r.billed_amount),
          currency: (r.currency as string) || 'KRW',
          collectionStatus: (r.collection_status as 'pending' | 'paid') || 'pending',
          paidDate: (r.paid_date as string) || undefined,
          contributor1Percentage: num(r.contributor_1_percentage),
          contributor2Percentage: num(r.contributor_2_percentage),
        })
      }
      return out
    },
  })
}
