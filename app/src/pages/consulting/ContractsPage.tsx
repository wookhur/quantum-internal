import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search, Plus, Loader2, DollarSign, CheckCircle2, AlertTriangle, Clock,
  Upload, Ban, ChevronRight, ChevronDown, TrendingUp, Trash2,
} from 'lucide-react'
import { useContractsWithInstallments, useCreateContract } from '@/hooks/useContracts'
import { useCreateInstallments } from '@/hooks/useInstallments'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuth } from '@/contexts/AuthContext'
import { Textarea } from '@/components/ui/textarea'
import { ContractPdfUploadDialog } from '@/components/ContractPdfUploadDialog'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import type { ContractStatus, PaymentInstallment, InstallmentStatus } from '@/types'

function StatusConfig(t: (key: string) => string): Record<InstallmentStatus, { label: string; color: string }> {
  return {
    paid: { label: t('contracts.status.fullyPaid'), color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial: { label: t('contracts.status.partial'), color: 'bg-amber-50 text-amber-700 border-amber-200' },
    overdue: { label: t('contracts.status.overdue'), color: 'bg-red-50 text-red-700 border-red-200' },
    pending: { label: t('contracts.status.pending'), color: 'bg-gray-50 text-gray-600 border-gray-200' },
  }
}

function ProgressBar({ progress }: { progress: number }) {
  const color =
    progress >= 100 ? 'bg-emerald-500'
    : progress >= 50 ? 'bg-blue-500'
    : progress > 0 ? 'bg-amber-500'
    : 'bg-gray-300'

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-muted-foreground w-[32px] text-right">
        {progress}%
      </span>
    </div>
  )
}

function CollectionStatusBadge({ progress, hasOverdue }: { progress: number; hasOverdue: boolean }) {
  const t = useT()
  if (progress >= 100) {
    return <Badge className="bg-emerald-500 text-white text-[10px] h-5">{t('contracts.status.fullyPaid')}</Badge>
  }
  if (hasOverdue) {
    return <Badge className="bg-red-500 text-white text-[10px] h-5">{t('contracts.status.overdue')}</Badge>
  }
  if (progress > 0) {
    return <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-50 text-[10px] h-5">{t('contracts.status.inProgress')}</Badge>
  }
  return <Badge variant="outline" className="text-[10px] h-5">{t('contracts.status.unpaid')}</Badge>
}

type InstallmentRow = { label: string; amount: string; dueDate: string }

const INITIAL_CONTRACT_FORM = {
  contractorName: '',
  studentName: '',
  schoolName: '',
  gradeAtContract: '',
  contractDate: '',
  expiryDate: '',
  phone: '',
  address: '',
  totalAmount: '',
  currency: 'KRW' as 'KRW' | 'USD',
  paymentAccount: 'KR' as 'KR' | 'US',
  salesRep: '',
  serviceRep: '',
  notes: '',
}

const DEFAULT_INSTALLMENTS: InstallmentRow[] = [
  { label: '계약금', amount: '', dueDate: '' },
  { label: '중도금', amount: '', dueDate: '' },
  { label: '잔금', amount: '', dueDate: '' },
]

