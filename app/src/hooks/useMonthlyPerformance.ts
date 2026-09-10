import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'
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

interface CollectedAmount { yearMonth: string; region: 'KR' | 'US'; amount: number }
interface NewContractCount { yearMonth: string; region: 'KR' | 'US'; count: number }

export function useAutoPerformanceData() {
  return useQuery({
    queryKey: ['auto_performance_data'],
    queryFn: async () => {
      // 납입 회차·계약 모두 1000행을 넘으므로 전량 페이지네이션 조회한다.
      // (잘리면 월별 수금액·신규 계약 수가 조용히 적게 집계된다)
      const [installRows, contractRows] = await Promise.all([
        fetchAllRows<{ paid_date: string | null; paid_amount: number | null; currency: string | null }>(
          (from, to) =>
            supabase
              .from('payment_installments')
              .select('paid_date, paid_amount, currency')
              .not('paid_date', 'is', null)
              .gt('paid_amount', 0)
              // 합계만 내므로 정렬 순서는 무관하나, 페이지 경계가 흔들리지 않게 고유키로 정렬한다.
              .order('id', { ascending: true })
              .range(from, to),
        ),
        fetchAllRows<{ contract_date: string | null; payment_account: string | null; currency: string | null }>(
          (from, to) =>
            supabase
              .from('contracts')
              .select('contract_date, payment_account, currency')
              .neq('status', 'cancelled')
              .order('id', { ascending: true })
              .range(from, to),
        ),
      ])

      const collected = new Map<string, number>()
      for (const row of installRows) {
        const paidDate = row.paid_date as string
        if (!paidDate) continue
        const ym = paidDate.substring(0, 7)
        const currency = (row.currency as string) || 'KRW'
        const region = currency === 'USD' ? 'US' : 'KR'
        const key = `${ym}|${region}`
        collected.set(key, (collected.get(key) || 0) + ((row.paid_amount as number) || 0))
      }

      const newContracts = new Map<string, number>()
      for (const row of contractRows) {
        const cd = row.contract_date as string
        if (!cd) continue
        const ym = cd.substring(0, 7)
        const region = (row.payment_account as string) === 'US' ? 'US' : 'KR'
        const key = `${ym}|${region}`
        newContracts.set(key, (newContracts.get(key) || 0) + 1)
      }

      const collectedArr: CollectedAmount[] = []
      for (const [key, amount] of collected) {
        const [yearMonth, region] = key.split('|')
        collectedArr.push({ yearMonth, region: region as 'KR' | 'US', amount })
      }

      const contractArr: NewContractCount[] = []
      for (const [key, count] of newContracts) {
        const [yearMonth, region] = key.split('|')
        contractArr.push({ yearMonth, region: region as 'KR' | 'US', count })
      }

      return { collected: collectedArr, newContracts: contractArr }
    },
  })
}

export function useCreateMonthlyPerformance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (perf: Partial<MonthlyPerformance>) => {
      const actual = perf.actual || 0
      const target = perf.target || 0
      const { data, error } = await supabase.from('monthly_performance').insert({
        year: perf.year,
        month: perf.month,
        region: perf.region || 'KR',
        target,
        actual,
        achievement_rate: target > 0 ? (actual / target * 100) : 0,
        expenses: perf.expenses || 0,
        profit: perf.profit || 0,
        consultation_count: perf.consultationCount || 0,
        new_contracts: perf.newContracts || 0,
        conversion_rate: perf.conversionRate || 0,
        currency: perf.currency || 'KRW',
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monthly_performance'] }),
  })
}

export function useUpdateMonthlyPerformance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...perf }: { id: string } & Partial<MonthlyPerformance>) => {
      const row: Record<string, unknown> = {}
      if (perf.year !== undefined) row.year = perf.year
      if (perf.month !== undefined) row.month = perf.month
      if (perf.region !== undefined) row.region = perf.region
      if (perf.target !== undefined) row.target = perf.target
      if (perf.actual !== undefined) row.actual = perf.actual
      if (perf.expenses !== undefined) row.expenses = perf.expenses
      if (perf.profit !== undefined) row.profit = perf.profit
      if (perf.consultationCount !== undefined) row.consultation_count = perf.consultationCount
      if (perf.newContracts !== undefined) row.new_contracts = perf.newContracts
      if (perf.conversionRate !== undefined) row.conversion_rate = perf.conversionRate
      if (perf.currency !== undefined) row.currency = perf.currency
      const target = perf.target ?? 0
      const actual = perf.actual ?? 0
      row.achievement_rate = target > 0 ? (actual / target * 100) : 0
      const { data, error } = await supabase
        .from('monthly_performance')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monthly_performance'] }),
  })
}

export function useDeleteMonthlyPerformance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('monthly_performance').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monthly_performance'] }),
  })
}
