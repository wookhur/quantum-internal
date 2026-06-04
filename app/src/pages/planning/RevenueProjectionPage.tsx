import { useMemo, useState } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2,
  TrendingUp,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useRevenueProjection } from '@/hooks/useInstallments'
import { formatCurrency } from '@/types'

function getMonthLabel(monthKey: string, t: (key: string) => string): string {
  const [year, month] = monthKey.split('-')
  return `${year}${t('planOverview.yearSuffix')} ${Number(month)}${t('planOverview.monthSuffix')}`
}

function isCurrentMonth(monthKey: string): boolean {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return monthKey === current
}

function isFutureMonth(monthKey: string): boolean {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return monthKey > current
}

export function RevenueProjectionPage() {
  const t = useT()
  const { data: projection = [], isLoading, error } = useRevenueProjection()
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  // Separate past, current, future
  const { currentMonth, futureMonths, totalPaid, totalPending, totalOverdue } = useMemo(() => {
    let current: (typeof projection)[0] | null = null
    const future: typeof projection = []

    let tPaid = 0
    let tPending = 0
    let tOverdue = 0

    for (const m of projection) {
      tPaid += m.paid
      tPending += m.pending
      tOverdue += m.overdue

      if (isCurrentMonth(m.month)) current = m
      else if (isFutureMonth(m.month)) future.push(m)
    }

    return {
      currentMonth: current,
      futureMonths: future,
      totalPaid: tPaid,
      totalPending: tPending,
      totalOverdue: tOverdue,
    }
  }, [projection])

  // Future revenue total
  const futureTotal = futureMonths.reduce((s, m) => s + m.pending + m.overdue, 0)

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
        <p className="text-red-500">{t('planOverview.loadError')}</p>
      </div>
    )
  }

  const noData = projection.length === 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('planning.projection')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('revProjection.subtitle')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">{t('revProjection.paid')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="size-5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(totalPending)}</div>
              <div className="text-xs text-muted-foreground">{t('revProjection.pending')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(totalOverdue)}</div>
              <div className="text-xs text-muted-foreground">{t('revProjection.overdue')}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <TrendingUp className="size-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(futureTotal)}</div>
              <div className="text-xs text-muted-foreground">{t('revProjection.futureRevenue')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-20 text-center text-muted-foreground">
            <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('revProjection.noSchedule')}</p>
            <p className="text-xs mt-1">{t('revProjection.noScheduleHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Revenue Chart — show last 3 months + next 9 months (12 total) */}
          <Card>
            <CardContent className="pt-6 pb-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                {t('revProjection.chartTitle')}
              </h3>
              {(() => {
                // Build a 12-month window: 3 past + current + 8 future
                const now = new Date()
                const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                const allKeys = projection.map(m => m.month)
                const curIdx = allKeys.indexOf(curKey)
                const startIdx = Math.max(0, curIdx >= 0 ? curIdx - 3 : 0)
                const windowData = projection.slice(startIdx, startIdx + 12)

                const paidLabel = t('revProjection.paid')
                const pendingLabel = t('revProjection.pending')
                const overdueLabel = t('revProjection.overdueShort')

                const chartData = windowData.map((m) => {
                  const [y, mo] = m.month.split('-')
                  return {
                    month: `${y.slice(2)}.${Number(mo)}${t('planOverview.monthSuffix')}`,
                    monthKey: m.month,
                    [paidLabel]: m.paid,
                    [pendingLabel]: m.pending,
                    [overdueLabel]: m.overdue,
                  }
                })

                const curLabel = (() => {
                  const [y, mo] = curKey.split('-')
                  return `${y.slice(2)}.${Number(mo)}${t('planOverview.monthSuffix')}`
                })()

                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickFormatter={(v) => {
                          if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}${t('revProjection.unitBillion')}`
                          if (v >= 10_000) return `${(v / 10_000).toFixed(0)}${t('revProjection.unitTenThousand')}`
                          return v.toLocaleString()
                        }}
                      />
                      <RechartsTooltip
                        formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                        labelFormatter={(label) => String(label)}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                      <ReferenceLine
                        x={curLabel}
                        stroke="#3b82f6"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: t('common.thisMonth'), position: 'top', fontSize: 10, fill: '#3b82f6' }}
                      />
                      <Bar dataKey={paidLabel} stackId="revenue" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey={pendingLabel} stackId="revenue" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                      <Bar dataKey={overdueLabel} stackId="revenue" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()}
            </CardContent>
          </Card>

          {/* Current Month Highlight */}
          {currentMonth && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="py-4">
                <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                  <Calendar className="size-4" />
                  {t('common.thisMonth')} ({getMonthLabel(currentMonth.month, t)})
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">{t('revProjection.paid')}</span>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(currentMonth.paid)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">{t('revProjection.pending')}</span>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(currentMonth.pending)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">{t('common.total')}</span>
                    <p className="text-lg font-bold">{formatCurrency(currentMonth.paid + currentMonth.pending + currentMonth.overdue)}</p>
                  </div>
                </div>
                {currentMonth.items.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {currentMonth.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-t border-blue-100">
                        <span>
                          {item.contractorName} — {item.studentName}
                          <Badge variant="outline" className="ml-2 text-[10px] h-4">
                            {item.label}
                          </Badge>
                        </span>
                        <span className="font-mono font-medium">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Monthly Projection Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{t('common.month')}</TableHead>
                    <TableHead className="text-right">{t('revProjection.paid')}</TableHead>
                    <TableHead className="text-right">{t('revProjection.pending')}</TableHead>
                    <TableHead className="text-right">{t('revProjection.overdueShort')}</TableHead>
                    <TableHead className="text-right">{t('common.total')}</TableHead>
                    <TableHead className="text-right w-20">{t('revProjection.count')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projection.map((m) => {
                    const total = m.paid + m.pending + m.overdue
                    const isCurrent = isCurrentMonth(m.month)
                    const isFuture = isFutureMonth(m.month)
                    const isExpanded = expandedMonth === m.month

                    return (
                      <>
                        <TableRow
                          key={m.month}
                          className={`cursor-pointer hover:bg-muted/50 ${isCurrent ? 'bg-blue-50/50 font-medium' : ''} ${isFuture ? 'text-muted-foreground' : ''}`}
                          onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                        >
                          <TableCell className="px-2">
                            {isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              {getMonthLabel(m.month, t)}
                              {isCurrent && (
                                <Badge className="bg-blue-500 text-white text-[10px] h-4">{t('common.thisMonth')}</Badge>
                              )}
                              {isFuture && (
                                <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">{t('revProjection.scheduled')}</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-600">
                            {m.paid > 0 ? formatCurrency(m.paid) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-600">
                            {m.pending > 0 ? formatCurrency(m.pending) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-500">
                            {m.overdue > 0 ? formatCurrency(m.overdue) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {formatCurrency(total)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {m.items.length}{t('common.count')}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail rows */}
                        {isExpanded && m.items.map((item, i) => (
                          <TableRow key={`${m.month}-${i}`} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell className="text-xs pl-8">
                              {item.contractorName} — {item.studentName}
                            </TableCell>
                            <TableCell className="text-right text-xs" colSpan={2}>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  item.status === 'paid'
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                    : item.status === 'overdue'
                                    ? 'bg-red-50 text-red-600 border-red-200'
                                    : 'bg-gray-50 text-gray-600'
                                }`}
                              >
                                {item.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {item.dueDate}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {formatCurrency(item.amount)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        ))}
                      </>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
