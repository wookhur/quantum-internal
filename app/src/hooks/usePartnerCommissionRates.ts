import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A per-partner commission rate used to auto-compute service incentives. */
export interface PartnerCommissionRate {
  id: string
  partner: string
  rate: number          // percentage (5–20, step 5)
  notes?: string
}

/** Normalize a partner label for matching (lowercase, strip spaces). */
export function normalizePartner(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/\s+/g, '').trim()
}

export function usePartnerCommissionRates() {
  return useQuery({
    queryKey: ['partner-commission-rates'],
    queryFn: async (): Promise<PartnerCommissionRate[]> => {
      const { data, error } = await supabase
        .from('partner_commission_rates')
        .select('*')
        .order('partner', { ascending: true })
      if (error) throw error
      return (data || []).map(r => ({
        id: r.id as string,
        partner: (r.partner as string) || '',
        rate: Number(r.rate) || 0,
        notes: (r.notes as string) || undefined,
      }))
    },
  })
}

/** Map of normalized partner label → rate, for quick lookup. */
export function useCommissionRateMap() {
  const q = usePartnerCommissionRates()
  const map = new Map<string, number>()
  for (const r of q.data || []) map.set(normalizePartner(r.partner), r.rate)
  return { map, ...q }
}

// ─── Global team commission rates ────────────────────────────────────
// Stored as two sentinel rows in the same table so no extra migration is
// needed. 세일즈맨 / 서비스맨 each earn (청구금액 × their team rate).
export const TEAM_SALES_KEY = '__team_sales__'
export const TEAM_SERVICE_KEY = '__team_service__'

export type ContributorTeam = 'sales' | 'service'

/** The two global team rates (세일즈맨 / 서비스맨). */
export function useTeamCommissionRates() {
  const q = usePartnerCommissionRates()
  const rows = q.data || []
  const salesRate = rows.find(r => r.partner === TEAM_SALES_KEY)?.rate ?? 0
  const serviceRate = rows.find(r => r.partner === TEAM_SERVICE_KEY)?.rate ?? 0
  return { salesRate, serviceRate, ...q }
}

/** Rate for a resolved team, given the two global rates. */
export function rateForTeam(team: ContributorTeam | undefined, salesRate: number, serviceRate: number): number {
  if (team === 'sales') return salesRate
  if (team === 'service') return serviceRate
  return 0
}

export function useUpsertCommissionRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; partner: string; rate: number; notes?: string }) => {
      const row = {
        partner: input.partner.trim(),
        rate: input.rate,
        notes: input.notes?.trim() || null,
      }
      // upsert by unique partner key so re-selecting an existing partner overwrites
      const { error } = await supabase
        .from('partner_commission_rates')
        .upsert(row, { onConflict: 'partner' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-commission-rates'] }),
  })
}

export function useDeleteCommissionRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('partner_commission_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-commission-rates'] }),
  })
}
