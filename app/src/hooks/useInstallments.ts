import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PaymentInstallment, InstallmentStatus } from '@/types'

function mapInstallment(row: Record<string, unknown>): PaymentInstallment {
  const contract = row.contracts as Record<string, unknown> | null
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    installmentOrder: row.installment_order as number,
    label: row.label as string,
    amount: (row.amount as number) || 0,
    dueDate: row.due_date as string | undefined,
    paidDate: row.paid_date as string | undefined,
    paidAmount: (row.paid_amount as number) || 0,
    status: row.status as InstallmentStatus,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    paymentMethod: row.payment_method as PaymentInstallment['paymentMethod'],
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    contract: contract
      ? {
          id: contract.id as string,
          contractorName: contract.contractor_name as string,
          studentName: contract.student_name as string,
          schoolName: (contract.school_name as string) || '',
          contractDate: contract.contract_date as string,
          expiryDate: contract.expiry_date as string,
          totalAmount: (contract.total_amount as number) || 0,
          currency: (contract.currency as 'KRW' | 'USD') || 'KRW',
          paymentAccount: (contract.payment_account as 'KR' | 'US') || 'KR',
          status: contract.status as PaymentInstallment['contract'] extends undefined ? never : NonNullable<PaymentInstallment['contract']>['status'],
          createdAt: contract.created_at as string,
          updatedAt: contract.updated_at as string,
        }
      : undefined,
  }
}

/** Fetch all installments with contract info */
export function useInstallments() {
  return useQuery({
    queryKey: ['installments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_installments')
        .select('*, contracts(id, contractor_name, student_name, school_name, contract_date, expiry_date, total_amount, currency, payment_account, status, created_at, updated_at)')
        .order('due_date', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapInstallment(r as Record<string, unknown>))
    },
  })
}

/** Fetch installments for a specific contract */
export function useContractInstallments(contractId: string | undefined) {
  return useQuery({
    queryKey: ['installments', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_installments')
        .select('*')
        .eq('contract_id', contractId!)
        .order('installment_order', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapInstallment(r as Record<string, unknown>))
    },
    enabled: !!contractId,
  })
}

/** Update an installment (mark paid, change amount, etc.) */
export function useUpdateInstallment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      label?: string
      amount?: number
      dueDate?: string
      status?: InstallmentStatus
      paidAmount?: number
      paidDate?: string
      paymentMethod?: string
      notes?: string
    }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.label !== undefined) row.label = updates.label
      if (updates.amount !== undefined) row.amount = updates.amount
      if (updates.dueDate !== undefined) row.due_date = updates.dueDate || null
      if (updates.status !== undefined) row.status = updates.status
      if (updates.paidAmount !== undefined) row.paid_amount = updates.paidAmount
      if (updates.paidDate !== undefined) row.paid_date = updates.paidDate || null
      if (updates.paymentMethod !== undefined) row.payment_method = updates.paymentMethod || null
      if (updates.notes !== undefined) row.notes = updates.notes || null

      const { data, error } = await supabase
        .from('payment_installments')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installments'] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['revenue-projection'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

/** Delete a single installment */
export function useDeleteInstallment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_installments')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installments'] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['revenue-projection'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

/** Create installments for a contract (batch insert) */
export function useCreateInstallments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (installments: {
      contractId: string
      items: {
        installmentOrder: number
        label: string
        amount: number
        dueDate?: string
        currency: 'KRW' | 'USD'
      }[]
    }) => {
      const rows = installments.items.map((item) => ({
        contract_id: installments.contractId,
        installment_order: item.installmentOrder,
        label: item.label,
        amount: item.amount,
        due_date: item.dueDate || null,
        currency: item.currency,
        status: 'pending' as const,
        paid_amount: 0,
      }))

      const { data, error } = await supabase
        .from('payment_installments')
        .insert(rows)
        .select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['installments'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
    },
  })
}

/**
 * Revenue projection data: groups installments by month
 * Returns both past (actual) and future (projected) months
 */
export function useRevenueProjection() {
  return useQuery({
    queryKey: ['revenue-projection'],
    queryFn: async () => {
      // Fetch all installments with contract info
      const { data, error } = await supabase
        .from('payment_installments')
        .select('*, contracts(id, contractor_name, student_name, total_amount, currency, status)')
        .order('due_date', { ascending: true })
      if (error) throw error

      const installments = (data || []) as Record<string, unknown>[]

      // Group by month
      const monthMap = new Map<string, {
        month: string
        paid: number
        pending: number
        overdue: number
        items: { label: string; contractorName: string; studentName: string; amount: number; status: string; dueDate: string }[]
      }>()

      for (const row of installments) {
        const dueDate = row.due_date as string
        if (!dueDate) continue

        const monthKey = dueDate.slice(0, 7) // YYYY-MM
        const existing = monthMap.get(monthKey) || {
          month: monthKey,
          paid: 0,
          pending: 0,
          overdue: 0,
          items: [],
        }

        const amount = (row.amount as number) || 0
        const paidAmount = (row.paid_amount as number) || 0
        const status = row.status as string
        const contract = row.contracts as Record<string, unknown> | null

        if (status === 'paid') {
          existing.paid += paidAmount
        } else if (status === 'overdue') {
          existing.overdue += amount - paidAmount
        } else {
          existing.pending += amount - paidAmount
        }

        existing.items.push({
          label: row.label as string,
          contractorName: contract?.contractor_name as string || '',
          studentName: contract?.student_name as string || '',
          amount,
          status,
          dueDate,
        })

        monthMap.set(monthKey, existing)
      }

      // Sort by month
      return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month))
    },
  })
}
