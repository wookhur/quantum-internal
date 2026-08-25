import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ArrowLeft, Loader2, Phone, MapPin, School, Calendar,
  DollarSign, CheckCircle2, AlertTriangle, Clock, Ban,
  UserCircle, ExternalLink, Pencil, Trash2, Plus, Users, X, FileText, Star,
  Upload, Download,
} from 'lucide-react'
import { useContract, useCancelContract, useUpdateContract, useDeleteContract } from '@/hooks/useContracts'
import { useUpdateInstallment, useCreateInstallments, useDeleteInstallment } from '@/hooks/useInstallments'
import { useRevenueSharesByInstallments, useCreateRevenueShares, useUpdateRevenueShare, useDeleteRevenueShare } from '@/hooks/useRevenueShares'
import { useECActivities } from '@/hooks/useECActivities'
import { useContractIncentives, useCreateIncentive, useDeleteIncentive, useSetIncentiveOverrides, useIncentiveRecipients, useCreateIncentiveRecipient, INCENTIVE_TYPES, type IncentiveType } from '@/hooks/useIncentives'
import { useProfiles } from '@/hooks/useProfiles'
import { useCanEdit } from '@/hooks/usePermissions'
import { autoIssueReceipt } from '@/hooks/useInvoicesReceipts'
import { formatCurrency, formatPhone } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateClawbacks, useAllClawbacks, useSetClawbackStatus, useDeleteClawback, nextMonthKey, type ClawbackInput } from '@/hooks/useClawbacks'
import { supabase } from '@/lib/supabase'
import type { Contract, PaymentInstallment, ContractStatus } from '@/types'

// 회차별 인센티브 요율 선택 옵션 (0 ~ 10%, 0.5 단위)
const INCENTIVE_RATE_STEPS = Array.from({ length: 21 }, (_, i) => i * 0.5)

function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function usePaymentMethodLabel() {
  const t = useT()
  return (method: string) => {
    if (method === 'bank_transfer') return t('contracts.paymentBankTransfer')
    if (method === 'card') return t('contracts.paymentCard')
    if (method === 'us_wire') return t('contracts.paymentUsWire')
    if (method === 'us_wire_us') return t('contracts.paymentUsWireUs')
    return method || t('common.select')
  }
}

