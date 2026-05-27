import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface ContractIncentive {
  id: string
  contractId: string
  profileId: string | null
  profileName: string
  customName: string | null
  /** Resolved display name: profileName or customName */
  displayName: string
  incentiveType: 'partner_sales' | 'partner_fee' | 'cold_call' | 'total_revenue'
  percentage: number
  /** When set, this incentive applies only to that specific installment (extra payments) */
  installmentId: string | null
  createdAt: string
}

export interface IncentiveWithContract extends ContractIncentive {
  contractorName: string
  studentName: string
  totalAmount: number
  /** Sum of paid_amount from all paid installments for this contract */
  paidAmount: number
  currency: 'KRW' | 'USD'
  contractDate: string
  contractStatus: string
}

/** Per-installment incentive entry for finance views */
export interface IncentiveByInstallment {
  /** Unique key: incentiveId + installmentId */
  key: string
  incentiveId: string
  contractId: string
  installmentId: string
  installmentLabel: string  // 계약금, 중도금, 잔금
  installmentOrder: number
  paidDate: string
  paidAmount: number
  currency: 'KRW' | 'USD'
  contractDate: string
  contractorName: string
  studentName: string
  totalAmount: number
  /** Incentive definition */
  profileId: string | null
  displayName: string
  incentiveType: IncentiveType
  percentage: number
  /** Computed: paidAmount * percentage / 100 */
  incentiveAmount: number
}

export const INCENTIVE_TYPES = {
  partner_sales: { labelKey: 'incentive.partnerSales', defaultPct: 20 },
  partner_fee: { labelKey: 'incentive.partnerFee', defaultPct: 10 },
  cold_call: { labelKey: 'incentive.coldCall', defaultPct: 4 },
  total_revenue: { labelKey: 'incentive.totalRevenue', defaultPct: 2 },
} as const

export type IncentiveType = keyof typeof INCENTIVE_TYPES

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapIncentive(row: Record<string, unknown>): ContractIncentive {
  const profile = row.profiles as Record<string, unknown> | null
  const profileName = (profile?.name as string) || ''
  const customName = (row.custom_name as string) || null
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    profileId: (row.profile_id as string) || null,
    profileName,
    customName,
    displayName: profileName || customName || '',
    incentiveType: row.incentive_type as ContractIncentive['incentiveType'],
    percentage: Number(row.percentage) || 0,
    installmentId: (row.installment_id as string) || null,
    createdAt: row.created_at as string,
  }
}

function mapIncentiveWithContract(row: Record<string, unknown>): Omit<IncentiveWithContract, 'paidAmount'> {
  const base = mapIncentive(row)
  const contract = row.contracts as Record<string, unknown> | null
  return {
    ...base,
    contractorName: (contract?.contractor_name as string) || '',
    studentName: (contract?.student_name as string) || '',
    totalAmount: Number(contract?.total_amount) || 0,
    currency: ((contract?.currency as string) || 'KRW') as 'KRW' | 'USD',
    contractDate: (contract?.contract_date as string) || '',
    contractStatus: (contract?.status as string) || '',
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch incentives for a specific contract, joining profile name */
export function useContractIncentives(contractId?: string) {
  return useQuery({
    queryKey: ['incentives', 'contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_incentives')
        .select('*, profiles:profile_id(id, name)')
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data || []).map((r) => mapIncentive(r as Record<string, unknown>))
    },
    enabled: !!contractId,
  })
}

/** Fetch ALL incentives, joining contract & profile info, ordered by contract_date desc */
export function useAllIncentives() {
  return useQuery({
    queryKey: ['incentives', 'all'],
    queryFn: async () => {
      // 1. Fetch incentives with contract info
      const { data, error } = await supabase
        .from('contract_incentives')
        .select(
          '*, profiles:profile_id(id, name), contracts:contract_id(id, contractor_name, student_name, total_amount, currency, contract_date, status)',
        )
        .order('created_at', { ascending: false })

      if (error) throw error

      // 2. Collect unique contract IDs and fetch paid installment sums
      const contractIds = [...new Set((data || []).map((r) => r.contract_id as string))]
      const paidMap = new Map<string, number>()

      if (contractIds.length > 0) {
        const { data: installments } = await supabase
          .from('payment_installments')
          .select('contract_id, paid_amount, status')
          .in('contract_id', contractIds)
          .eq('status', 'paid')

        for (const inst of installments || []) {
          const cid = inst.contract_id as string
          paidMap.set(cid, (paidMap.get(cid) || 0) + (Number(inst.paid_amount) || 0))
        }
      }

      const mapped = (data || []).map((r) => {
        const base = mapIncentiveWithContract(r as Record<string, unknown>)
        return { ...base, paidAmount: paidMap.get(base.contractId) || 0 }
      })
      // Sort by contract_date descending
      mapped.sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''))
      return mapped
    },
  })
}

/**
 * Fetch per-installment incentive entries for finance views.
 * Each paid installment × each incentive definition = one entry.
 * Grouped/filtered by paidDate month in UI.
 */
