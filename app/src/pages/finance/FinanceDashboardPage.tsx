import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2, ChevronLeft, ChevronRight, TrendingUp,
  DollarSign, AlertTriangle, CheckCircle2, Users, Percent,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'
import { useInstallments } from '@/hooks/useInstallments'
import { useIncentivesByInstallment, INCENTIVE_TYPES, type IncentiveType } from '@/hooks/useIncentives'
import { useAllExtraInstallments } from '@/hooks/useExternalFees'
import { useMonthlyPerformance } from '@/hooks/useMonthlyPerformance'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatCompact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`
  return n.toLocaleString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinanceDashboardPage() {
  const t = useT()
  const [month, setMonth] = useState(getCurrentMonth)
  const isCurrentMonth = month === getCurrentMonth()
  const [year, mon] = month.split('-').map(Number)
  const prevMonth = shiftMonth(month, -1)

  // Data hooks
  const { data: allInstallments = [], isLoading: instLoading } = useInstallments()
  const { data: allIncentives = [], isLoading: incLoading } = useIncentivesByInstallment()
  const { data: allExtras = [], isLoading: extLoading } = useAllExtraInstallments()
  const { data: perfData = [], isLoading: perfLoading } = useMonthlyPerformance({ year })

  const isLoading = instLoading || incLoading || extLoading || perfLoading

  // ─── 1. 수금 현황 (Collection Status) ─────────────────────────────
  const collectionStats = useMemo(() => {
    // Current month installments (by due date)
    const thisMonth = allInstallments.filter(i => i.dueDate?.startsWith(month))
    const prevMo = allInstallments.filter(i => i.dueDate?.startsWith(prevMonth))

    const calc = (list: typeof allInstallments) => {
      let totalDue = 0, totalPaid = 0, totalOverdue = 0, paidCount = 0, overdueCount = 0, pendingCount = 0
      for (const i of list) {
        totalDue += i.amount
        if (i.status === 'paid') { totalPaid += i.paidAmount; paidCount++ }
        else if (i.status === 'overdue') { totalOverdue += i.amount - i.paidAmount; overdueCount++ }
        else { pendingCount++ }
      }
      return { totalDue, totalPaid, totalOverdue, paidCount, overdueCount, pendingCount, total: list.length }
    }

    const current = calc(thisMonth)
    const prev = calc(prevMo)
    const collectionRate = current.totalDue > 0 ? Math.round((current.totalPaid / current.totalDue) * 100) : 0
    const prevRate = prev.totalDue > 0 ? Math.round((prev.totalPaid / prev.totalDue) * 100) : 0

    return { ...current, collectionRate, prevRate, prevPaid: prev.totalPaid }
  }, [allInstallments, month, prevMonth])

  // ─── 2. 인센티브 현황 (Incentive Status) ──────────────────────────
  const incentiveStats = useMemo(() => {
    const thisMonth = allIncentives.filter(e => {
      if (e.isPaid) return e.paidDate?.startsWith(month)
      const ref = e.dueDate || e.contractDate
      return ref?.startsWith(month)
    })
    const prevMo = allIncentives.filter(e => {
      if (e.isPaid) return e.paidDate?.startsWith(prevMonth)
      const ref = e.dueDate || e.contractDate
      return ref?.startsWith(prevMonth)
    })

    const calc = (list: typeof allIncentives) => {
      let totalPaid = 0, totalExpected = 0
      const byType: Record<string, number> = {}
      const byPerson: Record<string, number> = {}
      for (const e of list) {
        if (e.isPaid) totalPaid += e.incentiveAmount
        else totalExpected += e.incentiveAmount
        byType[e.incentiveType] = (byType[e.incentiveType] || 0) + e.incentiveAmount
        byPerson[e.displayName] = (byPerson[e.displayName] || 0) + e.incentiveAmount
      }
      return { totalPaid, totalExpected, total: totalPaid + totalExpected, byType, byPerson }
    }

    const current = calc(thisMonth)
    const prev = calc(prevMo)

    // Top recipients
    const topRecipients = Object.entries(current.byPerson)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Type breakdown
    const typeBreakdown = Object.entries(current.byType)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])

    return { ...current, prevTotal: prev.total, topRecipients, typeBreakdown }
  }, [allIncentives, month, prevMonth])

  // ─── 3. 서비스 수수료 / 외부비용 (External Fees) ──────────────────
  const externalFeeStats = useMemo(() => {
    const thisMonth = allExtras.filter(e => {
      const d = e.paidDate || e.contractDate
      return d?.startsWith(month)
    })
    const prevMo = allExtras.filter(e => {
      const d = e.paidDate || e.contractDate
      return d?.startsWith(prevMonth)
    })

    const calc = (list: typeof allExtras) => {
      let totalFees = 0, totalSharesPaid = 0, totalSharesUnpaid = 0
      const byRecipient: Record<string, { paid: number; unpaid: number }> = {}
      for (const ext of list) {
        totalFees += ext.amount
        for (const s of ext.revenueShares) {
          if (s.isPaid) {
            totalSharesPaid += s.amount
          } else {
            totalSharesUnpaid += s.amount
          }
          const key = s.recipientName
          if (!byRecipient[key]) byRecipient[key] = { paid: 0, unpaid: 0 }
          if (s.isPaid) byRecipient[key].paid += s.amount
          else byRecipient[key].unpaid += s.amount
        }
      }
      return { totalFees, totalSharesPaid, totalSharesUnpaid, totalShares: totalSharesPaid + totalSharesUnpaid, count: list.length, byRecipient }
    }

    const current = calc(thisMonth)
    const prev = calc(prevMo)

    const topRecipients = Object.entries(current.byRecipient)
      .map(([name, v]) => ({ name, ...v, total: v.paid + v.unpaid }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return { ...current, prevTotal: prev.totalShares, topRecipients }
  }, [allExtras, month, prevMonth])

  // ─── 4. 월간 실적 (Monthly Performance) ───────────────────────────
  const perfStats = useMemo(() => {
    const thisMonthData = perfData.filter(p => p.month === mon && p.year === year)
    const kr = thisMonthData.find(p => p.region === 'KR')
    const us = thisMonthData.find(p => p.region === 'US')

    const totalTarget = (kr?.target || 0) + (us?.target || 0)
    const totalActual = (kr?.actual || 0) + (us?.actual || 0)
    const totalExpenses = (kr?.expenses || 0) + (us?.expenses || 0)
    const totalProfit = (kr?.profit || 0) + (us?.profit || 0)
    const achievementRate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0

    return { totalTarget, totalActual, totalExpenses, totalProfit, achievementRate, kr, us }
  }, [perfData, year, mon])

  // ─── 5. 전체 미수금 (Total Outstanding) ───────────────────────────
  const overallOutstanding = useMemo(() => {
    let total = 0, count = 0
    for (const i of allInstallments) {
      if (i.status === 'overdue' || i.status === 'pending' || i.status === 'partial') {
        total += i.amount - i.paidAmount
        if (i.status === 'overdue') count++
      }
    }
    return { total, overdueCount: count }
  }, [allInstallments])

  // ─── Delta helper ─────────────────────────────────────────────────
  const DeltaBadge = ({ current, previous }: { current: number; previous: number }) => {
    if (previous === 0) return null
    const pct = Math.round(((current - previous) / previous) * 100)
    if (pct === 0) return null
    const isUp = pct > 0
    return (
      <span className={`flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-green-600' : 'text-red-500'}`}>
        {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
        {Math.abs(pct)}%
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('financeDash.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('financeDash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(m => shiftMonth(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[110px] text-center">
            {year}{t('common.year')} {mon}{t('common.month')}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(m => shiftMonth(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setMonth(getCurrentMonth())}>
              {t('incentive.thisMonth')}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ─── KPI Cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 수금액 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.collected')}</CardTitle>
                <CheckCircle2 className="size-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCompact(collectionStats.totalPaid)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">{t('financeDash.collectionRate')}: {collectionStats.collectionRate}%</span>
                  <DeltaBadge current={collectionStats.totalPaid} previous={collectionStats.prevPaid} />
                </div>
              </CardContent>
            </Card>

            {/* 미수금 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.outstanding')}</CardTitle>
                <AlertTriangle className="size-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600">{formatCompact(overallOutstanding.total)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t('financeDash.overdueCount', { n: overallOutstanding.overdueCount })}
                </div>
              </CardContent>
            </Card>

            {/* 인센티브 합계 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.incentiveTotal')}</CardTitle>
                <Percent className="size-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCompact(incentiveStats.total)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {t('financeDash.paid')}: {formatCompact(incentiveStats.totalPaid)}
                  </span>
                  <DeltaBadge current={incentiveStats.total} previous={incentiveStats.prevTotal} />
                </div>
              </CardContent>
            </Card>

            {/* 서비스 수수료 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.externalFees')}</CardTitle>
                <Users className="size-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCompact(externalFeeStats.totalShares)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {externalFeeStats.count}{t('financeDash.cases')}
                  </span>
                  <DeltaBadge current={externalFeeStats.totalShares} previous={externalFeeStats.prevTotal} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Row 2: 수금 + 실적 ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 수금 상세 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="size-4" />
                  {t('financeDash.collectionDetail')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{t('financeDash.collectionProgress')}</span>
                    <span className="font-semibold">{collectionStats.collectionRate}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.min(collectionStats.collectionRate, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-green-700 mb-0.5">{t('financeDash.paidStatus')}</div>
                    <div className="text-base font-bold text-green-700">{collectionStats.paidCount}</div>
                    <div className="text-[10px] text-green-600">{formatCompact(collectionStats.totalPaid)}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-amber-700 mb-0.5">{t('financeDash.pendingStatus')}</div>
                    <div className="text-base font-bold text-amber-700">{collectionStats.pendingCount}</div>
                    <div className="text-[10px] text-amber-600">
                      {formatCompact(collectionStats.totalDue - collectionStats.totalPaid - collectionStats.totalOverdue)}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-red-700 mb-0.5">{t('financeDash.overdueStatus')}</div>
                    <div className="text-base font-bold text-red-700">{collectionStats.overdueCount}</div>
                    <div className="text-[10px] text-red-600">{formatCompact(collectionStats.totalOverdue)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 월간 실적 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="size-4" />
                  {t('financeDash.monthlyPerformance')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Achievement bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{t('financeDash.achievementRate')}</span>
                    <span className={`font-semibold ${perfStats.achievementRate >= 100 ? 'text-green-600' : perfStats.achievementRate >= 70 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {perfStats.achievementRate}%
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${perfStats.achievementRate >= 100 ? 'bg-green-500' : perfStats.achievementRate >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(perfStats.achievementRate, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('financeDash.target')}</span>
                      <span className="font-medium">{formatCompact(perfStats.totalTarget)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('financeDash.actual')}</span>
                      <span className="font-medium">{formatCompact(perfStats.totalActual)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('financeDash.expenses')}</span>
                      <span className="font-medium text-red-500">{formatCompact(perfStats.totalExpenses)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('financeDash.profit')}</span>
                      <span className={`font-medium ${perfStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCompact(perfStats.totalProfit)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* KR / US split */}
                {(perfStats.kr || perfStats.us) && (
                  <div className="border-t pt-3 space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">{t('financeDash.regionBreakdown')}</div>
                    {perfStats.kr && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] h-4 px-1">KR</Badge>
                          {t('financeDash.target')}: {formatCompact(perfStats.kr.target)}
                        </span>
                        <span className="font-medium">
                          {t('financeDash.actual')}: {formatCompact(perfStats.kr.actual)}
                          <span className="text-muted-foreground ml-1">({perfStats.kr.achievementRate || 0}%)</span>
                        </span>
                      </div>
                    )}
                    {perfStats.us && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] h-4 px-1">US</Badge>
                          {t('financeDash.target')}: {formatCompact(perfStats.us.target)}
                        </span>
                        <span className="font-medium">
                          {t('financeDash.actual')}: {formatCompact(perfStats.us.actual)}
                          <span className="text-muted-foreground ml-1">({perfStats.us.achievementRate || 0}%)</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Row 3: 인센티브 + 서비스 수수료 ─────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 인센티브 상세 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Percent className="size-4" />
                  {t('financeDash.incentiveDetail')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Paid vs Expected */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-green-700 mb-0.5">{t('financeDash.paid')}</div>
                    <div className="text-base font-bold text-green-700">{formatCompact(incentiveStats.totalPaid)}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-amber-700 mb-0.5">{t('financeDash.expected')}</div>
                    <div className="text-base font-bold text-amber-700">{formatCompact(incentiveStats.totalExpected)}</div>
                  </div>
                </div>

                {/* Type breakdown */}
                {incentiveStats.typeBreakdown.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">{t('financeDash.byType')}</div>
                    {incentiveStats.typeBreakdown.map(([type, amount]) => (
                      <div key={type} className="flex items-center justify-between text-xs py-1">
                        <span>{t(INCENTIVE_TYPES[type as IncentiveType].labelKey)}</span>
                        <span className="font-medium">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top recipients */}
                {incentiveStats.topRecipients.length > 0 && (
                  <div className="border-t pt-3 space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">{t('financeDash.topRecipients')}</div>
                    {incentiveStats.topRecipients.map(([name, amount], i) => (
                      <div key={name} className="flex items-center justify-between text-xs py-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="text-muted-foreground w-4">{i + 1}.</span>
                          {name}
                        </span>
                        <span className="font-medium">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 서비스 수수료 상세 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="size-4" />
                  {t('financeDash.externalFeeDetail')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-purple-700 mb-0.5">{t('financeDash.totalFees')}</div>
                    <div className="text-base font-bold text-purple-700">{formatCompact(externalFeeStats.totalFees)}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-green-700 mb-0.5">{t('financeDash.sharesPaid')}</div>
                    <div className="text-base font-bold text-green-700">{formatCompact(externalFeeStats.totalSharesPaid)}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-[11px] text-amber-700 mb-0.5">{t('financeDash.sharesUnpaid')}</div>
                    <div className="text-base font-bold text-amber-700">{formatCompact(externalFeeStats.totalSharesUnpaid)}</div>
                  </div>
                </div>

                {/* By recipient */}
                {externalFeeStats.topRecipients.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">{t('financeDash.byRecipient')}</div>
                    {externalFeeStats.topRecipients.map((r, i) => (
                      <div key={r.name} className="flex items-center justify-between text-xs py-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-muted-foreground w-4">{i + 1}.</span>
                          {r.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {r.paid > 0 && (
                            <Badge variant="outline" className="text-[9px] h-4 bg-green-50 text-green-600 border-green-200">
                              {formatCompact(r.paid)}
                            </Badge>
                          )}
                          {r.unpaid > 0 && (
                            <Badge variant="outline" className="text-[9px] h-4 bg-amber-50 text-amber-600 border-amber-200">
                              {formatCompact(r.unpaid)}
                            </Badge>
                          )}
                          <span className="font-medium w-16 text-right">{formatCurrency(r.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    {t('financeDash.noExternalFees')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
