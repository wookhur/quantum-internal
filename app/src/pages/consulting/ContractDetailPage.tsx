import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  UserCircle, CreditCard, ExternalLink, Pencil, Trash2, Plus,
} from 'lucide-react'
import { useContract, useCancelContract, useUpdateContract, useDeleteContract } from '@/hooks/useContracts'
import { useUpdateInstallment, useCreateInstallments, useDeleteInstallment } from '@/hooks/useInstallments'
import { formatCurrency, formatPhone } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import { supabase } from '@/lib/supabase'
import type { Contract, PaymentInstallment, ContractStatus } from '@/types'

function usePaymentMethodLabel() {
  const t = useT()
  return (method: string) => {
    if (method === 'bank_transfer') return t('contracts.paymentBankTransfer')
    if (method === 'card') return t('contracts.paymentCard')
    if (method === 'us_wire') return t('contracts.paymentUsWire')
    return method || t('common.select')
  }
}

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
  onRevertPaid,
  onEdit,
  onDelete,
}: {
  installment: PaymentInstallment
  currency: 'KRW' | 'USD'
  onMarkPaid: (inst: PaymentInstallment) => void
  onRevertPaid: (inst: PaymentInstallment) => void
  onEdit: (inst: PaymentInstallment) => void
  onDelete: (inst: PaymentInstallment) => void
}) {
  const t = useT()
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
                <Badge variant="outline" className={`text-[10px] h-4 ${config.className}`}>
                  {config.label}
                </Badge>
              </div>
              <div className="text-lg font-bold mt-0.5 font-mono">
                {formatCurrency(installment.amount, currency)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(installment)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(installment)}
            >
              <Trash2 className="size-3.5" />
            </Button>
            {(isPaid || isPartial) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => onRevertPaid(installment)}
              >
                <AlertTriangle className="size-3.5" />
                {t('contracts.revertPaid')}
              </Button>
            )}
            {!isPaid && (
              <Button
                size="sm"
                variant={isOverdue ? 'destructive' : 'outline'}
                className="gap-1.5"
                onClick={() => onMarkPaid(installment)}
              >
                <CreditCard className="size-3.5" />
                {isPartial ? t('contracts.payRemaining') : t('contracts.markPaid')}
              </Button>
            )}
          </div>
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
  const t = useT()
  const pmLabel = usePaymentMethodLabel()
  const { data: contract, isLoading, error } = useContract(id)
  const cancelContract = useCancelContract()
  const updateContract = useUpdateContract()
  const deleteContract = useDeleteContract()
  const updateInstallment = useUpdateInstallment()
  const deleteInstallment = useDeleteInstallment()
  const createInstallments = useCreateInstallments()
  const STATUS_CONFIG = useStatusConfig()
  const { data: linkedLead } = useLinkedLead(contract?.leadId)
  const { data: leadActivities = [] } = useLeadActivities(contract?.leadId)
  const { data: salesMeetings = [] } = useSalesMeetings(contract?.leadId, contract?.contractorName)
  const { data: serviceData } = useServiceStudentMeetings(contract?.studentName)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [addChargeDialogOpen, setAddChargeDialogOpen] = useState(false)
  const [chargeForm, setChargeForm] = useState({ label: '', amount: '', dueDate: '', notes: '' })
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

  const handleRevertPaid = useCallback((inst: PaymentInstallment) => {
    if (!confirm(t('contracts.revertPaidConfirm').replace('{label}', inst.label))) return
    updateInstallment.mutate({
      id: inst.id,
      paidAmount: 0,
      paidDate: '',
      status: 'pending',
      paymentMethod: '',
      notes: '',
    })
  }, [updateInstallment, t])

  const handleDeleteInstallment = useCallback((inst: PaymentInstallment) => {
    if (!confirm(t('contracts.deleteInstallmentConfirm').replace('{label}', inst.label))) return
    deleteInstallment.mutate(inst.id)
  }, [deleteInstallment, t])

  const handleAddCharge = useCallback(() => {
    if (!id || !chargeForm.label.trim() || !chargeForm.amount) return
    const nextOrder = (contract?.installments?.length || 0) + 1
    createInstallments.mutate({
      contractId: id,
      items: [{
        installmentOrder: nextOrder,
        label: chargeForm.label.trim(),
        amount: Number(chargeForm.amount),
        dueDate: chargeForm.dueDate || undefined,
        currency: contract?.currency || 'KRW',
      }],
    }, {
      onSuccess: () => {
        setAddChargeDialogOpen(false)
        setChargeForm({ label: '', amount: '', dueDate: '', notes: '' })
      },
    })
  }, [id, chargeForm, contract, createInstallments])

  const openEditInstDialog = useCallback((inst: PaymentInstallment) => {
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
  }, [])

  const handleEditInstallment = useCallback(() => {
    if (!editInstForm.id || !editInstForm.label.trim() || !editInstForm.amount) return
    const payload: Parameters<typeof updateInstallment.mutate>[0] = {
      id: editInstForm.id,
      label: editInstForm.label.trim(),
      amount: Number(editInstForm.amount),
      dueDate: editInstForm.dueDate || '',
      notes: editInstForm.notes || undefined,
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
  }, [editInstForm, updateInstallment])

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
        <div className="flex items-center gap-2">
          {!isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="size-3.5" /> {t('common.edit')}
            </Button>
          )}
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5" /> {t('contracts.deleteContract')}
          </Button>
        </div>
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="size-5" />
            {t('contracts.installmentCount').replace('{n}', String(installments.length))}
          </h2>
          {!isCancelled && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setChargeForm({ label: '', amount: '', dueDate: '', notes: '' })
                setAddChargeDialogOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {t('contracts.addInstallment')}
            </Button>
          )}
        </div>
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
                onRevertPaid={handleRevertPaid}
                onEdit={openEditInstDialog}
                onDelete={handleDeleteInstallment}
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

      {/* ── Customer Journey (unified timeline) ────────────────────────── */}
      {(() => {
        // Build unified timeline from all sources
        type TimelineItem = { id: string; date: string; phase: 'lead' | 'sales' | 'service'; badge: string; badgeColor: string; title: string; desc?: string; person?: string }
        const items: TimelineItem[] = []

        // 1) Lead info summary as first event
        if (linkedLead) {
          items.push({
            id: 'lead-start',
            date: linkedLead.leadDate || '',
            phase: 'lead',
            badge: t('contracts.leadSourceChannel'),
            badgeColor: 'bg-violet-100 text-violet-700',
            title: `${linkedLead.sourceChannel || '유입'} → ${linkedLead.interestArea || '관심분야 미입력'}`,
            desc: linkedLead.memo || undefined,
            person: linkedLead.assignedUser,
          })
        }

        // 2) Lead activities (calls, notes, consultations, stage changes)
        for (const act of leadActivities) {
          const typeLabels: Record<string, string> = {
            note: '메모', call: '전화', katalk: '카톡', email: '이메일',
            meeting: '미팅', consultation: '상담', stage_change: '단계 변경',
            assignment_change: '담당자 변경', system: '시스템',
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
          })
        }

        // 3) Sales meetings
        for (const m of salesMeetings) {
          items.push({
            id: `smtg-${m.id as string}`,
            date: (m.meeting_date as string) || (m.created_at as string),
            phase: 'sales',
            badge: `${m.meeting_number || ''}차 상담`,
            badgeColor: 'bg-green-100 text-green-700',
            title: `${m.parent_name}${m.student_name ? ` / ${m.student_name}` : ''} 상담`,
            desc: typeof m.memo === 'string' ? m.memo : undefined,
            person: m.profiles?.name,
          })
        }

        // 4) Contract event itself
        items.push({
          id: `contract-${contract.id}`,
          date: contract.contractDate,
          phase: 'sales',
          badge: '계약 체결',
          badgeColor: 'bg-emerald-100 text-emerald-700',
          title: `${contract.contractorName} / ${contract.studentName} 계약`,
          desc: contract.totalAmount > 0 ? formatCurrency(contract.totalAmount, contract.currency) : undefined,
        })

        // 5) Service student meetings (post-contract)
        const svcMeetings = serviceData?.meetings || []
        for (const sm of svcMeetings) {
          const consultant = CONSULTANTS[sm.consultant_id as string] || (sm.consultant_id as string) || ''
          const reportBadge = sm.report_status === 'submitted' ? ' ✓리포트' : sm.report_status === 'pending' ? ' ⏳리포트' : ''
          items.push({
            id: `svc-${sm.id as string}`,
            date: (sm.meeting_date as string) || (sm.created_at as string),
            phase: 'service',
            badge: `${(sm.meeting_type as string) || '미팅'}${reportBadge}`,
            badgeColor: 'bg-blue-100 text-blue-700',
            title: `${contract.studentName} 서비스 미팅`,
            desc: typeof sm.summary === 'string' ? sm.summary : undefined,
            person: consultant,
          })
        }

        // Sort by date ascending (chronological journey)
        items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        const hasAnyData = items.length > 1 // more than just the contract event itself

        if (!hasAnyData && !linkedLead) return null

        const phaseColors = { lead: 'border-l-violet-400', sales: 'border-l-green-400', service: 'border-l-blue-400' }
        const phaseLabels = { lead: '리드/세일즈', sales: '상담/계약', service: '서비스' }

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4" />
                {t('contracts.customerJourney')}
                <span className="text-muted-foreground font-normal text-xs ml-1">
                  ({items.length}건)
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
                    to={`/service/student-360?studentId=${serviceData.student.id}`}
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
                    className={`flex gap-3 text-xs border-l-2 pl-3 py-1.5 ${phaseColors[item.phase]}`}
                  >
                    <div className="text-muted-foreground shrink-0 w-[68px] font-mono">
                      {item.date?.slice(0, 10) || '—'}
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{item.title}</span>
                      {item.desc && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.desc}</p>
                      )}
                    </div>
                    {item.person && (
                      <span className="text-muted-foreground shrink-0">{item.person}</span>
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

      {/* Add Installment Dialog */}
      <Dialog open={addChargeDialogOpen} onOpenChange={setAddChargeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contracts.addInstallment')}</DialogTitle>
            <DialogDescription>
              {t('contracts.addInstallmentDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('contracts.installmentLabel')} <span className="text-destructive">*</span></Label>
              <Input
                value={chargeForm.label}
                onChange={e => setChargeForm(f => ({ ...f, label: e.target.value }))}
                placeholder={t('contracts.installmentLabelPlaceholder')}
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
                placeholder="계약금, 중도금, 잔금 등"
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
                <SelectItem value="KRW">KRW (원)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
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
