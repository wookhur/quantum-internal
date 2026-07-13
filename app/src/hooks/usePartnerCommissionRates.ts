import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** A commission rate row: per-partner sales-team & service-team rates.
 *  The '__default__' partner holds the company-wide defaults. */
export interface PartnerCommissionRate {
  id: string
  partner: string
  salesRate: number     // % for 세일즈팀 contributors
  serviceRate: number   // % for 서비스팀 contributors
}

export type ContributorTeam = 'sales' | 'service'

export const DEFAULT_KEY = '__default__'
export const DEFAULT_SALES_RATE = 4
export const DEFAULT_SERVICE_RATE = 3

/** Normalize a partner label for matching (lowercase, strip spaces). */
export function normalizePartner(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/\s+/g, '').trim()
}

/** Pick the rate for a resolved team from a {salesRate, serviceRate} pair. */
export function rateForTeam(team: ContributorTeam | undefined, salesRate: number, serviceRate: number): number {
  if (team === 'sales') return salesRate
  if (team === 'service') return serviceRate
  return 0
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
        // fall back to the legacy single `rate` column if the team columns are unset
        salesRate: Number(r.sales_rate ?? r.rate ?? 0),
        serviceRate: Number(r.service_rate ?? r.rate ?? 0),
      }))
    },
  })
}

/** Per-partner rows only (excludes the default sentinel row). */
export function usePartnerRateList() {
  const q = usePartnerCommissionRates()
  const list = (q.data || []).filter(r => r.partner !== DEFAULT_KEY)
  return { list, ...q }
}

/** Company-wide default team rates (from the '__default__' row), 4% / 3% fallback. */
export function useDefaultRates() {
  const q = usePartnerCommissionRates()
  const row = (q.data || []).find(r => r.partner === DEFAULT_KEY)
  const salesRate = row ? row.salesRate : DEFAULT_SALES_RATE
  const serviceRate = row ? row.serviceRate : DEFAULT_SERVICE_RATE
  return { salesRate, serviceRate, ...q }
}

/** Map of normalized partner label → {salesRate, serviceRate} (excludes default). */
export function usePartnerRateMap() {
  const q = usePartnerCommissionRates()
  const map = new Map<string, { salesRate: number; serviceRate: number }>()
  for (const r of q.data || []) {
    if (r.partner === DEFAULT_KEY) continue
    map.set(normalizePartner(r.partner), { salesRate: r.salesRate, serviceRate: r.serviceRate })
  }
  return { map, ...q }
}

export function useUpsertCommissionRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { partner: string; salesRate: number; serviceRate: number }) => {
      const row = {
        partner: input.partner.trim(),
        // keep legacy NOT NULL `rate` populated for backward compatibility
        rate: input.salesRate,
        sales_rate: input.salesRate,
        service_rate: input.serviceRate,
      }
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
