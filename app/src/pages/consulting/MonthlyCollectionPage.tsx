import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar,
  CheckCircle2, Clock, AlertTriangle, CircleDot,
} from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import { formatCurrency } from '@/types'
import type { PaymentInstallment, InstallmentStatus } from '@/types'

const STATUS_CONFIG: Record<InstallmentStatus, { label: string; color: string; icon: typeof Clock }> = {
  paid: { label: '완납', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  partial: { label: '일부 납부', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: CircleDot },
  overdue: { label: '연체', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  pending: { label: '예정', color: 'bg-gray-50 text-gray-600 border-gray-200', icon: Clock },
}

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-')
  return `${year}년 ${MONTH_NAMES[Number(month) - 1]}`
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${day}일 (${weekday})`
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10)
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10)
}

export function MonthlyCollectionPage() {
  const { data: installments = [], isLoading, error } = useInstallments()
  const [currentMonth, setCurrentMonth] = useState(() => getMonthKey(new Date()))

  // Navigate months
  const goMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setCurrentMonth(getMonthKey(d))
  }

  const goToday = () => setCurrentMonth(getMonthKey(new Date()))

  // Filter installments for selected month and compute stats
  const { monthItems, totalExpected, totalCollected, totalOverdue, totalPending } = useMemo(() => {
    const items = installments
      .filter(inst => inst.dueDate && inst.dueDate.startsWith(currentMonth))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))

    let expected = 0
    let collected = 0
    let overdue = 0
    let pending = 0

    for (const inst of items) {
      expected += inst.amount
      collected += inst.paidAmount
      if (inst.status === 'overdue') overdue += inst.amount - inst.paidAmount
      if (inst.status === 'pending') pending += inst.amount - inst.paidAmount
    }

    return { monthItems: items, totalExpected: expected, totalCollected: collected, totalOverdue: overdue, totalPending: pending }
  }, [installments, currentMonth])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">월별 수금 일정</h1>
        <p className="text-muted-foreground text-sm">
          월별 납입 일정 및 수금 트래킹
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
              이번 달
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          총 {monthItems.length}건
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Calendar className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalExpected)}</div>
              <div className="text-xs text-muted-foreground">예정 수금액</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalCollected)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalOverdue)}</div>
              <div className="text-xs text-muted-foreground">연체</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalPending)}</div>
              <div className="text-xs text-muted-foreground">수금 대기</div>
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
              <p>{formatMonthLabel(currentMonth)}에 예정된 수금 일정이 없습니다.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">납기일</TableHead>
                  <TableHead>계약자</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>학교</TableHead>
                  <TableHead>항목</TableHead>
                  <TableHead className="text-right">납입 금액</TableHead>
                  <TableHead className="text-right">수금액</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                  <TableHead className="w-[90px]">상태</TableHead>
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

                    return (
                      <TableRow
                        key={inst.id}
                        className={`${today ? 'bg-blue-50/50' : ''} ${past && inst.status === 'overdue' ? 'bg-red-50/30' : ''}`}
                      >
                        {/* Date - only show for first item in group */}
                        <TableCell className={`font-mono text-xs ${today ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}`}>
                          {idx === 0 ? (
                            <div className="flex items-center gap-1">
                              {today && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                              {getDayLabel(date)}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {inst.contract?.contractorName || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
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
                          {formatCurrency(inst.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">
                          {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount) : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${inst.status === 'overdue' ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          {remaining > 0 ? formatCurrency(remaining) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${cfg.color}`}>
                            <Icon className="size-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
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
