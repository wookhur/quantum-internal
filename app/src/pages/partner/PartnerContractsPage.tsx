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
import { useT } from '@/i18n/LanguageContext'
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

function formatMoney(amount: number, currency: string = 'USD'): string {
  if (currency === 'KRW') return `₩${amount.toLocaleString('ko-KR')}`
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
  const t = useT()
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

  // ── Summary stats by currency ──
  const summaryByCurrency = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of payments) {
      const c = contractMap.get(p.contractId)
      const cur = c?.currency || p.currency || 'USD'
      map[cur] = (map[cur] || 0) + p.paidAmount
    }
    return Object.entries(map).map(([cur, total]) => ({
      currency: cur,
      total,
      fee: Math.round(total * feeRate),
    }))
  }, [payments, contractMap, feeRate])
  const totalContracts = contracts.length

  // ── Monthly aggregation by currency ──
  const monthlySummary = useMemo(() => {
    const map = new Map<string, Record<string, { count: number; total: number }>>()
    for (const p of payments) {
      if (!p.paidDate) continue
      const ym = p.paidDate.slice(0, 7)
      const cur = contractMap.get(p.contractId)?.currency || p.currency || 'USD'
      if (!map.has(ym)) map.set(ym, {})
      const byMonth = map.get(ym)!
      if (!byMonth[cur]) byMonth[cur] = { count: 0, total: 0 }
      byMonth[cur].count += 1
      byMonth[cur].total += p.paidAmount
    }
    const rows: { month: string; currency: string; count: number; total: number; fee: number; net: number }[] = []
    for (const [month, byCur] of map) {
      for (const [cur, v] of Object.entries(byCur)) {
        rows.push({ month, currency: cur, count: v.count, total: v.total, fee: Math.round(v.total * feeRate), net: v.total - Math.round(v.total * feeRate) })
      }
    }
    return rows.sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency))
  }, [payments, contractMap, feeRate])

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
    if (!confirm(t('partner.confirmDelete'))) return
    deletePayment.mutate(id)
  }

  // Tab config
  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: 'payments', label: t('partner.tabPayments'), icon: CalendarDays },
    { key: 'contracts', label: t('partner.tabContracts'), icon: FileText },
    { key: 'monthly', label: t('partner.tabMonthly'), icon: BarChart3 },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('partner.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('partner.subtitle')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t('partner.totalContracts')}</p>
              <p className="text-xl font-bold">{totalContracts}</p>
            </div>
            <FileText className="h-8 w-8 text-blue-200" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t('partner.totalDeposits')}</p>
              <div className="space-y-0.5">
                {summaryByCurrency.map(s => (
                  <p key={s.currency} className="text-lg font-bold text-green-600">{formatMoney(s.total, s.currency)}</p>
                ))}
              </div>
            </div>
            <DollarSign className="h-8 w-8 text-green-200" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t('partner.fee')} ({(feeRate * 100).toFixed(0)}%)</p>
              <div className="space-y-0.5">
                {summaryByCurrency.map(s => (
                  <p key={s.currency} className="text-lg font-bold text-amber-600">{formatMoney(s.fee, s.currency)}</p>
                ))}
              </div>
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
            {t('partner.addPayment')}
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
            <DialogTitle>{editId ? t('partner.editPayment') : t('partner.addPayment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('partner.contractStudent')} *</Label>
              <Select
                value={form.contractId}
                onValueChange={v => v && setForm(f => ({ ...f, contractId: v }))}
                disabled={!!editId}
              >
                <SelectTrigger>
                  <span>
                    {form.contractId
                      ? `${contractMap.get(form.contractId)?.studentName} — ${contractMap.get(form.contractId)?.schoolName}`
                      : t('partner.selectPlaceholder')}
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
                <Label className="text-xs">{t('partner.paymentType')} *</Label>
                <Select value={form.label} onValueChange={v => v && setForm(f => ({ ...f, label: v }))}>
                  <SelectTrigger><span>{form.label}</span></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map(pt => (
                      <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('partner.paidDate')} *</Label>
                <Input type="date" value={form.paidDate} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('partner.paidAmount')} *</Label>
              <Input
                type="number"
                value={form.paidAmount}
                onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                placeholder="9000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('partner.notes')}</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('partner.notesPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('partner.cancel')}</Button>
            <Button
              onClick={handleSave}
              disabled={!form.contractId || !form.paidDate || !(parseInt(form.paidAmount) > 0)}
            >
              {t('partner.save')}
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
  const t = useT()
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
          <p>{t('partner.noPayments')}</p>
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
              <TableHead>{t('partner.paidDate')}</TableHead>
              <TableHead>{t('partner.colContractor')}</TableHead>
              <TableHead>{t('partner.colStudent')}</TableHead>
              <TableHead>{t('partner.colSchool')}</TableHead>
              <TableHead>{t('partner.colType')}</TableHead>
              <TableHead className="text-right">{t('partner.colPaidAmount')}</TableHead>
              <TableHead>{t('partner.notes')}</TableHead>
              <TableHead className="text-right">{t('partner.colFee')}</TableHead>
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
                    {formatMoney(p.paidAmount, c?.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                    {p.notes || ''}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-600">
                    {formatMoney(fee, c?.currency)}
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
            {/* Totals rows by currency */}
            {Object.entries(
              sorted.reduce<Record<string, number>>((acc, p) => {
                const cur = contractMap.get(p.contractId)?.currency || p.currency || 'USD'
                acc[cur] = (acc[cur] || 0) + p.paidAmount
                return acc
              }, {})
            ).map(([cur, total]) => (
              <TableRow key={cur} className="bg-muted/30 font-semibold">
                <TableCell colSpan={6} className="text-right text-sm">{t('partner.total')} ({cur})</TableCell>
                <TableCell className="text-right font-mono text-green-700">
                  {formatMoney(total, cur)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right font-mono text-amber-600">
                  {formatMoney(Math.round(total * feeRate), cur)}
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
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
  const t = useT()
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t('partner.noContracts')}</p>
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
              <TableHead>{t('partner.colContractor')}</TableHead>
              <TableHead>{t('partner.colStudent')}</TableHead>
              <TableHead>{t('partner.colSchool')}</TableHead>
              <TableHead>{t('partner.colGrade')}</TableHead>
              <TableHead>{t('partner.colContractDate')}</TableHead>
              <TableHead>{t('partner.colExpiryDate')}</TableHead>
              <TableHead className="text-right">{t('partner.colDeposit')}</TableHead>
              <TableHead className="text-right">{t('partner.colInterim')}</TableHead>
              <TableHead className="text-right">{t('partner.colBalance')}</TableHead>
              <TableHead className="text-right">{t('partner.colTotalAmount')}</TableHead>
              <TableHead className="text-right">{t('partner.colTotalPaid')}</TableHead>
              <TableHead className="text-right">{t('partner.colFee')} ({(feeRate * 100).toFixed(0)}%)</TableHead>
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
                <TableCell className="text-right font-mono">{c.deposit > 0 ? formatMoney(c.deposit, c.currency) : '-'}</TableCell>
                <TableCell className="text-right font-mono">{c.interim > 0 ? formatMoney(c.interim, c.currency) : '-'}</TableCell>
                <TableCell className="text-right font-mono">{c.balance > 0 ? formatMoney(c.balance, c.currency) : '-'}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatMoney(c.totalAmount, c.currency)}</TableCell>
                <TableCell className="text-right font-mono font-medium text-green-700">{formatMoney(c.totalPaid, c.currency)}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{formatMoney(c.fee, c.currency)}</TableCell>
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
  data: { month: string; currency: string; count: number; total: number; fee: number; net: number }[]
  feeRate: number
}) {
  const t = useT()
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t('partner.noMonthlyData')}</p>
        </CardContent>
      </Card>
    )
  }

  const grandByCurrency: Record<string, { count: number; total: number; fee: number; net: number }> = {}
  for (const d of data) {
    if (!grandByCurrency[d.currency]) grandByCurrency[d.currency] = { count: 0, total: 0, fee: 0, net: 0 }
    grandByCurrency[d.currency].count += d.count
    grandByCurrency[d.currency].total += d.total
    grandByCurrency[d.currency].fee += d.fee
    grandByCurrency[d.currency].net += d.net
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('partner.colMonth')}</TableHead>
              <TableHead>{t('partner.colCurrency')}</TableHead>
              <TableHead className="text-right">{t('partner.colPaymentCount')}</TableHead>
              <TableHead className="text-right">{t('partner.colPaymentTotal')}</TableHead>
              <TableHead className="text-right">{t('partner.colFee')} ({(feeRate * 100).toFixed(0)}%)</TableHead>
              <TableHead className="text-right">{t('partner.colNetAmount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(d => (
              <TableRow key={`${d.month}-${d.currency}`}>
                <TableCell className="font-medium">{d.month}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{d.currency}</Badge></TableCell>
                <TableCell className="text-right">{d.count}</TableCell>
                <TableCell className="text-right font-mono text-green-700">{formatMoney(d.total, d.currency)}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{formatMoney(d.fee, d.currency)}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatMoney(d.net, d.currency)}</TableCell>
              </TableRow>
            ))}
            {Object.entries(grandByCurrency).map(([cur, g]) => (
              <TableRow key={cur} className="bg-muted/30 font-semibold">
                <TableCell>{t('partner.total')}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{cur}</Badge></TableCell>
                <TableCell className="text-right">{g.count}</TableCell>
                <TableCell className="text-right font-mono text-green-700">{formatMoney(g.total, cur)}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{formatMoney(g.fee, cur)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(g.net, cur)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
