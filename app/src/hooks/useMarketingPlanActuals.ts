import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'

/**
 * 2027 사업계획의 월별 실적 중 '밖에서 보고 와야 하는' 숫자.
 * 콘텐츠 수·문의 건수는 시스템에 쌓이지만 아래 셋은 사람이 적어 넣는다.
 */
export interface MarketingPlanActual {
  id: string
  month: string                      // 'YYYY-MM'
  instagramFollowers?: number        // 인스타 앱 기준 월말 팔로워
  paidSubscribers?: number           // 월말 유료 구독자
  appSignups?: number                // 그 달 신규 가입
  notes?: string
  createdAt: string
  updatedAt: string
}

const numOrNull = (v: unknown): number | undefined =>
  v === null || v === undefined || v === '' ? undefined : Number(v)

function mapRow(r: Record<string, unknown>): MarketingPlanActual {
  return {
    id: r.id as string,
    month: ((r.month as string) || '').slice(0, 7),
    instagramFollowers: numOrNull(r.instagram_followers),
    paidSubscribers: numOrNull(r.paid_subscribers),
    appSignups: numOrNull(r.app_signups),
    notes: (r.notes as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export interface PlanActualInput {
  month: string
  instagramFollowers?: number
  paidSubscribers?: number
  appSignups?: number
  notes?: string
}

/** 빈칸은 null 로 — 0 과 '아직 안 적음'은 다르다. */
function toRow(i: PlanActualInput) {
  return {
    month: i.month,
    instagram_followers: i.instagramFollowers ?? null,
    paid_subscribers: i.paidSubscribers ?? null,
    app_signups: i.appSignups ?? null,
    notes: i.notes || null,
  }
}

export function useMarketingPlanActuals() {
  return useQuery({
    queryKey: ['marketing_plan_actuals'],
    queryFn: async () => {
      const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
        supabase
          .from('marketing_plan_actuals')
          .select('*')
          .order('month', { ascending: false })
          .range(from, to),
      )
      return rows.map(mapRow)
    },
  })
}

/**
 * 한 달치 실적 저장. 같은 달이 이미 있으면 덮어쓴다(month 가 유니크).
 * 월 단위 기록이라 '새로 추가'와 '고치기'를 사용자가 구분할 이유가 없다.
 */
export function useSavePlanActual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PlanActualInput & { createdBy?: string }) => {
      const { data, error } = await supabase
        .from('marketing_plan_actuals')
        .upsert(
          { ...toRow(input), created_by: input.createdBy || null, updated_at: new Date().toISOString() },
          { onConflict: 'month' },
        )
        .select('id')
      if (error) throw error
      // RLS 로 막히면 에러 없이 0행이 바뀐다 — 저장된 것처럼 보이지 않게 끊는다.
      if (!data || data.length === 0) {
        throw new Error('실적을 입력할 권한이 없습니다. (저장된 내용 없음)')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing_plan_actuals'] }),
  })
}

export function useDeletePlanActual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_plan_actuals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing_plan_actuals'] }),
  })
}
