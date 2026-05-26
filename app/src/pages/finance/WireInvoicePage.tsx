import { useState, useCallback } from 'react'
import { FileText, Send, Plus, Trash2, Search, Mail, CheckCircle, Clock, Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useInvoices, useCreateDocument, useSendDocument, useDeleteDocument, type InvoiceReceipt } from '@/hooks/useInvoicesReceipts'
import { useContractsWithInstallments } from '@/hooks/useContracts'
import { useT } from '@/i18n/LanguageContext'

export function WireInvoicePage() {
  const t = useT()
  const { data: allInvoices = [], isLoading } = useInvoices()
  const { data: contracts = [] } = useContractsWithInstallments()
  const createDoc = useCreateDocument()
  const sendDoc = useSendDocument()
  const deleteDoc = useDeleteDocument()

  // Filter only wire invoices (USD currency)
  const invoices = allInvoices.filter(inv => inv.currency === 'USD')

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<InvoiceReceipt | null>(null)

  const [form, setForm] = useState({
    contractId: '',
    issuedTo: '',
    address: '',
    email: '',
    description: 'U.S. College Admission Consulting Services',
    studentName: '',
    unitPrice: '',
    qty: '1',
    dueDate: '',
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
        issuedTo: c.contractorName,
        unitPrice: c.totalAmount > 0 ? String(c.totalAmount) : '',
      }))
    }
  }, [contracts])

  const handleCreate = useCallback(() => {
    if (!form.issuedTo || !form.unitPrice) return
    const total = Number(form.unitPrice) * Number(form.qty || 1)
    const today = new Date().toISOString().slice(0, 10)

    createDoc.mutate({
      type: 'invoice',
      contractId: form.contractId || undefined,
      studentName: form.studentName,
      contractorName: form.issuedTo,
      recipientEmail: form.email || undefined,
      amount: total,
      currency: 'USD',
      issuedDate: today,
      description: `${form.description}\n${form.studentName}`,
      items: [{
        label: `${form.description} - ${form.studentName}`,
        amount: total,
      }],
      autoSend: !!form.email,
    }, {
      onSuccess: () => {
        setCreateOpen(false)
        setForm({ contractId: '', issuedTo: '', address: '', email: '', description: 'U.S. College Admission Consulting Services', studentName: '', unitPrice: '', qty: '1', dueDate: '' })
      },
    })
  }, [form, createDoc])

  const handlePreview = useCallback((doc: InvoiceReceipt) => {
    setPreviewDoc(doc)
    setPreviewOpen(true)
  }, [])

  const handlePrint = useCallback(() => {
    const printWin = window.open('', '_blank')
    if (!printWin || !previewDoc) return
    printWin.document.write(generateInvoiceHtml(previewDoc, form.address))
    printWin.document.close()
    printWin.focus()
    setTimeout(() => printWin.print(), 500)
  }, [previewDoc, form.address])

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
          <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <FileText className="size-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('wireInvoice.title')}</h1>
            <p className="text-xs text-gray-500">{t('wireInvoice.subtitle')}</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> {t('wireInvoice.create')}
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice No.</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Issued To</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Student</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount (USD)</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('common.status')}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('wireInvoice.noInvoices')}</td></tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.docNumber}</td>
                  <td className="px-4 py-3 text-gray-900">{inv.contractorName}</td>
                  <td className="px-4 py-3 text-gray-600">{inv.studentName}</td>
                  <td className="px-4 py-3 text-right font-medium">${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{inv.issuedDate}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(inv.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                        onClick={() => handlePreview(inv)}
                        title="Preview"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      {inv.status === 'draft' && inv.recipientEmail && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => sendDoc.mutate(inv.id)}
                          disabled={sendDoc.isPending}
                          title="Send"
                        >
                          <Send className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => { if (confirm(t('invoice.deleteConfirm'))) deleteDoc.mutate(inv.id) }}
                        title="Delete"
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

      {/* Create Wire Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('wireInvoice.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
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

            <div className="space-y-1.5">
              <Label className="text-xs">Issued To (Name) <span className="text-destructive">*</span></Label>
              <Input value={form.issuedTo} onChange={(e) => setForm(f => ({ ...f, issuedTo: e.target.value }))} placeholder="JAY JANGHO KIM" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} placeholder="1170 Angelo Drive Beverly Hills CA 90210" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="client@email.com" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Student Name <span className="text-destructive">*</span></Label>
                <Input value={form.studentName} onChange={(e) => setForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Unit Price (USD) <span className="text-destructive">*</span></Label>
                <Input type="number" value={form.unitPrice} onChange={(e) => setForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="15300.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">QTY</Label>
                <Input type="number" value={form.qty} onChange={(e) => setForm(f => ({ ...f, qty: e.target.value }))} min="1" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!form.issuedTo || !form.unitPrice || createDoc.isPending}
              >
                {form.email ? t('wireInvoice.createAndSend') : t('wireInvoice.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          {previewDoc && (
            <>
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-white border-b">
                <span className="text-sm font-medium text-gray-700">Invoice Preview</span>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handlePrint}>
                  <Download className="size-3.5" /> Print / PDF
                </Button>
              </div>
              <div
                className="p-6"
                dangerouslySetInnerHTML={{ __html: generateInvoiceHtml(previewDoc, form.address) }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Generate the wire invoice HTML matching the company's .docx template */
function generateInvoiceHtml(doc: InvoiceReceipt, address?: string): string {
  const today = doc.issuedDate || new Date().toISOString().slice(0, 10)
  const formattedDate = today.replace(/-/g, '.')
  const amount = doc.amount || 0
  const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 })
  const description = doc.description?.split('\n')[0] || 'U.S. College Admission Consulting Services'
  const studentName = doc.studentName || ''

  return `
<style>
  .wire-invoice { font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #222; }
  .wire-invoice h1 { text-align: center; letter-spacing: 12px; font-size: 28px; color: #1a1a2e; margin-bottom: 32px; font-weight: 700; }
  .wire-invoice .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
  .wire-invoice .meta-label { font-weight: 600; color: #555; }
  .wire-invoice .issued-to { margin: 24px 0; padding: 16px; background: #f8f9fa; border-radius: 8px; }
  .wire-invoice .issued-to .label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
  .wire-invoice .issued-to .name { font-size: 16px; font-weight: 700; }
  .wire-invoice .issued-to .addr { font-size: 13px; color: #555; margin-top: 4px; }
  .wire-invoice table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  .wire-invoice thead th { background: #1a1a2e; color: white; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .wire-invoice thead th:first-child { text-align: left; }
  .wire-invoice thead th:not(:first-child) { text-align: right; }
  .wire-invoice tbody td { padding: 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  .wire-invoice tbody td:not(:first-child) { text-align: right; }
  .wire-invoice .total-row { background: #f0f4ff; }
  .wire-invoice .total-row td { font-weight: 700; font-size: 14px; border: none; }
  .wire-invoice .wire-details { margin-top: 32px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #1a1a2e; }
  .wire-invoice .wire-details h3 { font-size: 13px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px; }
  .wire-invoice .wire-details .row { display: flex; font-size: 12px; margin-bottom: 6px; }
  .wire-invoice .wire-details .row .label { width: 200px; color: #666; font-weight: 500; }
  .wire-invoice .wire-details .row .value { color: #222; font-weight: 600; }
  @media print { .wire-invoice { padding: 20px; } }
</style>
<div class="wire-invoice">
  <h1>I N V O I C E</h1>

  <div style="display: flex; justify-content: flex-end; gap: 40px; margin-bottom: 20px;">
    <div>
      <div class="meta-row"><span class="meta-label">INVOICE NO:</span> <span>${doc.docNumber}</span></div>
      <div class="meta-row"><span class="meta-label">DATE:</span> <span>${formattedDate}</span></div>
      <div class="meta-row"><span class="meta-label">DUE DATE:</span> <span>${doc.paidDate?.replace(/-/g, '.') || formattedDate}</span></div>
    </div>
  </div>

  <div class="issued-to">
    <div class="label">Issued to :</div>
    <div class="name">${doc.contractorName}</div>
    ${address ? `<div class="addr">${address}</div>` : ''}
    ${doc.recipientEmail ? `<div class="addr">${doc.recipientEmail}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>DESCRIPTION</th>
        <th>UNIT PRICE</th>
        <th>QTY</th>
        <th>TOTAL</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${description}<br/><span style="color: #666;">${studentName}</span></td>
        <td>${formattedAmount} USD</td>
        <td>1</td>
        <td>${formattedAmount} USD</td>
      </tr>
      <tr class="total-row">
        <td colspan="3" style="text-align: right;">TOTAL</td>
        <td>${formattedAmount} USD</td>
      </tr>
    </tbody>
  </table>

  <div class="wire-details">
    <h3>Wire Transfer Details</h3>
    <div class="row"><span class="label">Bank Name:</span><span class="value">Hana Bank</span></div>
    <div class="row"><span class="label">Branch:</span><span class="value">Apgujeong Financial Center Branch</span></div>
    <div class="row"><span class="label">SWIFT Code:</span><span class="value">KOEXKRSE</span></div>
    <div class="row"><span class="label">Account Number:</span><span class="value">231-910056-27504</span></div>
    <div class="row"><span class="label">Account Holder:</span><span class="value">Quantum Admissions Co., Ltd.</span></div>
    <div class="row"><span class="label">Business Registration Number:</span><span class="value">652-86-03888</span></div>
    <div class="row"><span class="label">Representative:</span><span class="value">Sangbeom Han</span></div>
    <div class="row"><span class="label">Company Phone:</span><span class="value">+82-2-3444-7076</span></div>
    <div class="row"><span class="label">Mobile:</span><span class="value">+82-10-7350-7075</span></div>
    <div class="row"><span class="label">Bank Address:</span><span class="value">320 Apgujeong-ro, Gangnam-gu, Seoul 06018, Republic of Korea</span></div>
    <div class="row"><span class="label">Company Address:</span><span class="value">1F, 41-5, Nonhyeon-ro 131-gil, Gangnam-gu, Seoul, South Korea</span></div>
  </div>
</div>`
}
