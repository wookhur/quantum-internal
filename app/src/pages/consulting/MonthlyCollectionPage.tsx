import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar,
  CheckCircle2, Clock, AlertTriangle, CircleDot,
  Phone, MessageSquare, Mail, StickyNote, Send, Footprints,
} from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import { useCollectionActions, useCreateCollectionAction, type CollectionActionType } from '@/hooks/useCollectionActions'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import type { PaymentInstallment, InstallmentStatus } from '@/types'

// ---------------------------------------------------------------------------
// Action type config
// ---------------------------------------------------------------------------

const ACTION_TYPES: { type: CollectionActionType; icon: typeof Phone; color: string }[] = [
  { type: 'call', icon: Phone, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' },
  { type: 'sms', icon: MessageSquare, color: 'text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100' },
  { type: 'katalk', icon: Send, color: 'text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100' },
  { type: 'email', icon: Mail, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
  { type: 'visit', icon: Footprints, color: 'text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100' },
  { type: 'note', icon: StickyNote, color: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100' },
]

function useActionTypeLabels() {
  const t = useT()
  return (type: CollectionActionType): string => {
    const labels: Record<CollectionActionType, string> = {
      call: t('collection.action.call'),
      sms: t('collection.action.sms'),
      katalk: t('collection.action.katalk'),
      email: t('collection.action.email'),
      visit: t('collection.action.visit'),
      note: t('collection.action.note'),
    }
    return labels[type]
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useStatusConfig() {
  const t = useT()
  const STATUS_CONFIG: Record<InstallmentStatus, { label: string; color: string; icon: typeof Clock }> = {
    paid: { label: t('collection.status.fullyPaid'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    partial: { label: t('collection.status.partial'), color: 'bg-amber-50 text-amber-700 border-amber-200', icon: CircleDot },
    overdue: { label: t('collection.status.overdue'), color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
    pending: { label: t('collection.status.pending'), color: 'bg-gray-50 text-gray-600 border-gray-200', icon: Clock },
  }
  return STATUS_CONFIG
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function useFormatMonthLabel() {
  const t = useT()
  return (key: string): string => {
    const [year, month] = key.split('-')
    const monthName = t(`collection.monthNames.${Number(month)}`)
    return t('collection.monthYearFormat').replace('{year}', year).replace('{month}', monthName)
  }
}

function useGetDayLabel() {
  const t = useT()
  const weekdayKeys = [
    'collection.weekdays.sun',
    'collection.weekdays.mon',
    'collection.weekdays.tue',
    'collection.weekdays.wed',
    'collection.weekdays.thu',
    'collection.weekdays.fri',
    'collection.weekdays.sat',
  ]
  return (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDate()
    const weekday = t(weekdayKeys[d.getDay()])
    return `${day}${t('collection.daySuffix')} (${weekday})`
  }
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10)
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10)
}

/** Returns the number of days overdue (0 if not overdue) */
function daysOverdue(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  const diff = today.getTime() - due.getTime()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0
}

function timeAgo(dateStr: string, t: (key: string) => string): string {
  const now = new Date()
  const then = new Date(dateStr)
  const diffMs = now.getTime() - then.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return t('collection.action.minutesAgo').replace('{n}', String(mins || 1))
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('collection.action.hoursAgo').replace('{n}', String(hours))
  const days = Math.floor(hours / 24)
  return t('collection.action.daysAgo').replace('{n}', String(days))
}

// ---------------------------------------------------------------------------
// Overdue Action Row sub-component
// ---------------------------------------------------------------------------

function OverdueActionRow({
  installmentId,
  actions,
  colSpan,
}: {
  installmentId: string
  actions: ReturnType<typeof useCollectionActions>['data']
  colSpan: number
}) {
  const t = useT()
  const { user } = useAuth()
  const getLabel = useActionTypeLabels()
  const create = useCreateCollectionAction()
  const [inputOpen, setInputOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<CollectionActionType>('call')
  const [content, setContent] = useState('')

  const myActions = useMemo(
    () => (actions || []).filter((a) => a.installmentId === installmentId),
    [actions, installmentId],
  )

  const handleSubmit = useCallback(() => {
    if (!content.trim()) return
    create.mutate(
      { installmentId, actionType: selectedType, content: content.trim(), actedBy: user?.id },
      {
        onSuccess: () => {
          setContent('')
          setInputOpen(false)
        },
      },
    )
  }, [create, installmentId, selectedType, content, user?.id])

  return (
    <TableRow className="bg-red-50/30 border-l-[3px] border-l-red-400 hover:bg-red-50/50">
      <TableCell colSpan={colSpan} className="py-2 px-3">
        <div className="flex flex-col gap-2">
          {/* Existing actions timeline */}
          {myActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {myActions.slice(0, 5).map((action) => {
                const cfg = ACTION_TYPES.find((a) => a.type === action.actionType) || ACTION_TYPES[5]
                const Icon = cfg.icon
                return (
                  <div
                    key={action.id}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${cfg.color.split('hover:')[0]}`}
                  >
                    <Icon className="size-3 shrink-0" />
                    <span className="font-medium">{getLabel(action.actionType)}</span>
                    {action.actedByName && (
                      <span className="text-muted-foreground">· {action.actedByName}</span>
                    )}
                    {action.content && (
                      <span className="max-w-[200px] truncate text-muted-foreground">— {action.content}</span>
                    )}
                    <span className="text-muted-foreground/70">{timeAgo(action.createdAt, t)}</span>
                  </div>
                )
              })}
              {myActions.length > 5 && (
                <span className="text-[11px] text-muted-foreground self-center">
                  +{myActions.length - 5}{t('common.count')}
                </span>
              )}
            </div>
          )}

          {/* No actions yet warning */}
          {myActions.length === 0 && !inputOpen && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 text-red-400" />
              <span className="text-xs text-red-500 font-medium">
                {t('collection.action.noAction')}
              </span>
            </div>
          )}

          {/* Action input or add button */}
          {inputOpen ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Action type selector */}
              <div className="flex gap-1">
                {ACTION_TYPES.map(({ type, icon: Icon, color }) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`p-1.5 rounded border transition-all ${
                      selectedType === type
                        ? color.replace('hover:', '')
                        : 'text-muted-foreground bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                    title={getLabel(type)}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
              <Input
                className="h-7 text-xs flex-1 max-w-[300px]"
                placeholder={t('collection.action.placeholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                  if (e.key === 'Escape') { setInputOpen(false); setContent('') }
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={handleSubmit}
                disabled={!content.trim() || create.isPending}
              >
                {create.isPending ? <Loader2 className="size-3 animate-spin" /> : t('common.save')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => { setInputOpen(false); setContent('') }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <div onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setInputOpen(true)}
              >
                <Phone className="size-3" />
                {t('collection.action.addAction')}
              </Button>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MonthlyCollectionPage() {
  const t = useT()
  const navigate = useNavigate()
  const { data: installments = [], isLoading, error } = useInstallments()
  const [currentMonth, setCurrentMonth] = useState(() => getMonthKey(new Date()))
  const STATUS_CONFIG = useStatusConfig()
  const formatMonthLabel = useFormatMonthLabel()
  const getDayLabel = useGetDayLabel()

  // Navigate months
  const goMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setCurrentMonth(getMonthKey(d))
  }

  const goToday = () => setCurrentMonth(getMonthKey(new Date()))

  // Filter installments for selected month and compute stats
  const { monthItems, krw, usd, overdueCount } = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const items = installments
      .filter(inst => inst.dueDate && inst.dueDate.startsWith(currentMonth))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))

    const stats = { expected: 0, collected: 0, overdue: 0, pending: 0 }
    const statsUsd = { expected: 0, collected: 0, overdue: 0, pending: 0 }
    let overdueN = 0

    for (const inst of items) {
      const s = inst.currency === 'USD' ? statsUsd : stats
      s.expected += inst.amount
      s.collected += inst.paidAmount
      const remaining = inst.amount - inst.paidAmount
      const pastDue = inst.dueDate! < todayStr && inst.status !== 'paid'
      if (pastDue) {
        s.overdue += remaining
        overdueN++
      } else if (inst.status === 'pending') {
        s.pending += remaining
      }
    }

    return { monthItems: items, krw: stats, usd: statsUsd, overdueCount: overdueN }
  }, [installments, currentMonth])

  const hasUsd = usd.expected > 0

  // Collect overdue installment IDs for action fetching
  const overdueIds = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return monthItems
      .filter((inst) => inst.dueDate && inst.dueDate < todayStr && inst.status !== 'paid')
      .map((inst) => inst.id)
  }, [monthItems])

  const { data: allActions } = useCollectionActions(overdueIds)

  // Group by date for visual separation
  const dateGroups = useMemo(() => {
    const map = new Map<string, PaymentInstallment[]>()
    for (const inst of monthItems) {
      const date = inst.dueDate || 'unknown'
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(inst)
    }
    return Array.from(map.entries())
  }, [monthItems])

  // Check if current view is this month
  const isCurrentMonth = currentMonth === getMonthKey(new Date())

  const COL_COUNT = 9

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-red-500">{t('collection.loadError')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('collection.title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('collection.subtitle')}
        </p>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[140px] text-center">
            {formatMonthLabel(currentMonth)}
          </h2>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="text-xs ml-2" onClick={goToday}>
              {t('common.thisMonth')}
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {t('collection.totalCount').replace('{n}', String(monthItems.length))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Calendar className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(krw.expected)}</div>
              {hasUsd && <div className="text-sm font-semibold text-primary/70">{formatCurrency(usd.expected, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('collection.expectedAmount')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(krw.collected)}</div>
              {hasUsd && <div className="text-sm font-semibold text-emerald-500/70">{formatCurrency(usd.collected, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('collection.collected')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <div className="text-lg font-bold text-red-600">{formatCurrency(krw.overdue)}</div>
              {hasUsd && usd.overdue > 0 && <div className="text-sm font-semibold text-red-400">{formatCurrency(usd.overdue, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">
                {t('collection.overdue')}
                {overdueCount > 0 && <span className="ml-1 text-red-500 font-medium">({overdueCount}{t('common.count')})</span>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(krw.pending)}</div>
              {hasUsd && usd.pending > 0 && <div className="text-sm font-semibold text-blue-400">{formatCurrency(usd.pending, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('collection.pending')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collection Schedule */}
      <Card>
        <CardContent className="p-0">
          {monthItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <Calendar className="size-10 mx-auto mb-3 opacity-30" />
              <p>{t('collection.noSchedule').replace('{month}', formatMonthLabel(currentMonth))}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">{t('collection.col.dueDate')}</TableHead>
                  <TableHead>{t('collection.col.contractor')}</TableHead>
                  <TableHead>{t('collection.col.student')}</TableHead>
                  <TableHead>{t('collection.col.school')}</TableHead>
                  <TableHead>{t('collection.col.item')}</TableHead>
                  <TableHead className="text-right">{t('collection.col.amount')}</TableHead>
                  <TableHead className="text-right">{t('collection.col.collected')}</TableHead>
                  <TableHead className="text-right">{t('collection.col.balance')}</TableHead>
                  <TableHead className="w-[90px]">{t('collection.col.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dateGroups.map(([date, items]) => (
                  items.map((inst, idx) => {
                    const cfg = STATUS_CONFIG[inst.status]
                    const Icon = cfg.icon
                    const remaining = inst.amount - inst.paidAmount
                    const today = isToday(date)
                    const past = isPast(date) && inst.status !== 'paid'
                    const overdueDays = past ? daysOverdue(date) : 0

                    return (
                      <OverdueRowGroup key={inst.id}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 ${
                            today
                              ? 'bg-blue-50/50'
                              : past
                                ? 'bg-red-50/60 border-l-[3px] border-l-red-400'
                                : ''
                          }`}
                          onClick={() => navigate(`/consulting/clients/${inst.contractId}`)}
                        >
                          {/* Date - only show for first item in group */}
                          <TableCell className={`font-mono text-xs ${
                            today
                              ? 'text-blue-600 font-semibold'
                              : past
                                ? 'text-red-500 font-semibold'
                                : 'text-muted-foreground'
                          }`}>
                            {idx === 0 ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  {today && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                                  {past && <AlertTriangle className="size-3 text-red-400" />}
                                  {getDayLabel(date)}
                                </div>
                                {past && overdueDays > 0 && (
                                  <span className="text-[10px] text-red-400 font-medium">
                                    D+{overdueDays}
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className={`font-medium text-sm ${past ? 'text-red-700' : ''}`}>
                            {inst.contract?.contractorName || '-'}
                          </TableCell>
                          <TableCell className={`text-sm ${past ? 'text-red-600' : ''}`}>
                            {inst.contract?.studentName || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {inst.contract?.schoolName || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] h-4">
                              {inst.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrency(inst.amount, inst.currency)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-600">
                            {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount, inst.currency) : '-'}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${past ? 'text-red-500 font-semibold' : inst.status === 'overdue' ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                            {remaining > 0 ? formatCurrency(remaining, inst.currency) : '-'}
                          </TableCell>
                          <TableCell>
                            {past ? (
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 bg-red-50 text-red-700 border-red-300 font-semibold">
                                <AlertTriangle className="size-3" />
                                {overdueDays > 0 ? `${t('collection.status.overdue')} D+${overdueDays}` : cfg.label}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${cfg.color}`}>
                                <Icon className="size-3" />
                                {cfg.label}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Overdue action sub-row */}
                        {past && (
                          <OverdueActionRow
                            installmentId={inst.id}
                            actions={allActions}
                            colSpan={COL_COUNT}
                          />
                        )}
                      </OverdueRowGroup>
                    )
                  })
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Transparent wrapper to group main row + action row as siblings in <tbody> */
function OverdueRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
