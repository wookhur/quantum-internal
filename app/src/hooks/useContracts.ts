import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contract, ContractStatus, PaymentInstallment } from '@/types'
import { createNotificationsForUsers, getContractNotificationRecipients } from './useUserNotifications'

/** Fire-and-forget: notify sales manager, CEO, service manager about new contract */
function sendContractNotification(studentName: string, contractorName: string, contractId: string) {
  getContractNotificationRecipients().then((recipientIds) => {
    if (recipientIds.length === 0) return
    createNotificationsForUsers(recipientIds, {
      type: 'new_contract',
      title: '새 계약 등록',
      message: `${studentName} (${contractorName}) 학생의 새 계약이 등록되었습니다.`,
      link: `/consulting/clients/${contractId}`,
      metadata: { contractId, studentName, contractorName },
    })
  })
}

/**
 * Auto-creates a service_student record if one doesn't already exist with the same name.
 * Called after contract creation so the student appears in Student 360.
 */
async function ensureServiceStudent(opts: {
  studentName: string
  parentName?: string
  school?: string
  grade?: string
  phone?: string
  address?: string
  contractType?: string
  startDate?: string
  endDate?: string
}) {
  // Check if a service_student with this name already exists
  const { data: existing } = await supabase
    .from('service_students')
    .select('id')
    .eq('name', opts.studentName)
    .limit(1)

  if (existing && existing.length > 0) return // Already exists

  // Create a new service_student record
  await supabase.from('service_students').insert({
    name: opts.studentName,
    parent_name: opts.parentName || null,
    school: opts.school || null,
    grade: opts.grade || null,
    contact: opts.phone || null,
    address: opts.address || null,
    contract_type: opts.contractType || null,
    start_date: opts.startDate || null,
    end_date: opts.endDate || null,
    status: 'active',
  })
}

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
    serviceStartDate: (row.service_start_date as string) || undefined,
    serviceEndDate: (row.service_end_date as string) || undefined,
    applicationCount: (row.application_count as number) || undefined,
    additionalServices: (row.additional_services as string) || undefined,
    totalAmount: (row.total_amount as number) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    paymentAccount: (row.payment_account as 'KR' | 'US') || 'KR',
    salesRep: (row.sales_rep as string) || undefined,
    serviceRep: (row.service_rep as string) || undefined,
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
      totalAmount?: number
      currency?: 'KRW' | 'USD'
      leadId?: string
      phone?: string
      address?: string
      paymentAccount?: 'KR' | 'US'
      salesRep?: string
      serviceRep?: string
      notes?: string
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
      if (contract.totalAmount) row.total_amount = contract.totalAmount
      if (contract.currency) row.currency = contract.currency
      if (contract.leadId) row.lead_id = contract.leadId
      if (contract.phone) row.phone = contract.phone
      if (contract.address) row.address = contract.address
      if (contract.paymentAccount) row.payment_account = contract.paymentAccount
      if (contract.salesRep) row.sales_rep = contract.salesRep
      if (contract.serviceRep) row.service_rep = contract.serviceRep
      if (contract.notes) row.notes = contract.notes

      const { data, error } = await supabase.from('contracts').insert(row).select().single()
      if (error) throw error

      // Auto-create service_student if not exists
      await ensureServiceStudent({
        studentName: contract.studentName,
        parentName: contract.contractorName,
        school: contract.schoolName,
        grade: contract.gradeAtContract,
        phone: contract.phone,
        startDate: contract.contractDate,
        endDate: contract.expiryDate,
      })

      // Send notifications to sales manager, CEO, service manager
      sendContractNotification(contract.studentName, contract.contractorName, data.id as string)

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['service_students'] })
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
  })
}

/** Extended mutation that accepts all contract fields (used by PDF extraction & lead conversion) */
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
      leadId?: string
      salesRep?: string
      serviceRep?: string
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
      if (contract.leadId) row.lead_id = contract.leadId
      if (contract.salesRep) row.sales_rep = contract.salesRep
      if (contract.serviceRep) row.service_rep = contract.serviceRep

      const { data, error } = await supabase
        .from('contracts')
        .insert(row)
        .select()
        .single()
      if (error) throw error

      // Auto-create service_student if not exists
      await ensureServiceStudent({
        studentName: contract.studentName,
        parentName: contract.contractorName,
        school: contract.schoolName,
        grade: contract.gradeAtContract,
        phone: contract.phone,
        address: contract.address,
        startDate: contract.contractDate,
        endDate: contract.expiryDate,
      })

      // Send notifications to sales manager, CEO, service manager
      sendContractNotification(contract.studentName, contract.contractorName, data.id as string)

      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['linked-contracts'] })
      qc.invalidateQueries({ queryKey: ['service_students'] })
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
  })
}

