import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Loader2, Plus, Pencil, Trash2, DollarSign, TrendingUp,
  FileText, CalendarDays, BarChart3,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  usePartnerContracts,
  usePartnerPayments,
  useCreatePartnerPayment,
  useUpdatePartnerPayment,
  useDeletePartnerPayment,
  type CreatePartnerPaymentInput,
} from '@/hooks/usePartnerContracts'
import type { Contract, PaymentInstallment } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

type TabKey = 'payments' | 'contracts' | 'monthly'

const PAYMENT_TYPES = ['계약금', '중도금', '잔금'] as const

// ---------------------------------------------------------------------------
// Payment Form
// ---------------------------------------------------------------------------

interface PaymentForm {
  contractId: string
  label: string
  paidDate: string
  paidAmount: string
  notes: string
}

const emptyForm: PaymentForm = {
  contractId: '',
  label: '중도금',
  paidDate: new Date().toISOString().slice(0, 10),
  paidAmount: '',
  notes: '',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartnerContractsPage() {
  const { user } = useAuth()
  const partnerId = user?.id

  // Admin can view all partner contracts — for now just show own
  const { data: contracts = [], isLoading: contractsLoading } = usePartnerContracts(partnerId)
  const contractIds = useMemo(() => contracts.map(c => c.id), [contracts])
  const { data: payments = [], isLoading: paymentsLoading } = usePartnerPayments(contractIds)

  const createPayment = useCreatePartnerPayment()
  const updatePayment = useUpdatePartnerPayment()
  const deletePayment = useDeletePartnerPayment()

  const [activeTab, setActiveTab] = useState<TabKey>('payments')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<PaymentForm>(emptyForm)

  const isLoading = contractsLoading || paymentsLoading

  // Contract lookup
  const contractMap = useMemo(() => {
    const m = new Map<string, Contract>()
    for (const c of contracts) m.set(c.id, c)
    return m
  }, [contracts])

  // Fee rate (from first contract or default 20%)
  const feeRate = contracts[0]?.partnerFeeRate ?? 0.20

  // ── Summary stats ──
  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.paidAmount, 0), [payments])
  const totalFee = useMemo(() => Math.round(totalPaid * feeRate), [totalPaid, feeRate])
  const totalContracts = contracts.length

  // ── Monthly aggregation ──
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const p of payments) {
      if (!p.paidDate) continue
      const ym = p.paidDate.slice(0, 7)
      const cur = map.get(ym) || { count: 0, total: 0 }
      cur.count += 1
      cur.total += p.paidAmount
      map.set(ym, cur)
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, v]) => ({
        month,
        count: v.count,
        total: v.total,
        fee: Math.round(v.total * feeRate),
        net: v.total - Math.round(v.total * feeRate),
      }))
  }, [payments, feeRate])

  // ── Contract summary with payment subtotals ──
  const contractSummary = useMemo(() => {
    return contracts.map(c => {
      const cPayments = payments.filter(p => p.contractId === c.id)
      const deposit = cPayments.filter(p => p.label === '계약금').reduce((s, p) => s + p.paidAmount, 0)
      const interim = cPayments.filter(p => p.label === '중도금').reduce((s, p) => s + p.paidAmount, 0)
      const balance = cPayments.filter(p => p.label === '잔금').reduce((s, p) => s + p.paidAmount, 0)
      const totalPaid = deposit + interim + balance
      return { ...c, deposit, interim, balance, totalPaid, fee: Math.round(totalPaid * feeRate) }
    })
  }, [contracts, payments, feeRate])

  // ── Dialog handlers ──
  const openCreate = () => {
    setEditId(null)
    setForm({
      ...emptyForm,
      contractId: contracts[0]?.id || '',
    })
    setDialogOpen(true)
  }

  const openEdit = (p: PaymentInstallment) => {
    setEditId(p.id)
    setForm({
      contractId: p.contractId,
      label: p.label,
      paidDate: p.paidDate || '',
      paidAmount: String(p.paidAmount),
      notes: p.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    const amount = parseInt(form.paidAmount) || 0
    if (!form.contractId || !form.paidDate || amount <= 0) return

    if (editId) {
      updatePayment.mutate({
        id: editId,
        label: form.label,
        paidDate: form.paidDate,
        paidAmount: amount,
        notes: form.notes,
      })
    } else {
      const input: CreatePartnerPaymentInput = {
        contractId: form.contractId,
        label: form.label,
        paidDate: form.paidDate,
        paidAmount: amount,
        notes: form.notes,
      }
      createPayment.mutate(input)
    }
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('이 입금 기록을 삭제하시겠습니까?')) return
    deletePayment.mutate(id)
  }

  // Tab config
  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: 'payments', label: '입금 내역', icon: CalendarDays },
    { key: 'contracts', label: '계약 요약', icon: FileText },
    { key: 'monthly', label: '월별 집계', icon: BarChart3 },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">계약금 관리</h1>
        <p className="text-muted-foreground text-sm">학생별 계약금 입금 내역 및 수수료 현황</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">총 계약 수</p>
              <p className="text-xl font-bold">{totalContracts}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-200" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">총 입금액</p>
              <p className="text-xl font-bold text-green-600">{formatUSD(totalPaid)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-200" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">수수료 ({(feeRate * 100).toFixed(0)}%)</p>
              <p className="text-xl font-bold text-amber-600">{formatUSD(totalFee)}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-amber-200" />
          </CardContent>
        </Card>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b">
        {tabs.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}

        <div className="flex-1" />

        {activeTab === 'payments' && (
          <Button size="sm" className="mb-1" onClick={openCreate} disabled={contracts.length === 0}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            입금 추가
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === 'payments' ? (
        <PaymentsTab
          payments={payments}
          contractMap={contractMap}
          feeRate={feeRate}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ) : activeTab === 'contracts' ? (
        <ContractsTab data={contractSummary} feeRate={feeRate} />
      ) : (
        <MonthlyTab data={monthlySummary} feeRate={feeRate} />
      )}

      {/* Create/Edit Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editId ? '입금 수정' : '입금 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">계약 (학생) *</Label>
              <Select
                value={form.contractId}
                onValueChange={v => v && setForm(f => ({ ...f, contractId: v }))}
                disabled={!!editId}
              >
                <SelectTrigger>
                  <span>
                    {form.contractId
                      ? `${contractMap.get(form.contractId)?.studentName} — ${contractMap.get(form.contractId)?.schoolName}`
                      : '선택'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {contracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.studentName} — {c.schoolName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">입금 구분 *</Label>
                <Select value={form.label} onValueChange={v => v && setForm(f => ({ ...f, label: v }))}>
                  <SelectTrigger><span>{form.label}</span></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">입금일 *</Label>
                <Input type="date" value={form.paidDate} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">입금 금액 (USD) *</Label>
              <Input
                type="number"
                value={form.paidAmount}
                onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                placeholder="9000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="메모"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button
              onClick={handleSave}
              disabled={!form.contractId || !form.paidDate || !(parseInt(form.paidAmount) > 0)}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: 입금 내역
// ---------------------------------------------------------------------------

function PaymentsTab({
  payments, contractMap, feeRate, onEdit, onDelete,
}: {
  payments: PaymentInstallment[]
  contractMap: Map<string, Contract>
  feeRate: number
  onEdit: (p: PaymentInstallment) => void
  onDelete: (id: string) => void
}) {
  const sorted = useMemo(
    () => [...payments].sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || '')),
    [payments],
  )

  const labelColor: Record<string, string> = {
    '계약금': 'bg-blue-100 text-blue-700',
    '중도금': 'bg-purple-100 text-purple-700',
    '잔금': 'bg-amber-100 text-amber-700',
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>입금 내역이 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">No.</TableHead>
              <TableHead>입금일</TableHead>
              <TableHead>계약자</TableHead>
              <TableHead>학생명</TableHead>
              <TableHead>학교</TableHead>
              <TableHead>구분</TableHead>
              <TableHead className="text-right">입금액</TableHead>
              <TableHead>비고</TableHead>
              <TableHead className="text-right">수수료</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p, idx) => {
              const c = contractMap.get(p.contractId)
              const fee = Math.round(p.paidAmount * feeRate)
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-sm">{p.paidDate || '-'}</TableCell>
                  <TableCell>{c?.contractorName || '-'}</TableCell>
                  <TableCell className="font-medium">{c?.studentName || '-'}</TableCell>
                  <TableCell className="text-sm">{c?.schoolName || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-xs ${labelColor[p.label] || ''}`}>
                      {p.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-green-700">
                    {formatUSD(p.paidAmount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                    {p.notes || ''}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-600">
                    {formatUSD(fee)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => onDelete(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {/* Totals row */}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell colSpan={6} className="text-right text-sm">합계</TableCell>
              <TableCell className="text-right font-mono text-green-700">
                {formatUSD(sorted.reduce((s, p) => s + p.paidAmount, 0))}
              </TableCell>
              <TableCell />
              <TableCell className="text-right font-mono text-amber-600">
                {formatUSD(Math.round(sorted.reduce((s, p) => s + p.paidAmount, 0) * feeRate))}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: 계약 요약
// ---------------------------------------------------------------------------

interface ContractWithTotals extends Contract {
  deposit: number
  interim: number
  balance: number
  totalPaid: number
  fee: number
}

function ContractsTab({ data, feeRate }: { data: ContractWithTotals[]; feeRate: number }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>등록된 계약이 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">No.</TableHead>
              <TableHead>계약자</TableHead>
              <TableHead>학생명</TableHead>
              <TableHead>학교</TableHead>
              <TableHead>학년</TableHead>
              <TableHead>계약일</TableHead>
              <TableHead>만료일</TableHead>
              <TableHead className="text-right">계약금</TableHead>
              <TableHead className="text-right">중도금</TableHead>
              <TableHead className="text-right">잔금</TableHead>
              <TableHead className="text-right">총 계약액</TableHead>
              <TableHead className="text-right">총 납입액</TableHead>
              <TableHead className="text-right">수수료 ({(feeRate * 100).toFixed(0)}%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c, idx) => (
              <TableRow key={c.id}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>{c.contractorName}</TableCell>
                <TableCell className="font-medium">{c.studentName}</TableCell>
                <TableCell>{c.schoolName}</TableCell>
                <TableCell>{c.gradeAtContract || '-'}</TableCell>
                <TableCell className="font-mono text-sm">{c.contractDate}</TableCell>
                <TableCell className="font-mono text-sm">{c.expiryDate}</TableCell>
                <TableCell className="text-right font-mono">{c.deposit > 0 ? formatUSD(c.deposit) : '-'}</TableCell>
                <TableCell className="text-right font-mono">{c.interim > 0 ? formatUSD(c.interim) : '-'}</TableCell>
                <TableCell className="text-right font-mono">{c.balance > 0 ? formatUSD(c.balance) : '-'}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatUSD(c.totalAmount)}</TableCell>
                <TableCell className="text-right font-mono font-medium text-green-700">{formatUSD(c.totalPaid)}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{formatUSD(c.fee)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: 월별 집계
// ---------------------------------------------------------------------------

function MonthlyTab({
  data,
  feeRate,
}: {
  data: { month: string; count: number; total: number; fee: number; net: number }[]
  feeRate: number
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>입금 데이터가 없습니다.</p>
        </CardContent>
      </Card>
    )
  }

  const grandTotal = data.reduce((s, d) => s + d.total, 0)
  const grandFee = data.reduce((s, d) => s + d.fee, 0)
  const grandNet = data.reduce((s, d) => s + d.net, 0)
  const grandCount = data.reduce((s, d) => s + d.count, 0)

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>연월</TableHead>
              <TableHead className="text-right">입금 건수</TableHead>
              <TableHead className="text-right">입금 합계</TableHead>
              <TableHead className="text-right">수수료 ({(feeRate * 100).toFixed(0)}%)</TableHead>
              <TableHead className="text-right">실수령액 (입금-수수료)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(d => (
              <TableRow key={d.month}>
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell className="text-right">{d.count}</TableCell>
                <TableCell className="text-right font-mono text-green-700">{formatUSD(d.total)}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{formatUSD(d.fee)}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatUSD(d.net)}</TableCell>
              </TableRow>
            ))}
            {/* Grand total */}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell>합계</TableCell>
              <TableCell className="text-right">{grandCount}</TableCell>
              <TableCell className="text-right font-mono text-green-700">{formatUSD(grandTotal)}</TableCell>
              <TableCell className="text-right font-mono text-amber-600">{formatUSD(grandFee)}</TableCell>
              <TableCell className="text-right font-mono">{formatUSD(grandNet)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
