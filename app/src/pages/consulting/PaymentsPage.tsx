import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, DollarSign, TrendingUp, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Clock, AlertTriangle,
} from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import { formatCurrency } from '@/types'
import type { PaymentInstallment, InstallmentStatus } from '@/types'

/** Group installments by contract */
interface ContractGroup {
  contractId: string
  contractorName: string
  studentName: string
  schoolName: string
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  overdueAmount: number
  progress: number
  currency: 'KRW' | 'USD'
  installments: PaymentInstallment[]
}

function groupByContract(installments: PaymentInstallment[]): ContractGroup[] {
  const map = new Map<string, ContractGroup>()

  for (const inst of installments) {
    const cid = inst.contractId
    if (!map.has(cid)) {
      map.set(cid, {
        contractId: cid,
        contractorName: inst.contract?.contractorName || '-',
        studentName: inst.contract?.studentName || '-',
        schoolName: inst.contract?.schoolName || '-',
        totalAmount: inst.contract?.totalAmount || 0,
        paidAmount: 0,
        outstandingAmount: 0,
        overdueAmount: 0,
        progress: 0,
        currency: inst.currency,
        installments: [],
      })
    }
    const group = map.get(cid)!
    group.installments.push(inst)
    group.paidAmount += inst.paidAmount
    if (inst.status === 'overdue') {
      group.overdueAmount += inst.amount - inst.paidAmount
    }
  }

  // Compute derived fields
  for (const g of map.values()) {
    g.outstandingAmount = g.totalAmount - g.paidAmount
    g.progress = g.totalAmount > 0 ? Math.round((g.paidAmount / g.totalAmount) * 100) : 0
  }

  // Sort by contractor name
  return Array.from(map.values()).sort((a, b) => a.contractorName.localeCompare(b.contractorName))
}

const STATUS_CONFIG: Record<InstallmentStatus, { label: string; color: string }> = {
  paid: { label: '완납', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: '일부 납부', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: '연체', color: 'bg-red-50 text-red-700 border-red-200' },
  pending: { label: '예정', color: 'bg-gray-50 text-gray-600 border-gray-200' },
}

function ProgressBar({ progress }: { progress: number }) {
  const color =
    progress >= 100 ? 'bg-emerald-500'
    : progress >= 50 ? 'bg-blue-500'
    : progress > 0 ? 'bg-amber-500'
    : 'bg-red-400'

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-[36px] text-right">
        {progress}%
      </span>
    </div>
  )
}

export function PaymentsPage() {
  const { data: installments = [], isLoading, error } = useInstallments()
  const [expandedContract, setExpandedContract] = useState<string | null>(null)

  const { groups, totalAmount, totalPaid, totalOverdue, avgProgress } = useMemo(() => {
    const grps = groupByContract(installments)
    const tAmt = grps.reduce((s, g) => s + g.totalAmount, 0)
    const tPaid = grps.reduce((s, g) => s + g.paidAmount, 0)
    const tOver = grps.reduce((s, g) => s + g.overdueAmount, 0)
    const avg = grps.length > 0 ? Math.round(grps.reduce((s, g) => s + g.progress, 0) / grps.length) : 0
    return { groups: grps, totalAmount: tAmt, totalPaid: tPaid, totalOverdue: tOver, avgProgress: avg }
  }, [installments])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">수금 현황</h1>
        <p className="text-muted-foreground text-sm">
          {isLoading ? '로딩 중...' : `총 ${groups.length}건의 계약 · ${installments.length}건의 납입 일정`}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <DollarSign className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalAmount)}</div>
              <div className="text-xs text-muted-foreground">총 계약 금액</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalOverdue)}</div>
              <div className="text-xs text-muted-foreground">연체 미수금</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{avgProgress}%</div>
              <div className="text-xs text-muted-foreground">평균 수금률</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              결제 내역이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>계약자</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>학교</TableHead>
                  <TableHead className="text-right">총 금액</TableHead>
                  <TableHead className="text-right">수금액</TableHead>
                  <TableHead className="text-right">미수금</TableHead>
                  <TableHead className="w-[160px]">수금률</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const isExpanded = expandedContract === group.contractId
                  const statusLabel =
                    group.progress >= 100 ? '완납'
                    : group.overdueAmount > 0 ? '연체'
                    : group.progress > 0 ? '진행 중'
                    : '미납'
                  const statusVariant: 'default' | 'outline' | 'destructive' =
                    group.progress >= 100 ? 'default'
                    : group.overdueAmount > 0 ? 'destructive'
                    : group.progress > 0 ? 'outline'
                    : 'destructive'
                  const statusColor =
                    group.progress >= 100 ? 'bg-emerald-500 text-white'
                    : group.overdueAmount > 0 ? 'bg-red-500 text-white'
                    : group.progress > 0 ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'bg-red-100 text-red-600'

                  return (
                    <>
                      <TableRow
                        key={group.contractId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedContract(isExpanded ? null : group.contractId)}
                      >
                        <TableCell className="px-2">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{group.contractorName}</TableCell>
                        <TableCell>{group.studentName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{group.schoolName}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(group.totalAmount)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">
                          {group.paidAmount > 0 ? formatCurrency(group.paidAmount) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {group.outstandingAmount > 0 ? (
                            <span className={group.overdueAmount > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                              {formatCurrency(group.outstandingAmount)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <ProgressBar progress={group.progress} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant} className={statusColor + ' text-xs'}>
                            {statusLabel}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {/* Expanded installment rows */}
                      {isExpanded && group.installments.map((inst) => {
                        const cfg = STATUS_CONFIG[inst.status]
                        return (
                          <TableRow key={inst.id} className="bg-muted/30">
                            <TableCell></TableCell>
                            <TableCell colSpan={2} className="pl-8 text-xs">
                              <div className="flex items-center gap-2">
                                {inst.status === 'paid' && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                                {inst.status === 'partial' && <Clock className="size-3.5 text-amber-500" />}
                                {inst.status === 'overdue' && <AlertTriangle className="size-3.5 text-red-500" />}
                                {inst.status === 'pending' && <Clock className="size-3.5 text-gray-400" />}
                                <span className="font-medium">{inst.label}</span>
                                <Badge variant="outline" className={`text-[10px] h-4 ${cfg.color}`}>
                                  {cfg.label}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inst.dueDate ? `납기: ${inst.dueDate}` : ''}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              {formatCurrency(inst.amount)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono text-emerald-600">
                              {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono text-muted-foreground">
                              {inst.amount - inst.paidAmount > 0
                                ? formatCurrency(inst.amount - inst.paidAmount)
                                : '-'}
                            </TableCell>
                            <TableCell colSpan={2} className="text-xs text-muted-foreground">
                              {inst.paidDate ? `납부일: ${inst.paidDate}` : ''}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
