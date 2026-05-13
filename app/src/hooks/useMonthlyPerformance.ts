import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MonthlyPerformance } from '@/types'

function mapPerformance(row: Record<string, unknown>): MonthlyPerformance {
  return {
    id: row.id as string,
    year: row.year as number,
    month: row.month as number,
    region: row.region as 'KR' | 'US',
    target: row.target as number,
    actual: row.actual as number,
    achievementRate: row.achievement_rate as number,
    expenses: row.expenses as number | undefined,
    profit: row.profit as number | undefined,
    consultationCount: row.consultation_count as number | undefined,
    newContracts: row.new_contracts as number | undefined,
    conversionRate: row.conversion_rate as number | undefined,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
  }
}

export function useMonthlyPerformance(filters?: { year?: number; region?: 'KR' | 'US' }) {
  return useQuery({
    queryKey: ['monthly_performance', filters],
    queryFn: async () => {
      let query = supabase
        .from('monthly_performance')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (filters?.year) query = query.eq('year', filters.year)
      if (filters?.region) query = query.eq('region', filters.region)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapPerformance)
    },
  })
}
