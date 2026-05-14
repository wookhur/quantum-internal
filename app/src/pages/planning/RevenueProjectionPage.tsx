import { useMemo, useState } from 'react'
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

const MONTH_NAMES = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${year}년 ${MONTH_NAMES[Number(month)]}`
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
        <p className="text-red-500">데이터를 불러오는데 실패했습니다.</p>
      </div>
    )
  }

  const noData = projection.length === 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">매출 전망</h1>
        <p className="text-muted-foreground text-sm">
          계약 기반 월별 수금 예측 (계약금 · 중도금 · 잔금)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <Clock className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalPending)}</div>
              <div className="text-xs text-muted-foreground">수금 예정</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalOverdue)}</div>
              <div className="text-xs text-muted-foreground">미수금 (연체)</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <TrendingUp className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(futureTotal)}</div>
              <div className="text-xs text-muted-foreground">향후 예상 매출</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-20 text-center text-muted-foreground">
            <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">아직 납입 일정이 등록된 계약이 없습니다.</p>
            <p className="text-xs mt-1">계약 추가 시 계약금·중도금·잔금 일정을 입력하면 자동으로 매출 전망에 반영됩니다.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Revenue Chart */}
          <Card>
            <CardContent className="pt-6 pb-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                월별 매출 현황 및 전망
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={projection.map((m) => ({
                    month: MONTH_NAMES[Number(m.month.split('-')[1])] || m.month,
                    monthKey: m.month,
                    수금완료: m.paid,
                    수금예정: m.pending,
                    연체: m.overdue,
                  }))}
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
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
                    tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v.toLocaleString()}
                  />
                  <RechartsTooltip
                    formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  />
                  {/* Reference line for current month */}
                  {currentMonth && (
                    <ReferenceLine
                      x={MONTH_NAMES[Number(currentMonth.month.split('-')[1])]}
                      stroke="#3b82f6"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                  )}
                  <Bar dataKey="수금완료" stackId="revenue" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="수금예정" stackId="revenue" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="연체" stackId="revenue" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Current Month Highlight */}
          {currentMonth && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="py-4">
                <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                  <Calendar className="size-4" />
                  이번 달 ({getMonthLabel(currentMonth.month)})
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">수금 완료</span>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(currentMonth.paid)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">수금 예정</span>
                    <p className="text-lg font-bold text-blue-600">{formatCurrency(currentMonth.pending)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">합계</span>
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
                    <TableHead>월</TableHead>
                    <TableHead className="text-right">수금 완료</TableHead>
                    <TableHead className="text-right">수금 예정</TableHead>
                    <TableHead className="text-right">연체</TableHead>
                    <TableHead className="text-right">합계</TableHead>
                    <TableHead className="text-right w-20">건수</TableHead>
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
                              {getMonthLabel(m.month)}
                              {isCurrent && (
                                <Badge className="bg-blue-500 text-white text-[10px] h-4">이번 달</Badge>
                              )}
                              {isFuture && (
                                <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">예정</Badge>
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
                            {m.items.length}건
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
