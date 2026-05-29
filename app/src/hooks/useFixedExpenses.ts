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
      notes?: string | null
    }) => {
      const { id, ...rest } = params
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.name !== undefined) row.name = rest.name
      if (rest.category !== undefined) row.category = rest.category
      if (rest.amount !== undefined) row.amount = rest.amount
      if (rest.currency !== undefined) row.currency = rest.currency
      if (rest.isActive !== undefined) row.is_active = rest.isActive
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
