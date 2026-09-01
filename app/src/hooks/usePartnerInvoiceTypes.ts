import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { consultantNameKey } from '@/lib/consultants'

export type PartnerInvoiceType = 'individual' | 'business'

/**
 * 파트너 발행유형(개인/사업자) 맵. 자동청구 목록을 개인/사업자 파트너 게시판으로
 * 가르는 데 쓴다. 키는 consultantNameKey(정규화 이름). 없으면 '개인'이 기본.
 */
export function usePartnerInvoiceTypes() {
  return useQuery({
    queryKey: ['partner-invoice-types'],
    queryFn: async () => {
      const map = new Map<string, PartnerInvoiceType>()
      const { data, error } = await supabase.from('partner_invoice_types').select('name_key, invoice_type')
      if (error) {
        // 테이블 미생성(마이그레이션 전) → 전원 기본 '개인'
        console.warn('partner_invoice_types not found, defaulting all to individual:', error.message)
        return map
      }
      for (const r of data || []) {
        map.set(r.name_key as string, (r.invoice_type as PartnerInvoiceType) || 'individual')
      }
      return map
    },
  })
}

/** 이름으로 발행유형 조회 (기본 '개인') */
export function invoiceTypeOf(map: Map<string, PartnerInvoiceType> | undefined, name?: string): PartnerInvoiceType {
  if (!map || !name) return 'individual'
  return map.get(consultantNameKey(name)) || 'individual'
}

export function useSetPartnerInvoiceType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, invoiceType }: { name: string; invoiceType: PartnerInvoiceType }) => {
      const key = consultantNameKey(name)
      if (!key) throw new Error('이름이 비어 있습니다.')
      const { error } = await supabase.from('partner_invoice_types').upsert(
        { name_key: key, display_name: name, invoice_type: invoiceType, updated_at: new Date().toISOString() },
        { onConflict: 'name_key' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-invoice-types'] }),
  })
}
