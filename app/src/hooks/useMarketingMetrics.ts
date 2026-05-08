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
