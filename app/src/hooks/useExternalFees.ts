import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ExtraInstallmentWithContext {
  id: string
  contractId: string
  label: string
  amount: number
  paidAmount: number
  paidDate: string | null
  status: string
  currency: string
  category: string
  notes: string | null
  // Contract info
  contractorName: string
  studentName: string
  schoolName: string
  contractDate: string
  // Revenue shares
  revenueShares: {
    id: string
    recipientName: string
    recipientProfileId: string | null
    amount: number
    percentage: number | null
    role: string | null
    notes: string | null
    isPaid: boolean
    paidDate: string | null
  }[]
}

/**
 * Fetch ALL extra installments (category='extra') with their contract info
 * and associated revenue shares. Used by Service team's external fees page.
 */
export function useAllExtraInstallments() {
  return useQuery({
    queryKey: ['extra-installments-all'],
    queryFn: async () => {
      // 1. Fetch extra installments with contract info
      const { data: instData, error: instErr } = await supabase
        .from('payment_installments')
        .select('*, contracts:contract_id(id, contractor_name, student_name, school_name, contract_date, currency)')
        .eq('category', 'extra')
        .order('created_at', { ascending: false })

      if (instErr) throw instErr
      if (!instData || instData.length === 0) return []

      // 2. Fetch all revenue shares for these installments
      const instIds = instData.map(i => i.id as string)
      const { data: sharesData } = await supabase
        .from('installment_revenue_shares')
        .select('*')
        .in('installment_id', instIds)
        .order('created_at', { ascending: true })

      const sharesMap = new Map<string, ExtraInstallmentWithContext['revenueShares']>()
      for (const s of sharesData || []) {
        const iid = s.installment_id as string
        if (!sharesMap.has(iid)) sharesMap.set(iid, [])
        sharesMap.get(iid)!.push({
          id: s.id as string,
          recipientName: s.recipient_name as string,
          recipientProfileId: (s.recipient_profile_id as string) || null,
          amount: Number(s.amount) || 0,
          percentage: s.percentage != null ? Number(s.percentage) : null,
          role: (s.role as string) || null,
          notes: (s.notes as string) || null,
          isPaid: (s.is_paid as boolean) || false,
          paidDate: (s.paid_date as string) || null,
        })
      }

      // 3. Map results
      return instData.map((row): ExtraInstallmentWithContext => {
        const contract = row.contracts as Record<string, unknown> | null
        return {
          id: row.id as string,
          contractId: row.contract_id as string,
          label: row.label as string,
          amount: Number(row.amount) || 0,
          paidAmount: Number(row.paid_amount) || 0,
          paidDate: (row.paid_date as string) || null,
          status: (row.status as string) || 'pending',
          currency: (row.currency as string) || (contract?.currency as string) || 'KRW',
          category: 'extra',
          notes: (row.notes as string) || null,
          contractorName: (contract?.contractor_name as string) || '',
          studentName: (contract?.student_name as string) || '',
          schoolName: (contract?.school_name as string) || '',
          contractDate: (contract?.contract_date as string) || '',
          revenueShares: sharesMap.get(row.id as string) || [],
        }
      })
    },
  })
}
