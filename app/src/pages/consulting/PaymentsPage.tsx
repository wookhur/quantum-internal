import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Loader2, DollarSign, TrendingUp, AlertCircle, CheckCircle2,
  Plus, CreditCard, Clock, Trash2, CalendarClock,
} from 'lucide-react'
import { usePayments, useConfirmTransfer, useDeleteTransfer, useCreatePayment } from '@/hooks/usePayments'
import type { Payment, TransferStage, TransferMethod } from '@/types'
import { TRANSFER_STAGE_LABELS, TRANSFER_METHOD_LABELS } from '@/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: 'KRW' | 'USD' = 'KRW') {
  if (currency === 'USD')
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(amount)
}

function fmtDate(d?: string) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  return diff
}

type StageStatus = 'paid' | 'overdue' | 'upcoming' | 'future' | 'none'

function stageStatus(dueDate: string | undefined, amount: number, paidForStage: number): StageStatus {
  if (amount <= 0) return 'none'
  if (paidForStage >= amount) return 'paid'
  if (!dueDate) return 'future'
  const d = daysUntil(dueDate)
  if (d < 0) return 'overdue'
  if (d <= 14) return 'upcoming'
  return 'future'
}

// ─── Stage Badge ──────────────────────────────────────────────────────────────

function StageBadge({ status, dueDate, amount, currency }: {
  status: StageStatus; dueDate?: string; amount: number; currency: 'KRW' | 'USD'
}) {
  if (status === 'none') return null
  if (status === 'paid') return (
    <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
      <CheckCircle2 className="size-3" /> 완납
    </span>
  )
  const d = dueDate ? daysUntil(dueDate) : null
  if (status === 'overdue') return (
    <span className="flex items-center gap-1 text-destructive text-xs font-medium">
      <AlertCircle className="size-3" />
      {Math.abs(d!)}일 연체 · {fmt(amount, currency)}
    </span>
  )
  if (status === 'upcoming') return (
    <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
      <Clock className="size-3" />
      D-{d} · {fmt(amount, currency)}
    </span>
  )
  return (
    <span className="text-xs text-muted-foreground">
      {fmtDate(dueDate)} · {fmt(amount, currency)}
    </span>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const color = progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{progress}%</span>
    </div>
  )
}

// ─── Confirm Transfer Modal ───────────────────────────────────────────────────

const STAGES: TransferStage[] = ['deposit', 'interim1', 'interim2', 'balance', 'other']

