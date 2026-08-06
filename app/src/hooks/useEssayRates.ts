import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { consultantNameKey } from '@/lib/consultants'

export interface EssayRate {
  consultantKey: string
  consultantName?: string
  monthlyAmount: number
}

/** 컨설턴트별 원서·에세이 월 단가 — key(consultantNameKey)로 조회. */
export function useEssayRates() {
  return useQuery({
    queryKey: ['essay_rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('essay_rates').select('*')
      if (error) throw error
      const map = new Map<string, EssayRate>()
      for (const r of (data || []) as Record<string, unknown>[]) {
        map.set(r.consultant_key as string, {
          consultantKey: r.consultant_key as string,
          consultantName: (r.consultant_name as string) || undefined,
          monthlyAmount: r.monthly_amount != null ? Number(r.monthly_amount) : 0,
        })
      }
      return map
    },
  })
}

/** 이름 → 월 단가 (없으면 0). */
export function essayRateForName(rates: Map<string, EssayRate> | undefined, name?: string): number {
  if (!rates || !name) return 0
  return rates.get(consultantNameKey(name))?.monthlyAmount ?? 0
}

export function useUpsertEssayRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; monthlyAmount: number }) => {
      const key = consultantNameKey(input.name)
      if (!key) return
      const { error } = await supabase.from('essay_rates').upsert({
        consultant_key: key,
        consultant_name: input.name,
        monthly_amount: input.monthlyAmount || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'consultant_key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['essay_rates'] }),
  })
}
