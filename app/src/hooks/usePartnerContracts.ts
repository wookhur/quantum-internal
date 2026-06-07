import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contract, PaymentInstallment } from '@/types'

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapContract(row: Record<string, unknown>): Contract {
  return {
    id: row.id as string,
    leadId: row.lead_id as string | undefined,
    contractorName: row.contractor_name as string,
    studentName: row.student_name as string,
    schoolName: row.school_name as string,
    gradeAtContract: row.grade_at_contract as string | undefined,
    address: row.address as string | undefined,
    phone: row.phone as string | undefined,
    contractDate: row.contract_date as string,
    expiryDate: row.expiry_date as string,
    totalAmount: (row.total_amount as number) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'USD',
    paymentAccount: (row.payment_account as 'KR' | 'US') || 'US',
    salesRep: row.sales_rep as string | undefined,
    serviceRep: row.service_rep as string | undefined,
    partnerId: row.partner_id as string | undefined,
    partnerFeeRate: row.partner_fee_rate as number | undefined,
    status: row.status as Contract['status'],
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapInstallment(row: Record<string, unknown>): PaymentInstallment {
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    installmentOrder: (row.installment_order as number) || 1,
    label: row.label as string,
    amount: (row.amount as number) || 0,
    dueDate: row.due_date as string | undefined,
    paidDate: row.paid_date as string | undefined,
    paidAmount: (row.paid_amount as number) || 0,
    status: (row.status as PaymentInstallment['status']) || 'paid',
    currency: (row.currency as 'KRW' | 'USD') || 'USD',
    category: (row.category as PaymentInstallment['category']) || 'base',
    paymentMethod: row.payment_method as PaymentInstallment['paymentMethod'] | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch contracts belonging to a partner */
export function usePartnerContracts(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['partner-contracts', partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('partner_id', partnerId!)
        .order('contract_date', { ascending: false })
      if (error) throw error
      return (data || []).map(mapContract)
    },
  })
}

/** Fetch payment installments for a set of contract IDs */
export function usePartnerPayments(contractIds: string[]) {
  return useQuery({
    queryKey: ['partner-payments', contractIds],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_installments')
        .select('*')
        .in('contract_id', contractIds)
        .order('paid_date', { ascending: false })
      if (error) throw error
      return (data || []).map(mapInstallment)
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreatePartnerPaymentInput {
  contractId: string
  label: string          // 계약금 / 중도금 / 잔금
  paidDate: string       // YYYY-MM-DD
  paidAmount: number     // USD
  notes?: string
}

export function useCreatePartnerPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreatePartnerPaymentInput) => {
      // Get current max order
      const { data: existing } = await supabase
        .from('payment_installments')
        .select('installment_order')
        .eq('contract_id', input.contractId)
        .order('installment_order', { ascending: false })
        .limit(1)
      const nextOrder = ((existing?.[0]?.installment_order as number) || 0) + 1

      const categoryMap: Record<string, string> = {
        '계약금': 'base',
        '중도금': 'base',
        '잔금': 'base',
      }

      const { data, error } = await supabase
        .from('payment_installments')
        .insert({
          contract_id: input.contractId,
          installment_order: nextOrder,
          label: input.label,
          amount: input.paidAmount,
          paid_date: input.paidDate,
          paid_amount: input.paidAmount,
          status: 'paid',
          currency: 'USD',
          payment_method: 'us_wire',
          category: categoryMap[input.label] || 'base',
          notes: input.notes || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-payments'] })
      qc.invalidateQueries({ queryKey: ['partner-contracts'] })
    },
  })
}

export function useUpdatePartnerPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: {
      id: string
      label?: string
      paidDate?: string
      paidAmount?: number
      notes?: string
    }) => {
      const update: Record<string, unknown> = {}
      if (fields.label !== undefined) update.label = fields.label
      if (fields.paidDate !== undefined) update.paid_date = fields.paidDate
      if (fields.paidAmount !== undefined) {
        update.paid_amount = fields.paidAmount
        update.amount = fields.paidAmount
      }
      if (fields.notes !== undefined) update.notes = fields.notes
      const { error } = await supabase
        .from('payment_installments')
        .update(update)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-payments'] })
    },
  })
}

export function useDeletePartnerPayment() {
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
      qc.invalidateQueries({ queryKey: ['partner-payments'] })
    },
  })
}
