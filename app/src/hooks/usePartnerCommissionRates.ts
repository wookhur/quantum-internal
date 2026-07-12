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
