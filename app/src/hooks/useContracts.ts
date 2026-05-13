import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contract, ContractStatus } from '@/types'

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
    }) => {
      const { data, error } = await supabase.from('contracts').insert({
        contractor_name: contract.contractorName,
        student_name: contract.studentName,
        school_name: contract.schoolName,
        grade_at_contract: contract.gradeAtContract,
        contract_date: contract.contractDate,
        expiry_date: contract.expiryDate,
        status: 'active',
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
}