/** Update an existing contract */
export function useUpdateContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      contractorName?: string
      studentName?: string
      schoolName?: string
      gradeAtContract?: string
      contractDate?: string
      expiryDate?: string
      serviceStartDate?: string
      serviceEndDate?: string
      applicationCount?: number
      additionalServices?: string
      address?: string
      phone?: string
      totalAmount?: number
      currency?: 'KRW' | 'USD'
      paymentAccount?: 'KR' | 'US'
      notes?: string
      status?: ContractStatus
      salesRep?: string | null
      serviceRep?: string | null
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.contractorName !== undefined) update.contractor_name = rest.contractorName
      if (rest.studentName !== undefined) update.student_name = rest.studentName
      if (rest.schoolName !== undefined) update.school_name = rest.schoolName
      if (rest.gradeAtContract !== undefined) update.grade_at_contract = rest.gradeAtContract
      if (rest.contractDate !== undefined) update.contract_date = rest.contractDate
      if (rest.expiryDate !== undefined) update.expiry_date = rest.expiryDate
      if (rest.serviceStartDate !== undefined) update.service_start_date = rest.serviceStartDate || null
      if (rest.serviceEndDate !== undefined) update.service_end_date = rest.serviceEndDate || null
      if (rest.applicationCount !== undefined) update.application_count = rest.applicationCount || null
      if (rest.additionalServices !== undefined) update.additional_services = rest.additionalServices || null
      if (rest.address !== undefined) update.address = rest.address
      if (rest.phone !== undefined) update.phone = rest.phone
      if (rest.totalAmount !== undefined) update.total_amount = rest.totalAmount
      if (rest.currency !== undefined) update.currency = rest.currency
      if (rest.paymentAccount !== undefined) update.payment_account = rest.paymentAccount
      if (rest.notes !== undefined) update.notes = rest.notes
      if (rest.status !== undefined) update.status = rest.status
      if (rest.salesRep !== undefined) update.sales_rep = rest.salesRep
      if (rest.serviceRep !== undefined) update.service_rep = rest.serviceRep

      const { error } = await supabase.from('contracts').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts', v.id] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
    },
  })
}

/** Permanently delete a contract and its installments */
export function useDeleteContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete installments first (foreign key)
      await supabase.from('payment_installments').delete().eq('contract_id', id)
      // Delete the contract
      const { error } = await supabase.from('contracts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] })
      qc.invalidateQueries({ queryKey: ['contracts-with-installments'] })
      qc.invalidateQueries({ queryKey: ['installments'] })
    },
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
        category: (r.category as 'base' | 'extra') || 'base',
        paymentMethod: r.payment_method as PaymentInstallment['paymentMethod'],
        notes: r.notes as string | undefined,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }))

      // Only count base installments toward contract total progress
      const baseInst = installments.filter(i => i.category !== 'extra')
      const paidAmount = baseInst.reduce((s, i) => s + i.paidAmount, 0)
      // Use contract totalAmount as base; fall back to base installment sum if not set
      const baseAmount = contract.totalAmount > 0
        ? contract.totalAmount
        : baseInst.reduce((s, i) => s + i.amount, 0)

      return {
        ...contract,
        installments,
        paidAmount,
        outstandingAmount: Math.max(baseAmount - paidAmount, 0),
        paymentProgress: baseAmount > 0 ? Math.min(Math.round((paidAmount / baseAmount) * 100), 100) : 0,
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
          category: (r.category as 'base' | 'extra') || 'base',
          paymentMethod: r.payment_method as PaymentInstallment['paymentMethod'],
          notes: r.notes as string | undefined,
          createdAt: r.created_at as string,
          updatedAt: r.updated_at as string,
        })
      }

      // Merge — only base installments count toward contract total
      return contracts.map(c => {
        const installments = installmentMap.get(c.id) || []
        const baseInst = installments.filter(i => i.category !== 'extra')
        const paidAmount = baseInst.reduce((s, i) => s + i.paidAmount, 0)
        const baseAmount = c.totalAmount > 0
          ? c.totalAmount
          : baseInst.reduce((s, i) => s + i.amount, 0)
        return {
          ...c,
          installments,
          paidAmount,
          outstandingAmount: Math.max(baseAmount - paidAmount, 0),
          paymentProgress: baseAmount > 0 ? Math.min(Math.round((paidAmount / baseAmount) * 100), 100) : 0,
        }
      })
    },
  })
}
