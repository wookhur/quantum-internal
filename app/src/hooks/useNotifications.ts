import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNotificationPreferences } from './useNotificationPreferences'
import { useFeatureAccess, getEffectiveRoutes } from './useProfiles'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'error'
  link?: string
  createdAt: string
}

/**
 * Generates client-side notifications based on various data conditions.
 * These are computed in real-time, not stored in DB.
 */
export function useAppNotifications() {
  const { user } = useAuth()
  const { data: prefs } = useNotificationPreferences()
  const disabledTypes = prefs?.disabledTypes || []

  // Birthday alerts are only shown to users who can view employee info (직원정보).
  const { data: featureAccess = [] } = useFeatureAccess()
  const canViewPersonalInfo = useMemo(
    () => (user ? getEffectiveRoutes(user, featureAccess).includes('/hr/personal-info') : false),
    [user, featureAccess],
  )

  // --- Neglected leads (no activity in 7+ days) ---
  const { data: neglectedLeads = [] } = useQuery({
    queryKey: ['notifications-neglected-leads', user?.id],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('leads')
        .select('id, parent_name, student_name, updated_at')
        .not('pipeline_stage', 'in', '("contracted","lost","rejected","on_hold")')
        .lt('updated_at', sevenDaysAgo)
        .limit(10)
      if (error) return []
      return data || []
    },
  })

  // --- Overdue payments ---
  const { data: overduePayments = [] } = useQuery({
    queryKey: ['notifications-overdue-payments'],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('payment_installments')
        .select('id, label, due_date, amount, contracts(student_name)')
        .eq('status', 'pending')
        .lt('due_date', today)
        .limit(10)
      if (error) return []
      return data || []
    },
  })

  // --- Today's meetings ---
  const { data: todayMeetings = [] } = useQuery({
    queryKey: ['notifications-today-meetings'],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('meetings')
        .select('id, parent_name, meeting_date')
        .eq('meeting_date', today)
        .limit(10)
      if (error) return []
      return data || []
    },
  })

  // --- Service meetings with missing reports (last 24h) ---
  const { data: missingReportMeetings = [] } = useQuery({
    queryKey: ['notifications-missing-reports', user?.id],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('service_meetings')
        .select('id, meeting_date, report_status, service_students!inner(name)')
        .gte('meeting_date', yesterday)
        .lte('meeting_date', today)
        .neq('report_status', 'submitted')
        .limit(20)
      if (error) return []
      return data || []
    },
  })

  // --- Upcoming employee birthdays (next 3 weeks) ---
  const { data: upcomingBirthdays = [] } = useQuery({
    queryKey: ['notifications-birthdays', canViewPersonalInfo],
    enabled: !!user?.id && canViewPersonalInfo,
    refetchInterval: 60 * 60 * 1000,
    queryFn: async () => {
      const [infoRes, profilesRes] = await Promise.all([
        supabase.from('employee_info').select('profile_id, birth_date').not('birth_date', 'is', null),
        supabase.from('profiles').select('id, name'),
      ])
      if (infoRes.error || profilesRes.error) return []
      const nameMap = new Map<string, string>()
      ;(profilesRes.data || []).forEach((p: Record<string, unknown>) => {
        nameMap.set(p.id as string, (p.name as string) || '')
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const year = today.getFullYear()
      const DAY = 86400000
      const WINDOW_DAYS = 21

      const result: { profileId: string; name: string; dateLabel: string; daysUntil: number; cycleYear: number }[] = []
      ;(infoRes.data || []).forEach((row: Record<string, unknown>) => {
        const bd = row.birth_date as string | null
        const profileId = row.profile_id as string
        const name = nameMap.get(profileId)
        if (!bd || !name) return
        const month = parseInt(bd.slice(5, 7), 10)
        const day = parseInt(bd.slice(8, 10), 10)
        if (!month || !day) return
        let bday = new Date(year, month - 1, day)
        bday.setHours(0, 0, 0, 0)
        let cycleYear = year
        if (bday.getTime() < today.getTime()) {
          bday = new Date(year + 1, month - 1, day)
          bday.setHours(0, 0, 0, 0)
          cycleYear = year + 1
        }
        const daysUntil = Math.round((bday.getTime() - today.getTime()) / DAY)
        if (daysUntil <= WINDOW_DAYS) {
          result.push({ profileId, name, dateLabel: `${month}월 ${day}일`, daysUntil, cycleYear })
        }
      })
      result.sort((a, b) => a.daysUntil - b.daysUntil)
      return result
    },
  })

  const notifications = useMemo(() => {
    const items: AppNotification[] = []
    const now = new Date().toISOString()

    // Neglected leads
    if (!disabledTypes.includes('neglected_lead') && neglectedLeads.length > 0) {
      items.push({
        id: 'neglected-leads',
        type: 'neglected_lead',
        title: '방치 리드 경고',
        message: `${neglectedLeads.length}건의 리드가 7일 이상 방치되었습니다.`,
        severity: 'warning',
        link: '/sales/leads',
        createdAt: now,
      })
    }

    // Overdue payments
    if (!disabledTypes.includes('overdue_payment') && overduePayments.length > 0) {
      items.push({
        id: 'overdue-payments',
        type: 'overdue_payment',
        title: '미수금 알림',
        message: `${overduePayments.length}건의 결제가 기한을 초과했습니다.`,
        severity: 'error',
        link: '/consulting/collections',
        createdAt: now,
      })
    }

    // Today's meetings
    if (!disabledTypes.includes('today_meeting') && todayMeetings.length > 0) {
      items.push({
        id: 'today-meetings',
        type: 'today_meeting',
        title: '오늘 미팅',
        message: `오늘 ${todayMeetings.length}건의 미팅이 예정되어 있습니다.`,
        severity: 'info',
        link: '/calendar',
        createdAt: now,
      })
    }

    // Missing service meeting reports (last 24h)
    if (!disabledTypes.includes('missing_report') && missingReportMeetings.length > 0) {
      const names = (missingReportMeetings as Record<string, unknown>[])
        .map((m) => {
          const s = m.service_students as Record<string, unknown>
          const date = m.meeting_date as string
          return `${(s?.name as string) || '?'} (${date})`
        })
        .join(', ')
      items.push({
        id: 'missing-reports',
        type: 'missing_report',
        title: '미팅일지 미제출 알림',
        message: `최근 24시간 내 미팅 중 일지 미제출: ${names}`,
        severity: 'error',
        link: '/service/student360',
        createdAt: now,
      })
    }

    // Upcoming employee birthdays (only for users who can view 직원정보)
    if (canViewPersonalInfo && !disabledTypes.includes('employee_birthday')) {
      upcomingBirthdays.forEach((b) => {
        const dday = b.daysUntil === 0 ? '오늘' : `D-${b.daysUntil}`
        items.push({
          id: `birthday-${b.profileId}-${b.cycleYear}`,
          type: 'employee_birthday',
          title: `${b.name}님 생일 (${dday})`,
          message: `${b.dateLabel} · 직원 생일이 다가옵니다.`,
          severity: 'info',
          link: '/hr/personal-info',
          createdAt: now,
        })
      })
    }

    return items
  }, [neglectedLeads, overduePayments, todayMeetings, missingReportMeetings, upcomingBirthdays, canViewPersonalInfo, disabledTypes])

  return notifications
}

/** All possible notification types with labels */
export const NOTIFICATION_TYPES = [
  { key: 'neglected_lead', label: '방치 리드 경고', labelEn: 'Neglected Lead Warning' },
  { key: 'overdue_payment', label: '미수금 알림', labelEn: 'Overdue Payment Alert' },
  { key: 'today_meeting', label: '오늘 미팅 알림', labelEn: 'Today\'s Meeting Alert' },
  { key: 'new_message', label: '새 메시지 알림', labelEn: 'New Message Alert' },
  { key: 'missing_report', label: '미팅일지 미제출 알림', labelEn: 'Missing Meeting Report Alert' },
  { key: 'new_contract', label: '새 계약 등록 알림', labelEn: 'New Contract Alert' },
  { key: 'consultant_assigned', label: '고객 배정 알림', labelEn: 'Client Assignment Alert' },
  { key: 'task_assigned', label: '업무 배정 알림', labelEn: 'Task Assignment Alert' },
  { key: 'task_status_changed', label: '업무 상태 변경 알림', labelEn: 'Task Status Changed Alert' },
  { key: 'employee_birthday', label: '직원 생일 알림', labelEn: 'Employee Birthday Alert' },
] as const
