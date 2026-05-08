import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AdCampaign, AdPlatform } from '@/types'

function mapAdCampaign(row: Record<string, unknown>): AdCampaign {
  return {
    id: row.id as string,
    platform: row.platform as AdPlatform,
    eventName: row.event_name as string,
    impressions: row.impressions as number,
    reach: row.reach as number,
    clicks: row.clicks as number,
    cost: row.cost as number,
    ctr: row.ctr as number,
    cpc: row.cpc as number,
    comments: row.comments as number | undefined,
    commentRate: row.comment_rate as number | undefined,
    costPerComment: row.cost_per_comment as number | undefined,
    friendsBefore: row.friends_before as number | undefined,
    friendsAfter: row.friends_after as number | undefined,
    note: row.note as string | undefined,
    createdAt: row.created_at as string,
  }
}

export interface CreateAdCampaignInput {
  platform: AdPlatform
  event_name: string
  impressions: number
  reach: number
  clicks: number
  cost: number
  ctr: number
  cpc: number
  note?: string
}

export function useCreateAdCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateAdCampaignInput) => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .insert({
          platform: input.platform,
          event_name: input.event_name,
          impressions: input.impressions,
          reach: input.reach,
          clicks: input.clicks,
          cost: input.cost,
          ctr: input.ctr,
          cpc: input.cpc,
          note: input.note || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad_campaigns'] })
    },
  })
}

export function useAdCampaigns(filters?: { platform?: AdPlatform }) {
  return useQuery({
    queryKey: ['ad_campaigns', filters],
    queryFn: async () => {
      let query = supabase
        .from('ad_campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters?.platform) query = query.eq('platform', filters.platform)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapAdCampaign)
    },
  })
}
