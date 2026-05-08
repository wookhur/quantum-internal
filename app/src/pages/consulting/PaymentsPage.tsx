import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { usePayments, useCreatePayment } from '@/hooks/usePayments'

function formatCurrency(amount: number, currency: 'KRW' | 'USD') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
}

function ProgressBar({ progress }: { progress: number }) {
  const color =
    progress >= 100
      ? 'bg-emerald-500'
      : progress >= 50
        ? 'bg-yellow-500'
        : 'bg-red-500'

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

function PaymentStage({ label, amount, date, currency }: { label: string; amount: number; date?: string; currency: 'KRW' | 'USD' }) {
  const isPaid = !!date
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center gap-1">
        <span className={isPaid ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>{label}</span>
      </div>
      <div className={isPaid ? 'font-medium' : 'text-muted-foreground'}>
        {formatCurrency(amount, currency)}
      </div>
      {date && <div className="text-[10px] text-muted-foreground font-mono">{date.slice(0, 10)}</div>}
    </div>
  )
}

const INITIAL_PAYMENT_FORM = {
  contractId: '',
  totalAmount: '',
  depositAmount: '',
  currency: 'KRW' as 'KRW' | 'USD',
}

export function PaymentsPage() {
  const { data: payments = [], isLoading, error } = usePayments()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_PAYMENT_FORM)
  const createPayment = useCreatePayment()

  const handleCreatePayment = () => {
    const totalAmount = Number(form.totalAmount)
    const depositAmount = Number(form.depositAmount)
    if (!form.contractId.trim() || totalAmount <= 0) return
    createPayment.mutate(
      {
        contractId: form.contractId,
        totalAmount,
        depositAmount: depositAmount || 0,
        currency: form.currency,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_PAYMENT_FORM)
        },
      },
    )
  }

  const totalReceivable = payments.reduce((sum, p) => sum + p.totalAmount, 0)
  const totalCollected = payments.reduce((sum, p) => sum + p.paidAmount, 0)
  const totalOutstanding = payments.reduce((sum, p) => sum + p.outstandingAmount, 0)
  const avgProgress = payments.length > 0
    ? Math.round(payments.reduce((sum, p) => sum + p.paymentProgress, 0) / payments.length)
    : 0

  // Use KRW for summary display (most common)
  const summaryCurrency: 'KRW' | 'USD' = 'KRW'

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">수금 현황</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : `총 ${payments.length}건의 결제 내역`}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> 결제 추가
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>결제 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>계약 ID</Label>
                <Input
                  placeholder="계약 ID"
                  value={form.contractId}
                  onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>총 금액</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.totalAmount}
                    onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>계약금</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.depositAmount}
                    onChange={e => setForm(f => ({ ...f, depositAmount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>통화</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as 'KRW' | 'USD' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KRW">KRW (원)</SelectItem>
                    <SelectItem value="USD">USD (달러)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleCreatePayment}
                disabled={!form.contractId.trim() || !Number(form.totalAmount) || createPayment.isPending}
              >
                {createPayment.isPending ? '추가 중...' : '추가'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <DollarSign className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalReceivable, summaryCurrency)}</div>
              <div className="text-xs text-muted-foreground">총 계약 금액</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalCollected, summaryCurrency)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalOutstanding, summaryCurrency)}</div>
              <div className="text-xs text-muted-foreground">미수금</div>
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
          ) : payments.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              결제 내역이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계약자</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>계약금</TableHead>
                  <TableHead>중도금 1</TableHead>
                  <TableHead>중도금 2</TableHead>
                  <TableHead>잔금</TableHead>
                  <TableHead className="w-[100px]">총 금액</TableHead>
                  <TableHead className="w-[160px]">수금 진행률</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const statusLabel =
                    payment.paymentProgress >= 100
                      ? '완납'
                      : payment.paymentProgress > 0
                        ? '진행 중'
                        : '미납'
                  const statusColor =
                    payment.paymentProgress >= 100
                      ? 'bg-emerald-500 text-white'
                      : payment.paymentProgress > 0
                        ? 'border-yellow-500 text-yellow-600 bg-yellow-50'
                        : 'bg-red-500 text-white'
                  const statusVariant: 'default' | 'outline' | 'destructive' =
                    payment.paymentProgress >= 100
                      ? 'default'
                      : payment.paymentProgress > 0
                        ? 'outline'
                        : 'destructive'

                  return (
                    <TableRow key={payment.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {payment.contract?.contractorName || '-'}
                      </TableCell>
                      <TableCell>
                        {payment.contract?.studentName || '-'}
                      </TableCell>
                      <TableCell>
                        <PaymentStage
                          label="계약금"
                          amount={payment.depositAmount}
                          date={payment.depositDate}
                          currency={payment.currency}
                        />
                      </TableCell>
                      <TableCell>
                        <PaymentStage
                          label="중도금1"
                          amount={payment.interim1Amount}
                          date={payment.interim1Date}
                          currency={payment.currency}
                        />
                      </TableCell>
                      <TableCell>
                        <PaymentStage
                          label="중도금2"
                          amount={payment.interim2Amount}
                          date={payment.interim2Date}
                          currency={payment.currency}
                        />
                      </TableCell>
                      <TableCell>
                        <PaymentStage
                          label="잔금"
                          amount={payment.balanceAmount}
                          date={payment.balanceDate}
                          currency={payment.currency}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {formatCurrency(payment.totalAmount, payment.currency)}
                      </TableCell>
                      <TableCell>
                        <ProgressBar progress={payment.paymentProgress} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant} className={statusColor + ' text-xs'}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
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
