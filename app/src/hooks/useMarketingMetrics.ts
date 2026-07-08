import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MarketingMetric } from '@/types'

function mapMetric(row: Record<string, unknown>): MarketingMetric {
  return {
    id: row.id as string,
    year: row.year as number,
    month: row.month as number,
    week: row.week as number | undefined,
    channel: row.channel as string,
    metric: row.metric as string,
    annualTarget: row.annual_target as number | undefined,
    value: row.value as number,
    createdAt: row.created_at as string,
  }
}

export interface CreateMarketingMetricInput {
  year: number
  month: number
  week?: number
  channel: string
  metric: string
  annual_target?: number
  value: number
}

export function useCreateMarketingMetric() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateMarketingMetricInput) => {
      const { data, error } = await supabase
        .from('marketing_metrics')
        .insert({
          year: input.year,
          month: input.month,
          week: input.week || null,
          channel: input.channel,
          metric: input.metric,
          annual_target: input.annual_target || null,
          value: input.value,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing_metrics'] })
    },
  })
}

export function useMarketingMetrics(filters?: { year?: number; month?: number }) {
  return useQuery({
    queryKey: ['marketing_metrics', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_metrics')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (filters?.year) query = query.eq('year', filters.year)
      if (filters?.month) query = query.eq('month', filters.month)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapMetric)
    },
  })
}

export interface SyncResult {
  success: boolean
  synced: number
  results?: { channel: string; value: number }[]
  errors?: string[]
  timestamp: string
}

export function useSyncMarketingMetrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke('sync-marketing-metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error) throw error
      return data as SyncResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing_metrics'] })
    },
  })
}

export function useUpdateMarketingMetric() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateMarketingMetricInput>) => {
      const row: Record<string, unknown> = {}
      if (input.year !== undefined) row.year = input.year
      if (input.month !== undefined) row.month = input.month
      if (input.week !== undefined) row.week = input.week || null
      if (input.channel !== undefined) row.channel = input.channel
      if (input.metric !== undefined) row.metric = input.metric
      if (input.annual_target !== undefined) row.annual_target = input.annual_target || null
      if (input.value !== undefined) row.value = input.value
      const { data, error } = await supabase
        .from('marketing_metrics')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing_metrics'] })
    },
  })
}

export function useDeleteMarketingMetric() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_metrics').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing_metrics'] })
    },
  })
}

export function useMarketingMetricsByYear(year: number) {
  return useQuery({
    queryKey: ['marketing_metrics', 'year', year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_metrics')
        .select('*')
        .eq('year', year)
        .order('month', { ascending: true })

      if (error) throw error
      return (data || []).map(mapMetric)
    },
    enabled: !!year,
  })
}
