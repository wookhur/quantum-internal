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
  comments?: number
  comment_rate?: number
  cost_per_comment?: number
  friends_before?: number
  friends_after?: number
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
          comments: input.comments ?? null,
          comment_rate: input.comment_rate ?? null,
          cost_per_comment: input.cost_per_comment ?? null,
          friends_before: input.friends_before ?? null,
          friends_after: input.friends_after ?? null,
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

export function useUpdateAdCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateAdCampaignInput>) => {
      const row: Record<string, unknown> = {}
      if (input.platform !== undefined) row.platform = input.platform
      if (input.event_name !== undefined) row.event_name = input.event_name
      if (input.impressions !== undefined) row.impressions = input.impressions
      if (input.reach !== undefined) row.reach = input.reach
      if (input.clicks !== undefined) row.clicks = input.clicks
      if (input.cost !== undefined) row.cost = input.cost
      if (input.ctr !== undefined) row.ctr = input.ctr
      if (input.cpc !== undefined) row.cpc = input.cpc
      if (input.note !== undefined) row.note = input.note || null
      if (input.comments !== undefined) row.comments = input.comments ?? null
      if (input.comment_rate !== undefined) row.comment_rate = input.comment_rate ?? null
      if (input.cost_per_comment !== undefined) row.cost_per_comment = input.cost_per_comment ?? null
      if (input.friends_before !== undefined) row.friends_before = input.friends_before ?? null
      if (input.friends_after !== undefined) row.friends_after = input.friends_after ?? null
      const { data, error } = await supabase
        .from('ad_campaigns')
        .update(row)
        .eq('id', id)
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

export function useDeleteAdCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad_campaigns'] })
    },
  })
}

export function useAdCampaigns(filters?: { platform?: AdPlatform; month?: string }) {
  return useQuery({
    queryKey: ['ad_campaigns', filters],
    queryFn: async () => {
      let query = supabase
        .from('ad_campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters?.platform) query = query.eq('platform', filters.platform)

      if (filters?.month) {
        const [year, mon] = filters.month.split('-').map(Number)
        const startDate = `${filters.month}-01`
        const nextMonth = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`
        query = query.gte('created_at', startDate).lt('created_at', nextMonth)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapAdCampaign)
    },
  })
}
