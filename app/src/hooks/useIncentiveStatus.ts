import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface IncentiveStatus {
  received: boolean
  receivedMonth?: string // 수령(클릭)한 달 YYYY-MM
}

/** 인센티브 라인 키 → 수령 상태 맵 */
export function useIncentiveStatus() {
  const { data } = useQuery({
    queryKey: ['incentive_status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('incentive_status').select('key, received, received_month')
      if (error) throw error
      const m = new Map<string, IncentiveStatus>()
      for (const r of (data || []) as Record<string, unknown>[]) {
        m.set(r.key as string, { received: !!r.received, receivedMonth: (r.received_month as string) || undefined })
      }
      return m
    },
    staleTime: 30_000,
  })
  return data || new Map<string, IncentiveStatus>()
}

/** 라인 수령 상태 토글: received=true면 receivedMonth 저장, false면 해제 */
export function useSetIncentiveReceived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, received, month }: { key: string; received: boolean; month: string }) => {
      const { error } = await supabase.from('incentive_status').upsert({
        key,
        received,
        received_month: received ? month : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incentive_status'] }),
  })
}
