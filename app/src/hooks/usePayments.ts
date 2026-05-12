import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contract } from '@/types'

// Legacy Payment type for backward compat (will be replaced with PaymentInstallment)
interface Payment {
  id: string
  contractId: string
  depositAmount: number
  depositDate?: string
  interim1Amount: number
  interim1Date?: string
  interim2Amount: number
  interim2Date?: string
  balanceAmount: number
  balanceDate?: string
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  paymentProgress: number
  currency: 'KRW' | 'USD'
  createdAt: string
  updatedAt: string
  contract?: Partial<Contract>
}

function mapPayment(row: Record<string, unknown>): Payment {
  const contract = row.contracts as Record<string, unknown> | null
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    depositAmount: (row.deposit_amount as number) || 0,
    depositDate: row.deposit_date as string,
    interim1Amount: (row.interim1_amount as number) || 0,
    interim1Date: row.interim1_date as string,
    interim2Amount: (row.interim2_amount as number) || 0,
    interim2Date: row.interim2_date as string,
    balanceAmount: (row.balance_amount as number) || 0,
    balanceDate: row.balance_date as string,
    totalAmount: (row.total_amount as number) || 0,
    paidAmount: (row.paid_amount as number) || 0,
    outstandingAmount: (row.outstanding_amount as number) || 0,
    paymentProgress: (row.payment_progress as number) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    contract: contract
      ? {
          id: contract.id as string,
          contractorName: contract.contractor_name as string,
          studentName: contract.student_name as string,
          schoolName: contract.school_name as string,
          gradeAtContract: contract.grade_at_contract as string,
          contractDate: contract.contract_date as string,
          expiryDate: contract.expiry_date as string,
          status: contract.status as Contract['status'],
          createdAt: contract.created_at as string,
          updatedAt: contract.updated_at as string,
        }
      : undefined,
  }
}

export function usePayments() {
  return useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, contracts(*)')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []).map(mapPayment)
    },
  })
}

export function useCreatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      contractId: string
      totalAmount: number
      depositAmount: number
      currency: 'KRW' | 'USD'
    }) => {
      const outstandingAmount = payment.totalAmount - payment.depositAmount
      const paidAmount = payment.depositAmount
      const paymentProgress = payment.totalAmount > 0
        ? Math.round((payment.depositAmount / payment.totalAmount) * 100)
        : 0

      const { data, error } = await supabase.from('payments').insert({
        contract_id: payment.contractId,
        total_amount: payment.totalAmount,
        deposit_amount: payment.depositAmount,
        deposit_date: payment.depositAmount > 0 ? new Date().toISOString().slice(0, 10) : null,
        interim1_amount: 0,
        interim1_date: null,
        interim2_amount: 0,
        interim2_date: null,
        balance_amount: 0,
        balance_date: null,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
        payment_progress: paymentProgress,
        currency: payment.currency,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  })
}
