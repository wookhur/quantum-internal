import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { consultantNameKey } from '@/lib/consultants'

export type PartnerInvoiceType = 'individual' | 'business'
export type PartnerAccountRegion = 'domestic' | 'overseas'
export interface PartnerSetting {
  invoiceType: PartnerInvoiceType
  accountRegion: PartnerAccountRegion
  /** 인보이스설정 목록에서 빼 둔 사람. 퇴사자·테스트 계정처럼 발행 대상이 아닌 경우. */
  hidden: boolean
}
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
      // 칸이 늘 때마다 마이그레이션 전 화면이 통째로 비지 않도록, 넓은 것부터 좁혀 가며 조회한다
      let rows: Record<string, unknown>[] | null = null
      for (const cols of [
        'name_key, invoice_type, account_region, hidden',
        'name_key, invoice_type, account_region',
        'name_key, invoice_type',
      ]) {
        const res = await supabase.from('partner_invoice_types').select(cols)
        if (!res.error) { rows = res.data as unknown as Record<string, unknown>[]; break }
        if (cols === 'name_key, invoice_type') {
          console.warn('partner_invoice_types not found:', res.error.message)
          return map
        }
      }
      for (const r of rows || []) {
        map.set(r.name_key as string, {
          invoiceType: (r.invoice_type as PartnerInvoiceType) || 'individual',
          accountRegion: (r.account_region as PartnerAccountRegion) || 'domestic',
          hidden: r.hidden === true,
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
    mutationFn: async ({ name, invoiceType, accountRegion, hidden }: { name: string; invoiceType?: PartnerInvoiceType; accountRegion?: PartnerAccountRegion; hidden?: boolean }) => {
      const key = consultantNameKey(name)
      if (!key) throw new Error('이름이 비어 있습니다.')
      const row: Record<string, unknown> = { name_key: key, display_name: name, updated_at: new Date().toISOString() }
      if (invoiceType !== undefined) row.invoice_type = invoiceType
      if (accountRegion !== undefined) row.account_region = accountRegion
      if (hidden !== undefined) row.hidden = hidden
      const { error } = await supabase.from('partner_invoice_types').upsert(row, { onConflict: 'name_key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-invoice-types'] }),
  })
}
