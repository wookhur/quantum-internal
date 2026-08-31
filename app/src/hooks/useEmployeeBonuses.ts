import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmployeeBonus {
  id: string
  profileId: string
  amount: number
  month?: string
  reason?: string
  paid: boolean
  paidAt?: string
  createdBy?: string
  createdAt: string
}

function mapRow(r: Record<string, unknown>): EmployeeBonus {
  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    amount: Number(r.amount) || 0,
    month: (r.month as string) || undefined,
    reason: (r.reason as string) || undefined,
    paid: !!r.paid,
    paidAt: (r.paid_at as string) || undefined,
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
  }
}

export function useEmployeeBonuses() {
  return useQuery({
    queryKey: ['employee_bonuses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_bonuses').select('*').order('created_at', { ascending: false })
      if (error) return [] as EmployeeBonus[] // 테이블 미생성 등은 조용히 빈 값
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateBonus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (b: { profileId: string; amount: number; month?: string; reason?: string; createdBy?: string }) => {
      const { error } = await supabase.from('employee_bonuses').insert({
        profile_id: b.profileId, amount: b.amount, month: b.month || null, reason: b.reason || null, created_by: b.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee_bonuses'] }),
  })
}

export function useSetBonusPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from('employee_bonuses')
        .update({ paid, paid_at: paid ? new Date().toISOString().slice(0, 10) : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee_bonuses'] }),
  })
}

export function useDeleteBonus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_bonuses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee_bonuses'] }),
  })
}
