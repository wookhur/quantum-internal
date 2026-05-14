import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft, Loader2, Phone, MapPin, School, Calendar,
  DollarSign, CheckCircle2, AlertTriangle, Clock, Ban,
  UserCircle, CreditCard,
} from 'lucide-react'
import { useContract, useCancelContract } from '@/hooks/useContracts'
import { useUpdateInstallment } from '@/hooks/useInstallments'
import { formatCurrency, formatPhone } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import type { PaymentInstallment, ContractStatus } from '@/types'

function useStatusConfig() {
  const t = useT()
  const STATUS_CONFIG: Record<ContractStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    active: { label: t('contracts.active'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    expiring_soon: { label: t('contracts.expiringSoon'), className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: AlertTriangle },
    expired: { label: t('contracts.expired'), className: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
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

function InstallmentCard({
  installment,
  currency,
  onMarkPaid,
}: {
  installment: PaymentInstallment
  currency: 'KRW' | 'USD'
  onMarkPaid: (inst: PaymentInstallment) => void
}) {
  const t = useT()
  const INSTALLMENT_STATUS_CONFIG = useInstallmentStatusConfig()
  const config = INSTALLMENT_STATUS_CONFIG[installment.status] || INSTALLMENT_STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const isPaid = installment.status === 'paid'
  const isOverdue = installment.status === 'overdue'
  const remaining = installment.amount - installment.paidAmount

  return (
    <Card className={`${isOverdue ? 'border-red-200 bg-red-50/30' : ''} ${isPaid ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.className}`}>
              <StatusIcon className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{installment.label}</span>
                <Badge variant="outline" className={`text-[10px] h-4 ${config.className}`}>
                  {config.label}
                </Badge>
              </div>
              <div className="text-lg font-bold mt-0.5 font-mono">
                {formatCurrency(installment.amount, currency)}
              </div>
            </div>
          </div>

          {!isPaid && (
            <Button
              size="sm"
              variant={isOverdue ? 'destructive' : 'outline'}
              className="gap-1.5"
              onClick={() => onMarkPaid(installment)}
            >
              <CreditCard className="size-3.5" />
              {t('contracts.markPaid')}
            </Button>
          )}
        </div>

        {/* Payment details */}
        <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">{t('contracts.dueAmount')}</span>
            <p className="font-mono mt-0.5">{installment.dueDate || '-'}</p>
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
        {installment.paidDate && (
          <div className="mt-2 text-xs text-muted-foreground">
            {t('contracts.paidDateLabel').replace('{date}', installment.paidDate)}
            {installment.paymentMethod && ` | ${installment.paymentMethod === 'bank_transfer' ? t('contracts.paymentBankTransfer') : installment.paymentMethod === 'card' ? t('contracts.paymentCard') : t('contracts.paymentUsWire')}`}
          </div>
        )}
        {installment.notes && (
          <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
            {installment.notes}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const { data: contract, isLoading, error } = useContract(id)
  const cancelContract = useCancelContract()
  const updateInstallment = useUpdateInstallment()
  const STATUS_CONFIG = useStatusConfig()

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<PaymentInstallment | null>(null)
  const [payForm, setPayForm] = useState({
    paidAmount: '',
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'bank_transfer' as string,
    notes: '',
  })

  const handleCancel = useCallback(() => {
    if (!id) return
    cancelContract.mutate({ contractId: id, reason: cancelReason || undefined }, {
      onSuccess: () => {
        setCancelDialogOpen(false)
        setCancelReason('')
      },
    })
  }, [id, cancelReason, cancelContract])

  const openPayDialog = useCallback((inst: PaymentInstallment) => {
    setSelectedInstallment(inst)
    setPayForm({
      paidAmount: String(inst.amount - inst.paidAmount),
      paidDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'bank_transfer',
      notes: '',
    })
    setPayDialogOpen(true)
  }, [])

  const handleMarkPaid = useCallback(() => {
    if (!selectedInstallment) return
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
      },
    })
  }, [selectedInstallment, payForm, updateInstallment])

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
        {!isCancelled && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setCancelDialogOpen(true)}
          >
            <Ban className="size-3.5" /> {t('contracts.cancelContract')}
          </Button>
        )}
      </div>

      {/* Payment Progress */}
      <Card>
        <CardContent className="py-5">
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.totalContractAmount')}</div>
              <div className="text-xl font-bold font-mono">
                {formatCurrency(contract.totalAmount, contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.collectionComplete')}</div>
              <div className="text-xl font-bold font-mono text-emerald-600">
                {formatCurrency(contract.paidAmount || 0, contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.outstanding')}</div>
              <div className={`text-xl font-bold font-mono ${(contract.outstandingAmount || 0) > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {formatCurrency(contract.outstandingAmount || 0, contract.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('contracts.collectionRate')}</div>
              <div className="text-xl font-bold">
                {contract.paymentProgress || 0}%
              </div>
              <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${contract.paymentProgress || 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Installment Timeline */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="size-5" />
          {t('contracts.installmentCount').replace('{n}', String(installments.length))}
        </h2>
        {installments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground text-sm">
              {t('contracts.noInstallments')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {installments.map((inst) => (
              <InstallmentCard
                key={inst.id}
                installment={inst}
                currency={contract.currency}
                onMarkPaid={openPayDialog}
              />
            ))}
          </div>
        )}
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
              <Label>{t('contracts.paymentDate')}</Label>
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t('contracts.paymentBankTransfer')}</SelectItem>
                  <SelectItem value="card">{t('contracts.paymentCard')}</SelectItem>
                  <SelectItem value="us_wire">{t('contracts.paymentUsWire')}</SelectItem>
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
    </div>
  )
}