export function ContractsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const t = useT()
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_CONTRACT_FORM)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>(DEFAULT_INSTALLMENTS.map(r => ({ ...r })))
  const [expandedContract, setExpandedContract] = useState<string | null>(null)
  const [fromLead, setFromLead] = useState(false)
  const createContract = useCreateContract()
  const createInstallments = useCreateInstallments()

  // Auto-open create dialog when navigated from lead stage change
  useEffect(() => {
    const leadId = searchParams.get('leadId')
    if (leadId) {
      leadInfoRef.current = { leadId, phone: searchParams.get('phone') || '' }
      setForm({
        ...INITIAL_CONTRACT_FORM,
        contractorName: searchParams.get('contractorName') || '',
        studentName: searchParams.get('studentName') || '',
        schoolName: searchParams.get('schoolName') || '',
        gradeAtContract: searchParams.get('grade') || '',
        contractDate: new Date().toISOString().slice(0, 10),
        phone: searchParams.get('phone') || '',
        salesRep: user?.id || '',
      })
      setFromLead(true)
      setDialogOpen(true)
      // Clean URL params without navigation
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve lead info for contract creation (survives URL cleanup)
  const leadInfoRef = useRef<{ leadId: string; phone: string } | null>(null)

  const handleCreateContract = () => {
    if (!form.contractorName.trim() || !form.studentName.trim()) return
    createContract.mutate(
      {
        contractorName: form.contractorName,
        studentName: form.studentName,
        schoolName: form.schoolName,
        gradeAtContract: form.gradeAtContract,
        contractDate: form.contractDate,
        expiryDate: form.expiryDate,
        totalAmount: Number(form.totalAmount) || undefined,
        currency: form.currency,
        phone: form.phone || leadInfoRef.current?.phone || undefined,
        address: form.address || undefined,
        paymentAccount: form.paymentAccount,
        salesRep: form.salesRep || undefined,
        serviceRep: form.serviceRep || undefined,
        notes: form.notes || undefined,
        leadId: leadInfoRef.current?.leadId,
      },
      {
        onError: (err) => {
          alert(`계약 추가 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
        },
        onSuccess: (data) => {
          // Create installments if any have amount
          const validItems = installmentRows
            .filter(r => r.label.trim() && Number(r.amount) > 0)
            .map((r, i) => ({
              installmentOrder: i + 1,
              label: r.label.trim(),
              amount: Number(r.amount),
              dueDate: r.dueDate || undefined,
              currency: form.currency,
            }))
          if (data?.id && validItems.length > 0) {
            createInstallments.mutate({ contractId: data.id, items: validItems })
          }
          setDialogOpen(false)
          setForm(INITIAL_CONTRACT_FORM)
          setInstallmentRows(DEFAULT_INSTALLMENTS.map(r => ({ ...r })))
          setFromLead(false)
          if (data?.id) navigate(`/consulting/clients/${data.id}`)
        },
      },
    )
  }

  const { data: contracts = [], isLoading, error } = useContractsWithInstallments({
    status: statusFilter !== 'all' ? statusFilter as ContractStatus : undefined,
    search: search || undefined,
  })

  const statusConfig = StatusConfig(t)

  // Summary stats
  const { total, totalPaid, totalOutstanding, overdueContracts, cancelledCount, avgProgress } = useMemo(() => {
    const cnt = contracts.length
    const paid = contracts.reduce((s, c) => s + (c.paidAmount || 0), 0)
    const outstanding = contracts.reduce((s, c) => s + (c.outstandingAmount || 0), 0)
    const overdue = contracts.filter(c => c.installments?.some(i => i.status === 'overdue')).length
    const cancelled = contracts.filter(c => c.status === 'cancelled').length
    const activeContracts = contracts.filter(c => c.status !== 'cancelled' && c.totalAmount > 0)
    const avg = activeContracts.length > 0
      ? Math.round(activeContracts.reduce((s, c) => s + (c.totalAmount > 0 ? ((c.paidAmount || 0) / c.totalAmount * 100) : 0), 0) / activeContracts.length)
      : 0
    return { total: cnt, totalPaid: paid, totalOutstanding: outstanding, overdueContracts: overdue, cancelledCount: cancelled, avgProgress: avg }
  }, [contracts])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('contracts.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? t('contracts.summaryLoading') : t('contracts.summaryText').replace('{total}', String(total)).replace('{paid}', formatCurrency(totalPaid)).replace('{outstanding}', formatCurrency(totalOutstanding))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPdfDialogOpen(true)}>
            <Upload className="size-3.5" /> {t('contracts.pdfUpload')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" /> {t('contracts.addContract')}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('contracts.addContract')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {fromLead && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    📋 {t('contracts.fromLeadMessage')}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('contracts.parentName')}</Label>
                    <Input
                      placeholder={t('contracts.parentName')}
                      value={form.contractorName}
                      onChange={e => setForm(f => ({ ...f, contractorName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.studentName')}</Label>
                    <Input
                      placeholder={t('contracts.studentName')}
                      value={form.studentName}
                      onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('contracts.schoolName')}</Label>
                    <Input
                      placeholder={t('contracts.schoolName')}
                      value={form.schoolName}
                      onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.gradeName')}</Label>
                    <Input
                      placeholder={t('contracts.gradeName')}
                      value={form.gradeAtContract}
                      onChange={e => setForm(f => ({ ...f, gradeAtContract: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('contracts.contractDate')}</Label>
                    <Input
                      type="date"
                      value={form.contractDate}
                      onChange={e => setForm(f => ({ ...f, contractDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.expiryDate')}</Label>
                    <Input
                      type="date"
                      value={form.expiryDate}
                      onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Phone & Address */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('common.phone')}</Label>
                    <Input
                      placeholder={t('common.phone')}
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.address')}</Label>
                    <Input
                      placeholder={t('contracts.address')}
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Total Amount, Currency, Payment Account */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-4">
                  <div className="space-y-2">
                    <Label>{t('contracts.totalContractAmount')}</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={form.totalAmount}
                      onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.currency')}</Label>
                    <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: (v || 'KRW') as 'KRW' | 'USD' }))}>
                      <SelectTrigger><span>{form.currency === 'USD' ? 'USD ($)' : 'KRW (원)'}</span></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KRW">KRW (원)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.depositAccount')}</Label>
                    <Select value={form.paymentAccount} onValueChange={v => setForm(f => ({ ...f, paymentAccount: (v || 'KR') as 'KR' | 'US' }))}>
                      <SelectTrigger><span>{form.paymentAccount === 'US' ? t('contracts.usAccount') : t('contracts.krAccount')}</span></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KR">{t('contracts.krAccount')}</SelectItem>
                        <SelectItem value="US">{t('contracts.usAccount')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Sales Rep & Service Rep */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('leadDetail.salesRep')}</Label>
                    <Select value={form.salesRep} onValueChange={v => setForm(f => ({ ...f, salesRep: v || '' }))}>
                      <SelectTrigger><span>{profiles.find(p => p.id === form.salesRep)?.name || t('common.select')}</span></SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('leadDetail.serviceRep')}</Label>
                    <Select value={form.serviceRep} onValueChange={v => setForm(f => ({ ...f, serviceRep: v || '' }))}>
                      <SelectTrigger><span>{profiles.find(p => p.id === form.serviceRep)?.name || t('common.select')}</span></SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Installment Schedule */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('contracts.installmentSchedule')}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => setInstallmentRows(rows => [...rows, { label: '', amount: '', dueDate: '' }])}
                    >
                      <Plus className="size-3" /> {t('common.add')}
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                    {installmentRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <Input
                          placeholder={t('contracts.installmentLabel')}
                          value={row.label}
                          onChange={e => {
                            const next = [...installmentRows]
                            next[idx] = { ...next[idx], label: e.target.value }
                            setInstallmentRows(next)
                          }}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder={t('contracts.amount')}
                          value={row.amount}
                          onChange={e => {
                            const next = [...installmentRows]
                            next[idx] = { ...next[idx], amount: e.target.value }
                            setInstallmentRows(next)
                          }}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="date"
                          value={row.dueDate}
                          onChange={e => {
                            const next = [...installmentRows]
                            next[idx] = { ...next[idx], dueDate: e.target.value }
                            setInstallmentRows(next)
                          }}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setInstallmentRows(rows => rows.filter((_, i) => i !== idx))}
                          disabled={installmentRows.length <= 1}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    {installmentRows.length > 0 && (
                      <div className="text-[11px] text-muted-foreground pt-1 text-right">
                        {t('contracts.installmentTotal')}: {formatCurrency(installmentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0), form.currency)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t('common.notes')}</Label>
                  <Textarea
                    placeholder={t('common.notes')}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="min-h-[60px]"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateContract}
                  disabled={!form.contractorName.trim() || !form.studentName.trim() || createContract.isPending}
                >
                  {createContract.isPending ? t('contracts.adding') : t('common.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <ContractPdfUploadDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">{t('contracts.collectionComplete')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{formatCurrency(totalOutstanding)}</div>
              <div className="text-xs text-muted-foreground">{t('contracts.outstanding')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{overdueContracts}</div>
              <div className="text-xs text-muted-foreground">{t('contracts.overdueContracts')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{avgProgress}%</div>
              <div className="text-xs text-muted-foreground">{t('contracts.avgCollectionRate')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Ban className="size-5 text-gray-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold whitespace-nowrap">{cancelledCount}</div>
              <div className="text-xs text-muted-foreground">{t('contracts.cancelledCount')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t('contracts.searchPlaceholder')}
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder={t('common.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="active">{t('contracts.active')}</SelectItem>
                <SelectItem value="expiring_soon">{t('contracts.expiringSoon')}</SelectItem>
                <SelectItem value="expired">{t('contracts.expired')}</SelectItem>
                <SelectItem value="cancelled">{t('contracts.cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">
              {t('contracts.loadError')}
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
              <p>{t('contracts.noContracts')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-[120px]">{t('contracts.col.contractor')}</TableHead>
                  <TableHead className="w-[90px]">{t('contracts.col.student')}</TableHead>
                  <TableHead className="w-[95px]">{t('contracts.col.contractDate')}</TableHead>
                  <TableHead className="text-right w-[110px]">{t('contracts.col.contractAmount')}</TableHead>
                  <TableHead className="text-right w-[110px]">{t('contracts.col.collected')}</TableHead>
                  <TableHead className="text-right w-[110px]">{t('contracts.col.balance')}</TableHead>
                  <TableHead className="w-[140px]">{t('contracts.col.collectionRate')}</TableHead>
                  <TableHead className="w-[70px]">{t('contracts.col.status')}</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const isCancelled = contract.status === 'cancelled'
                  const isExpanded = expandedContract === contract.id
                  const progress = contract.totalAmount > 0
                    ? Math.round(((contract.paidAmount || 0) / contract.totalAmount) * 100)
                    : 0
                  const hasOverdue = contract.installments?.some(i => i.status === 'overdue') || false
                  const hasInstallments = (contract.installments?.length || 0) > 0

                  return (
                    <>
                      <TableRow
                        key={contract.id}
                        className={`cursor-pointer hover:bg-muted/50 ${isCancelled ? 'opacity-50' : ''}`}
                        onClick={() => navigate(`/consulting/clients/${contract.id}`)}
                      >
                        <TableCell className="px-2">
                          {hasInstallments ? (
                            <button
                              className="p-0.5 rounded hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedContract(isExpanded ? null : contract.id)
                              }}
                            >
                              {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                            </button>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {contract.contractorName}
                            {isCancelled && (
                              <Badge variant="outline" className="text-[10px] h-4 bg-gray-100 text-gray-500 border-gray-300">
                                {t('contracts.cancelled')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{contract.studentName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {contract.contractDate || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {contract.totalAmount > 0 ? formatCurrency(contract.totalAmount, contract.currency) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-600">
                          {(contract.paidAmount || 0) > 0 ? formatCurrency(contract.paidAmount!, contract.currency) : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${(contract.outstandingAmount || 0) > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                          {(contract.outstandingAmount || 0) > 0 ? formatCurrency(contract.outstandingAmount!, contract.currency) : '-'}
                        </TableCell>
                        <TableCell>
                          {contract.totalAmount > 0 && !isCancelled ? (
                            <ProgressBar progress={progress} />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {!isCancelled && contract.totalAmount > 0 && (
                            <CollectionStatusBadge progress={progress} hasOverdue={hasOverdue} />
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>

                      {/* Expanded installment rows */}
                      {isExpanded && contract.installments?.map((inst: PaymentInstallment) => {
                        const cfg = statusConfig[inst.status]
                        const remaining = inst.amount - inst.paidAmount
                        return (
                          <TableRow key={inst.id} className="bg-muted/30 hover:bg-muted/50">
                            <TableCell></TableCell>
                            <TableCell colSpan={2} className="pl-6 text-xs">
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
                            <TableCell className="text-right text-xs font-mono">
                              {formatCurrency(inst.amount)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono text-emerald-600">
                              {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount) : '-'}
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono text-muted-foreground">
                              {remaining > 0 ? formatCurrency(remaining) : '-'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inst.dueDate ? t('contracts.dueDate').replace('{date}', inst.dueDate) : ''}
                            </TableCell>
                            <TableCell colSpan={2} className="text-xs text-muted-foreground">
                              {inst.paidDate ? t('contracts.paidDate').replace('{date}', inst.paidDate) : ''}
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
