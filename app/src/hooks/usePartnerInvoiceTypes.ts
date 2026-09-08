import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { consultantNameKey } from '@/lib/consultants'

export type PartnerInvoiceType = 'individual' | 'business'
export type PartnerAccountRegion = 'domestic' | 'overseas'
export interface PartnerSetting { invoiceType: PartnerInvoiceType; accountRegion: PartnerAccountRegion }
export type PartnerSettingMap = Map<string, PartnerSetting>

/**
 * 파트너 사람별 설정: 발행유형(개인/사업자) + 계좌구분(국내/해외).
 * 발행유형 = 자동청구를 개인/사업자 파트너 게시판 중 어디에 띄울지.
 * 계좌구분 = 국내계좌면 견적서, 해외계좌면 해외 인보이스 양식으로 발행.
 * 키는 consultantNameKey(정규화 이름). 없으면 개인·국내가 기본.
 */
export function usePartnerInvoiceTypes() {
  return useQuery({
    queryKey: ['partner-invoice-types'],
    queryFn: async () => {
      const map: PartnerSettingMap = new Map()
      // account_region 마이그레이션 전이면 그 칸 없이 재조회
      let rows: Record<string, unknown>[] | null = null
      const full = await supabase.from('partner_invoice_types').select('name_key, invoice_type, account_region')
      if (full.error) {
        const base = await supabase.from('partner_invoice_types').select('name_key, invoice_type')
        if (base.error) { console.warn('partner_invoice_types not found:', base.error.message); return map }
        rows = base.data as Record<string, unknown>[]
      } else {
        rows = full.data as Record<string, unknown>[]
      }
      for (const r of rows || []) {
        map.set(r.name_key as string, {
          invoiceType: (r.invoice_type as PartnerInvoiceType) || 'individual',
          accountRegion: (r.account_region as PartnerAccountRegion) || 'domestic',
        })
      }
      return map
    },
  })
}

/** 이름으로 발행유형 조회 (기본 '개인') */
export function invoiceTypeOf(map: PartnerSettingMap | undefined, name?: string): PartnerInvoiceType {
  if (!map || !name) return 'individual'
  return map.get(consultantNameKey(name))?.invoiceType || 'individual'
}

/** 이름으로 계좌구분 조회 (기본 '국내') */
export function accountRegionOf(map: PartnerSettingMap | undefined, name?: string): PartnerAccountRegion {
  if (!map || !name) return 'domestic'
  return map.get(consultantNameKey(name))?.accountRegion || 'domestic'
}

export function useSetPartnerInvoiceType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, invoiceType, accountRegion }: { name: string; invoiceType?: PartnerInvoiceType; accountRegion?: PartnerAccountRegion }) => {
      const key = consultantNameKey(name)
      if (!key) throw new Error('이름이 비어 있습니다.')
      const row: Record<string, unknown> = { name_key: key, display_name: name, updated_at: new Date().toISOString() }
      if (invoiceType !== undefined) row.invoice_type = invoiceType
      if (accountRegion !== undefined) row.account_region = accountRegion
      const { error } = await supabase.from('partner_invoice_types').upsert(row, { onConflict: 'name_key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-invoice-types'] }),
  })
}
