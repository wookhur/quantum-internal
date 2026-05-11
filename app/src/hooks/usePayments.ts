import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Payment, Contract, PaymentTransfer, TransferStage, TransferMethod } from '@/types'

function mapTransfer(row: Record<string, unknown>): PaymentTransfer {
  return {
    id: row.id as string,
    paymentId: row.payment_id as string,
    stage: row.stage as TransferStage,
    amount: row.amount as number,
    transferredAt: row.transferred_at as string,
    confirmedAt: row.confirmed_at as string,
    senderName: row.sender_name as string | undefined,
    transferMethod: (row.transfer_method as TransferMethod) || 'bank_transfer',
    memo: row.memo as string | undefined,
    confirmedBy: row.confirmed_by as string | undefined,
    createdAt: row.created_at as string,
  }
}

function mapPayment(row: Record<string, unknown>): Payment {
  const contract = row.contracts as Record<string, unknown> | null
  const transfers = (row.payment_transfers as Record<string, unknown>[] | null) ?? []
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    depositAmount: (row.deposit_amount as number) || 0,
    depositDate: row.deposit_date as string | undefined,
    interim1Amount: (row.interim1_amount as number) || 0,
    interim1Date: row.interim1_date as string | undefined,
    interim2Amount: (row.interim2_amount as number) || 0,
    interim2Date: row.interim2_date as string | undefined,
    balanceAmount: (row.balance_amount as number) || 0,
    balanceDate: row.balance_date as string | undefined,
    totalAmount: (row.total_amount as number) || 0,
    paidAmount: (row.paid_amount as number) || 0,
    outstandingAmount: (row.outstanding_amount as number) || 0,
    paymentProgress: Math.round((row.payment_progress as number) || 0),
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    transfers: transfers.map(mapTransfer),
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
        .select('*, contracts(*), payment_transfers(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapPayment)
    },
  })
}

export function usePaymentTransfers(paymentId: string) {
  return useQuery({
    queryKey: ['payment_transfers', paymentId],
    enabled: !!paymentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_transfers')
        .select('*')
        .eq('payment_id', paymentId)
        .order('transferred_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapTransfer)
    },
  })
}

export function useConfirmTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      paymentId: string
      stage: TransferStage
      amount: number
      transferredAt: string
      senderName?: string
      transferMethod: TransferMethod
      memo?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('payment_transfers')
        .insert({
          payment_id: input.paymentId,
          stage: input.stage,
          amount: input.amount,
          transferred_at: input.transferredAt,
          sender_name: input.senderName || null,
          transfer_method: input.transferMethod,
          memo: input.memo || null,
          confirmed_by: user?.id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['payment_transfers', variables.paymentId] })
    },
  })
}

export function useDeleteTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ transferId, paymentId }: { transferId: string; paymentId: string }) => {
      const { error } = await supabase
        .from('payment_transfers')
        .delete()
        .eq('id', transferId)
      if (error) throw error
      return { paymentId }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['payment_transfers', variables.paymentId] })
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
      depositDueDate?: string
      interim1Amount?: number
      interim1DueDate?: string
      interim2Amount?: number
      interim2DueDate?: string
      balanceAmount?: number
      balanceDueDate?: string
      currency: 'KRW' | 'USD'
    }) => {
      const { data, error } = await supabase.from('payments').insert({
        contract_id: payment.contractId,
        total_amount: payment.totalAmount,
        deposit_amount: payment.depositAmount,
        deposit_date: payment.depositDueDate || null,
        interim1_amount: payment.interim1Amount || 0,
        interim1_date: payment.interim1DueDate || null,
        interim2_amount: payment.interim2Amount || 0,
        interim2_date: payment.interim2DueDate || null,
        balance_amount: payment.balanceAmount || 0,
        balance_date: payment.balanceDueDate || null,
        paid_amount: 0,
        currency: payment.currency,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  })
}
