import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export interface ContractIncentive {
  id: string
  contractId: string
  profileId: string
  profileName: string
  incentiveType: 'partner_sales' | 'partner_fee' | 'cold_call' | 'total_revenue'
  percentage: number
  createdAt: string
}

export interface IncentiveWithContract extends ContractIncentive {
  contractorName: string
  studentName: string
  totalAmount: number
  currency: 'KRW' | 'USD'
  contractDate: string
  contractStatus: string
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
  return {
    id: row.id as string,
    contractId: row.contract_id as string,
    profileId: row.profile_id as string,
    profileName: (profile?.name as string) || '',
    incentiveType: row.incentive_type as ContractIncentive['incentiveType'],
    percentage: Number(row.percentage) || 0,
    createdAt: row.created_at as string,
  }
}

function mapIncentiveWithContract(row: Record<string, unknown>): IncentiveWithContract {
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
      const { data, error } = await supabase
        .from('contract_incentives')
        .select(
          '*, profiles:profile_id(id, name), contracts:contract_id(id, contractor_name, student_name, total_amount, currency, contract_date, status)',
        )
        .order('created_at', { ascending: false })

      if (error) throw error

      const mapped = (data || []).map((r) => mapIncentiveWithContract(r as Record<string, unknown>))
      // Sort by contract_date descending (from the joined contracts table)
      mapped.sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''))
      return mapped
    },
  })
}

/** Insert a new incentive row */
export function useCreateIncentive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contract_id: string
      profile_id: string
      incentive_type: IncentiveType
      percentage: number
    }) => {
      const { data, error } = await supabase
        .from('contract_incentives')
        .insert(input)
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