export function useIncentivesByInstallment() {
  return useQuery({
    queryKey: ['incentives', 'by-installment'],
    queryFn: async () => {
      // 1. Fetch all incentive definitions with contract info
      const { data, error } = await supabase
        .from('contract_incentives')
        .select(
          '*, profiles:profile_id(id, name), contracts:contract_id(id, contractor_name, student_name, total_amount, currency, contract_date, status)',
        )
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) return []

      // 2. Fetch ALL paid installments for those contracts
      const contractIds = [...new Set(data.map((r) => r.contract_id as string))]

      const { data: installments } = await supabase
        .from('payment_installments')
        .select('id, contract_id, label, installment_order, paid_amount, paid_date, status, category')
        .in('contract_id', contractIds)
        .eq('status', 'paid')

      if (!installments || installments.length === 0) return []

      // 3. Build per-installment map: contractId -> paid installments[]
      const instMap = new Map<string, Array<{
        id: string
        label: string
        installmentOrder: number
        paidAmount: number
        paidDate: string
        category: string
      }>>()

      for (const inst of installments) {
        const cid = inst.contract_id as string
        if (!instMap.has(cid)) instMap.set(cid, [])
        instMap.get(cid)!.push({
          id: inst.id as string,
          label: inst.label as string,
          installmentOrder: (inst.installment_order as number) || 0,
          paidAmount: Number(inst.paid_amount) || 0,
          paidDate: (inst.paid_date as string) || '',
          category: (inst.category as string) || 'base',
        })
      }

      // 4. Cross-join with scoping:
      //    - Base incentives (installmentId=null): apply only to base installments
      //    - Installment-specific incentives: apply only to their specific installment
      const results: IncentiveByInstallment[] = []

      for (const row of data) {
        const inc = mapIncentive(row as Record<string, unknown>)
        const contract = (row as Record<string, unknown>).contracts as Record<string, unknown> | null
        const contractorName = (contract?.contractor_name as string) || ''
        const studentName = (contract?.student_name as string) || ''
        const totalAmount = Number(contract?.total_amount) || 0
        const currency = ((contract?.currency as string) || 'KRW') as 'KRW' | 'USD'
        const contractDate = (contract?.contract_date as string) || ''

        const paidInsts = instMap.get(inc.contractId) || []
        for (const pi of paidInsts) {
          // Scope matching: base incentives → base installments only,
          // installment-specific incentives → that installment only
          if (inc.installmentId) {
            if (pi.id !== inc.installmentId) continue
          } else {
            if (pi.category !== 'base') continue
          }

          // 부가세 10% 제외 후 인센티브 계산
          const amountExVat = Math.round(pi.paidAmount / 1.1)
          const incentiveAmount = Math.round(amountExVat * inc.percentage / 100)
          results.push({
            key: `${inc.id}-${pi.id}`,
            incentiveId: inc.id,
            contractId: inc.contractId,
            installmentId: pi.id,
            installmentLabel: pi.label,
            installmentOrder: pi.installmentOrder,
            paidDate: pi.paidDate,
            paidAmount: pi.paidAmount,
            currency,
            contractDate,
            contractorName,
            studentName,
            totalAmount,
            profileId: inc.profileId,
            displayName: inc.displayName,
            incentiveType: inc.incentiveType,
            percentage: inc.percentage,
            incentiveAmount,
          })
        }
      }

      // Sort by paidDate descending
      results.sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''))
      return results
    },
  })
}

/** Insert a new incentive row */
export function useCreateIncentive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contract_id: string
      profile_id?: string | null
      custom_name?: string | null
      incentive_type: IncentiveType
      percentage: number
      installment_id?: string | null
    }) => {
      const row: Record<string, unknown> = {
        contract_id: input.contract_id,
        incentive_type: input.incentive_type,
        percentage: input.percentage,
      }
      if (input.profile_id) row.profile_id = input.profile_id
      if (input.custom_name) row.custom_name = input.custom_name
      if (input.installment_id) row.installment_id = input.installment_id
      const { data, error } = await supabase
        .from('contract_incentives')
        .insert(row)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentives'] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}

/** Delete a single incentive by id */
export function useDeleteIncentive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contract_incentives').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentives'] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}

// ---------------------------------------------------------------------------
// External recipients (persistent custom names)
// ---------------------------------------------------------------------------

export interface IncentiveRecipient {
  id: string
  name: string
}

/** Fetch all saved external recipients */
export function useIncentiveRecipients() {
  return useQuery({
    queryKey: ['incentive-recipients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_recipients')
        .select('id, name')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as IncentiveRecipient[]
    },
  })
}

/** Add a new external recipient and return it */
export function useCreateIncentiveRecipient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      // Upsert to avoid duplicate errors
      const { data, error } = await supabase
        .from('incentive_recipients')
        .upsert({ name }, { onConflict: 'name' })
        .select()
        .single()
      if (error) throw error
      return data as IncentiveRecipient
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-recipients'] })
    },
  })
}

/** Delete ALL incentives for a given contract */
export function useDeleteContractIncentives() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { error } = await supabase
        .from('contract_incentives')
        .delete()
        .eq('contract_id', contractId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentives'] })
      qc.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}
