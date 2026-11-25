import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { canSuperviseService } from '@/hooks/useProfiles'
import { useOutreachSignals } from '@/hooks/useOutreachSignals'
import { todayKST } from '@/lib/date'
import { weekStart } from '@/lib/outreachSignals'

/**
 * 주 1회, 학부모 소통이 밀린 학생을 알림으로 올린다.
 *
 * 서버에 걸어 둔 배치가 아니라 '슈퍼바이저가 그 주에 처음 앱을 열 때' 한 번 돈다.
 * 크론을 붙이지 않은 이유는 받는 사람이 한 명이기 때문이다 — 아무도 안 보는
 * 시각에 돌려 둘 이유가 없고, 확장(pg_cron)과 비밀키를 안 건드려도 된다.
 * 월요일에 안 열어도 그 주 안에 처음 열 때 받는다.
 *
 * 중복은 서버 기록으로 막는다. 같은 주에 이미 넣은 알림이 있으면 넣지 않는다 —
 * 브라우저에 표시를 남기는 방식이면 다른 기기에서 열 때 또 들어온다.
 */

export const OUTREACH_NOTIFICATION_TYPE = 'parent_outreach_weekly'

/** 알림 본문에 이름까지 적어 줄 학생 수. 나머지는 '외 N명'. */
const NAMES_IN_MESSAGE = 3

export function useOutreachWatch() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const on = canSuperviseService(user)
  const today = todayKST()
  const monday = weekStart(today)
  const sentRef = useRef(false)

  // ① 이번 주에 이미 보냈나 — 신호 계산(무거움)보다 먼저 싸게 확인한다
  const { data: alreadySent } = useQuery({
    queryKey: ['outreach-watch-sent', user?.id, monday],
    enabled: on && !!user?.id,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('user_id', user!.id)
        .eq('type', OUTREACH_NOTIFICATION_TYPE)
        .gte('created_at', `${monday}T00:00:00`)
        .limit(1)
      if (error) {
        // 못 읽었으면 '보낸 적 있다'로 둔다 — 중복 알림보다 한 주 거르는 쪽이 낫다
        console.warn('주간 소통 알림 확인 실패:', error.message)
        return true
      }
      return (data || []).length > 0
    },
  })

  // ② 안 보냈을 때만 신호를 읽는다
  const { data: signals } = useOutreachSignals(on && alreadySent === false)

  useEffect(() => {
    if (!on || !user?.id) return
    if (alreadySent !== false) return
    if (!signals) return
    if (sentRef.current) return            // 한 번 그린 동안 두 번 들어가지 않게

    const flagged = signals.flagged
    if (!flagged.length) return            // 조용한 주에는 알림을 만들지 않는다

    sentRef.current = true

    const names = flagged.slice(0, NAMES_IN_MESSAGE).map(f => {
      const top = f.signals[0]
      return `${f.label || '학생'} · ${top?.label || ''}`.trim()
    })
    const rest = flagged.length - names.length
    const message = names.join('\n') + (rest > 0 ? `\n외 ${rest}명` : '')

    void (async () => {
      const { error } = await supabase.from('user_notifications').insert({
        user_id: user.id,
        type: OUTREACH_NOTIFICATION_TYPE,
        title: `이번 주 챙길 학생 ${flagged.length}명`,
        message,
        link: '/service/dashboard?view=outreach',
        metadata: {
          week: monday,
          studentIds: flagged.map(f => f.studentId),
          high: flagged.filter(f => f.level === 'high').length,
        },
        is_read: false,
      })
      if (error) {
        sentRef.current = false            // 실패했으면 다음 기회에 다시
        console.warn('주간 소통 알림 생성 실패:', error.message)
        return
      }
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
      qc.invalidateQueries({ queryKey: ['outreach-watch-sent'] })
    })()
  }, [on, user?.id, alreadySent, signals, monday, qc])
}
