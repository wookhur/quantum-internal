import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, X, AlertTriangle, AlertCircle, Info, ExternalLink, Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppNotifications } from '@/hooks/useNotifications'
import { useUserNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/useUserNotifications'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'

export function NotificationCenter() {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const appNotifications = useAppNotifications()
  const { data: dbNotifications = [] } = useUserNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const { data: prefs } = useNotificationPreferences()
  const updatePrefs = useUpdateNotificationPreferences()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)
  const hasAutoOpenedRef = useRef(false)

  // Auto-open on login when there are unread DB notifications
  useEffect(() => {
    if (user && dbNotifications.length > 0 && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true
      setOpen(true)
    }
  }, [user, dbNotifications.length])

  // Reset auto-open flag on logout
  useEffect(() => {
    if (!user) {
      hasAutoOpenedRef.current = false
    }
  }, [user])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visibleAppNotifs = appNotifications.filter((n) => !dismissed.has(n.id))

  // Total count = DB unread + app notifications
  const totalCount = dbNotifications.length + visibleAppNotifs.length

  const handleDismissApp = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const handleDontShowAgain = (type: string) => {
    const current = prefs?.disabledTypes || []
    if (!current.includes(type)) {
      updatePrefs.mutate([...current, type])
    }
    const notif = appNotifications.find((n) => n.type === type)
    if (notif) handleDismissApp(notif.id)
  }

  const handleNavigate = useCallback((link: string, notifId?: string) => {
    if (notifId) markRead.mutate(notifId) // viewing detail marks it read
    navigate(link)
    setOpen(false)
  }, [navigate, markRead])

  // Mark a single DB notification as read (removes it from the list & count)
  const handleMarkRead = useCallback((id: string) => {
    markRead.mutate(id)
  }, [markRead])

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate()
  }, [markAllRead])

  // Closing the panel acknowledges the notifications so they don't reappear
  const closePanel = useCallback(() => {
    if (dbNotifications.length > 0) markAllRead.mutate()
    setOpen(false)
  }, [dbNotifications.length, markAllRead])

  const severityIcon = {
    warning: <AlertTriangle className="size-4 text-amber-500 shrink-0" />,
    error: <AlertCircle className="size-4 text-red-500 shrink-0" />,
    info: <Info className="size-4 text-blue-500 shrink-0" />,
  }

  const severityBg = {
    warning: 'bg-amber-50 border-amber-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  }

  const typeIcon: Record<string, React.ReactNode> = {
    new_contract: <FileText className="size-4 text-green-600 shrink-0" />,
    consultant_assigned: <Info className="size-4 text-blue-600 shrink-0" />,
  }

  const typeBg: Record<string, string> = {
    new_contract: 'bg-green-50 border-green-200',
    consultant_assigned: 'bg-blue-50 border-blue-200',
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} strokeWidth={1.75} />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse">
            {totalCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-[420px] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('notif.title')}
              {totalCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-100 text-red-600 text-[10px] font-bold px-1.5">
                  {totalCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {dbNotifications.length > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  {t('notif.markAllRead')}
                </button>
              )}
              <button
                onClick={closePanel}
                title="닫기 (읽음 처리)"
                className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[450px] overflow-y-auto">
            {totalCount === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                {t('notif.noNotifications')}
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {/* DB-backed notifications (persistent, require detail view) */}
                {dbNotifications.map((notif) => {
                  const bgClass = typeBg[notif.type] || 'bg-blue-50 border-blue-200'
                  const icon = typeIcon[notif.type] || <Info className="size-4 text-blue-500 shrink-0" />

                  return (
                    <div
                      key={`db-${notif.id}`}
                      className={`relative rounded-lg border p-3 ${bgClass} transition-all`}
                    >
                      {/* Per-item dismiss (mark read) */}
                      <button
                        onClick={() => handleMarkRead(notif.id)}
                        disabled={markRead.isPending}
                        title="읽음"
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 rounded p-0.5 hover:bg-black/5"
                      >
                        <X className="size-3.5" />
                      </button>
                      <div className="flex items-start gap-2">
                        {icon}
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-sm font-medium text-gray-900">{notif.title}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{notif.message}</div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {formatTimeAgo(notif.createdAt)}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {notif.link && (
                              <button
                                onClick={() => handleNavigate(notif.link!, notif.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                              >
                                {t('notif.viewDetail')} <ExternalLink className="size-3" />
                              </button>
                            )}
                            <button
                              onClick={() => handleMarkRead(notif.id)}
                              disabled={markRead.isPending}
                              className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-800"
                            >
                              <Check className="size-3" /> {t('notif.confirmRead')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Separator if both types exist */}
                {dbNotifications.length > 0 && visibleAppNotifs.length > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[10px] text-gray-400 font-medium">{t('notif.systemAlerts')}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}

                {/* App-computed notifications (existing system) */}
                {visibleAppNotifs.map((notif) => (
                  <div
                    key={notif.id}
                    className={`relative rounded-lg border p-3 ${severityBg[notif.severity]}`}
                  >
                    <div className="flex items-start gap-2">
                      {severityIcon[notif.severity]}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{notif.title}</div>
                        <div className="text-xs text-gray-600 mt-0.5">{notif.message}</div>
                        <div className="flex items-center gap-2 mt-2">
                          {notif.link && (
                            <button
                              onClick={() => handleNavigate(notif.link!)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              {t('notif.viewDetail')} <ExternalLink className="size-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDontShowAgain(notif.type)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            {t('notif.dontShowAgain')}
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDismissApp(notif.id)}
                        className="text-gray-400 hover:text-gray-600 rounded p-0.5"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Format a timestamp into a relative time string */
function formatTimeAgo(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`

  return new Date(isoString).toLocaleDateString('ko-KR')
}
