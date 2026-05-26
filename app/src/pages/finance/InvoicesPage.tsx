import { useState, useCallback } from 'react'
import { FileText, Send, Plus, Trash2, Search, Mail, CheckCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useInvoices, useCreateDocument, useSendDocument, useDeleteDocument } from '@/hooks/useInvoicesReceipts'
import { useContractsWithInstallments } from '@/hooks/useContracts'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'

export function InvoicesPage() {
  const t = useT()
  const { data: invoices = [], isLoading } = useInvoices()
  const { data: contracts = [] } = useContractsWithInstallments()
  const createDoc = useCreateDocument()
  const sendDoc = useSendDocument()
  const deleteDoc = useDeleteDocument()

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    contractId: '',
    studentName: '',
    contractorName: '',
    recipientEmail: '',
    amount: '',
    currency: 'KRW' as 'KRW' | 'USD',
    description: '',
  })

  const filtered = invoices.filter((inv) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      inv.studentName.toLowerCase().includes(q) ||
      inv.contractorName.toLowerCase().includes(q) ||
      inv.docNumber.toLowerCase().includes(q)
    )
  })

  const handleContractSelect = useCallback((contractId: string | null) => {
    if (!contractId) return
    const c = contracts.find((c) => c.id === contractId)
    if (c) {
      setForm((f) => ({
        ...f,
        contractId,
        studentName: c.studentName,
        contractorName: c.contractorName,
        currency: c.currency || 'KRW',
      }))
    }
  }, [contracts])

  const handleCreate = useCallback(() => {
    if (!form.studentName || !form.contractorName || !form.amount) return
    createDoc.mutate({
      type: 'invoice',
      contractId: form.contractId || undefined,
      studentName: form.studentName,
      contractorName: form.contractorName,
      recipientEmail: form.recipientEmail || undefined,
      amount: Number(form.amount),
      currency: form.currency,
      description: form.description || undefined,
      items: [{ label: form.description || '서비스 이용료', amount: Number(form.amount) }],
      autoSend: !!form.recipientEmail,
    }, {
      onSuccess: () => {
        setCreateOpen(false)
        setForm({ contractId: '', studentName: '', contractorName: '', recipientEmail: '', amount: '', currency: 'KRW', description: '' })
      },
    })
  }, [form, createDoc])

  const handleSend = useCallback((id: string) => {
    sendDoc.mutate(id)
  }, [sendDoc])

  const handleDelete = useCallback((id: string) => {
    if (!confirm(t('invoice.deleteConfirm'))) return
    deleteDoc.mutate(id)
  }, [deleteDoc, t])

  const statusBadge = (status: string) => {
    switch (status) {
      case 'sent': return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
          <CheckCircle className="size-3" /> {t('invoice.sent')}
        </span>
      )
      case 'viewed': return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
          <Mail className="size-3" /> {t('invoice.viewed')}
        </span>
      )
      default: return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
          <Clock className="size-3" /> {t('invoice.draft')}
        </span>
      )
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <FileText className="size-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('invoice.title')}</h1>
            <p className="text-xs text-gray-500">{t('invoice.subtitle')}</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> {t('invoice.create')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          className="pl-9 h-9"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('invoice.docNumber')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('invoice.recipient')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{t('contracts.studentName')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">{t('contracts.amount')}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('invoice.issuedDate')}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('invoice.noInvoices')}</td></tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.docNumber}</td>
                  <td className="px-4 py-3 text-gray-900">{inv.contractorName}</td>
                  <td className="px-4 py-3 text-gray-600">{inv.studentName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.amount, inv.currency)}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{inv.issuedDate}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(inv.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {inv.status === 'draft' && inv.recipientEmail && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => handleSend(inv.id)}
                          disabled={sendDoc.isPending}
                          title={t('invoice.send')}
                        >
                          <Send className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(inv.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('invoice.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Contract selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">{t('invoice.selectContract')}</Label>
              <Select value={form.contractId} onValueChange={handleContractSelect}>
                <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.studentName} ({c.contractorName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('contracts.parentName')} <span className="text-destructive">*</span></Label>
                <Input value={form.contractorName} onChange={(e) => setForm(f => ({ ...f, contractorName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('contracts.studentName')} <span className="text-destructive">*</span></Label>
                <Input value={form.studentName} onChange={(e) => setForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('invoice.recipientEmail')}</Label>
              <Input type="email" value={form.recipientEmail} onChange={(e) => setForm(f => ({ ...f, recipientEmail: e.target.value }))} placeholder="parent@email.com" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('contracts.amount')} <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('contracts.currency')}</Label>
                <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: (v || 'KRW') as 'KRW' | 'USD' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KRW">KRW</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('invoice.description')}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="resize-none"
                placeholder={t('invoice.descriptionPlaceholder')}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!form.studentName || !form.contractorName || !form.amount || createDoc.isPending}
              >
                {form.recipientEmail ? t('invoice.createAndSend') : t('invoice.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
