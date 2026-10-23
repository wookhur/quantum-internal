import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 정산 완료 기준월 — '이 달까지는 전원 지급을 끝냈다'는 한 줄 선언.
 * app_settings 의 'settled_through_month' 에 'YYYY-MM' 으로 둔다.
 *
 * 자동청구 줄은 지급이 끝날 때까지 다음 달 목록에 계속 올라온다(소급 3개월).
 * 보통은 인보이스가 그 줄들을 들고 있어서(covered_incentive_keys) 지급완료를
 * 찍는 순간 저절로 내려간다. 그런데 그 연결이 없던 시절에 발행된 건은 이어
 * 붙일 데가 없고, 관리비 줄은 사람별 패널에만 있어 한 사람씩 눌러 끄는 수밖에
 * 없다 — 서른 명이면 서른 번이다.
 *
 * 그래서 기준월을 둔다. 재무가 '9월까지 다 나갔다'고 한 번 정하면 그 이전 달은
 * 전원 분이 한꺼번에 내려간다. 앞으로의 건은 인보이스 연결로 처리되므로, 이건
 * 지난 건을 정리하는 쓰임이자 연결이 또 끊겼을 때의 안전장치다.
 *
 * 되돌릴 수 있게 '달'로 둔다 — 줄마다 지급완료를 찍어 버리면 잘못 찍었을 때
 * 하나씩 되돌려야 하지만, 기준월은 한 칸만 내리면 그대로 되살아난다.
 */

const QUERY_KEY = ['app-settings', 'settled_through_month']

export function useSettledThroughMonth(): string | undefined {
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'settled_through_month')
        .maybeSingle()
      if (error) {
        console.warn('settled_through_month 조회 실패:', error.message)
        return ''
      }
      const v = data?.value as { month?: string } | string | null
      const month = typeof v === 'string' ? v : v?.month
      return /^\d{4}-\d{2}$/.test(month || '') ? (month as string) : ''
    },
    staleTime: 60_000,
  })
  return data || undefined
}

export function useSetSettledThroughMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (month: string) => {
      // 빈 값 = 기준월 없음(소급을 끝까지 올린다)
      if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error('YYYY-MM 형식이어야 합니다.')
      const { error } = await supabase.from('app_settings').upsert({
        key: 'settled_through_month',
        value: { month },
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

/** 그 달 치가 이미 정산 끝난 것으로 볼지. 기준월이 없으면 늘 false. */
export function isSettled(originMonth: string | undefined, settledThrough: string | undefined): boolean {
  if (!settledThrough || !originMonth) return false
  return originMonth <= settledThrough
}
