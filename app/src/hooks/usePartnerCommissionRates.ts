import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A per-partner commission rate used to auto-compute service incentives. */
export interface PartnerCommissionRate {
  id: string
  partner: string
  rate: number          // percentage (1–10, step 1)
  notes?: string
}

// ─── Global team commission rates ────────────────────────────────────
// Stored as two sentinel rows in the same table so no extra migration is
// needed. 세일즈맨 / 서비스맨 each earn (청구금액 × their team rate).
export const TEAM_SALES_KEY = '__team_sales__'
export const TEAM_SERVICE_KEY = '__team_service__'
export const DEFAULT_SALES_RATE = 4
export const DEFAULT_SERVICE_RATE = 3
const SENTINEL_KEYS = new Set<string>([TEAM_SALES_KEY, TEAM_SERVICE_KEY])

export type ContributorTeam = 'sales' | 'service'

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

/** Per-partner rows only (excludes the team sentinel rows). */
export function usePartnerRateList() {
  const q = usePartnerCommissionRates()
  const list = (q.data || []).filter(r => !SENTINEL_KEYS.has(r.partner))
  return { list, ...q }
}

/** Map of normalized partner label → rate (per-partner overrides only). */
export function useCommissionRateMap() {
  const q = usePartnerCommissionRates()
  const map = new Map<string, number>()
  for (const r of q.data || []) {
    if (SENTINEL_KEYS.has(r.partner)) continue
    map.set(normalizePartner(r.partner), r.rate)
  }
  return { map, ...q }
}

/** The two global team rates (세일즈맨 / 서비스맨), defaulting to 4% / 3%. */
export function useTeamCommissionRates() {
  const q = usePartnerCommissionRates()
  const rows = q.data || []
  const salesRow = rows.find(r => r.partner === TEAM_SALES_KEY)
  const serviceRow = rows.find(r => r.partner === TEAM_SERVICE_KEY)
  const salesRate = salesRow ? salesRow.rate : DEFAULT_SALES_RATE
  const serviceRate = serviceRow ? serviceRow.rate : DEFAULT_SERVICE_RATE
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
