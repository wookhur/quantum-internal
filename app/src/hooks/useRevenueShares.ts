import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RevenueShare } from '@/types'

function mapShare(r: Record<string, unknown>): RevenueShare {
  return {
    id: r.id as string,
    installmentId: r.installment_id as string,
    recipientName: r.recipient_name as string,
    recipientProfileId: r.recipient_profile_id as string | undefined,
    amount: (r.amount as number) || 0,
    percentage: r.percentage as number | undefined,
    role: r.role as string | undefined,
    notes: r.notes as string | undefined,
    isPaid: (r.is_paid as boolean) || false,
    paidDate: r.paid_date as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/** Fetch revenue shares for a set of installment IDs */
export function useRevenueSharesByInstallments(installmentIds: string[]) {
  return useQuery({
    queryKey: ['revenue-shares', installmentIds],
    enabled: installmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installment_revenue_shares')
        .select('*')
        .in('installment_id', installmentIds)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapShare(r as Record<string, unknown>))
    },
  })
}

/** Create revenue shares for an installment (batch) */
export function useCreateRevenueShares() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      installmentId: string
      shares: {
        recipientName: string
        recipientProfileId?: string
        amount: number
        percentage?: number
        role?: string
        notes?: string
      }[]
    }) => {
      if (params.shares.length === 0) return []
      const rows = params.shares.map(s => ({
        installment_id: params.installmentId,
        recipient_name: s.recipientName,
        recipient_profile_id: s.recipientProfileId || null,
        amount: s.amount,
        percentage: s.percentage || null,
        role: s.role || null,
        notes: s.notes || null,
      }))
      const { data, error } = await supabase
        .from('installment_revenue_shares')
        .insert(rows)
        .select()
      if (error) throw error
      return (data || []).map((r) => mapShare(r as Record<string, unknown>))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue-shares'] })
    },
  })
}

/** Update a revenue share (mark paid, change amount, etc.) */
export function useUpdateRevenueShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      recipientName?: string
      amount?: number
      percentage?: number
      role?: string
      notes?: string
      isPaid?: boolean
      paidDate?: string
    }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.recipientName !== undefined) row.recipient_name = updates.recipientName
      if (updates.amount !== undefined) row.amount = updates.amount
      if (updates.percentage !== undefined) row.percentage = updates.percentage
      if (updates.role !== undefined) row.role = updates.role || null
      if (updates.notes !== undefined) row.notes = updates.notes || null
      if (updates.isPaid !== undefined) row.is_paid = updates.isPaid
      if (updates.paidDate !== undefined) row.paid_date = updates.paidDate || null

      const { data, error } = await supabase
        .from('installment_revenue_shares')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapShare(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue-shares'] })
    },
  })
}

/** Delete a revenue share */
export function useDeleteRevenueShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('installment_revenue_shares')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['revenue-shares'] })
    },
  })
}
