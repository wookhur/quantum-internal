import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { useCreateContractFull } from '@/hooks/useContracts'
import { useCreateInstallments } from '@/hooks/useInstallments'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'

interface LeadInfo {
  id: string
  parentName: string
  studentName: string
  phone?: string
  currentSchool?: string
  grade?: string
  region?: string
  email?: string
}

interface InstallmentRow {
  label: string
  amount: string
  dueDate: string
}

const DEFAULT_INSTALLMENTS: InstallmentRow[] = [
  { label: '계약금', amount: '', dueDate: '' },
  { label: '중도금', amount: '', dueDate: '' },
  { label: '잔금', amount: '', dueDate: '' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: LeadInfo
}

export function CreateContractFromLeadDialog({ open, onOpenChange, lead }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const createContract = useCreateContractFull()
  const createInstallments = useCreateInstallments()

  const [form, setForm] = useState({
    contractorName: '',
    studentName: '',
    schoolName: '',
    gradeAtContract: '',
    phone: '',
    address: '',
    contractDate: '',
    expiryDate: '',
    totalAmount: '',
    currency: 'KRW' as 'KRW' | 'USD',
    paymentAccount: 'KR' as 'KR' | 'US',
    salesRep: '',
    serviceRep: '',
    notes: '',
  })

  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>(DEFAULT_INSTALLMENTS)

  // Pre-fill from lead data when dialog opens
  useEffect(() => {
    if (open && lead) {
      setForm({
        contractorName: lead.parentName || '',
        studentName: lead.studentName || '',
        schoolName: lead.currentSchool || '',
        gradeAtContract: lead.grade || '',
        phone: lead.phone || '',
        address: '',
        contractDate: new Date().toISOString().slice(0, 10),
        expiryDate: '',
        totalAmount: '',
        currency: 'KRW',
        paymentAccount: 'KR',
        salesRep: user?.id || '',
        serviceRep: '',
        notes: '',
      })
      setInstallmentRows([...DEFAULT_INSTALLMENTS])
    }
  }, [open, lead, user?.id])

  const set = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(f => ({ ...f, [key]: value }))
  }, [])

  const handleSave = useCallback(() => {
    if (!form.contractorName || !form.studentName || !form.schoolName || !form.contractDate || !form.expiryDate) return

    createContract.mutate({
      contractorName: form.contractorName,
      studentName: form.studentName,
      schoolName: form.schoolName,
      gradeAtContract: form.gradeAtContract || undefined,
      contractDate: form.contractDate,
      expiryDate: form.expiryDate,
      address: form.address || undefined,
      phone: form.phone || undefined,
      totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
      currency: form.currency || undefined,
      paymentAccount: form.paymentAccount || undefined,
      notes: form.notes || undefined,
      leadId: lead.id,
      salesRep: form.salesRep || undefined,
      serviceRep: form.serviceRep || undefined,
    }, {
      onSuccess: (data) => {
        // Create installments
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
          createInstallments.mutate({ contractId: data.id as string, items: validItems })
        }

        onOpenChange(false)
        // Navigate to the new contract detail
        if (data?.id) {
          navigate(`/consulting/clients/${data.id}`)
        }
      },
    })
  }, [form, installmentRows, lead, createContract, createInstallments, navigate, onOpenChange])

  const isRequiredMissing = !form.contractorName || !form.studentName || !form.schoolName || !form.contractDate || !form.expiryDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leadDetail.createContract')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Contractor & Student */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('contracts.parentName')} <span className="text-destructive">*</span>
              </Label>
              <Input value={form.contractorName} onChange={e => set('contractorName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('contracts.studentName')} <span className="text-destructive">*</span>
              </Label>
              <Input value={form.studentName} onChange={e => set('studentName', e.target.value)} />
            </div>
          </div>

          {/* School & Grade */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('contracts.school')} <span className="text-destructive">*</span>
              </Label>
              <Input value={form.schoolName} onChange={e => set('schoolName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.grade')}</Label>
              <Input value={form.gradeAtContract} onChange={e => set('gradeAtContract', e.target.value)} />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('leadDetail.contractDate')} <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={form.contractDate} onChange={e => set('contractDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('leadDetail.expiryDate')} <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={form.expiryDate} onChange={e => set('expiryDate', e.target.value)} />
            </div>
          </div>

          {/* Phone & Address */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.phone')}</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('contracts.address')}</Label>
              <Input value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </div>

          {/* Amount, Currency, Payment Account */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('contracts.totalContractAmount')}</Label>
              <Input
                type="number"
                value={form.totalAmount}
                onChange={e => set('totalAmount', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('contracts.currency')}</Label>
              <Select value={form.currency} onValueChange={v => set('currency', (v || 'KRW') as 'KRW' | 'USD')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRW">KRW (원)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('contracts.depositAccount')}</Label>
              <Select value={form.paymentAccount} onValueChange={v => set('paymentAccount', (v || 'KR') as 'KR' | 'US')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KR">{t('contracts.krAccount')}</SelectItem>
                  <SelectItem value="US">{t('contracts.usAccount')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sales Rep & Service Rep */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leadDetail.salesRep')}</Label>
              <Select value={form.salesRep} onValueChange={v => set('salesRep', v || '')}>
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('leadDetail.serviceRep')}</Label>
              <Select value={form.serviceRep} onValueChange={v => set('serviceRep', v || '')}>
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.notes')}</Label>
            <Textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Installment Schedule */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('contracts.installmentLabel')}</Label>
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
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] text-muted-foreground font-medium px-0.5">
                <span>{t('contracts.installmentLabel')}</span>
                <span>{t('contracts.amount')}</span>
                <span>{t('common.date')}</span>
                <span className="w-7" />
              </div>
              {installmentRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <Input
                    placeholder="계약금"
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
                    placeholder="0"
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
              {installmentRows.some(r => Number(r.amount) > 0) && (() => {
                const instTotal = installmentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
                const contractAmt = Number(form.totalAmount) || 0
                const mismatch = contractAmt > 0 && instTotal !== contractAmt
                return (
                  <>
                    <div className="text-[11px] text-muted-foreground pt-1 text-right">
                      {t('contracts.installmentTotal')}: {formatCurrency(instTotal, form.currency)}
                    </div>
                    {mismatch && (
                      <div className="flex items-center gap-1.5 mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px]">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>
                          {t('contracts.amountMismatchWarning')
                            .replace('{instTotal}', formatCurrency(instTotal, form.currency))
                            .replace('{contractTotal}', formatCurrency(contractAmt, form.currency))}
                        </span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={isRequiredMissing || createContract.isPending}
            >
              {createContract.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              {t('leadDetail.createContract')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
