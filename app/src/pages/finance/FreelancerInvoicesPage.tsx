import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  FileText, Plus, Trash2, Download, CheckCircle2, XCircle,
  Eye, Loader2, Search, Upload,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceMeetings } from '@/hooks/useServiceDashboard'
import { useConsultantName } from '@/lib/consultants'
import { useProfiles } from '@/hooks/useProfiles'
import { useSendMessage } from '@/hooks/useMessages'
import {
  useFreelancerInvoices,
  useMyInvoices,
  useInvoiceItems,
  useCreateInvoice,
  useUpdateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  type FreelancerInvoice,
  type InvoiceItem,
} from '@/hooks/useFreelancerInvoices'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'fInvoice.statusDraft',
  submitted: 'fInvoice.statusSubmitted',
  approved: 'fInvoice.statusApproved',
  rejected: 'fInvoice.statusRejected',
}

function formatKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)
}

function getCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthOptions() {
  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ─── Excel Upload Parser ──────────────────────────────────────────────────

interface ParsedInvoice {
  invoiceDate: string
  residentNumber: string
  phone: string
  email: string
  bankAccount: string
  items: ItemRow[]
}

async function parseInvoiceExcel(file: File): Promise<ParsedInvoice> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const buf = await file.arrayBuffer()
  await wb.xlsx.load(buf)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('시트를 찾을 수 없습니다')

  const cell = (r: number, c: number) => {
    const v = ws.getCell(r, c).value
    if (v === null || v === undefined) return ''
    if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
    return String(v)
  }
  const num = (r: number, c: number) => {
    const v = ws.getCell(r, c).value
    if (v === null || v === undefined) return 0
    if (typeof v === 'object' && 'result' in v) return Number(v.result) || 0
    return Number(v) || 0
  }

  // Parse date from row 8 col C/D area
  let invoiceDate = ''
  const dateRaw = cell(8, 3) || cell(8, 4)
  if (dateRaw) {
    const d = new Date(dateRaw)
    if (!isNaN(d.getTime())) invoiceDate = d.toISOString().slice(0, 10)
    else invoiceDate = dateRaw
  }

  // Parse personal info
  const residentNumber = cell(9, 8) || cell(9, 7)
  const phone = cell(10, 6) || cell(10, 7)
  const email = cell(11, 6) || cell(11, 7)
  const bankAccount = cell(21, 2) || cell(21, 3) || cell(22, 2)

  // Parse items from rows 15-19 (B=No, C=품명, D=수량, E=단가, F=공급가액, G=비고)
  const items: ItemRow[] = []
  for (let row = 15; row <= 24; row++) {
    const itemName = cell(row, 3)
    if (!itemName || itemName === '합     계' || itemName === '합계') break
    items.push({
      itemName,
      quantity: num(row, 4) || 1,
      unitPrice: num(row, 5),
      remark: cell(row, 7),
    })
  }

  if (items.length === 0) {
    // Fallback: try to find items by scanning for non-empty itemName cells
    for (let row = 1; row <= ws.rowCount; row++) {
      const noVal = num(row, 2)
      const name = cell(row, 3)
      if (noVal >= 1 && name && name !== '품명' && name !== 'No.') {
        items.push({
          itemName: name,
          quantity: num(row, 4) || 1,
          unitPrice: num(row, 5),
          remark: cell(row, 7),
        })
      }
    }
  }

  return { invoiceDate, residentNumber, phone, email, bankAccount, items: items.length > 0 ? items : [emptyItem()] }
}

// ─── Item Row for Invoice Form ────────────────────────────────────────────

interface ItemRow {
  itemName: string
  quantity: number
  unitPrice: number
  remark: string
}

function emptyItem(): ItemRow {
  return { itemName: '', quantity: 1, unitPrice: 0, remark: '' }
}

// ─── Invoice Form Dialog ──────────────────────────────────────────────────

