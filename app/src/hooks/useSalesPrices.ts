import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Types ───────────────────────────────────────────────────────
export type PriceCategory = 'quantum' | 'partner'

export interface PriceGroup {
  id: string
  category: PriceCategory
  name: string
  subtitle: string | null
  attachmentUrl: string | null
  attachmentName: string | null
  sortOrder: number
}

export interface PriceItem {
  id: string
  groupId: string
  serviceName: string
  priceText: string | null
  memo: string | null
  locked: boolean
  sortOrder: number
}

// ── Mappers ─────────────────────────────────────────────────────
function mapGroup(r: Record<string, unknown>): PriceGroup {
  return {
    id: r.id as string,
    category: ((r.category as string) || 'partner') as PriceCategory,
    name: r.name as string,
    subtitle: (r.subtitle as string) ?? null,
    attachmentUrl: (r.attachment_url as string) ?? null,
    attachmentName: (r.attachment_name as string) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
  }
}

function mapItem(r: Record<string, unknown>): PriceItem {
  return {
    id: r.id as string,
    groupId: r.group_id as string,
    serviceName: r.service_name as string,
    priceText: (r.price_text as string) ?? null,
    memo: (r.memo as string) ?? null,
    locked: Boolean(r.locked),
    sortOrder: (r.sort_order as number) ?? 0,
  }
}

// ── Queries ─────────────────────────────────────────────────────
export function usePriceGroups() {
  return useQuery({
    queryKey: ['sales-price-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_price_groups')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapGroup(r as Record<string, unknown>))
    },
  })
}

export function usePriceItems() {
  return useQuery({
    queryKey: ['sales-price-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_price_items')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapItem(r as Record<string, unknown>))
    },
  })
}

// ── Group mutations ─────────────────────────────────────────────
export function useCreatePriceGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { category: PriceCategory; name: string; subtitle?: string | null; sortOrder?: number }) => {
      const { data, error } = await supabase
        .from('sales_price_groups')
        .insert({
          category: input.category,
          name: input.name,
          subtitle: input.subtitle ?? null,
          sort_order: input.sortOrder ?? 0,
        })
        .select('*')
        .single()
      if (error) throw error
      return mapGroup(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-groups'] }),
  })
}

export function useUpdatePriceGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; subtitle?: string | null; attachmentUrl?: string | null; attachmentName?: string | null }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) row.name = input.name
      if (input.subtitle !== undefined) row.subtitle = input.subtitle
      if (input.attachmentUrl !== undefined) row.attachment_url = input.attachmentUrl
      if (input.attachmentName !== undefined) row.attachment_name = input.attachmentName
      const { error } = await supabase.from('sales_price_groups').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-groups'] }),
  })
}

export function useDeletePriceGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_price_groups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-price-groups'] })
      qc.invalidateQueries({ queryKey: ['sales-price-items'] })
    },
  })
}

/** Upload a guide file (PDF/image) and save its URL + original name on the group. */
export function useUploadPriceAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, file }: { groupId: string; file: File }) => {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `${groupId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('sales-price-attachments')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('sales-price-attachments').getPublicUrl(path)
      const { error: updErr } = await supabase
        .from('sales_price_groups')
        .update({ attachment_url: publicUrl, attachment_name: file.name })
        .eq('id', groupId)
      if (updErr) throw updErr
      return publicUrl
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-groups'] }),
  })
}

// ── Item mutations ──────────────────────────────────────────────
export function useCreatePriceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { groupId: string; serviceName: string; priceText?: string | null; memo?: string | null; sortOrder?: number }) => {
      const { error } = await supabase.from('sales_price_items').insert({
        group_id: input.groupId,
        service_name: input.serviceName,
        price_text: input.priceText ?? null,
        memo: input.memo ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-items'] }),
  })
}

export function useUpdatePriceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; serviceName?: string; priceText?: string | null; memo?: string | null; locked?: boolean }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.serviceName !== undefined) row.service_name = input.serviceName
      if (input.priceText !== undefined) row.price_text = input.priceText
      if (input.memo !== undefined) row.memo = input.memo
      if (input.locked !== undefined) row.locked = input.locked
      const { error } = await supabase.from('sales_price_items').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-items'] }),
  })
}

export function useDeletePriceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_price_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-price-items'] }),
  })
}
