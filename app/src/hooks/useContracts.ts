import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contract, ContractStatus, PaymentInstallment } from '@/types'

function mapContract(row: Record<string, unknown>): Contract {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    contractorName: row.contractor_name as string,
    studentName: row.student_name as string,
    schoolName: row.school_name as string,
    gradeAtContract: row.grade_at_contract as string,
    address: (row.address as string) || undefined,
    phone: (row.phone as string) || undefined,
    contractDate: row.contract_date as string,
    expiryDate: row.expiry_date as string,
    totalAmount: (row.total_amount as number) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    paymentAccount: (row.payment_account as 'KR' | 'US') || 'KR',
    status: row.status as ContractStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useContracts(filters?: { status?: ContractStatus; search?: string }) {
  return useQuery({
    queryKey: ['contracts', filters],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*')
        .order('contract_date', { ascending: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.search) {
        query = query.or(`contractor_name.ilike.%${filters.search}%,student_name.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapContract)
    },
  })
}

export function useCreateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contract: {
      contractorName: string
      studentName: string
      schoolName: string
      gradeAtContract: string
      contractDate: string
      expiryDate: string
      leadId?: string
      phone?: string
    }) => {
      const row: Record<string, unknown> = {
        contractor_name: contract.contractorName,
        student_name: contract.studentName,
        school_name: contract.schoolName,
        grade_at_contract: contract.gradeAtContract,
        contract_date: contract.contractDate,
        expiry_date: contract.expiryDate,
        status: 'active',
      }
      if (contract.leadId) row.lead_id = contract.leadId
      if (contract.phone) row.phone = contract.phone

      const { data, error } = await supabase.from('contracts').insert(row).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
    },
  })
}

/** Extended mutation that accepts all contract fields (used by PDF extraction) */
export function useCreateContractFull() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contract: {
      contractorName: string
      studentName: string
      schoolName: string
      gradeAtContract?: string
      contractDate: string
      expiryDate: string
      address?: string
      phone?: string
      totalAmount?: number
      currency?: 'KRW' | 'USD'
      paymentAccount?: 'KR' | 'US'
      notes?: string
    }) => {
      const row: Record<string, unknown> = {
        contractor_name: contract.contractorName,
        student_name: contract.studentName,
        school_name: contract.schoolName,
        grade_at_contract: contract.gradeAtContract || null,
        contract_date: contract.contractDate,
        expiry_date: contract.expiryDate,
        status: 'active',
      }
      if (contract.address) row.address = contract.address
      if (contract.phone) row.phone = contract.phone
      if (contract.totalAmount) row.total_amount = contract.totalAmount
      if (contract.currency) row.currency = contract.currency
      if (contract.paymentAccount) row.payment_account = contract.paymentAccount
      if (contract.notes) row.notes = contract.notes

      const { data, error } = await supabase
        .from('contracts')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
}

/** Fetch a single contract by ID with installments */
export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error

      const contract = mapContract(data as Record<string, unknown>)

      // Fetch installments for this contract
      const { data: installmentRows, error: instError } = await supabase
        .from('payment_installments')
        .select('*')
        .eq('contract_id', id!)
        .order('installment_order', { ascending: true })
      if (instError) throw instError

      const installments: PaymentInstallment[] = (installmentRows || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        contractId: r.contract_id as string,
        installmentOrder: r.installment_order as number,
        label: r.label as string,
        amount: (r.amount as number) || 0,
        dueDate: r.due_date as string | undefined,
        paidDate: r.paid_date as string | undefined,
        paidAmount: (r.paid_amount as number) || 0,
        status: r.status as PaymentInstallment['status'],
        currency: (r.currency as 'KRW' | 'USD') || 'KRW',
        paymentMethod: r.payment_method as PaymentInstallment['paymentMethod'],
        notes: r.notes as string | undefined,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }))

      const paidAmount = installments.reduce((s, i) => s + i.paidAmount, 0)
      const totalInstallmentAmount = installments.reduce((s, i) => s + i.amount, 0)

      return {
        ...contract,
        installments,
        paidAmount,
        outstandingAmount: totalInstallmentAmount - paidAmount,
        paymentProgress: totalInstallmentAmount > 0 ? Math.round((paidAmount / totalInstallmentAmount) * 100) : 0,
      }
    },
    enabled: !!id,
  })
}

/** Cancel a contract — sets status to 'cancelled' and marks pending installments */
export function useCancelContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ contractId, reason }: { contractId: string; reason?: string }) => {
      // Update contract status
      const { error: contractError } = await supabase
        .from('contracts')
        .update({
          status: 'cancelled',
          notes: reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contractId)
      if (contractError) throw contractError

      // Cancel all pending/overdue installments (don't touch already paid ones)
      const { error: installError } = await supabase
        .from('payment_installments')
        .update({
          status: 'pending',
          notes: '계약 취소',
          updated_at: new Date().toISOString(),
        })
        .eq('contract_id', contractId)
        .in('status', ['pending', 'overdue'])
      if (installError) throw installError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['installments'] })
      qc.invalidateQueries({ queryKey: ['revenue-projection'] })
    },
  })
}

/** Fetch all contracts with their installment summaries (for list view) */
export function useContractsWithInstallments(filters?: { status?: ContractStatus; search?: string }) {
  return useQuery({
    queryKey: ['contracts-with-installments', filters],
    queryFn: async () => {
      // Fetch contracts
      let query = supabase
        .from('contracts')
        .select('*')
        .order('contract_date', { ascending: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.search) {
        query = query.or(`contractor_name.ilike.%${filters.search}%,student_name.ilike.%${filters.search}%`)
      }

      const { data: contractRows, error: cErr } = await query
      if (cErr) throw cErr

      const contracts = (contractRows || []).map((r: Record<string, unknown>) => mapContract(r))
      if (contracts.length === 0) return []

      // Fetch all installments for these contracts in one query
      const contractIds = contracts.map(c => c.id)
      const { data: installmentRows, error: iErr } = await supabase
        .from('payment_installments')
        .select('*')
        .in('contract_id', contractIds)
        .order('installment_order', { ascending: true })
      if (iErr) throw iErr

      // Group installments by contract_id
      const installmentMap = new Map<string, PaymentInstallment[]>()
      for (const r of (installmentRows || []) as Record<string, unknown>[]) {
        const cid = r.contract_id as string
        if (!installmentMap.has(cid)) installmentMap.set(cid, [])
        installmentMap.get(cid)!.push({
          id: r.id as string,
          contractId: cid,
          installmentOrder: r.installment_order as number,
          label: r.label as string,
          amount: (r.amount as number) || 0,
          dueDate: r.due_date as string | undefined,
          paidDate: r.paid_date as string | undefined,
          paidAmount: (r.paid_amount as number) || 0,
          status: r.status as PaymentInstallment['status'],
          currency: (r.currency as 'KRW' | 'USD') || 'KRW',
          paymentMethod: r.payment_method as PaymentInstallment['paymentMethod'],
          notes: r.notes as string | undefined,
          createdAt: r.created_at as string,
          updatedAt: r.updated_at as string,
        })
      }

      // Merge
      return contracts.map(c => {
        const installments = installmentMap.get(c.id) || []
        const paidAmount = installments.reduce((s, i) => s + i.paidAmount, 0)
        const totalInstAmount = installments.reduce((s, i) => s + i.amount, 0)
        return {
          ...c,
          installments,
          paidAmount,
          outstandingAmount: totalInstAmount - paidAmount,
          paymentProgress: totalInstAmount > 0 ? Math.round((paidAmount / totalInstAmount) * 100) : 0,
        }
      })
    },
  })
}