function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  existingItems,
  userId,
  initialData,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: FreelancerInvoice
  existingItems?: InvoiceItem[]
  userId: string
  initialData?: ParsedInvoice
}) {
  const t = useT()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()

  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoiceDate || invoice?.invoiceDate || new Date().toISOString().slice(0, 10))
  const [invoiceMonth, setInvoiceMonth] = useState(invoice?.invoiceMonth || getCurrentMonth())
  const [residentNumber, setResidentNumber] = useState(initialData?.residentNumber || invoice?.residentNumber || '')
  const [phone, setPhone] = useState(initialData?.phone || invoice?.phone || '')
  const [bankAccount, setBankAccount] = useState(initialData?.bankAccount || invoice?.bankAccount || '')
  const [note, setNote] = useState(invoice?.note || '')
  const [items, setItems] = useState<ItemRow[]>(
    initialData?.items?.length
      ? initialData.items
      : existingItems?.length
        ? existingItems.map(it => ({ itemName: it.itemName, quantity: it.quantity, unitPrice: it.unitPrice, remark: it.remark || '' }))
        : [emptyItem()],
  )
  const [saving, setSaving] = useState(false)

  const totalAmount = useMemo(() => items.reduce((s, it) => s + it.quantity * it.unitPrice, 0), [items])

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }, [])

  const handleSave = async () => {
    const validItems = items.filter(it => it.itemName.trim())
    if (validItems.length === 0) return
    setSaving(true)
    try {
      if (invoice) {
        await updateInvoice.mutateAsync({
          id: invoice.id,
          invoiceDate,
          residentNumber,
          phone,
          bankAccount,
          note,
          items: validItems,
        })
      } else {
        await createInvoice.mutateAsync({
          freelancerId: userId,
          invoiceDate,
          invoiceMonth,
          residentNumber,
          phone,
          bankAccount,
          note,
          items: validItems,
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            {invoice ? t('fInvoice.edit') : t('fInvoice.create')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date & Month */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('fInvoice.date')}</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('fInvoice.month')}</Label>
              <Input type="month" value={invoiceMonth} onChange={e => setInvoiceMonth(e.target.value)} className="h-9" disabled={!!invoice} />
            </div>
          </div>

          {/* Personal Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('fInvoice.residentNumber')}</Label>
              <Input value={residentNumber} onChange={e => setResidentNumber(e.target.value)} placeholder="000000-0000000" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('fInvoice.phone')}</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('fInvoice.bankAccount')}</Label>
            <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder={t('fInvoice.bankPlaceholder')} className="h-9" />
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">{t('fInvoice.items')}</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setItems(prev => [...prev, emptyItem()])}
                disabled={items.length >= 10}
              >
                <Plus className="size-3" />
                {t('fInvoice.addItem')}
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8">No</TableHead>
                    <TableHead>{t('fInvoice.itemName')}</TableHead>
                    <TableHead className="w-20">{t('fInvoice.quantity')}</TableHead>
                    <TableHead className="w-28">{t('fInvoice.unitPrice')}</TableHead>
                    <TableHead className="w-28">{t('fInvoice.supplyAmount')}</TableHead>
                    <TableHead className="w-24">{t('fInvoice.remark')}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs text-center">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={item.itemName}
                          onChange={e => updateItem(idx, 'itemName', e.target.value)}
                          placeholder={t('fInvoice.itemPlaceholder')}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {formatKRW(item.quantity * item.unitPrice)}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.remark}
                          onChange={e => updateItem(idx, 'remark', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell colSpan={4} className="text-right text-sm">{t('fInvoice.totalAmount')}</TableCell>
                    <TableCell className="text-right text-sm">{formatKRW(totalAmount)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('fInvoice.note')}</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !items.some(it => it.itemName.trim())} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {t('fInvoice.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invoice Detail Dialog ────────────────────────────────────────────────

function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: FreelancerInvoice
}) {
  const t = useT()
  const { user } = useAuth()
  const { data: items = [] } = useInvoiceItems(invoice.id)
  const updateStatus = useUpdateInvoiceStatus()
  const deleteInvoice = useDeleteInvoice()
  const isAccounting = (user?.email || '').toLowerCase() === ACCOUNTING_EMAIL
  const canDelete = isAccounting || (invoice.freelancerId === user?.id && invoice.status !== 'approved')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            {t('fInvoice.viewDetail')}
            <Badge className={`ml-2 ${STATUS_COLORS[invoice.status]}`}>{t(STATUS_LABELS[invoice.status])}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">{t('fInvoice.freelancer')}:</span> <span className="font-medium">{invoice.freelancerName}</span></div>
            <div><span className="text-muted-foreground">{t('fInvoice.date')}:</span> <span className="font-medium">{invoice.invoiceDate}</span></div>
            <div><span className="text-muted-foreground">{t('fInvoice.month')}:</span> <span className="font-medium">{invoice.invoiceMonth}</span></div>
            {invoice.residentNumber && <div><span className="text-muted-foreground">{t('fInvoice.residentNumber')}:</span> <span className="font-medium">{invoice.residentNumber}</span></div>}
            {invoice.phone && <div><span className="text-muted-foreground">{t('fInvoice.phone')}:</span> <span className="font-medium">{invoice.phone}</span></div>}
            {invoice.bankAccount && <div className="col-span-2"><span className="text-muted-foreground">{t('fInvoice.bankAccount')}:</span> <span className="font-medium">{invoice.bankAccount}</span></div>}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-10">No</TableHead>
                  <TableHead>{t('fInvoice.itemName')}</TableHead>
                  <TableHead className="text-right w-20">{t('fInvoice.quantity')}</TableHead>
                  <TableHead className="text-right w-28">{t('fInvoice.unitPrice')}</TableHead>
                  <TableHead className="text-right w-28">{t('fInvoice.supplyAmount')}</TableHead>
                  <TableHead className="w-24">{t('fInvoice.remark')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-center">{item.itemOrder}</TableCell>
                    <TableCell>{item.itemName}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatKRW(item.unitPrice)}</TableCell>
                    <TableCell className="text-right font-medium">{formatKRW(item.supplyAmount)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.remark}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={4} className="text-right">{t('fInvoice.totalAmount')}</TableCell>
                  <TableCell className="text-right">{formatKRW(invoice.totalAmount)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {invoice.note && (
            <div className="text-sm">
              <span className="text-muted-foreground">{t('fInvoice.note')}:</span> {invoice.note}
            </div>
          )}
        </div>

        {(isAccounting && invoice.status === 'submitted') || canDelete ? (
          <DialogFooter className="gap-2">
            {canDelete && (
              <Button
                variant="outline"
                className="gap-1.5 text-red-600 hover:text-red-700 mr-auto"
                disabled={deleteInvoice.isPending}
                onClick={async () => {
                  const isApproved = invoice.status === 'approved'
                  const confirmMsg = isApproved
                    ? t('fInvoice.deleteApprovedConfirm', {
                        name: invoice.freelancerName || '',
                        amount: formatKRW(invoice.totalAmount),
                      })
                    : t('fInvoice.deleteConfirm')
                  if (confirm(confirmMsg)) {
                    await deleteInvoice.mutateAsync(invoice.id)
                    onOpenChange(false)
                  }
                }}
              >
                <Trash2 className="size-4" />
                {t('fInvoice.delete')}
              </Button>
            )}
            {isAccounting && invoice.status === 'submitted' && (
              <>
                <Button
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-700"
                  onClick={async () => { await updateStatus.mutateAsync({ id: invoice.id, status: 'rejected' }); onOpenChange(false) }}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="size-4" />
                  {t('fInvoice.reject')}
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={async () => { await updateStatus.mutateAsync({ id: invoice.id, status: 'approved' }); onOpenChange(false) }}
                  disabled={updateStatus.isPending}
                >
                  <CheckCircle2 className="size-4" />
                  {t('fInvoice.approve')}
                </Button>
              </>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ─── Excel Export ──────────────────────────────────────────────────────────

async function exportInvoicesToExcel(invoices: FreelancerInvoice[], month: string) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(`인보이스_${month}`)

  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: '프리랜서', key: 'name', width: 15 },
    { header: '이메일', key: 'email', width: 25 },
    { header: '날짜', key: 'date', width: 12 },
    { header: '정산월', key: 'month', width: 10 },
    { header: '합계', key: 'total', width: 15 },
    { header: '상태', key: 'status', width: 10 },
    { header: '주민등록번호', key: 'resident', width: 18 },
    { header: '전화번호', key: 'phone', width: 15 },
    { header: '입금계좌', key: 'bank', width: 30 },
    { header: '비고', key: 'note', width: 20 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, size: 11 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }

  const statusMap: Record<string, string> = { draft: '임시저장', submitted: '제출됨', approved: '승인', rejected: '반려' }

  invoices.forEach((inv, i) => {
    ws.addRow({
      no: i + 1,
      name: inv.freelancerName || '',
      email: inv.freelancerEmail || '',
      date: inv.invoiceDate,
      month: inv.invoiceMonth,
      total: inv.totalAmount,
      status: statusMap[inv.status] || inv.status,
      resident: inv.residentNumber || '',
      phone: inv.phone || '',
      bank: inv.bankAccount || '',
      note: inv.note || '',
    })
  })

  ws.getColumn('total').numFmt = '#,##0'

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `프리랜서_인보이스_${month}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Auto-generate tab (consultant management-fee invoices) ─────────────────

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/** Treat a student as active unless their status explicitly says otherwise. */
function isActiveStudent(status?: string): boolean {
  if (!status) return true
  return !/(pause|중단|중지|hold|ended|종료|해지|complete|완료|graduat|졸업|inactive)/i.test(status)
}

function studentLabel(name?: string, koreanName?: string): string {
  const ko = (koreanName || '').trim()
  const en = (name || '').trim()
  if (ko && en && ko !== en) return `${ko} (${en})`
  return ko || en || '—'
}

// ─── Shared: accounting access + billable students ─────────────────────────

const ACCOUNTING_EMAIL = 'accounting@quantumadmissions.com'

export interface BillableStudent { id: string; label: string; done: number; billable: boolean }

/** Per consultant NAME → their active students with billable flag (>=2 report-uploaded meetings this month). */
function useConsultantBillable(month: string) {
  const consultantName = useConsultantName()
  const { data: students = [] } = useServiceStudents()
  const { start, end } = monthRange(month)
  const { data: meetings = [] } = useAllServiceMeetings(start, end)

  return useMemo(() => {
    const completed = new Map<string, number>()
    for (const mt of meetings) {
      if ((mt.reportStatus === 'submitted' || !!mt.reportUrl) && mt.status !== 'cancelled') {
        completed.set(mt.studentId, (completed.get(mt.studentId) || 0) + 1)
      }
    }
    const byConsultant = new Map<string, BillableStudent[]>()
    students.filter(s => isActiveStudent(s.status) && s.assignedConsultant).forEach(s => {
      const nm = consultantName(s.assignedConsultant)
      const done = completed.get(s.id) || 0
      const arr = byConsultant.get(nm) || []
      arr.push({ id: s.id, label: studentLabel(s.name, s.koreanName), done, billable: done >= 2 })
      byConsultant.set(nm, arr)
    })
    return byConsultant
  }, [students, meetings, consultantName])
}

// ─── Main Page ────────────────────────────────────────────────────────────

export function FreelancerInvoicesPage() {
  const t = useT()
  const { user } = useAuth()
  const isAccounting = (user?.email || '').toLowerCase() === ACCOUNTING_EMAIL

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<FreelancerInvoice | undefined>()
  const [detailInvoice, setDetailInvoice] = useState<FreelancerInvoice | undefined>()
  const [exporting, setExporting] = useState(false)
  const [uploadedData, setUploadedData] = useState<ParsedInvoice | undefined>()
  const [uploading, setUploading] = useState(false)

  const { data: editItems } = useInvoiceItems(editInvoice?.id)

  const { data: allInvoices = [], isLoading: allLoading } = useFreelancerInvoices(
    isAccounting ? (selectedMonth === 'all' ? undefined : selectedMonth) : undefined,
  )
  const { data: myInvoices = [], isLoading: myLoading } = useMyInvoices(
    !isAccounting ? user?.id : undefined,
  )
  const deleteInvoice = useDeleteInvoice()

  const invoices = isAccounting ? allInvoices : myInvoices
  const loading = isAccounting ? allLoading : myLoading

  const filtered = useMemo(() => {
    let list = invoices
    if (statusFilter !== 'all') list = list.filter(inv => inv.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(inv =>
        inv.freelancerName?.toLowerCase().includes(q) ||
        inv.freelancerEmail?.toLowerCase().includes(q),
      )
    }
    return list
  }, [invoices, statusFilter, search])

  const monthOptions = getMonthOptions()
  const grandTotal = filtered.reduce((s, inv) => s + inv.totalAmount, 0)

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportInvoicesToExcel(filtered, selectedMonth)
    } finally {
      setExporting(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const parsed = await parseInvoiceExcel(file)
      setUploadedData(parsed)
      setEditInvoice(undefined)
      setFormOpen(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('fInvoice.cannotReadFile'))
    } finally {
      setUploading(false)
    }
  }

  // The freelancer's own billable students (>=2 report-uploaded meetings) this month.
  const issueMonth = selectedMonth === 'all' ? getCurrentMonth() : selectedMonth
  const byConsultant = useConsultantBillable(issueMonth)
  const myBillable = useMemo(() => {
    const rows = (user?.name && byConsultant.get(user.name)) || []
    return rows.filter(r => r.billable)
  }, [byConsultant, user?.name])

  // "인보이스 발행" — open the form pre-filled with this month's billable students.
  const openIssueInvoice = () => {
    const initial: ParsedInvoice = {
      invoiceDate: new Date().toISOString().slice(0, 10),
      residentNumber: '', phone: '', email: user?.email || '', bankAccount: '',
      items: myBillable.length
        ? myBillable.map(r => ({ itemName: r.label, quantity: 1, unitPrice: 0, remark: '' }))
        : [emptyItem()],
    }
    setEditInvoice(undefined)
    setUploadedData(initial)
    setFormOpen(true)
  }

  const listActions = (
        <div className="flex items-center gap-2 justify-end">
          {isAccounting && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting || filtered.length === 0}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t('fInvoice.exportExcel')}
            </Button>
          )}
        </div>
  )

  const listView = (
    <div className="space-y-6">
      {listActions}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {isAccounting && (
          <Select value={selectedMonth} onValueChange={v => v && setSelectedMonth(v)}>
            <SelectTrigger className="w-40 h-9">
              <span>{selectedMonth === 'all' ? t('fInvoice.all') : selectedMonth}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fInvoice.all')}</SelectItem>
              {monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={v => v && setStatusFilter(v)}>
          <SelectTrigger className="w-32 h-9">
            <span>{statusFilter === 'all' ? t('fInvoice.all') : t(STATUS_LABELS[statusFilter])}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('fInvoice.all')}</SelectItem>
            <SelectItem value="submitted">{t('fInvoice.statusSubmitted')}</SelectItem>
            <SelectItem value="approved">{t('fInvoice.statusApproved')}</SelectItem>
            <SelectItem value="rejected">{t('fInvoice.statusRejected')}</SelectItem>
          </SelectContent>
        </Select>

        {isAccounting && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('fInvoice.searchPlaceholder')} className="h-9 pl-9" />
          </div>
        )}

        <div className="ml-auto text-sm font-medium">
          {filtered.length} {t('fInvoice.count')} · {formatKRW(grandTotal)}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">{t('fInvoice.noInvoices')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  {isAccounting && <TableHead>{t('fInvoice.freelancer')}</TableHead>}
                  <TableHead>{t('fInvoice.month')}</TableHead>
                  <TableHead>{t('fInvoice.date')}</TableHead>
                  <TableHead className="text-right">{t('fInvoice.totalAmount')}</TableHead>
                  <TableHead>{t('fInvoice.bankAccount')}</TableHead>
                  <TableHead>{t('fInvoice.status')}</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(inv => (
                  <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailInvoice(inv)}>
                    {isAccounting && (
                      <TableCell className="font-medium">
                        <div>{inv.freelancerName}</div>
                        <div className="text-xs text-muted-foreground">{inv.freelancerEmail}</div>
                      </TableCell>
                    )}
                    <TableCell>{inv.invoiceMonth}</TableCell>
                    <TableCell>{inv.invoiceDate}</TableCell>
                    <TableCell className="text-right font-medium">{formatKRW(inv.totalAmount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{inv.bankAccount}</TableCell>
                    <TableCell>
                      <Badge className={`text-[11px] ${STATUS_COLORS[inv.status]}`}>{t(STATUS_LABELS[inv.status])}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDetailInvoice(inv)}>
                          <Eye className="size-3.5" />
                        </Button>
                        {/* Edit: own invoice (any non-approved) or admin (non-approved only) */}
                        {(inv.freelancerId === user?.id || isAccounting) && inv.status !== 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => { setEditInvoice(inv); setFormOpen(true) }}
                          >
                            <FileText className="size-3.5" />
                          </Button>
                        )}
                        {/* Delete: admin always, freelancer only if not approved */}
                        {(isAccounting || (inv.freelancerId === user?.id && inv.status !== 'approved')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            disabled={deleteInvoice.isPending}
                            onClick={async () => {
                              const isApproved = inv.status === 'approved'
                              const confirmMsg = isApproved
                                ? t('fInvoice.deleteApprovedConfirm', {
                                    name: inv.freelancerName || '',
                                    amount: formatKRW(inv.totalAmount),
                                  })
                                : t('fInvoice.deleteConfirm')
                              if (confirm(confirmMsg)) {
                                await deleteInvoice.mutateAsync(inv.id)
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const freelancerView = (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">정산월</Label>
          <Select value={issueMonth} onValueChange={v => v && setSelectedMonth(v)}>
            <SelectTrigger className="h-9 w-40"><span>{issueMonth}</span></SelectTrigger>
            <SelectContent>{monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button className="gap-1.5" onClick={openIssueInvoice}>
          <Plus className="size-4" />인보이스 발행
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 relative h-9" disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          엑셀 업로드
          <input type="file" accept=".xlsx,.xls" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUpload} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm">
            <b>{issueMonth}</b> 청구 가능 학생 <span className="font-bold text-emerald-600">{myBillable.length}</span>명
            <span className="text-muted-foreground"> · 미팅리포트 월 2회 업로드 완료 학생만 발행 가능</span>
          </div>
          {myBillable.length === 0 ? (
            <p className="text-sm text-muted-foreground">이 달에 조건을 충족한 학생이 없습니다. (미팅리포트 2회 업로드 필요)</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {myBillable.map(r => <Badge key={r.id} variant="outline">{r.label}</Badge>)}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">"인보이스 발행"을 누르면 위 학생이 품명에 채워진 견적서 폼이 열립니다. 사업자정보·단가·입금계좌를 채우고 제출하세요. 사업자정보가 다르면 여러 건 발행할 수 있습니다.</p>
        </CardContent>
      </Card>

      <div className="text-sm font-semibold text-gray-700">내 인보이스</div>
      {listView}
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">{isAccounting ? '프리랜서 인보이스 (재무)' : '인보이스 발행'}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{isAccounting ? '제출된 인보이스를 확인·승인하고 엑셀로 다운로드합니다.' : '이 달 서비스를 제공한 학생으로 인보이스를 발행하세요.'}</p>
      </div>

      {isAccounting ? (
        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">인보이스 목록</TabsTrigger>
            <TabsTrigger value="missing">미제출 현황</TabsTrigger>
          </TabsList>
          <TabsContent value="list">{listView}</TabsContent>
          <TabsContent value="missing"><MissingInvoices month={issueMonth} /></TabsContent>
        </Tabs>
      ) : freelancerView}

      {/* Dialogs */}
      {formOpen && user && (
        <InvoiceFormDialog
          open={formOpen}
          onOpenChange={open => { setFormOpen(open); if (!open) setUploadedData(undefined) }}
          invoice={editInvoice}
          existingItems={editItems || undefined}
          userId={editInvoice?.freelancerId || user.id}
          initialData={uploadedData}
        />
      )}

      {detailInvoice && (
        <InvoiceDetailDialog
          open={!!detailInvoice}
          onOpenChange={open => { if (!open) setDetailInvoice(undefined) }}
          invoice={detailInvoice}
        />
      )}
    </div>
  )
}

// ─── Missing-invoice tracking (accounting) ─────────────────────────────────

function MissingInvoices({ month }: { month: string }) {
  const { data: invoices = [] } = useFreelancerInvoices(month)
  const { data: profiles = [] } = useProfiles()
  const byConsultant = useConsultantBillable(month)
  const send = useSendMessage()
  const [sending, setSending] = useState<string | null>(null)

  const rows = useMemo(() => {
    const out: { name: string; billableCount: number; status: 'none' | 'submitted' | 'approved' }[] = []
    byConsultant.forEach((students, name) => {
      const billableCount = students.filter(s => s.billable).length
      if (billableCount === 0) return
      const theirs = invoices.filter(inv => inv.freelancerName === name)
      const status = theirs.some(i => i.status === 'approved') ? 'approved'
        : theirs.some(i => i.status === 'submitted') ? 'submitted' : 'none'
      out.push({ name, billableCount, status })
    })
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [byConsultant, invoices])

  const request = async (name: string) => {
    const profile = profiles.find(p => p.name === name)
    if (!profile) { alert(`'${name}' 직원 계정을 찾을 수 없습니다.`); return }
    setSending(name)
    try {
      await send.mutateAsync({ receiverId: profile.id, content: `[인보이스 요청] ${month} 프리랜서 인보이스를 발행·제출해 주세요. (청구 가능 학생이 있습니다)` })
      alert(`${name}님에게 인보이스 요청 메시지를 보냈습니다.`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '전송에 실패했습니다.')
    } finally {
      setSending(null)
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-4 text-sm text-muted-foreground">
          {month} 청구 대상 컨설턴트별 인보이스 제출 현황입니다. '승인완료'가 아닌 대상에게 요청 메시지를 보낼 수 있습니다.
        </div>
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>컨설턴트</TableHead>
              <TableHead className="text-center w-28">청구 가능</TableHead>
              <TableHead className="w-40">상태</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">청구 대상이 없습니다.</TableCell></TableRow>
            )}
            {rows.map(r => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-center">{r.billableCount}명</TableCell>
                <TableCell>
                  {r.status === 'approved' ? <Badge className="bg-green-100 text-green-700">승인완료</Badge>
                    : r.status === 'submitted' ? <Badge className="bg-blue-100 text-blue-700">제출됨(미승인)</Badge>
                    : <Badge className="bg-red-100 text-red-700">미제출</Badge>}
                </TableCell>
                <TableCell>
                  {r.status !== 'approved' && (
                    <Button size="sm" variant="outline" disabled={sending === r.name} onClick={() => request(r.name)}>
                      {sending === r.name ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}요청
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
