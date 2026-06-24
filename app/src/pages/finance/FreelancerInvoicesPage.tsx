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
import {
  FileText, Plus, Trash2, Download, CheckCircle2, XCircle,
  Eye, Loader2, Search, Upload,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
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
            <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="은행명 계좌번호 예금주" className="h-9" />
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">항목</Label>
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
                          placeholder="예: 영상편집"
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
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'

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

        {isAdmin && invoice.status === 'submitted' && (
          <DialogFooter>
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
          </DialogFooter>
        )}
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

// ─── Main Page ────────────────────────────────────────────────────────────

export function FreelancerInvoicesPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'
  const isFreelancer = user?.role === 'freelancer' || user?.role === 'external'

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
    isAdmin ? (selectedMonth === 'all' ? undefined : selectedMonth) : undefined,
  )
  const { data: myInvoices = [], isLoading: myLoading } = useMyInvoices(
    !isAdmin ? user?.id : undefined,
  )
  const deleteInvoice = useDeleteInvoice()

  const invoices = isAdmin ? allInvoices : myInvoices
  const loading = isAdmin ? allLoading : myLoading

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
      alert(err instanceof Error ? err.message : '파일을 읽을 수 없습니다')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{isAdmin ? t('fInvoice.title') : t('fInvoice.myTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isAdmin ? t('fInvoice.subtitle') : t('fInvoice.mySubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting || filtered.length === 0}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {t('fInvoice.exportExcel')}
            </Button>
          )}
          {(isFreelancer || isAdmin) && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 relative" disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                엑셀 업로드
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleUpload}
                />
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditInvoice(undefined); setUploadedData(undefined); setFormOpen(true) }}>
                <Plus className="size-4" />
                {t('fInvoice.create')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {isAdmin && (
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

        {isAdmin && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 검색..." className="h-9 pl-9" />
          </div>
        )}

        <div className="ml-auto text-sm font-medium">
          {filtered.length}건 · {formatKRW(grandTotal)}
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
                  {isAdmin && <TableHead>{t('fInvoice.freelancer')}</TableHead>}
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
                    {isAdmin && (
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
                        {(inv.freelancerId === user?.id || isAdmin) && inv.status !== 'approved' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => { setEditInvoice(inv); setFormOpen(true) }}
                            >
                              <FileText className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                              onClick={async () => {
                                if (confirm(t('fInvoice.deleteConfirm'))) {
                                  await deleteInvoice.mutateAsync(inv.id)
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
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