function ConfirmTransferModal({ payment, open, onClose }: {
  payment: Payment; open: boolean; onClose: () => void
}) {
  const confirm = useConfirmTransfer()
  const deleteTransfer = useDeleteTransfer()
  const [stage, setStage] = useState<TransferStage>('deposit')
  const [amount, setAmount] = useState('')
  const [transferredAt, setTransferredAt] = useState(today())
  const [senderName, setSenderName] = useState(payment.contract?.contractorName ?? '')
  const [method, setMethod] = useState<TransferMethod>('bank_transfer')
  const [memo, setMemo] = useState('')

  const stageAmount: Record<TransferStage, number> = {
    deposit: payment.depositAmount,
    interim1: payment.interim1Amount,
    interim2: payment.interim2Amount,
    balance: payment.balanceAmount,
    other: 0,
  }

  function handleStageChange(s: TransferStage) {
    setStage(s)
    setAmount(stageAmount[s] > 0 ? String(stageAmount[s]) : '')
  }

  function handleConfirm() {
    const amt = Number(amount)
    if (amt <= 0 || !transferredAt) return
    confirm.mutate(
      { paymentId: payment.id, stage, amount: amt, transferredAt, senderName, transferMethod: method, memo },
      {
        onSuccess: () => {
          setAmount('')
          setMemo('')
          setSenderName(payment.contract?.contractorName ?? '')
          setStage('deposit')
        },
      },
    )
  }

  const transfers = payment.transfers ?? []

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-4" />
            이체 확인 — {payment.contract?.studentName}
            <span className="text-sm font-normal text-muted-foreground">
              ({payment.contract?.contractorName})
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 납기 현황 요약 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {((['deposit', 'interim1', 'interim2', 'balance'] as TransferStage[])).map(s => {
            const amt = stageAmount[s]
            if (amt <= 0) return null
            const dueDate = s === 'deposit' ? payment.depositDate :
              s === 'interim1' ? payment.interim1Date :
              s === 'interim2' ? payment.interim2Date : payment.balanceDate
            const paidForStage = transfers.filter(t => t.stage === s).reduce((a, t) => a + t.amount, 0)
            const st = stageStatus(dueDate, amt, paidForStage)
            return (
              <div key={s} className="flex items-center justify-between bg-muted/50 rounded-md px-2 py-1.5">
                <span className="font-medium">{TRANSFER_STAGE_LABELS[s]}</span>
                <StageBadge status={st} dueDate={dueDate} amount={amt} currency={payment.currency} />
              </div>
            )
          })}
        </div>

        <Separator />

        {/* 이체 확인 입력 */}
        <div className="space-y-3">
          <p className="text-sm font-medium">이체 확인 입력</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">납기 단계</Label>
              <Select value={stage} onValueChange={v => handleStageChange(v as TransferStage)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s} value={s}>{TRANSFER_STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">이체 금액</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">이체일</Label>
              <Input
                type="date"
                className="h-9"
                value={transferredAt}
                onChange={e => setTransferredAt(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">이체 방법</Label>
              <Select value={method} onValueChange={v => setMethod(v as TransferMethod)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TRANSFER_METHOD_LABELS) as [TransferMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">입금자명</Label>
            <Input
              className="h-9"
              placeholder={payment.contract?.contractorName}
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">메모 (선택)</Label>
            <Input
              className="h-9"
              placeholder="특이사항 입력"
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />
          </div>

          <Button
            className="w-full h-9"
            onClick={handleConfirm}
            disabled={!amount || Number(amount) <= 0 || !transferredAt || confirm.isPending}
          >
            {confirm.isPending
              ? <><Loader2 className="size-4 animate-spin mr-2" />확인 중...</>
              : <><CheckCircle2 className="size-4 mr-2" />이체 확인 완료</>
            }
          </Button>
        </div>

        {/* 이체 내역 */}
        {transfers.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">이체 내역 ({transfers.length}건)</p>
              <div className="space-y-1.5">
                {transfers.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-md px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      <div>
                        <span className="font-medium">{TRANSFER_STAGE_LABELS[t.stage]}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span className="font-semibold">{fmt(t.amount, payment.currency)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{fmtDate(t.transferredAt)}</span>
                      {t.senderName && <span>· {t.senderName}</span>}
                      <button
                        className="ml-1 text-destructive/60 hover:text-destructive"
                        onClick={() => deleteTransfer.mutate({ transferId: t.id, paymentId: payment.id })}
                        disabled={deleteTransfer.isPending}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  contractId: '',
  totalAmount: '',
  depositAmount: '',
  depositDueDate: '',
  interim1Amount: '',
  interim1DueDate: '',
  balanceAmount: '',
  balanceDueDate: '',
  currency: 'KRW' as 'KRW' | 'USD',
}

function AddPaymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const createPayment = useCreatePayment()

  function set(key: keyof typeof EMPTY_FORM, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSubmit() {
    const total = Number(form.totalAmount)
    if (!form.contractId.trim() || total <= 0) return
    createPayment.mutate(
      {
        contractId: form.contractId,
        totalAmount: total,
        depositAmount: Number(form.depositAmount) || 0,
        depositDueDate: form.depositDueDate || undefined,
        interim1Amount: Number(form.interim1Amount) || 0,
        interim1DueDate: form.interim1DueDate || undefined,
        balanceAmount: Number(form.balanceAmount) || 0,
        balanceDueDate: form.balanceDueDate || undefined,
        currency: form.currency,
      },
      { onSuccess: () => { onClose(); setForm(EMPTY_FORM) } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>결제 스케줄 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">계약 ID</Label>
            <Input placeholder="계약 ID" value={form.contractId} onChange={e => set('contractId', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">총 계약금액</Label>
              <Input type="number" placeholder="0" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">통화</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v as string)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRW">KRW (원)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(['deposit', 'interim1', 'balance'] as const).map((s, i) => {
            const labels = ['계약금', '중도금', '잔금']
            const amtKey = s === 'deposit' ? 'depositAmount' : s === 'interim1' ? 'interim1Amount' : 'balanceAmount'
            const dateKey = s === 'deposit' ? 'depositDueDate' : s === 'interim1' ? 'interim1DueDate' : 'balanceDueDate'
            return (
              <div key={s} className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels[i]} 금액</Label>
                  <Input type="number" placeholder="0" value={form[amtKey]} onChange={e => set(amtKey, e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{labels[i]} 납기 예정일</Label>
                  <Input type="date" value={form[dateKey]} onChange={e => set(dateKey, e.target.value)} />
                </div>
              </div>
            )
          })}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!form.contractId.trim() || !Number(form.totalAmount) || createPayment.isPending}
          >
            {createPayment.isPending ? '추가 중...' : '결제 스케줄 추가'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { data: payments = [], isLoading, error } = usePayments()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const totalAmount = payments.reduce((s, p) => s + p.totalAmount, 0)
  const totalPaid   = payments.reduce((s, p) => s + p.paidAmount, 0)
  const totalOutstanding = payments.reduce((s, p) => s + p.outstandingAmount, 0)
  const overdueCount = payments.filter(p => {
    const stages: Array<{ date?: string; amount: number }> = [
      { date: p.depositDate, amount: p.depositAmount },
      { date: p.interim1Date, amount: p.interim1Amount },
      { date: p.balanceDate, amount: p.balanceAmount },
    ]
    const paidPerStage = (stage: TransferStage) =>
      (p.transfers ?? []).filter(t => t.stage === stage).reduce((a, t) => a + t.amount, 0)
    return stages.some((st, i) => {
      const stageName = (['deposit', 'interim1', 'balance'] as TransferStage[])[i]
      return st.date && st.amount > 0 && paidPerStage(stageName) < st.amount && daysUntil(st.date) < 0
    })
  }).length

  // 14일 이내 납기 예정
  const upcomingPayments = payments.filter(p => {
    const stages: Array<{ date?: string; amount: number; stage: TransferStage }> = [
      { date: p.depositDate, amount: p.depositAmount, stage: 'deposit' },
      { date: p.interim1Date, amount: p.interim1Amount, stage: 'interim1' },
      { date: p.interim2Date, amount: p.interim2Amount, stage: 'interim2' },
      { date: p.balanceDate, amount: p.balanceAmount, stage: 'balance' },
    ]
    const paidPerStage = (stage: TransferStage) =>
      (p.transfers ?? []).filter(t => t.stage === stage).reduce((a, t) => a + t.amount, 0)
    return stages.some(st =>
      st.date && st.amount > 0 && paidPerStage(st.stage) < st.amount &&
      daysUntil(st.date) >= 0 && daysUntil(st.date) <= 14
    )
  })

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">수금 현황</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? '로딩 중...' : `총 ${payments.length}건 · 이체 확인은 각 항목의 버튼을 클릭하세요`}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> 결제 추가
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <DollarSign className="size-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold truncate">{fmt(totalAmount)}</div>
              <div className="text-xs text-muted-foreground">총 계약 금액</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold truncate">{fmt(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold truncate">{fmt(totalOutstanding)}</div>
              <div className="text-xs text-muted-foreground">미수금 {overdueCount > 0 && <span className="text-destructive">({overdueCount}건 연체)</span>}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold">
                {payments.length > 0
                  ? Math.round(payments.reduce((s, p) => s + p.paymentProgress, 0) / payments.length)
                  : 0}%
              </div>
              <div className="text-xs text-muted-foreground">평균 수금률</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 14일 이내 납기 */}
      {upcomingPayments.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-700">
              <CalendarClock className="size-4" />
              14일 이내 납기 예정 ({upcomingPayments.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {upcomingPayments.map(p => {
                const stages: Array<{ date?: string; amount: number; stage: TransferStage }> = [
                  { date: p.depositDate, amount: p.depositAmount, stage: 'deposit' },
                  { date: p.interim1Date, amount: p.interim1Amount, stage: 'interim1' },
                  { date: p.interim2Date, amount: p.interim2Amount, stage: 'interim2' },
                  { date: p.balanceDate, amount: p.balanceAmount, stage: 'balance' },
                ]
                const paidPerStage = (stage: TransferStage) =>
                  (p.transfers ?? []).filter(t => t.stage === stage).reduce((a, t) => a + t.amount, 0)
                const pendingStage = stages.find(st =>
                  st.date && st.amount > 0 && paidPerStage(st.stage) < st.amount &&
                  daysUntil(st.date) >= 0 && daysUntil(st.date) <= 14
                )
                if (!pendingStage) return null
                const d = daysUntil(pendingStage.date!)
                return (
                  <button
                    key={p.id}
                    className="flex items-center gap-2 bg-white border border-yellow-200 rounded-lg px-3 py-2 text-xs hover:border-yellow-400 transition-colors"
                    onClick={() => setSelectedPayment(p)}
                  >
                    <Clock className="size-3 text-yellow-500" />
                    <span className="font-medium">{p.contract?.studentName}</span>
                    <span className="text-muted-foreground">{TRANSFER_STAGE_LABELS[pendingStage.stage]}</span>
                    <Badge variant="outline" className="text-yellow-600 border-yellow-300 text-[10px] px-1">
                      D-{d}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">데이터를 불러오는 중 오류가 발생했습니다.</div>
          ) : payments.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">결제 내역이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계약자 / 학생</TableHead>
                  <TableHead>계약금</TableHead>
                  <TableHead>중도금 1</TableHead>
                  <TableHead>중도금 2</TableHead>
                  <TableHead>잔금</TableHead>
                  <TableHead className="text-right">총액</TableHead>
                  <TableHead className="w-[140px]">수금 진행</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(payment => {
                  const paidPerStage = (stage: TransferStage) =>
                    (payment.transfers ?? []).filter(t => t.stage === stage).reduce((a, t) => a + t.amount, 0)

                  const stageCell = (dueDate: string | undefined, amount: number, stage: TransferStage) => {
                    if (amount <= 0) return <span className="text-muted-foreground text-xs">—</span>
                    const paid = paidPerStage(stage)
                    const st = stageStatus(dueDate, amount, paid)
                    return (
                      <div className="space-y-0.5">
                        <StageBadge status={st} dueDate={dueDate} amount={amount} currency={payment.currency} />
                        {dueDate && st !== 'paid' && (
                          <div className="text-[10px] text-muted-foreground">{fmtDate(dueDate)}</div>
                        )}
                      </div>
                    )
                  }

                  const hasOverdue = (['deposit', 'interim1', 'interim2', 'balance'] as TransferStage[]).some(s => {
                    const amt = s === 'deposit' ? payment.depositAmount : s === 'interim1' ? payment.interim1Amount : s === 'interim2' ? payment.interim2Amount : payment.balanceAmount
                    const date = s === 'deposit' ? payment.depositDate : s === 'interim1' ? payment.interim1Date : s === 'interim2' ? payment.interim2Date : payment.balanceDate
                    return stageStatus(date, amt, paidPerStage(s)) === 'overdue'
                  })

                  return (
                    <TableRow key={payment.id} className={hasOverdue ? 'bg-destructive/5' : ''}>
                      <TableCell>
                        <div className="font-medium text-sm">{payment.contract?.studentName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {payment.contract?.contractorName}
                          {payment.contract?.schoolName && ` · ${payment.contract.schoolName}`}
                        </div>
                      </TableCell>
                      <TableCell>{stageCell(payment.depositDate, payment.depositAmount, 'deposit')}</TableCell>
                      <TableCell>{stageCell(payment.interim1Date, payment.interim1Amount, 'interim1')}</TableCell>
                      <TableCell>{stageCell(payment.interim2Date, payment.interim2Amount, 'interim2')}</TableCell>
                      <TableCell>{stageCell(payment.balanceDate, payment.balanceAmount, 'balance')}</TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        <div>{fmt(payment.totalAmount, payment.currency)}</div>
                        {payment.outstandingAmount > 0 && (
                          <div className="text-xs text-muted-foreground">미수 {fmt(payment.outstandingAmount, payment.currency)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ProgressBar progress={payment.paymentProgress} />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={payment.paymentProgress >= 100 ? 'ghost' : 'outline'}
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedPayment(payment)}
                          disabled={payment.paymentProgress >= 100}
                        >
                          {payment.paymentProgress >= 100
                            ? <><CheckCircle2 className="size-3 text-emerald-500" /> 완납</>
                            : <><CreditCard className="size-3" /> 이체확인</>
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 이체 확인 모달 */}
      {selectedPayment && (
        <ConfirmTransferModal
          payment={selectedPayment}
          open={!!selectedPayment}
          onClose={() => setSelectedPayment(null)}
        />
      )}

      {/* 결제 추가 모달 */}
      <AddPaymentModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
