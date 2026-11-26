import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ExpenseCategory = 'salary' | 'rent' | 'subscription' | 'insurance' | 'tax' | 'marketing' | 'etc'

export interface FixedExpense {
  id: string
  name: string
  category: ExpenseCategory
  amount: number
  currency: 'KRW' | 'USD'
  isActive: boolean
  /** 매달 며칠에 나가는가(1~31). 그 달에 없는 날이면 말일로 당긴다. */
  payDay: number
  /** 'YYYY-MM' — 이 달부터 / 이 달까지. 비우면 제한 없음. */
  startMonth: string | null
  endMonth: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

function mapExpense(row: Record<string, unknown>): FixedExpense {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as ExpenseCategory,
    amount: Number(row.amount) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    isActive: row.is_active as boolean,
    // 칸이 아직 없는 환경(마이그레이션 전)에서도 급여 지급일(5일)로 동작하게 둔다
    payDay: Number(row.pay_day) || 5,
    startMonth: (row.start_month as string) || null,
    endMonth: (row.end_month as string) || null,
    notes: row.notes as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useFixedExpenses() {
  return useQuery({
    queryKey: ['fixed-expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_expenses')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapExpense(r as Record<string, unknown>))
    },
  })
}

export function useCreateFixedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      name: string
      category: ExpenseCategory
      amount: number
      currency?: 'KRW' | 'USD'
      payDay?: number
      startMonth?: string | null
      endMonth?: string | null
      notes?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase
        .from('fixed_expenses')
        .insert({
          name: params.name,
          category: params.category,
          amount: params.amount,
          currency: params.currency || 'KRW',
          pay_day: params.payDay ?? 5,
          start_month: params.startMonth || null,
          end_month: params.endMonth || null,
          notes: params.notes || null,
          created_by: params.createdBy || null,
        })
        .select()
        .single()
      if (error) throw error
      return mapExpense(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }),
  })
}

export function useUpdateFixedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      name?: string
      category?: ExpenseCategory
      amount?: number
      currency?: 'KRW' | 'USD'
      isActive?: boolean
      payDay?: number
      startMonth?: string | null
      endMonth?: string | null
      notes?: string | null
    }) => {
      const { id, ...rest } = params
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.name !== undefined) row.name = rest.name
      if (rest.category !== undefined) row.category = rest.category
      if (rest.amount !== undefined) row.amount = rest.amount
      if (rest.currency !== undefined) row.currency = rest.currency
      if (rest.isActive !== undefined) row.is_active = rest.isActive
      if (rest.payDay !== undefined) row.pay_day = rest.payDay
      if (rest.startMonth !== undefined) row.start_month = rest.startMonth
      if (rest.endMonth !== undefined) row.end_month = rest.endMonth
      if (rest.notes !== undefined) row.notes = rest.notes
      const { error } = await supabase.from('fixed_expenses').update(row).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }),
  })
}

export function useDeleteFixedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fixed-expenses'] }),
  })
}