function useStatusConfig() {
  const t = useT()
  const STATUS_CONFIG: Record<ContractStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    active: { label: t('contracts.active'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    expiring_soon: { label: t('contracts.expiringSoon'), className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: AlertTriangle },
    expired: { label: t('contracts.expired'), className: 'bg-slate-100 text-slate-600 border-slate-300', icon: CheckCircle2 },
    terminated: { label: t('contracts.terminated'), className: 'bg-amber-100 text-amber-700 border-amber-300', icon: Ban },
    cancelled: { label: t('contracts.cancelled'), className: 'bg-gray-100 text-gray-500 border-gray-300', icon: Ban },
  }
  return STATUS_CONFIG
}

function useInstallmentStatusConfig() {
  const t = useT()
  const INSTALLMENT_STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    paid: { label: t('contracts.status.fullyPaid'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    pending: { label: t('contracts.status.pending'), className: 'bg-gray-50 text-gray-600 border-gray-200', icon: Clock },
    overdue: { label: t('contracts.status.overdue'), className: 'bg-red-50 text-red-600 border-red-200', icon: AlertTriangle },
    partial: { label: t('contracts.partialPayment'), className: 'bg-amber-50 text-amber-700 border-amber-200', icon: DollarSign },
  }
  return INSTALLMENT_STATUS_CONFIG
}

/** Unified dropdown: profiles + saved recipients in one flat list + inline add */
function IncentivePersonSelect({
  profiles,
  recipients,
  value,
  customName,
  onChange,
  onAddRecipient,
  placeholder,
  addNewLabel,
}: {
  profiles: { id: string; name: string }[]
  recipients: { id: string; name: string }[]
  value: string
  customName: string
  onChange: (profileId: string, customName: string) => void
  onAddRecipient: (name: string) => void
  placeholder: string
  addNewLabel: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayLabel = value
    ? profiles.find(p => p.id === value)?.name || ''
    : customName || ''

  const profileNames = new Set(profiles.map(p => p.name.toLowerCase()))
  const externalOnly = recipients.filter(r => !profileNames.has(r.name.toLowerCase()))
  type ListItem = { type: 'profile'; id: string; name: string } | { type: 'recipient'; id: string; name: string }
  const allItems: ListItem[] = [
    ...profiles.map(p => ({ type: 'profile' as const, id: p.id, name: p.name })),
    ...externalOnly.map(r => ({ type: 'recipient' as const, id: r.id, name: r.name })),
  ]

  const handleAddNew = () => {
    if (!newName.trim()) return
    onAddRecipient(newName.trim())
    onChange('', newName.trim())
    setOpen(false)
    setIsAdding(false)
    setNewName('')
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setIsAdding(false); setNewName('') } }}>
      <div className="relative">
        <PopoverTrigger
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={displayLabel ? 'text-foreground pr-5' : 'text-muted-foreground'}>
            {displayLabel || placeholder}
          </span>
          <svg className="size-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </PopoverTrigger>
        {displayLabel && (
          <button
            type="button"
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onChange('', '') }}
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <PopoverContent align="start" side="bottom" sideOffset={4} className="w-[var(--anchor-width)] p-0 max-h-[280px] overflow-y-auto">
        {/* Unified list */}
        {allItems.map((item) => {
          const isSelected = item.type === 'profile'
            ? (value === item.id && !customName)
            : (customName === item.name && !value)
          return (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${isSelected ? 'bg-accent font-medium' : ''}`}
              onClick={() => {
                if (item.type === 'profile') onChange(item.id, '')
                else onChange('', item.name)
                setOpen(false)
              }}
            >
              {item.name}
            </button>
          )
        })}

        {/* Add new */}
        <div className={allItems.length > 0 ? 'border-t' : ''}>
          {!isAdding ? (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 font-medium"
              onClick={() => {
                setIsAdding(true)
                setTimeout(() => inputRef.current?.focus(), 50)
              }}
            >
              <Plus className="size-3.5" />
              {addNewLabel}
            </button>
          ) : (
            <div className="flex items-center gap-1 p-1.5">
              <input
                ref={inputRef}
                type="text"
                className="flex-1 h-8 rounded-md border px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={addNewLabel}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddNew() }
                  if (e.key === 'Escape') { setIsAdding(false); setNewName('') }
                }}
              />
              <button
                type="button"
                className="h-8 px-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                disabled={!newName.trim()}
                onClick={handleAddNew}
              >
                {t('contractDetail.confirm')}
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// 계약 정보: 계약유형 · 원서지원수 · 계약서 PDF — Student360에 자동 연동되는 원본
function ContractInfoCard({ contract, canEdit }: { contract: Contract; canEdit: boolean }) {
  const update = useUpdateContract()
  const [contractType, setContractType] = useState(contract.contractType || '')
  const [appCount, setAppCount] = useState(contract.applicationCount ? String(contract.applicationCount) : '')
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    setContractType(contract.contractType || '')
    setAppCount(contract.applicationCount ? String(contract.applicationCount) : '')
  }, [contract.id, contract.contractType, contract.applicationCount])

  const saveType = () => { if (canEdit && contractType !== (contract.contractType || '')) update.mutate({ id: contract.id, contractType }) }
  const saveCount = () => {
    const n = appCount ? Number(appCount) : undefined
    if (canEdit && n !== contract.applicationCount) update.mutate({ id: contract.id, applicationCount: n })
  }
  const handlePickPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type && file.type !== 'application/pdf') { window.alert('PDF 파일만 업로드할 수 있습니다.'); return }
    setUploading(true)
    try {
      const path = `contract/${contract.id}/${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('contract-pdfs').upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('contract-pdfs').getPublicUrl(path)
      update.mutate({ id: contract.id, contractPdfUrl: publicUrl })
    } catch (err) {
      window.alert('계약서 업로드 실패: ' + (err instanceof Error ? err.message : String(err)))
    } finally { setUploading(false) }
  }
  const pdfUrl = contract.contractPdfUrl

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="size-4 text-primary" /> 계약 정보
          <span className="text-xs font-normal text-muted-foreground">· Student360에 자동 연동</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">계약유형</Label>
          <Input value={contractType} onChange={e => setContractType(e.target.value)} onBlur={saveType} disabled={!canEdit} placeholder="예: A (Platinum)" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">원서지원수 <span className="text-muted-foreground font-normal">(원서 칸 자동 생성 수)</span></Label>
          <Input type="number" min={0} value={appCount} onChange={e => setAppCount(e.target.value)} onBlur={saveCount} disabled={!canEdit} placeholder="예: 10" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">실물 계약서 (PDF)</Label>
          <div className="flex items-center gap-2">
            <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePickPdf} />
            {canEdit && (
              <Button variant="outline" size="sm" className="h-9 gap-1" disabled={uploading} onClick={() => pdfInputRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{pdfUrl ? '교체' : '업로드'}
              </Button>
            )}
            <Button variant="outline" size="sm" className={`h-9 gap-1 ${pdfUrl ? 'text-primary' : 'text-muted-foreground/40'}`} disabled={!pdfUrl}
              onClick={() => { if (pdfUrl) window.open(pdfUrl, '_blank', 'noopener') }}>
              <Download className="size-4" /> 다운로드
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InstallmentCard({
  installment,
  currency,
  canEdit,
  onMarkPaid,
  onEdit,
  onDelete,
  revenueShares,
  onToggleSharePaid,
  onDeleteShare,
  contributors,
  studentName,
}: {
  installment: PaymentInstallment
  currency: 'KRW' | 'USD'
  canEdit: boolean
  onMarkPaid: (inst: PaymentInstallment) => void
  onRevertPaid: (inst: PaymentInstallment) => void
  onEdit: (inst: PaymentInstallment) => void
  onDelete: (inst: PaymentInstallment) => void
  revenueShares?: import('@/types').RevenueShare[]
  onToggleSharePaid?: (shareId: string, isPaid: boolean) => void
  onDeleteShare?: (shareId: string) => void
  contributors?: string[]
  studentName?: string
}) {
  const t = useT()
  const { user } = useAuth()
  const createClawbacks = useCreateClawbacks()
  const [cbAmts, setCbAmts] = useState<Record<string, string>>({})
  const [deductM, setDeductM] = useState(nextMonthKey())
  const pmLabel = usePaymentMethodLabel()
  const INSTALLMENT_STATUS_CONFIG = useInstallmentStatusConfig()
  // Derive actual status from amounts — DB status may be stale
  const remaining = installment.amount - installment.paidAmount
  const derivedStatus: string =
    installment.paidAmount > 0 && remaining <= 0 ? 'paid'
    : installment.paidAmount > 0 && remaining > 0 ? 'partial'
    : installment.status === 'overdue' ? 'overdue'
    : 'pending'
  const config = INSTALLMENT_STATUS_CONFIG[derivedStatus] || INSTALLMENT_STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const isPaid = derivedStatus === 'paid'
  const isPartial = derivedStatus === 'partial'
  const isOverdue = derivedStatus === 'overdue'

  // ── 환불 처리 (건별) ──
  const updateInst = useUpdateInstallment()
  const refundStatus = installment.refundStatus
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmt, setRefundAmt] = useState('')
  const [refundDt, setRefundDt] = useState('')
  const [refundAcct, setRefundAcct] = useState('')
  const [refundReasonInput, setRefundReasonInput] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeDt, setCompleteDt] = useState('')
  const openRefund = () => {
    setRefundAmt(String(installment.refundAmount ?? installment.paidAmount ?? ''))
    setRefundDt(installment.refundDate || todayLocalISO())
    setRefundAcct(installment.refundAccount || '')
    setRefundReasonInput(installment.refundReason || '')
    setRefundOpen(true)
  }
  const submitRefund = () => {
    const amt = Number(refundAmt.replace(/,/g, ''))
    if (!amt || amt <= 0) return
    updateInst.mutate(
      { id: installment.id, refundStatus: 'requested', refundAmount: amt, refundDate: refundDt || undefined, refundAccount: refundAcct.trim() || null, refundReason: refundReasonInput.trim() || null },
      { onSuccess: () => setRefundOpen(false) },
    )
  }
  const openComplete = () => { setCompleteDt(todayLocalISO()); setDeductM(nextMonthKey(todayLocalISO())); setCbAmts({}); setCompleteOpen(true) }
  const submitComplete = () => updateInst.mutate(
    { id: installment.id, refundStatus: 'completed', refundDate: completeDt || todayLocalISO() },
    { onSuccess: () => {
        const items: ClawbackInput[] = (contributors || [])
          .filter(name => Number(cbAmts[name]) > 0)
          .map(name => ({ source: 'contract', sourceId: installment.id, studentName, contributorName: name, amount: Number(cbAmts[name]), reason: installment.refundReason || undefined, deductMonth: deductM }))
        if (items.length) createClawbacks.mutate({ items, createdBy: user?.id })
        setCompleteOpen(false)
      } },
  )
  const clearRefund = () => updateInst.mutate({ id: installment.id, refundStatus: null, refundAmount: null, refundDate: null, refundAccount: null, refundReason: null })

  // ── 상태 드롭다운: 입금예정 / 수금완료 / 환불신청 / 환불완료 ──
  const stateValue: 'pending' | 'paid' | 'refund_requested' | 'refund_completed' =
    refundStatus === 'completed' ? 'refund_completed'
    : refundStatus === 'requested' ? 'refund_requested'
    : isPaid ? 'paid'
    : 'pending'
  const STATE_LABEL: Record<typeof stateValue, string> = {
    pending: '입금예정', paid: '수금완료', refund_requested: '환불신청', refund_completed: '환불완료',
  }
  const revertToPending = () => updateInst.mutate({
    id: installment.id,
    paidAmount: 0, paidDate: '', status: 'pending', paymentMethod: '',
    refundStatus: null, refundAmount: null, refundDate: null, refundAccount: null, refundReason: null,
  }, {
    onSuccess: async () => {
      await supabase.from('invoices_receipts').delete().eq('installment_id', installment.id).eq('type', 'receipt')
    },
  })
  const handleStateChange = (v: string | null) => {
    if (!v || v === stateValue) return
    if (v === 'pending') {
      if (confirm('이 항목의 수금·환불 내역을 초기화하고 입금예정으로 되돌릴까요?')) revertToPending()
    } else if (v === 'paid') {
      if (refundStatus) { if (confirm('환불 내역을 취소하고 수금완료로 되돌릴까요?')) clearRefund() }
      else onMarkPaid(installment)
    } else if (v === 'refund_requested') {
      openRefund()
    } else if (v === 'refund_completed') {
      openComplete()
    }
  }

  return (
    <Card className={`${isOverdue ? 'border-red-200 bg-red-50/30' : ''} ${isPaid ? 'border-emerald-200 bg-emerald-50/30' : ''} ${isPartial ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.className}`}>
              <StatusIcon className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{installment.label}</span>
                {(isPartial || isOverdue) && (
                  <Badge variant="outline" className={`text-[10px] h-4 ${config.className}`}>
                    {config.label}
                  </Badge>
                )}
              </div>
              <div className="text-lg font-bold mt-0.5 font-mono">
                {formatCurrency(installment.amount, currency)}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => onEdit(installment)}>
                <Pencil className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(installment)}>
                <Trash2 className="size-3.5" />
              </Button>
              {/* 상태 드롭다운: 입금예정 / 수금완료 / 환불신청 / 환불완료 */}
              <Select value={stateValue} onValueChange={handleStateChange}>
                <SelectTrigger className={`h-8 w-[124px] text-xs font-medium ${
                  stateValue === 'paid' ? 'text-emerald-700 border-emerald-300'
                  : stateValue === 'refund_requested' ? 'text-orange-700 border-orange-300'
                  : stateValue === 'refund_completed' ? 'text-rose-700 border-rose-300'
                  : isOverdue ? 'text-red-600 border-red-300' : ''}`}>
                  <span>{STATE_LABEL[stateValue]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">입금예정</SelectItem>
                  <SelectItem value="paid">수금완료</SelectItem>
                  <SelectItem value="refund_requested">환불신청</SelectItem>
                  <SelectItem value="refund_completed">환불완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {!canEdit && (
            <Badge variant="outline" className={`text-[11px] h-5 ${
              stateValue === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : stateValue === 'refund_requested' ? 'bg-orange-50 text-orange-700 border-orange-200'
              : stateValue === 'refund_completed' ? 'bg-rose-50 text-rose-700 border-rose-200'
              : isOverdue ? 'bg-red-50 text-red-600 border-red-200' : ''}`}>
              {STATE_LABEL[stateValue]}
            </Badge>
          )}
        </div>

        {/* Payment details */}
        <div className="mt-3 grid grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">{t('contracts.scheduledDate')}</span>
            <p className="font-mono mt-0.5">{installment.dueDate || '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('contracts.actualPaidDate')}</span>
            <p className={`font-mono mt-0.5 ${isPaid ? 'text-emerald-600' : ''}`}>
              {installment.paidDate || '-'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('contracts.paidAmount')}</span>
            <p className={`font-mono mt-0.5 ${isPaid ? 'text-emerald-600' : ''}`}>
              {installment.paidAmount > 0 ? formatCurrency(installment.paidAmount, currency) : '-'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('contracts.remainBalance')}</span>
            <p className={`font-mono mt-0.5 ${remaining > 0 ? 'text-red-500 font-medium' : ''}`}>
              {remaining > 0 ? formatCurrency(remaining, currency) : '-'}
            </p>
          </div>
        </div>
        {refundStatus && (
          <div className="mt-2 space-y-1 text-xs text-rose-600">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>환불액: <span className="font-mono font-medium">{installment.refundAmount ? formatCurrency(installment.refundAmount, currency) : '-'}</span></span>
              {installment.refundDate && <span>{refundStatus === 'completed' ? '환불일' : '환불예정일'}: <span className="font-mono">{installment.refundDate}</span></span>}
              <span className="text-muted-foreground">({refundStatus === 'completed' ? '환불완료' : '환불신청'})</span>
            </div>
            {installment.refundAccount && <div>환불계좌: <span className="font-medium">{installment.refundAccount}</span></div>}
            {installment.refundReason && <div className="whitespace-pre-wrap">사유: {installment.refundReason}</div>}
          </div>
        )}
        {installment.paymentMethod && installment.paidDate && (
          <div className="mt-2 text-xs text-muted-foreground">
            {pmLabel(installment.paymentMethod || '')}
          </div>
        )}
        {installment.notes && (
          <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
            {installment.notes}
          </div>
        )}
        {/* Revenue Shares */}
        {revenueShares && revenueShares.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="size-3.5 text-violet-500" />
              <span className="text-xs font-medium text-violet-700">{t('contracts.revenueShare')}</span>
            </div>
            <div className="space-y-1.5">
              {revenueShares.map(share => (
                <div key={share.id} className="flex items-center justify-between text-xs bg-violet-50/50 rounded px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${share.isPaid ? 'text-emerald-700' : 'text-gray-800'}`}>
                      {share.recipientName}
                    </span>
                    {share.role && (
                      <span className="text-[10px] text-violet-500 bg-violet-100 rounded px-1.5 py-0.5">
                        {share.role}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">
                      {formatCurrency(share.amount, currency)}
                    </span>
                    {share.isPaid ? (
                      <Badge variant="outline" className="text-[10px] h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                        {t('contracts.status.fullyPaid')}
                      </Badge>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className="text-[10px] text-violet-600 hover:text-violet-800 font-medium"
                        onClick={() => onToggleSharePaid?.(share.id, true)}
                      >
                        {t('contracts.markPaid')}
                      </button>
                    ) : null}
                    {canEdit && onDeleteShare && (
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-500"
                        onClick={() => onDeleteShare(share.id)}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 환불 신청 다이얼로그 */}
        <Dialog open={refundOpen} onOpenChange={(o) => { if (!o) setRefundOpen(false) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>환불 신청</DialogTitle>
              <DialogDescription>{installment.label} · 환불 금액·계좌·사유를 입력하면 &lsquo;환불신청&rsquo; 상태가 됩니다.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">환불 금액 ({currency})</Label>
                <Input value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} inputMode="numeric" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">환불 계좌</Label>
                <Input value={refundAcct} onChange={(e) => setRefundAcct(e.target.value)} placeholder="예: 하나은행 123-456789-01 홍길동" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">환불 사유 / 메모</Label>
                <Textarea value={refundReasonInput} onChange={(e) => setRefundReasonInput(e.target.value)} rows={2} placeholder="예: 중도해지 · 학부모 요청 등" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">환불 예정일</Label>
                <Input type="date" value={refundDt} onChange={(e) => setRefundDt(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundOpen(false)}>취소</Button>
              <Button onClick={submitRefund} disabled={updateInst.isPending || !Number(refundAmt.replace(/,/g, ''))}>환불신청</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 환불 완료 처리 다이얼로그 */}
        <Dialog open={completeOpen} onOpenChange={(o) => { if (!o) setCompleteOpen(false) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>환불 완료 처리</DialogTitle>
              <DialogDescription>
                {installment.label} · 환불액 {installment.refundAmount ? formatCurrency(installment.refundAmount, currency) : '-'}
                {installment.refundAccount ? ` · ${installment.refundAccount}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">환불 완료일</Label>
              <Input type="date" value={completeDt} onChange={(e) => setCompleteDt(e.target.value)} />
            </div>
            {contributors && contributors.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <div className="text-xs font-medium text-violet-700">세일즈 인센티브 차감 (다음달 급여)</div>
                {contributors.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs w-20 truncate" title={name}>{name}</span>
                    <Input type="number" value={cbAmts[name] || ''} onChange={(e) => setCbAmts((m) => ({ ...m, [name]: e.target.value }))} placeholder="차감액 (원)" className="h-8 text-sm" />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-xs w-20 text-muted-foreground">차감월</span>
                  <Input type="month" value={deductM} onChange={(e) => setDeductM(e.target.value)} className="h-8 text-sm w-40" />
                </div>
                <p className="text-[11px] text-muted-foreground">입력 시 담당자 알림 + 인보이스·지급원장에 (−) 자동 반영. 사유에 따라 차등 입력하세요.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompleteOpen(false)}>취소</Button>
              <Button onClick={submitComplete} disabled={updateInst.isPending}>환불완료</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

// ─── Linked data hooks ──────────────────────────────────────────────────

function useLinkedLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['linked-lead', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, profiles!leads_assigned_to_fkey(id, name)')
        .eq('id', leadId!)
        .single()
      if (error) return null
      const row = data as Record<string, unknown>
      return {
        id: row.id as string,
        parentName: row.parent_name as string,
        studentName: row.student_name as string,
        phone: row.phone as string,
        sourceChannel: row.source_channel as string,
        interestArea: row.interest_area as string,
        memo: row.memo as string,
        pipelineStage: row.pipeline_stage as string,
        leadDate: row.lead_date as string,
        region: row.region as string,
        currentSchool: row.current_school as string,
        assignedUser: (row.profiles as Record<string, unknown> | null)?.name as string | undefined,
      }
    },
  })
}

function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-activities-for-contract', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*, profiles:profiles!lead_activities_created_by_fkey(name)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) return []
      return (data || []) as (Record<string, unknown> & { profiles: { name: string } | null })[]
    },
  })
}

/** Sales meetings linked to the lead */
function useSalesMeetings(leadId: string | undefined, parentName: string | undefined) {
  return useQuery({
    queryKey: ['sales-meetings-for-contract', leadId, parentName],
    enabled: !!(leadId || parentName),
    queryFn: async () => {
      const conditions: string[] = []
      if (leadId) conditions.push(`lead_id.eq.${leadId}`)
      if (parentName) conditions.push(`parent_name.ilike.%${parentName}%`)
      if (conditions.length === 0) return []

      const { data, error } = await supabase
        .from('meetings')
        .select('*, profiles:profiles!meetings_created_by_fkey(name)')
        .or(conditions.join(','))
        .order('meeting_date', { ascending: false })
      if (error) return []
      return (data || []) as (Record<string, unknown> & { profiles: { name: string } | null })[]
    },
  })
}

/** Service student meetings matched by student name */
function useServiceStudentMeetings(studentName: string | undefined) {
  return useQuery({
    queryKey: ['service-meetings-for-contract', studentName],
    enabled: !!studentName,
    queryFn: async () => {
      if (!studentName) return { student: null, meetings: [] }

      // Find matching service student
      const { data: students } = await supabase
        .from('service_students')
        .select('id, name, korean_name')
        .or(`name.ilike.%${studentName}%,korean_name.ilike.%${studentName}%`)
        .limit(1)

      const student = students?.[0] || null
      if (!student) return { student: null, meetings: [] }

      // Fetch their meetings
      const { data: meetings } = await supabase
        .from('service_meetings')
        .select('*')
        .eq('student_id', student.id)
        .order('meeting_date', { ascending: false })

      return {
        student: { id: student.id as string, name: (student.name || student.korean_name) as string },
        meetings: (meetings || []) as Record<string, unknown>[],
      }
    },
  })
}

// ─── Consultant name lookup ─────────────────────────────────────────────
const CONSULTANTS: Record<string, string> = {
  sangbum: '한상범', jihyun: '김지현', eunyoung: '양은영',
  yeonse: '남연서', danny: 'Danny', liz: '유리즈',
}

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canEdit = useCanEdit(useLocation().pathname)
  const t = useT()
  const { user } = useAuth()
  const pmLabel = usePaymentMethodLabel()
  const { data: contract, isLoading, error } = useContract(id)
  const cancelContract = useCancelContract()
  const updateContract = useUpdateContract()
  const deleteContract = useDeleteContract()
  const updateInstallment = useUpdateInstallment()
  const deleteInstallment = useDeleteInstallment()
  const createInstallments = useCreateInstallments()
  const STATUS_CONFIG = useStatusConfig()
  const createRevenueShares = useCreateRevenueShares()
  const updateRevenueShare = useUpdateRevenueShare()
  const deleteRevenueShare = useDeleteRevenueShare()
  const { data: linkedLead } = useLinkedLead(contract?.leadId)
  const { data: leadActivities = [] } = useLeadActivities(contract?.leadId)
  const { data: salesMeetings = [] } = useSalesMeetings(contract?.leadId, contract?.contractorName)
  const { data: serviceData } = useServiceStudentMeetings(contract?.studentName)
  // 외부서비스(EC)를 Student360 기준으로 조회 전용 표시 (계약 총액엔 미반영)
  const { data: ecActivities = [] } = useECActivities(serviceData?.student?.id)
  const extraInstIds = (contract?.installments || []).filter(i => i.category === 'extra').map(i => i.id)
  const { data: revenueShares = [] } = useRevenueSharesByInstallments(extraInstIds)
  const { data: contractIncentives = [] } = useContractIncentives(id)
  // 이 계약의 세일즈 인센티브 담당자(중복 제거) — 환불완료 시 차감 입력 대상
  const incentiveContributorNames = useMemo(
    () => [...new Set(contractIncentives.map((ci) => ci.displayName).filter((n): n is string => !!n))],
    [contractIncentives],
  )
  // 인센티브 환급(신청→완료) — 계약자 환불 프로세스와 동일 흐름
  const createClawbacks = useCreateClawbacks()
  const { data: allClawbacks = [] } = useAllClawbacks()
  const setClawbackStatus = useSetClawbackStatus()
  const deleteClawback = useDeleteClawback()
  const contractClawbacks = useMemo(
    () => allClawbacks.filter((c) => c.source === 'contract' && (c.studentName || '') === (contract?.studentName || '')),
    [allClawbacks, contract?.studentName],
  )
  const [clawOpen, setClawOpen] = useState(false)
  const [clawAmts, setClawAmts] = useState<Record<string, string>>({})
  const [clawMonth, setClawMonth] = useState(nextMonthKey())
  const [clawReason, setClawReason] = useState('')
  const submitClawbacks = () => {
    const items: ClawbackInput[] = incentiveContributorNames
      .filter((n) => Number(clawAmts[n]) > 0)
      .map((n) => ({ source: 'contract', sourceId: id, studentName: contract?.studentName, contributorName: n, amount: Number(clawAmts[n]), reason: clawReason.trim() || undefined, deductMonth: clawMonth }))
    if (!items.length) return
    createClawbacks.mutate({ items, createdBy: user?.id }, { onSuccess: () => { setClawOpen(false); setClawAmts({}); setClawReason('') } })
  }
  const createIncentive = useCreateIncentive()
  const deleteIncentive = useDeleteIncentive()
  const setIncentiveOverrides = useSetIncentiveOverrides()
  // 회차별 요율 저장: 기본 %와 같으면 맵에서 제거(깔끔), 다르면 지정.
  const saveIncentiveRate = (inc: { id: string; percentage: number; installmentOverrides: Record<string, number> | null }, installmentId: string, newPct: number) => {
    const next = { ...(inc.installmentOverrides || {}) }
    if (newPct === inc.percentage) delete next[installmentId]
    else next[installmentId] = newPct
    setIncentiveOverrides.mutate({ incentiveId: inc.id, overrides: next })
  }
  const { data: allProfiles = [] } = useProfiles()
  const { data: incentiveRecipients = [] } = useIncentiveRecipients()
  const createRecipient = useCreateIncentiveRecipient()
  const [incentiveForm, setIncentiveForm] = useState({ profileId: '', customName: '', incentiveType: '' as string })
  const [incentiveFormKey, setIncentiveFormKey] = useState(0)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10))
  const [addChargeDialogOpen, setAddChargeDialogOpen] = useState(false)
  const [addBaseDialogOpen, setAddBaseDialogOpen] = useState(false)
  const [baseForm, setBaseForm] = useState({ label: '', amount: '', dueDate: '' })
  const [chargeForm, setChargeForm] = useState({ label: '', amount: '', dueDate: '', notes: '' })
  const [revenueShareRows, setRevenueShareRows] = useState<{ name: string; amount: string; role: string }[]>([])
  const [editInstDialogOpen, setEditInstDialogOpen] = useState(false)
  const [editInstForm, setEditInstForm] = useState({ id: '', label: '', amount: '', dueDate: '', paidDate: '', paidAmount: '', paymentMethod: '', notes: '', isPaid: false })
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<PaymentInstallment | null>(null)
  const [payForm, setPayForm] = useState({
    paidAmount: '',
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'bank_transfer' as string,
    notes: '',
  })

  const handleCancel = useCallback(() => {
    if (!canEdit) return
    if (!id) return
    cancelContract.mutate({
      contractId: id,
      reason: cancelReason || undefined,
      refundAmount: refundAmount ? Number(refundAmount) : undefined,
      refundDate: refundAmount ? refundDate : undefined,
      studentName: contract?.studentName,
    }, {
      onSuccess: () => {
        setCancelDialogOpen(false)
        setCancelReason('')
        setRefundAmount('')
      },
      onError: (e: unknown) => {
        const err = e as { message?: string }
        alert(`계약 취소 처리에 실패했습니다.\n${err?.message || ''}`)
      },
    })
  }, [id, cancelReason, refundAmount, refundDate, contract?.studentName, cancelContract, canEdit])

  const openPayDialog = useCallback((inst: PaymentInstallment) => {
    if (!canEdit) return
    setSelectedInstallment(inst)
    setPayForm({
      paidAmount: String(inst.amount - inst.paidAmount),
      paidDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'bank_transfer',
      notes: '',
    })
    setPayDialogOpen(true)
  }, [canEdit])

  const handleMarkPaid = useCallback(() => {
    if (!canEdit) return
    if (!selectedInstallment || !contract) return
    const amount = Number(payForm.paidAmount) || 0
    if (amount <= 0) return

    const totalPaid = selectedInstallment.paidAmount + amount
    const isFullyPaid = totalPaid >= selectedInstallment.amount

    updateInstallment.mutate({
      id: selectedInstallment.id,
      paidAmount: totalPaid,
      paidDate: payForm.paidDate,
      status: isFullyPaid ? 'paid' : 'partial',
      paymentMethod: payForm.paymentMethod,
      notes: payForm.notes || undefined,
    }, {
      onSuccess: () => {
        setPayDialogOpen(false)
        setSelectedInstallment(null)

        // Auto-issue receipt and send to customer email
        autoIssueReceipt({
          contractId: contract.id,
          installmentId: selectedInstallment.id,
          studentName: contract.studentName,
          contractorName: contract.contractorName,
          recipientEmail: undefined, // Will be looked up from service_students
          amount,
          currency: contract.currency || 'KRW',
          paymentMethod: payForm.paymentMethod,
          paidDate: payForm.paidDate,
          label: selectedInstallment.label,
          createdBy: user?.id,
        }).then(async (doc) => {
          // Try to find customer email from service_students or leads
          if (doc && !doc.recipient_email) {
            const { data: student } = await supabase
              .from('service_students')
              .select('parent_email, email')
              .eq('name', contract.studentName)
              .limit(1)
              .single()
            const email = student?.parent_email || student?.email
            if (email) {
              await supabase
                .from('invoices_receipts')
                .update({ recipient_email: email })
                .eq('id', doc.id as string)
              // Send the email
              await supabase.functions.invoke('send-document', {
                body: { documentId: doc.id },
              })
            }
          }
        })
      },
    })
  }, [selectedInstallment, payForm, updateInstallment, contract, user?.id, canEdit])

  const handleRevertPaid = useCallback((inst: PaymentInstallment) => {
    if (!canEdit) return
    if (!confirm(t('contracts.revertPaidConfirm').replace('{label}', inst.label))) return
    updateInstallment.mutate({
      id: inst.id,
      paidAmount: 0,
      paidDate: '',
      status: 'pending',
      paymentMethod: '',
      notes: '',
    }, {
      onSuccess: async () => {
        // Delete associated receipts when payment is reverted
        const { error } = await supabase
          .from('invoices_receipts')
          .delete()
          .eq('installment_id', inst.id)
          .eq('type', 'receipt')
        if (error) console.error('Failed to delete receipt on revert:', error.message)
      },
    })
  }, [updateInstallment, t, canEdit])

  const handleDeleteInstallment = useCallback((inst: PaymentInstallment) => {
    if (!canEdit) return
    if (!confirm(t('contracts.deleteInstallmentConfirm').replace('{label}', inst.label))) return
    deleteInstallment.mutate(inst.id)
  }, [deleteInstallment, t, canEdit])

  const handleAddCharge = useCallback(() => {
    if (!canEdit) return
    if (!id || !chargeForm.label.trim() || !chargeForm.amount) return
    const nextOrder = (contract?.installments?.length || 0) + 1
    const validShares = revenueShareRows.filter(r => r.name.trim() && Number(r.amount) > 0)
    createInstallments.mutate({
      contractId: id,
      items: [{
        installmentOrder: nextOrder,
        label: chargeForm.label.trim(),
        amount: Number(chargeForm.amount),
        dueDate: chargeForm.dueDate || undefined,
        currency: contract?.currency || 'KRW',
        category: 'extra',
      }],
    }, {
      onSuccess: (data) => {
        // Create revenue shares if any were added
        if (validShares.length > 0 && data && data.length > 0) {
          const newInstId = (data[0] as Record<string, unknown>).id as string
          createRevenueShares.mutate({
            installmentId: newInstId,
            shares: validShares.map(r => ({
              recipientName: r.name.trim(),
              amount: Number(r.amount),
              role: r.role.trim() || undefined,
            })),
          })
        }
        setAddChargeDialogOpen(false)
        setChargeForm({ label: '', amount: '', dueDate: '', notes: '' })
        setRevenueShareRows([])
      },
    })
  }, [id, chargeForm, revenueShareRows, contract, createInstallments, createRevenueShares, canEdit])

  const handleAddBase = useCallback(() => {
    if (!canEdit) return
    if (!id || !baseForm.label.trim() || !baseForm.amount || Number(baseForm.amount) <= 0) return
    const baseCount = (contract?.installments || []).filter(i => i.category !== 'extra').length
    createInstallments.mutate({
      contractId: id,
      items: [{
        installmentOrder: baseCount + 1,
        label: baseForm.label.trim(),
        amount: Number(baseForm.amount),
        dueDate: baseForm.dueDate || undefined,
        currency: contract?.currency || 'KRW',
        category: 'base',
      }],
    }, {
      onSuccess: () => {
        setAddBaseDialogOpen(false)
        setBaseForm({ label: '', amount: '', dueDate: '' })
      },
    })
  }, [id, baseForm, contract, createInstallments, canEdit])

  const openEditInstDialog = useCallback((inst: PaymentInstallment) => {
    if (!canEdit) return
    const hasPaid = inst.status === 'paid' || inst.status === 'partial'
    setEditInstForm({
      id: inst.id,
      label: inst.label,
      amount: String(inst.amount),
      dueDate: inst.dueDate || '',
      paidDate: inst.paidDate || '',
      paidAmount: inst.paidAmount > 0 ? String(inst.paidAmount) : '',
      paymentMethod: inst.paymentMethod || '',
      notes: inst.notes || '',
      isPaid: hasPaid,
    })
    setEditInstDialogOpen(true)
  }, [canEdit])

  const handleEditInstallment = useCallback(() => {
    if (!canEdit) return
    if (!editInstForm.id || !editInstForm.label.trim() || !editInstForm.amount) return
    const payload: Parameters<typeof updateInstallment.mutate>[0] = {
      id: editInstForm.id,
      label: editInstForm.label.trim(),
      amount: Number(editInstForm.amount),
      dueDate: editInstForm.dueDate || '',
      notes: editInstForm.notes,
    }
    // If paid fields are present, update them too
    if (editInstForm.isPaid) {
      payload.paidDate = editInstForm.paidDate || ''
      payload.paidAmount = Number(editInstForm.paidAmount) || 0
      if (editInstForm.paymentMethod) payload.paymentMethod = editInstForm.paymentMethod
    }
    updateInstallment.mutate(payload, {
      onSuccess: () => {
        setEditInstDialogOpen(false)
      },
    })
  }, [editInstForm, updateInstallment, canEdit])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-destructive text-sm">{t('contracts.contractNotFound')}</p>
        <Button variant="outline" onClick={() => navigate('/consulting/clients')}>
          <ArrowLeft className="size-4 mr-2" /> {t('contracts.backToList')}
        </Button>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active
  const isCancelled = contract.status === 'cancelled'
  const installments = contract.installments || []
  const baseInstallments = installments.filter(i => i.category !== 'extra')
  const extraInstallments = installments.filter(i => i.category === 'extra')
  const basePaid = baseInstallments.reduce((s, i) => s + i.paidAmount, 0)
  const extraTotal = extraInstallments.reduce((s, i) => s + i.amount, 0)
  const extraPaid = extraInstallments.reduce((s, i) => s + i.paidAmount, 0)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/consulting/clients')}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{contract.contractorName}</h1>
            <Badge variant="outline" className={statusCfg.className}>
              {statusCfg.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {contract.studentName} | {contract.schoolName} {contract.gradeAtContract || ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="size-3.5" /> {t('common.edit')}
            </Button>
          )}
          {canEdit && !isCancelled && contract.status !== 'terminated' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={() => {
                if (window.confirm(`'${contract.contractorName}' 계약을 서비스 중도해지 처리할까요?`)) {
                  updateContract.mutate({ id: contract.id, status: 'terminated' }, {
                    onError: (e: unknown) => {
                      const err = e as { message?: string }
                      alert(`중도해지 처리에 실패했습니다.\n${err?.message || ''}`)
                    },
                  })
                }
              }}
            >
              <Ban className="size-3.5" /> {t('contracts.terminated')}
            </Button>
          )}
          {canEdit && !isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setCancelDialogOpen(true)}
            >
              <Ban className="size-3.5" /> {t('contracts.cancelContract')}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="size-3.5" /> {t('contracts.deleteContract')}
            </Button>
          )}
        </div>
      </div>

      {/* Payment Progress */}
      <Card>
        <CardContent className="py-5">
          {/* Base contract amounts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.totalContractAmount')}</div>
              <div className="text-xl font-bold font-mono whitespace-nowrap">
                {formatCurrency(contract.totalAmount, contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.collectionComplete')}</div>
              <div className="text-xl font-bold font-mono text-emerald-600 whitespace-nowrap">
                {formatCurrency(basePaid, contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.outstanding')}</div>
              <div className={`text-xl font-bold font-mono whitespace-nowrap ${(contract.totalAmount - basePaid) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {formatCurrency(Math.max(0, contract.totalAmount - basePaid), contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.collectionRate')}</div>
              <div className="text-xl font-bold">
                {contract.totalAmount > 0 ? Math.round((basePaid / contract.totalAmount) * 100) : 0}%
              </div>
              <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${contract.totalAmount > 0 ? Math.min(100, Math.round((basePaid / contract.totalAmount) * 100)) : 0}%` }}
                />
              </div>
            </div>
          </div>
          {/* 환불 기록 (계약 취소 시) */}
          {contract.refundAmount != null && contract.refundAmount > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-amber-200 flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">환불</Badge>
              <span className="font-mono font-bold text-amber-700">{formatCurrency(contract.refundAmount, contract.currency)}</span>
              {contract.refundDate && <span className="text-xs text-muted-foreground">· {contract.refundDate} 환불</span>}
              <span className="text-xs text-muted-foreground">· 실수령(수금−환불) {formatCurrency(Math.max(0, basePaid - contract.refundAmount), contract.currency)}</span>
            </div>
          )}
          {/* Extra charges summary (only show if there are extra charges) */}
          {extraInstallments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('contracts.extraChargesTotal')}</div>
                  <div className="text-lg font-bold font-mono text-violet-700">
                    {formatCurrency(extraTotal, contract.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('contracts.extraChargesPaid')}</div>
                  <div className="text-lg font-bold font-mono text-emerald-600">
                    {formatCurrency(extraPaid, contract.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('contracts.extraChargesOutstanding')}</div>
                  <div className={`text-lg font-bold font-mono ${(extraTotal - extraPaid) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {formatCurrency(Math.max(0, extraTotal - extraPaid), contract.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t('contracts.extraChargesRate')}</div>
                  <div className="text-lg font-bold">
                    {extraTotal > 0 ? Math.round((extraPaid / extraTotal) * 100) : 0}%
                  </div>
                  <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${extraTotal > 0 ? Math.min(100, Math.round((extraPaid / extraTotal) * 100)) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 계약 정보: 계약유형 · 원서지원수 · 계약서 PDF (Student360에 자동 연동) */}
      <ContractInfoCard contract={contract} canEdit={canEdit} />

      {/* Base Installment Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="size-5" />
            {t('contracts.baseInstallments')} ({baseInstallments.length})
          </h2>
          {canEdit && !isCancelled && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setBaseForm({ label: '', amount: '', dueDate: '' })
                setAddBaseDialogOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {t('contracts.addInstallment')}
            </Button>
          )}
        </div>
        {baseInstallments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              {t('contracts.noInstallments')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {baseInstallments.map((inst) => (
              <InstallmentCard
                key={inst.id}
                installment={inst}
                currency={contract.currency}
                canEdit={canEdit}
                onMarkPaid={openPayDialog}
                onRevertPaid={handleRevertPaid}
                onEdit={openEditInstDialog}
                onDelete={handleDeleteInstallment}
                contributors={incentiveContributorNames}
                studentName={contract.studentName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Extra Charges */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="size-5 text-violet-600" />
            <span>{t('contracts.extraCharges')}</span>
            {extraInstallments.length > 0 && (
              <Badge variant="outline" className="text-violet-600 border-violet-200 bg-violet-50">
                {extraInstallments.length}
              </Badge>
            )}
          </h2>
          {canEdit && !isCancelled && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
              onClick={() => {
                setChargeForm({ label: '', amount: '', dueDate: '', notes: '' })
                setRevenueShareRows([])
                setAddChargeDialogOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {t('contracts.addCharge')}
            </Button>
          )}
        </div>
        {extraInstallments.length === 0 ? (
          <Card className="border-dashed border-violet-200">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {t('contracts.noExtraCharges')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {extraInstallments.map((inst) => (
              <InstallmentCard
                key={inst.id}
                installment={inst}
                currency={contract.currency}
                canEdit={canEdit}
                onMarkPaid={openPayDialog}
                onRevertPaid={handleRevertPaid}
                onEdit={openEditInstDialog}
                onDelete={handleDeleteInstallment}
                revenueShares={revenueShares.filter(s => s.installmentId === inst.id)}
                onToggleSharePaid={(shareId, isPaid) => {
                  updateRevenueShare.mutate({
                    id: shareId,
                    isPaid,
                    paidDate: isPaid ? new Date().toISOString().slice(0, 10) : undefined,
                  })
                }}
                onDeleteShare={(shareId) => deleteRevenueShare.mutate(shareId)}
                contributors={incentiveContributorNames}
                studentName={contract.studentName}
              />
            ))}
          </div>
        )}
      </div>

      {/* 외부서비스(EC) · Student360 연동 (조회 전용) */}
      {ecActivities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Star className="size-5 text-blue-500" />
              외부서비스 (EC)
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">{ecActivities.length}</Badge>
            </h2>
            <span className="text-[11px] text-muted-foreground">Student360 연동 · 조회 전용 (수금·인센티브는 서비스입금관리에서 관리 — 계약 총액에 미반영)</span>
          </div>
          <div className="space-y-2">
            {ecActivities.map(ec => (
              <Card key={ec.id} className="border-blue-100 bg-blue-50/30">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-100 text-xs">{ec.partner || 'EC'}</Badge>
                      {ec.program && <span className="text-sm">{ec.program}</span>}
                      <Badge className={ec.collectionStatus === 'paid' ? 'bg-green-100 text-green-700 text-[10px] h-4' : 'bg-amber-100 text-amber-700 text-[10px] h-4'}>
                        {ec.collectionStatus === 'paid' ? t('contracts.status.fullyPaid') : t('incentive.unpaid')}
                      </Badge>
                    </div>
                    <span className="font-mono font-semibold text-sm">{formatCurrency(ec.billedAmount || 0, (ec.currency as 'KRW' | 'USD') || 'KRW')}</span>
                  </div>
                  {(ec.periodStart || ec.paidDate) && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {ec.periodStart || ''}{ec.periodEnd ? ` ~ ${ec.periodEnd}` : ''}{ec.paidDate ? ` · 납입 ${ec.paidDate}` : ''}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Incentive Settings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="size-5 text-orange-500" />
            {t('incentive.assign')}
            {contractIncentives.length > 0 && (
              <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                {contractIncentives.length}
              </Badge>
            )}
          </h2>
          {canEdit && incentiveContributorNames.length > 0 && (
            <Button size="sm" variant="outline" className={`gap-1.5 ${clawOpen ? 'text-muted-foreground' : 'text-rose-700 border-rose-200 hover:bg-rose-50'}`}
              onClick={() => { if (!clawOpen) { setClawMonth(nextMonthKey(todayLocalISO())); setClawAmts({}); setClawReason('') } setClawOpen((v) => !v) }}>
              <DollarSign className="size-3.5" /> {clawOpen ? '닫기' : '환급금 신청'}
            </Button>
          )}
        </div>

        {/* 환급금 신청 — 담당자별 인라인 입력 */}
        {clawOpen && incentiveContributorNames.length > 0 && (
          <Card className="mb-3 border-rose-200 bg-rose-50/40">
            <CardContent className="py-4 space-y-3">
              <div className="text-sm font-semibold text-rose-700">환급금 신청 (세일즈 인센티브 회수)</div>
              <p className="text-xs text-muted-foreground">환불로 회수할 금액을 <b>담당자별로</b> 입력하세요. 신청 시 담당자 알림 + 인보이스·지급원장에 (−) 반영, 급여 지급 후 아래에서 <b>환급완료</b>로 바꾸면 됩니다.</p>
              <div className="space-y-2">
                {incentiveContributorNames.map((n) => (
                  <div key={n} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2">
                    <span className="text-sm font-medium w-28 truncate" title={n}>{n}</span>
                    <span className="text-xs text-muted-foreground">환급액</span>
                    <Input type="number" min={0} value={clawAmts[n] || ''} onChange={(e) => setClawAmts((m) => ({ ...m, [n]: e.target.value }))} placeholder="0" className="h-9 text-sm flex-1" />
                    <span className="text-xs text-muted-foreground">원</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">반영월(급여 차감월)</Label>
                  <Input type="month" value={clawMonth} onChange={(e) => setClawMonth(e.target.value)} className="h-9 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs">사유 (차등 근거)</Label>
                  <Input value={clawReason} onChange={(e) => setClawReason(e.target.value)} placeholder="예: 5주차 중단 → 7주분 환불" className="h-9 text-sm mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setClawOpen(false)}>취소</Button>
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={submitClawbacks}
                  disabled={createClawbacks.isPending || !incentiveContributorNames.some((n) => Number(clawAmts[n]) > 0)}>
                  환급 신청 저장 · 알림
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 환급 현황 — 신청된 건: 환급신청/환급완료 드롭다운(계약 환불 프로세스와 동일) */}
        {contractClawbacks.length > 0 && (
          <Card className="mb-3">
            <CardContent className="py-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">인센티브 환급 현황</div>
              {contractClawbacks.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={c.status === 'deducted' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}>
                      {c.status === 'deducted' ? '환급완료' : '환급신청'}
                    </Badge>
                    <span className="text-sm font-medium">{c.contributorName}</span>
                    <span className="text-sm font-mono font-semibold text-rose-600">−{formatCurrency(c.amount, 'KRW')}</span>
                    <span className="text-xs text-muted-foreground">· 반영월 {c.deductMonth}{c.reason ? ` · ${c.reason}` : ''}</span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={c.status}
                        onChange={(e) => setClawbackStatus.mutate({ id: c.id, status: e.target.value as 'pending' | 'deducted' })}
                        disabled={setClawbackStatus.isPending}
                        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="pending">환급신청</option>
                        <option value="deducted">환급완료</option>
                      </select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => { if (confirm('이 환급 건을 삭제할까요? (인보이스·지급원장 (−)반영도 사라집니다)')) deleteClawback.mutate(c.id) }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* ── Base contract incentives ── */}
            {(() => {
              const baseIncentives = contractIncentives.filter(inc => !inc.installmentId)
              return baseIncentives.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('incentive.baseContract')}</div>
                  {baseIncentives.map((inc) => {
                    const typeCfg = INCENTIVE_TYPES[inc.incentiveType]
                    return (
                      <div key={inc.id} className="p-3 rounded-lg bg-orange-50/50 border border-orange-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-orange-700 border-orange-200 bg-orange-100 text-xs">
                              {t(typeCfg.labelKey)}
                            </Badge>
                            <span className="text-sm font-medium">{inc.displayName}</span>
                            <span className="text-xs text-muted-foreground">
                              기본 {inc.percentage}%
                              {inc.installmentOverrides && Object.keys(inc.installmentOverrides).length > 0 && (
                                <span className="ml-1 text-orange-600">· 회차별 조정</span>
                              )}
                            </span>
                          </div>
                          {canEdit && !isCancelled && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500"
                              onClick={() => { if (!canEdit) return; if (confirm(t('incentive.deleteConfirm'))) deleteIncentive.mutate(inc.id) }}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                        {baseInstallments.length > 0 && (
                          <div className="space-y-1.5">
                            {baseInstallments.map((inst) => {
                              const isPaid = inst.paidAmount > 0
                              const amountExVat = Math.round(inst.paidAmount / 1.1)
                              // 회차별 요율: 오버라이드 있으면 그 값, 없으면 기본 %
                              const rowPct = inc.installmentOverrides?.[inst.id] ?? inc.percentage
                              const overridden = inc.installmentOverrides?.[inst.id] != null
                              const instInc = isPaid ? Math.round(amountExVat * rowPct / 100) : 0
                              const rateControl = (canEdit && !isCancelled) ? (
                                <Select value={String(rowPct)} onValueChange={(v) => saveIncentiveRate(inc, inst.id, Number(v))}>
                                  <SelectTrigger className={`h-6 w-[70px] text-xs ${overridden ? 'border-orange-300 text-orange-700 font-semibold' : ''}`}>
                                    <span>{rowPct}%</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {INCENTIVE_RATE_STEPS.map((r) => (
                                      <SelectItem key={r} value={String(r)}>{r}%{r === inc.percentage ? ' (기본)' : ''}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className={`text-xs ${overridden ? 'text-orange-700 font-semibold' : 'text-muted-foreground'}`}>{rowPct}%</span>
                              )
                              return (
                                <div key={inst.id} className={`flex items-center justify-between px-3 py-1.5 rounded text-sm ${isPaid ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`font-medium ${isPaid ? 'text-green-800' : 'text-gray-400'}`}>{inst.label}</span>
                                    {isPaid && <span className="text-xs text-green-600">({formatCurrency(amountExVat)} ×</span>}
                                    {rateControl}
                                    {isPaid && <span className="text-xs text-green-600">)</span>}
                                  </div>
                                  <span className={`font-mono font-semibold ${isPaid ? 'text-green-700' : 'text-gray-400'}`}>
                                    {isPaid ? formatCurrency(instInc) : t('incentive.unpaid')}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t('incentive.noIncentives')}</p>
              )
            })()}

            {/* Add base incentive form */}
            {canEdit && !isCancelled && (
              <div className="flex items-end gap-2 pt-2 border-t flex-wrap">
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-xs text-muted-foreground">{t('incentive.selectPerson')}</label>
                  <IncentivePersonSelect
                    profiles={allProfiles}
                    recipients={incentiveRecipients}
                    value={incentiveForm.profileId}
                    customName={incentiveForm.customName}
                    onChange={(profileId, customName) => setIncentiveForm(f => ({ ...f, profileId, customName }))}
                    onAddRecipient={(name) => createRecipient.mutate(name)}
                    placeholder={t('incentive.selectPerson')}
                    addNewLabel={t('incentive.addNewPerson')}
                  />
                </div>
                <div className="flex-1 min-w-[140px] space-y-1">
                  <label className="text-xs text-muted-foreground">{t('incentive.selectType')}</label>
                  <Select key={incentiveFormKey} value={incentiveForm.incentiveType || undefined} onValueChange={(v) => setIncentiveForm(f => ({ ...f, incentiveType: v || '' }))}>
                    <SelectTrigger className="h-9">
                      <span>
                        {incentiveForm.incentiveType && INCENTIVE_TYPES[incentiveForm.incentiveType as IncentiveType]
                          ? `${t(INCENTIVE_TYPES[incentiveForm.incentiveType as IncentiveType].labelKey)} (${INCENTIVE_TYPES[incentiveForm.incentiveType as IncentiveType].defaultPct}%)`
                          : t('incentive.selectType')}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px]">
                      {(Object.entries(INCENTIVE_TYPES) as [IncentiveType, typeof INCENTIVE_TYPES[IncentiveType]][]).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{t(cfg.labelKey)} ({cfg.defaultPct}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="h-9 gap-1"
                  disabled={(!incentiveForm.profileId && !incentiveForm.customName.trim()) || !incentiveForm.incentiveType || createIncentive.isPending}
                  onClick={() => {
                    if (!id || !incentiveForm.incentiveType) return
                    if (!incentiveForm.profileId && !incentiveForm.customName.trim()) return
                    const typKey = incentiveForm.incentiveType as IncentiveType
                    createIncentive.mutate({
                      contract_id: id,
                      profile_id: incentiveForm.profileId || null,
                      custom_name: incentiveForm.customName.trim() || null,
                      incentive_type: typKey,
                      percentage: INCENTIVE_TYPES[typKey].defaultPct,
                    }, {
                      onSuccess: () => {
                        setIncentiveForm({ profileId: '', customName: '', incentiveType: '' })
                        setIncentiveFormKey(k => k + 1)
                      },
                      onError: (err) => {
                        const e = err as { message?: string; details?: string; hint?: string; code?: string }
                        const msg = e?.message || e?.details || t('contractDetail.unknownError')
                        window.alert(`${t('contractDetail.incentiveAddFailed')}: ${msg}${e?.hint ? `\n${e.hint}` : ''}${e?.code ? `\n(${e.code})` : ''}`)
                      },
                    })
                  }}
                >
                  {createIncentive.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  {t('incentive.addIncentive')}
                </Button>
              </div>
            )}

            {/* 추가입금(추가비용) 인센티브는 외부서비스 인센티브 이중계산 방지를 위해 제거됨.
                외부서비스(EC) 인센티브는 Student360 EC / 서비스입금관리에서 자동 계산·관리합니다. */}
          </CardContent>
        </Card>
      </div>

      {/* Contract Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="size-4" />
            {t('contracts.contractDetail')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.contact')}</span>
              <span className="font-medium">{contract.phone ? formatPhone(contract.phone) : '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <School className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.school')}</span>
              <span className="font-medium">{contract.schoolName} {contract.gradeAtContract || ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.address')}</span>
              <span className="font-medium">{contract.address || '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.contractDate')}</span>
              <span className="font-mono">{contract.contractDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.expiryDate')}</span>
              <span className="font-mono">{contract.expiryDate}</span>
            </div>
            {(contract.serviceStartDate || contract.serviceEndDate) && (
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground w-24">{t('contracts.servicePeriod')}</span>
                <span className="font-mono">
                  {contract.serviceStartDate || '?'} ~ {contract.serviceEndDate || '?'}
                </span>
              </div>
            )}
            {contract.applicationCount && (
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground w-24">{t('contracts.applicationCount')}</span>
                <span className="font-medium">{contract.applicationCount}{t('contractDetail.countUnit')}</span>
              </div>
            )}
            {contract.additionalServices && (
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground w-24">{t('contracts.additionalServices')}</span>
                <span className="font-medium">{contract.additionalServices}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <DollarSign className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground w-16">{t('contracts.depositAccount')}</span>
              <span className="font-medium">{contract.paymentAccount === 'US' ? t('contracts.usAccount') : t('contracts.krAccount')}</span>
            </div>
          </div>
          {contract.notes && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
              <span className="text-xs text-muted-foreground">{t('contracts.memo')}</span>
              <p className="mt-1">{contract.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Customer Journey (unified timeline) ────────────────────────── */}
      {(() => {
        // Build unified timeline from all sources
        type TimelineItem = { id: string; date: string; phase: 'lead' | 'sales' | 'service'; badge: string; badgeColor: string; title: string; desc?: string; person?: string; link?: string }
        const items: TimelineItem[] = []

        // 1) Lead info summary as first event
        if (linkedLead) {
          items.push({
            id: 'lead-start',
            date: linkedLead.leadDate || '',
            phase: 'lead',
            badge: t('contracts.leadSourceChannel'),
            badgeColor: 'bg-violet-100 text-violet-700',
            title: `${linkedLead.sourceChannel || t('contractDetail.inflow')} → ${linkedLead.interestArea || t('contractDetail.interestNotEntered')}`,
            desc: linkedLead.memo || undefined,
            person: linkedLead.assignedUser,
            link: contract.leadId ? `/sales/leads/${contract.leadId}` : undefined,
          })
        }

        // 2) Lead activities (calls, notes, consultations, stage changes)
        for (const act of leadActivities) {
          const typeLabels: Record<string, string> = {
            note: t('contractDetail.activityNote'), call: t('contractDetail.activityCall'), katalk: t('contractDetail.activityKatalk'), email: t('contractDetail.activityEmail'),
            meeting: t('contractDetail.activityMeeting'), consultation: t('contractDetail.activityConsultation'), stage_change: t('contractDetail.activityStageChange'),
            assignment_change: t('contractDetail.activityAssignmentChange'), system: t('contractDetail.activitySystem'),
          }
          const typeColors: Record<string, string> = {
            call: 'bg-orange-100 text-orange-700', consultation: 'bg-green-100 text-green-700',
            stage_change: 'bg-blue-100 text-blue-700', katalk: 'bg-yellow-100 text-yellow-700',
          }
          items.push({
            id: `act-${act.id as string}`,
            date: act.created_at as string,
            phase: 'lead',
            badge: typeLabels[act.activity_type as string] || (act.activity_type as string),
            badgeColor: typeColors[act.activity_type as string] || 'bg-gray-100 text-gray-600',
            title: act.title as string,
            desc: typeof act.content === 'string' ? act.content : undefined,
            person: act.profiles?.name,
            link: contract.leadId ? `/sales/leads/${contract.leadId}` : undefined,
          })
        }

        // 3) Sales meetings
        for (const m of salesMeetings) {
          items.push({
            id: `smtg-${m.id as string}`,
            date: (m.meeting_date as string) || (m.created_at as string),
            phase: 'sales',
            badge: `${m.meeting_number || ''}${t('contractDetail.nthConsultation')}`,
            badgeColor: 'bg-green-100 text-green-700',
            title: `${m.parent_name}${m.student_name ? ` / ${m.student_name}` : ''} ${t('contractDetail.consultation')}`,
            desc: typeof m.memo === 'string' ? m.memo : undefined,
            person: m.profiles?.name,
            link: '/sales/meetings',
          })
        }

        // 4) Contract event itself
        items.push({
          id: `contract-${contract.id}`,
          date: contract.contractDate,
          phase: 'sales',
          badge: t('contractDetail.contractSigned'),
          badgeColor: 'bg-emerald-100 text-emerald-700',
          title: `${contract.contractorName} / ${contract.studentName} ${t('contractDetail.contract')}`,
          desc: contract.totalAmount > 0 ? formatCurrency(contract.totalAmount, contract.currency) : undefined,
        })

        // 5) Service student meetings (post-contract)
        const svcMeetings = serviceData?.meetings || []
        for (const sm of svcMeetings) {
          const consultant = CONSULTANTS[sm.consultant_id as string] || (sm.consultant_id as string) || ''
          const reportBadge = sm.report_status === 'submitted' ? ` ${t('contractDetail.reportSubmitted')}` : sm.report_status === 'pending' ? ` ${t('contractDetail.reportPending')}` : ''
          items.push({
            id: `svc-${sm.id as string}`,
            date: (sm.meeting_date as string) || (sm.created_at as string),
            phase: 'service',
            badge: `${(sm.meeting_type as string) || t('contractDetail.meetingDefault')}${reportBadge}`,
            badgeColor: 'bg-blue-100 text-blue-700',
            title: `${contract.studentName} ${t('contractDetail.serviceMeeting')}`,
            desc: typeof sm.summary === 'string' ? sm.summary : undefined,
            person: consultant,
            link: serviceData?.student ? `/service/student-360?student=${serviceData.student.id}` : undefined,
          })
        }

        // Sort by date ascending (chronological journey)
        items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        const hasAnyData = items.length > 1 // more than just the contract event itself

        if (!hasAnyData && !linkedLead) return null

        const phaseColors = { lead: 'border-l-violet-400', sales: 'border-l-green-400', service: 'border-l-blue-400' }
        const phaseLabels = { lead: t('contractDetail.phaseLead'), sales: t('contractDetail.phaseSales'), service: t('contractDetail.phaseService') }

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4" />
                {t('contracts.customerJourney')}
                <span className="text-muted-foreground font-normal text-xs ml-1">
                  ({items.length}{t('contractDetail.itemsCount')})
                </span>
                {linkedLead && (
                  <Link
                    to={`/sales/leads/${contract.leadId}`}
                    className="ml-auto text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 font-normal"
                  >
                    {t('contracts.viewLeadDetail')} <ExternalLink className="size-3" />
                  </Link>
                )}
                {serviceData?.student && (
                  <Link
                    to={`/service/student-360?student=${serviceData.student.id}`}
                    className={`text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 font-normal ${linkedLead ? '' : 'ml-auto'}`}
                  >
                    Student 360 <ExternalLink className="size-3" />
                  </Link>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Lead summary row */}
              {linkedLead && (
                <div className="grid grid-cols-4 gap-3 text-xs mb-4 p-3 bg-muted/50 rounded-lg">
                  <div><span className="text-muted-foreground">{t('contracts.leadSourceChannel')}</span><p className="font-medium mt-0.5">{linkedLead.sourceChannel || '-'}</p></div>
                  <div><span className="text-muted-foreground">{t('contracts.leadInterestArea')}</span><p className="font-medium mt-0.5">{linkedLead.interestArea || '-'}</p></div>
                  <div><span className="text-muted-foreground">{t('contracts.leadRegion')}</span><p className="font-medium mt-0.5">{linkedLead.region || '-'}</p></div>
                  <div><span className="text-muted-foreground">{t('contracts.leadAssignedTo')}</span><p className="font-medium mt-0.5">{linkedLead.assignedUser || '-'}</p></div>
                </div>
              )}

              {/* Phase legend */}
              <div className="flex gap-4 mb-3 text-[10px]">
                {(['lead', 'sales', 'service'] as const).map(p => {
                  const count = items.filter(i => i.phase === p).length
                  if (count === 0) return null
                  return (
                    <span key={p} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${p === 'lead' ? 'bg-violet-400' : p === 'sales' ? 'bg-green-400' : 'bg-blue-400'}`} />
                      {phaseLabels[p]} ({count})
                    </span>
                  )
                })}
              </div>

              {/* Timeline */}
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 text-xs border-l-2 pl-3 py-1.5 ${phaseColors[item.phase]} ${item.link ? 'cursor-pointer hover:bg-muted/50 rounded-r transition-colors' : ''}`}
                    onClick={item.link ? () => navigate(item.link!) : undefined}
                  >
                    <div className="text-muted-foreground shrink-0 w-[82px] font-mono whitespace-nowrap">
                      {item.date?.slice(0, 10) || '—'}
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${item.link ? 'text-blue-600 hover:underline' : ''}`}>{item.title}</span>
                      {item.desc && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.desc}</p>
                      )}
                    </div>
                    {item.person && (
                      <span className="text-muted-foreground shrink-0 whitespace-nowrap">{item.person}</span>
                    )}
                    {item.link && (
                      <ExternalLink className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.cancelContract')}</DialogTitle>
            <DialogDescription>
              {t('contracts.cancelConfirm').replace('{contractor}', contract.contractorName).replace('{student}', contract.studentName)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t('contracts.cancelReasonLabel')}</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('contracts.cancelReasonPlaceholder')}
                rows={3}
                className="resize-none"
              />
            </div>
            {/* 환불 기록 */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t">
              <div className="space-y-1">
                <Label className="text-xs">환불액 (선택)</Label>
                <Input type="number" min={0} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="예: 5000000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">환불일</Label>
                <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} disabled={!refundAmount} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">환불액을 입력하면 계약에 환불 기록으로 저장되고, 같은 이름의 Student360 학생 상태도 "서비스 취소"로 함께 반영됩니다.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              {t('contracts.close')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelContract.isPending}
            >
              {cancelContract.isPending ? t('contracts.processing') : t('contracts.cancelContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Contract Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.deleteContract')}</DialogTitle>
            <DialogDescription>
              {t('contracts.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {contract.contractorName} / {contract.studentName} — {formatCurrency(contract.totalAmount, contract.currency)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteContract.mutate(contract.id, {
                  onSuccess: () => navigate('/consulting/clients'),
                })
              }}
              disabled={deleteContract.isPending}
            >
              {deleteContract.isPending ? t('contracts.processing') : t('contracts.deleteContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.markPaid')}</DialogTitle>
            <DialogDescription>
              {selectedInstallment?.label} — {selectedInstallment ? formatCurrency(selectedInstallment.amount, contract.currency) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contracts.paymentAmount')}</Label>
              <Input
                type="number"
                value={payForm.paidAmount}
                onChange={(e) => setPayForm(f => ({ ...f, paidAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.actualPaidDate')}</Label>
              <Input
                type="date"
                value={payForm.paidDate}
                onChange={(e) => setPayForm(f => ({ ...f, paidDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.paymentMethod')}</Label>
              <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm(f => ({ ...f, paymentMethod: v || 'bank_transfer' }))}>
                <SelectTrigger>
                  <SelectValue>{pmLabel(payForm.paymentMethod)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t('contracts.paymentBankTransfer')}</SelectItem>
                  <SelectItem value="card">{t('contracts.paymentCard')}</SelectItem>
                  <SelectItem value="us_wire">{t('contracts.paymentUsWire')}</SelectItem>
                  <SelectItem value="us_wire_us">{t('contracts.paymentUsWireUs')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.memoOptional')}</Label>
              <Input
                value={payForm.notes}
                onChange={(e) => setPayForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('contracts.memoPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleMarkPaid}
              disabled={updateInstallment.isPending || !payForm.paidAmount || Number(payForm.paidAmount) <= 0}
            >
              {updateInstallment.isPending ? t('contracts.processing') : t('contracts.confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Base Installment Dialog */}
      <Dialog open={addBaseDialogOpen} onOpenChange={setAddBaseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('contracts.addInstallment')}</DialogTitle>
            <DialogDescription>
              {t('contracts.addInstallmentDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('contracts.installmentLabel')}</Label>
              <Input
                value={baseForm.label}
                onChange={(e) => setBaseForm(f => ({ ...f, label: e.target.value }))}
                placeholder={t('contractDetail.installmentPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.amount')}</Label>
              <Input
                type="number"
                value={baseForm.amount}
                onChange={(e) => setBaseForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.dueDate')}</Label>
              <Input
                type="date"
                value={baseForm.dueDate}
                onChange={(e) => setBaseForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBaseDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddBase}
              disabled={!baseForm.label.trim() || !baseForm.amount || Number(baseForm.amount) <= 0 || createInstallments.isPending}
            >
              {createInstallments.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Extra Charge Dialog */}
      <Dialog open={addChargeDialogOpen} onOpenChange={setAddChargeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contracts.addCharge')}</DialogTitle>
            <DialogDescription>
              {t('contracts.addChargeDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Quick preset buttons */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('contracts.quickPresets')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'contractDetail.presetCompetitionFee' },
                  { key: 'contractDetail.presetResearchPaper' },
                  { key: 'contractDetail.presetInternship' },
                  { key: 'contractDetail.presetECActivity' },
                  { key: 'contractDetail.presetCapstone' },
                  { key: 'contractDetail.presetEssayEditing' },
                ].map((preset) => {
                  const label = t(preset.key)
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        chargeForm.label === label
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                      onClick={() => setChargeForm(f => ({ ...f, label }))}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('contracts.installmentLabel')} <span className="text-destructive">*</span></Label>
              <Input
                value={chargeForm.label}
                onChange={e => setChargeForm(f => ({ ...f, label: e.target.value }))}
                placeholder={t('contracts.chargeLabelPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.amount')} ({contract.currency}) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={chargeForm.amount}
                onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('contracts.scheduledDate')}</Label>
              <Input
                type="date"
                value={chargeForm.dueDate}
                onChange={e => setChargeForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>

            {/* 수익 배분(추가비용 인센티브)은 외부서비스 인센티브 이중계산 방지를 위해 제거됨.
                외부서비스 인센티브는 Student360 EC / 서비스입금관리에서 관리합니다. */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChargeDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddCharge}
              disabled={!chargeForm.label.trim() || !chargeForm.amount || Number(chargeForm.amount) <= 0 || createInstallments.isPending}
            >
              {createInstallments.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Installment Dialog */}
      <Dialog open={editInstDialogOpen} onOpenChange={setEditInstDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contracts.editInstallment')}</DialogTitle>
            <DialogDescription>
              {t('contracts.editInstallmentDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contracts.installmentLabel')} <span className="text-destructive">*</span></Label>
              <Input
                value={editInstForm.label}
                onChange={e => setEditInstForm(f => ({ ...f, label: e.target.value }))}
                placeholder={t('contractDetail.installmentPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('contracts.amount')} ({contract.currency}) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={editInstForm.amount}
                  onChange={e => setEditInstForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('contracts.scheduledDate')}</Label>
                <Input
                  type="date"
                  value={editInstForm.dueDate}
                  onChange={e => setEditInstForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            {editInstForm.isPaid && (
              <>
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-3">{t('contracts.paidInfo')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t('contracts.actualPaidDate')}</Label>
                    <Input
                      type="date"
                      value={editInstForm.paidDate}
                      onChange={e => setEditInstForm(f => ({ ...f, paidDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('contracts.paidAmount')}</Label>
                    <Input
                      type="number"
                      value={editInstForm.paidAmount}
                      onChange={e => setEditInstForm(f => ({ ...f, paidAmount: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('contracts.paymentMethod')}</Label>
                  <Select value={editInstForm.paymentMethod || 'bank_transfer'} onValueChange={v => setEditInstForm(f => ({ ...f, paymentMethod: v || '' }))}>
                    <SelectTrigger><SelectValue>{pmLabel(editInstForm.paymentMethod || 'bank_transfer')}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">{t('contracts.paymentBankTransfer')}</SelectItem>
                      <SelectItem value="card">{t('contracts.paymentCard')}</SelectItem>
                      <SelectItem value="us_wire">{t('contracts.paymentUsWire')}</SelectItem>
                      <SelectItem value="us_wire_us">{t('contracts.paymentUsWireUs')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>{t('common.notes')}</Label>
              <Input
                value={editInstForm.notes}
                onChange={e => setEditInstForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('contracts.memoPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInstDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEditInstallment}
              disabled={!editInstForm.label.trim() || !editInstForm.amount || Number(editInstForm.amount) <= 0 || updateInstallment.isPending}
            >
              {updateInstallment.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contract Dialog */}
      <ContractEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        contract={contract}
        onSave={(data) => {
          updateContract.mutate({ id: contract.id, ...data }, {
            onSuccess: () => setEditDialogOpen(false),
          })
        }}
        isPending={updateContract.isPending}
      />
    </div>
  )
}

// ─── Contract Edit Dialog ──────────────────────────────────────────────────

function ContractEditDialog({
  open,
  onOpenChange,
  contract,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  contract: Contract
  onSave: (data: {
    contractorName: string
    studentName: string
    schoolName: string
    gradeAtContract: string
    contractDate: string
    expiryDate: string
    serviceStartDate: string
    serviceEndDate: string
    applicationCount: number
    additionalServices: string
    address: string
    phone: string
    totalAmount: number
    currency: 'KRW' | 'USD'
    paymentAccount: 'KR' | 'US'
    notes: string
  }) => void
  isPending: boolean
}) {
  const t = useT()
  const buildForm = useCallback(() => ({
    contractorName: contract.contractorName || '',
    studentName: contract.studentName || '',
    schoolName: contract.schoolName || '',
    gradeAtContract: contract.gradeAtContract || '',
    contractDate: contract.contractDate || '',
    expiryDate: contract.expiryDate || '',
    serviceStartDate: contract.serviceStartDate || '',
    serviceEndDate: contract.serviceEndDate || '',
    applicationCount: contract.applicationCount ? String(contract.applicationCount) : '',
    additionalServices: contract.additionalServices || '',
    address: contract.address || '',
    phone: contract.phone || '',
    totalAmount: contract.totalAmount ? String(contract.totalAmount) : '',
    currency: (contract.currency || 'KRW') as 'KRW' | 'USD',
    paymentAccount: (contract.paymentAccount || 'KR') as 'KR' | 'US',
    notes: contract.notes || '',
  }), [contract])

  const [form, setForm] = useState(buildForm)

  // Reset form whenever dialog opens
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  /* eslint-enable react-hooks/exhaustive-deps */

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    onSave({
      contractorName: form.contractorName,
      studentName: form.studentName,
      schoolName: form.schoolName,
      gradeAtContract: form.gradeAtContract,
      contractDate: form.contractDate,
      expiryDate: form.expiryDate,
      serviceStartDate: form.serviceStartDate,
      serviceEndDate: form.serviceEndDate,
      applicationCount: Number(form.applicationCount) || 0,
      additionalServices: form.additionalServices,
      address: form.address,
      phone: form.phone,
      totalAmount: Number(form.totalAmount) || 0,
      currency: form.currency,
      paymentAccount: form.paymentAccount,
      notes: form.notes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('contracts.editContract')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.col.contractor')}</Label>
            <Input value={form.contractorName} onChange={e => set('contractorName', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.col.student')}</Label>
            <Input value={form.studentName} onChange={e => set('studentName', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.school')}</Label>
            <Input value={form.schoolName} onChange={e => set('schoolName', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('common.grade')}</Label>
            <Input value={form.gradeAtContract} onChange={e => set('gradeAtContract', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.contractDate')}</Label>
            <Input type="date" value={form.contractDate} onChange={e => set('contractDate', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.expiryDate')}</Label>
            <Input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.serviceStartDate')}</Label>
            <Input type="date" value={form.serviceStartDate} onChange={e => set('serviceStartDate', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.serviceEndDate')}</Label>
            <Input type="date" value={form.serviceEndDate} onChange={e => set('serviceEndDate', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.applicationCount')}</Label>
            <Input type="number" value={form.applicationCount} onChange={e => set('applicationCount', e.target.value)} placeholder={t('contractDetail.applicationCountPlaceholder')} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">{t('contracts.additionalServices')}</Label>
            <Input value={form.additionalServices} onChange={e => set('additionalServices', e.target.value)} placeholder={t('contractDetail.additionalServicesPlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.contact')}</Label>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.address')}</Label>
            <Input value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.totalContractAmount')}</Label>
            <Input type="number" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('contracts.currency')}</Label>
            <Select value={form.currency} onValueChange={v => set('currency', v || 'KRW')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KRW">{t('contractDetail.currencyKRW')}</SelectItem>
                <SelectItem value="USD">{t('contractDetail.currencyUSD')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">{t('contracts.depositAccount')}</Label>
            <Select value={form.paymentAccount} onValueChange={v => set('paymentAccount', v || 'KR')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KR">{t('contracts.krAccount')}</SelectItem>
                <SelectItem value="US">{t('contracts.usAccount')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">{t('contracts.memo')}</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={isPending || !form.contractorName || !form.studentName}>
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
