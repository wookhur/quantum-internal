import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 인센티브 요율 이력 1건 — (대상자,유형)의 '언제부터 몇 %'. */
export interface IncentiveRateSchedule {
  id: string
  profileId: string
  incentiveType: string
  rate: number
  effectiveFrom: string // 'YYYY-MM'
  note?: string
  createdAt: string
}

function mapRow(row: Record<string, unknown>): IncentiveRateSchedule {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    incentiveType: row.incentive_type as string,
    rate: Number(row.rate),
    effectiveFrom: row.effective_from as string,
    note: (row.note as string) || undefined,
    createdAt: row.created_at as string,
  }
}

export function useIncentiveRateSchedules() {
  return useQuery({
    queryKey: ['incentive-rate-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_rate_schedule')
        .select('*')
        .order('incentive_type', { ascending: true })
        .order('effective_from', { ascending: false })
      // 테이블 미생성(마이그레이션 전) 등은 조용히 빈 목록 처리 — 다른 화면 깨지지 않게
      if (error) return []
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateRateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { profileId: string; incentiveType: string; rate: number; effectiveFrom: string; note?: string; createdBy?: string }) => {
      const { error } = await supabase.from('incentive_rate_schedule').upsert(
        {
          profile_id: input.profileId,
          incentive_type: input.incentiveType,
          rate: input.rate,
          effective_from: input.effectiveFrom,
          note: input.note || null,
          created_by: input.createdBy || null,
        },
        { onConflict: 'profile_id,incentive_type,effective_from' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-rate-schedule'] })
      qc.invalidateQueries({ queryKey: ['incentives'] })
    },
  })
}

export function useDeleteRateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_rate_schedule').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-rate-schedule'] })
      qc.invalidateQueries({ queryKey: ['incentives'] })
    },
  })
}
