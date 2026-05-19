import { useState, useRef, useEffect } from 'react'
import { Bell, X, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppNotifications } from '@/hooks/useNotifications'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'

export function NotificationCenter() {
  const t = useT()
  const navigate = useNavigate()
  const notifications = useAppNotifications()
  const { data: prefs } = useNotificationPreferences()
  const updatePrefs = useUpdateNotificationPreferences()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

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

  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id))
  const count = visibleNotifications.length

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const handleDontShowAgain = (type: string) => {
    const current = prefs?.disabledTypes || []
    if (!current.includes(type)) {
      updatePrefs.mutate([...current, type])
    }
    // Also dismiss visually
    const notif = notifications.find((n) => n.type === type)
    if (notif) handleDismiss(notif.id)
  }

  const handleNavigate = (link: string) => {
    navigate(link)
    setOpen(false)
  }

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

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {count}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">{t('notif.title')}</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {visibleNotifications.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                {t('notif.noNotifications')}
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {visibleNotifications.map((notif) => (
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
                        onClick={() => handleDismiss(notif.id)}
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
