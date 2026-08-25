import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 포상휴가 지급 1건 */
export interface RewardGrant {
  id: string
  profileId: string
  days: number
  reason?: string
  grantedBy?: string
  grantedAt: string
  createdAt: string
}

function mapRow(row: Record<string, unknown>): RewardGrant {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    days: Number(row.days),
    reason: (row.reason as string) || undefined,
    grantedBy: (row.granted_by as string) || undefined,
    grantedAt: row.granted_at as string,
    createdAt: row.created_at as string,
  }
}

/** 포상휴가 지급 내역 (본인 것 + 승인자는 전 직원). 이름은 호출부에서 profiles로 해석. */
export function useRewardLeaveGrants() {
  return useQuery({
    queryKey: ['reward-leave-grants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reward_leave_grants')
        .select('*')
        .order('granted_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateRewardGrant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { profileId: string; days: number; reason?: string; grantedBy?: string }) => {
      const { error } = await supabase.from('reward_leave_grants').insert({
        profile_id: input.profileId,
        days: input.days,
        reason: input.reason || null,
        granted_by: input.grantedBy || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reward-leave-grants'] }),
  })
}

export function useDeleteRewardGrant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reward_leave_grants').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reward-leave-grants'] }),
  })
}
