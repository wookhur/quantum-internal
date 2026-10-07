import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { consultantNameKey } from '@/lib/consultants'
import type { AnnualFee } from '@/lib/sessionFee'

export interface ConsultantFee extends AnnualFee {
  nameKey: string
  displayName: string
}
export type AnnualFeeMap = Map<string, ConsultantFee>

/**
 * 컨설턴트별 연 관리비. 1회분 단가 = 연액 ÷ 횟수(기본 30).
 * 여기에 없는 사람은 기존 '미팅 2회 = 1개월분' 방식 그대로다.
 */
export function useConsultantAnnualFees() {
  const { data } = useQuery({
    queryKey: ['consultant_annual_fees'],
    queryFn: async () => {
      const map: AnnualFeeMap = new Map()
      const { data, error } = await supabase
        .from('consultant_annual_fees')
        .select('name_key, display_name, annual_amount, sessions')
      if (error) {
        // 표가 아직 없으면 조용히 빈 값 — 기존 방식으로 계속 동작한다.
        console.warn('consultant_annual_fees not found:', error.message)
        return map
      }
      for (const r of (data || []) as Record<string, unknown>[]) {
        map.set(r.name_key as string, {
          nameKey: r.name_key as string,
          displayName: (r.display_name as string) || (r.name_key as string),
          annualAmount: Number(r.annual_amount) || 0,
          sessions: Number(r.sessions) || 30,
        })
      }
      return map
    },
    staleTime: 60_000,
  })
  return data || new Map<string, ConsultantFee>()
}

/** 이름으로 연 관리비 조회. 없으면 undefined(= 기존 방식). */
export function annualFeeOf(map: AnnualFeeMap | undefined, name?: string): ConsultantFee | undefined {
  if (!map || !name) return undefined
  return map.get(consultantNameKey(name))
}

export function useSetConsultantAnnualFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, annualAmount, sessions }: { name: string; annualAmount: number; sessions: number }) => {
      const key = consultantNameKey(name)
      if (!key) throw new Error('이름이 비어 있습니다.')
      const { data, error } = await supabase
        .from('consultant_annual_fees')
        .upsert({
          name_key: key,
          display_name: name,
          annual_amount: Math.max(0, Math.round(annualAmount)),
          sessions: Math.max(1, Math.round(sessions)),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'name_key' })
        .select('name_key')
      if (error) throw error
      // RLS 로 막히면 에러 없이 0행이 바뀐다 — 저장된 것처럼 보이지 않게 끊는다.
      if (!data || data.length === 0) throw new Error('연 관리비를 설정할 권한이 없습니다. (저장된 내용 없음)')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultant_annual_fees'] }),
  })
}

export function useDeleteConsultantAnnualFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nameKey: string) => {
      const { error } = await supabase.from('consultant_annual_fees').delete().eq('name_key', nameKey)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultant_annual_fees'] }),
  })
}
