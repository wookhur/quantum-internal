import { useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useNotificationPreferences } from './useNotificationPreferences'
import { useFeatureAccess, getEffectiveRoutes } from './useProfiles'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { daysFromTodayKST } from '@/lib/date'

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
  const t = useT()
  const { user } = useAuth()
  const { data: prefs } = useNotificationPreferences()
  const disabledTypes = prefs?.disabledTypes || []

  // 매니저급/임원은 모든 미제출 미팅 알림을 받고, 그 외(컨설턴트 등)는 본인 담당 미팅만.
  const isManagerLevel = !!user && (['admin', 'c_level', 'service_manager'] as string[]).includes(user.role)

  // Birthday alerts are shown to admins (who can view employee info / 직원정보)
  // and to service managers.
  const { data: featureAccess = [] } = useFeatureAccess()
  const canSeeBirthdayAlerts = useMemo(() => {
    if (!user) return false
    if (user.role === 'service_manager') return true
    return getEffectiveRoutes(user, featureAccess).includes('/hr/personal-info')
  }, [user, featureAccess])

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
    queryKey: ['notifications-missing-reports', user?.id, isManagerLevel],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      let q = supabase
        .from('service_meetings')
        .select('id, meeting_date, report_status, consultant_id, service_students!inner(name)')
        .gte('meeting_date', yesterday)
        .lte('meeting_date', today)
        .neq('report_status', 'submitted')
        .limit(20)
      // 담당 컨설턴트에게만: 매니저/임원이 아니면 본인이 담당한 미팅만
      if (!isManagerLevel) q = q.eq('consultant_id', user!.id)
      const { data, error } = await q
      if (error) return []
      return data || []
    },
  })

  // --- My assigned tasks with a due date, still open (마감 임박/초과 알림용) ---
  const { data: myOpenTasks = [] } = useQuery({
    queryKey: ['notifications-my-due-tasks', user?.id],
    enabled: !!user?.id,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('assignee_id', user!.id)
        .in('status', ['requested', 'in_progress'])
        .not('due_date', 'is', null)
        .limit(50)
      if (error) return []
      return (data || []) as { id: string; title: string; due_date: string; status: string }[]
    },
  })

  // --- Upcoming employee birthdays (next 3 weeks) ---
  const { data: upcomingBirthdays = [] } = useQuery({
    queryKey: ['notifications-birthdays', canSeeBirthdayAlerts],
    enabled: !!user?.id && canSeeBirthdayAlerts,
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
        id: 'neglected-leads', type: 'neglected_lead',
        title: t('notif.a.neglected_lead.title'),
        message: t('notif.a.neglected_lead.body', { count: neglectedLeads.length }),
        severity: 'warning', link: '/sales/leads', createdAt: now,
      })
    }

    // Overdue payments
    if (!disabledTypes.includes('overdue_payment') && overduePayments.length > 0) {
      items.push({
        id: 'overdue-payments', type: 'overdue_payment',
        title: t('notif.a.overdue_payment.title'),
        message: t('notif.a.overdue_payment.body', { count: overduePayments.length }),
        severity: 'error', link: '/consulting/collections', createdAt: now,
      })
    }

    // Today's meetings
    if (!disabledTypes.includes('today_meeting') && todayMeetings.length > 0) {
      items.push({
        id: 'today-meetings', type: 'today_meeting',
        title: t('notif.a.today_meeting.title'),
        message: t('notif.a.today_meeting.body', { count: todayMeetings.length }),
        severity: 'info', link: '/calendar', createdAt: now,
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
        id: 'missing-reports', type: 'missing_report',
        title: t('notif.a.missing_report.title'),
        message: t('notif.a.missing_report.body', { names }),
        severity: 'error', link: '/service/student360', createdAt: now,
      })
    }

    // My tasks overdue (기한 지났는데 아직 진행/완료 안 됨) — 담당자에게 반복 알림
    const overdueTasks = myOpenTasks.filter(tk => tk.due_date && daysFromTodayKST(tk.due_date) < 0)
    if (!disabledTypes.includes('task_overdue') && overdueTasks.length > 0) {
      const names = overdueTasks.slice(0, 5).map(tk => tk.title).join(', ')
      items.push({
        id: 'task-overdue', type: 'task_overdue',
        title: t('notif.a.task_overdue.title'),
        message: t('notif.a.task_overdue.body', { count: overdueTasks.length, names, more: overdueTasks.length > 5 ? t('notif.a.moreSuffix') : '' }),
        severity: 'error', link: '/tasks', createdAt: now,
      })
    }

    // My tasks due tomorrow (마감 하루 전) — 담당자에게 사전 알림
    const dueSoonTasks = myOpenTasks.filter(tk => tk.due_date && daysFromTodayKST(tk.due_date) === 1)
    if (!disabledTypes.includes('task_due_soon') && dueSoonTasks.length > 0) {
      const names = dueSoonTasks.slice(0, 5).map(tk => tk.title).join(', ')
      items.push({
        id: 'task-due-soon', type: 'task_due_soon',
        title: t('notif.a.task_due_soon.title'),
        message: t('notif.a.task_due_soon.body', { count: dueSoonTasks.length, names, more: dueSoonTasks.length > 5 ? t('notif.a.moreSuffix') : '' }),
        severity: 'warning', link: '/tasks', createdAt: now,
      })
    }

    // Upcoming employee birthdays (only for users who can view 직원정보)
    if (canSeeBirthdayAlerts && !disabledTypes.includes('employee_birthday')) {
      upcomingBirthdays.forEach((b) => {
        const dday = b.daysUntil === 0 ? t('notif.dday.today') : `D-${b.daysUntil}`
        items.push({
          id: `birthday-${b.profileId}-${b.cycleYear}`, type: 'employee_birthday',
          title: t('notif.a.employee_birthday.title', { name: b.name, dday }),
          message: t('notif.a.employee_birthday.body', { dateLabel: b.dateLabel }),
          severity: 'info', link: '/hr/personal-info', createdAt: now,
        })
      })
    }

    return items
  }, [neglectedLeads, overduePayments, todayMeetings, missingReportMeetings, myOpenTasks, upcomingBirthdays, canSeeBirthdayAlerts, disabledTypes, t])

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
  { key: 'task_overdue', label: '업무 기한 초과 알림', labelEn: 'Task Overdue Alert' },
  { key: 'task_due_soon', label: '업무 마감 임박 알림', labelEn: 'Task Due Soon Alert' },
  { key: 'employee_birthday', label: '직원 생일 알림', labelEn: 'Employee Birthday Alert' },
] as const
