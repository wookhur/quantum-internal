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
import { useAllEditorMeetingsInRange } from '@/hooks/useEditorMeetings'
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
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'
  const canDelete = isAdmin || (invoice.freelancerId === user?.id && invoice.status !== 'approved')

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

        {(isAdmin && invoice.status === 'submitted') || canDelete ? (
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
            {isAdmin && invoice.status === 'submitted' && (
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

/** Fill the uploaded 견적서 template: B=품명(학생이름), C=수량(1). Amounts left blank. */
async function generateConsultantInvoiceExcel(consultant: string, names: string[], month: string) {
  const { default: ExcelJS } = await import('exceljs')
  const res = await fetch('/freelancer-invoice-template.xlsx')
  if (!res.ok) throw new Error('인보이스 양식 파일을 불러올 수 없습니다.')
  const buf = await res.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)

  // Keep only the first sheet, name it for the month.
  const ws = wb.worksheets[0]
  const [y, m] = month.split('-').map(Number)
  for (let i = wb.worksheets.length - 1; i >= 1; i--) wb.removeWorksheet(wb.worksheets[i].id)
  ws.name = `${m}월`

  // Invoice date (template uses M.D.YYYY in C5)
  try { ws.getCell('C5').value = `${m}.1.${y}` } catch { /* ignore */ }

  // Find the 합계(total) row so we don't overwrite it.
  let sumRow = 23
  for (let r = 15; r <= 80; r++) {
    const v = ws.getCell(r, 1).value
    if (v != null && String(v).includes('합')) { sumRow = r; break }
  }
  const dataStart = 15
  let capacity = sumRow - dataStart
  if (names.length > capacity) {
    const extra = names.length - capacity
    ws.spliceRows(sumRow, 0, ...Array.from({ length: extra }, () => [] as unknown[]))
    sumRow += extra
    capacity += extra
  }
  for (let i = 0; i < capacity; i++) {
    const r = dataStart + i
    if (i < names.length) {
      ws.getCell(r, 1).value = i + 1     // No.
      ws.getCell(r, 2).value = names[i]  // 품명 = 학생이름
      ws.getCell(r, 3).value = 1         // 수량 = 1
    } else {
      ws.getCell(r, 1).value = null
      ws.getCell(r, 2).value = null
      ws.getCell(r, 3).value = null
    }
  }

  const out = await wb.xlsx.writeBuffer()
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `프리랜서_인보이스_${consultant}_${month}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ConsultantInvoicePanel() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [consultant, setConsultant] = useState<string>('')   // consultant display NAME
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)

  const consultantName = useConsultantName()
  const { data: profiles = [] } = useProfiles()
  const { data: students = [] } = useServiceStudents()
  const { start, end } = monthRange(month)
  const { data: meetings = [] } = useAllServiceMeetings(start, end)
  const createInvoice = useCreateInvoice()

  // Count meetings with an uploaded summary report, per student, this month.
  const completedByStudent = useMemo(() => {
    const map = new Map<string, number>()
    for (const mt of meetings) {
      if (mt.reportStatus === 'submitted' && mt.status !== 'cancelled') {
        map.set(mt.studentId, (map.get(mt.studentId) || 0) + 1)
      }
    }
    return map
  }, [meetings])

  const activeStudents = useMemo(
    () => students.filter(s => isActiveStudent(s.status) && s.assignedConsultant),
    [students],
  )

  // Group active students by their consultant's display NAME (resolves slug/UUID ids).
  const consultantGroups = useMemo(() => {
    const map = new Map<string, typeof activeStudents>()
    activeStudents.forEach(s => {
      const nm = consultantName(s.assignedConsultant)
      const arr = map.get(nm) || []
      arr.push(s)
      map.set(nm, arr)
    })
    return map
  }, [activeStudents, consultantName])

  const consultants = useMemo(
    () => Array.from(consultantGroups.keys()).sort((a, b) => a.localeCompare(b, 'ko')),
    [consultantGroups],
  )

  const rows = useMemo(() => {
    const list = consultant ? (consultantGroups.get(consultant) || []) : []
    return list
      .map(s => {
        const done = completedByStudent.get(s.id) || 0
        return { id: s.id, label: studentLabel(s.name, s.koreanName), done, billable: done >= 2 }
      })
      .sort((a, b) => Number(b.billable) - Number(a.billable) || a.label.localeCompare(b.label))
  }, [consultant, consultantGroups, completedByStudent])

  const billable = rows.filter(r => r.billable)

  const handleGenerate = async () => {
    if (!consultant || billable.length === 0) return
    setGenerating(true)
    try {
      await generateConsultantInvoiceExcel(consultant, billable.map(r => r.label), month)
    } catch (e) {
      alert(e instanceof Error ? e.message : '엑셀 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const handleAddInvoice = async () => {
    if (!consultant || billable.length === 0) return
    const profile = profiles.find(p => p.name === consultant)
    if (!profile) {
      alert(`'${consultant}' 직원 계정을 찾을 수 없어 인보이스를 만들 수 없습니다.\n직원정보에 등록된 이름과 일치해야 합니다.`)
      return
    }
    if (!confirm(`${consultant} · ${month}\n청구 가능 ${billable.length}명으로 인보이스를 추가할까요?`)) return
    setCreating(true)
    try {
      await createInvoice.mutateAsync({
        freelancerId: profile.id,
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceMonth: month,
        items: billable.map(r => ({ itemName: r.label, quantity: 1, unitPrice: 0 })),
      })
      alert(`인보이스가 추가되었습니다 (${billable.length}명).\n'인보이스 목록' 탭에서 금액 입력·승인하세요.`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '인보이스 추가에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">정산월</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">컨설턴트</Label>
          <Select value={consultant} onValueChange={v => v && setConsultant(v)}>
            <SelectTrigger className="h-9">
              <span>{consultant || '컨설턴트 선택'}</span>
            </SelectTrigger>
            <SelectContent>
              {consultants.length === 0
                ? <div className="px-2 py-1.5 text-sm text-muted-foreground">active 학생이 있는 컨설턴트가 없습니다</div>
                : consultants.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-1.5" disabled={!consultant || billable.length === 0 || creating} onClick={handleAddInvoice}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          인보이스 추가
        </Button>
        <Button variant="outline" className="gap-1.5" disabled={!consultant || billable.length === 0 || generating} onClick={handleGenerate}>
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          엑셀 다운로드
        </Button>
      </div>

      {consultant && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="font-semibold text-base">{consultant}</span>
              <span>청구 가능 <span className="font-bold text-emerald-600 text-base">{billable.length}</span>명</span>
              <span className="text-muted-foreground">/ active {rows.length}명</span>
            </div>
            <p className="text-xs text-muted-foreground">
              ※ 해당 월에 상담요약보고서가 업로드된 미팅이 <b>2회 이상</b>인 학생만 청구 가능합니다. 다운로드 시 청구 가능 학생만 품명에 채워집니다.
            </p>
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>학생</TableHead>
                  <TableHead className="text-center w-36">완료 미팅(보고서)</TableHead>
                  <TableHead className="text-center w-24">청구 가능</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-center">{r.done} / 2</TableCell>
                    <TableCell className="text-center">
                      {r.billable
                        ? <Badge className="bg-emerald-100 text-emerald-700">가능</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">미달</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">학생이 없습니다.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EditorInvoicePanel() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [editor, setEditor] = useState('')
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data: profiles = [] } = useProfiles()
  const { start, end } = monthRange(month)
  const { data: editorMeetings = [] } = useAllEditorMeetingsInRange(start, end)
  const createInvoice = useCreateInvoice()

  const editors = useMemo(() => {
    const set = new Set<string>()
    editorMeetings.forEach(m => { if (m.editor) set.add(m.editor) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [editorMeetings])

  const rows = useMemo(() => {
    if (!editor) return []
    return editorMeetings
      .filter(m => m.editor === editor)
      .map(m => ({
        id: m.id,
        date: m.meetingDate || '',
        student: studentLabel(m.studentName, m.studentKoreanName),
        content: m.content || '',
      }))
  }, [editor, editorMeetings])

  const count = rows.length
  const itemLabel = (r: { student: string; date: string }) =>
    `${r.student}${r.date ? ` (${r.date.slice(5).replace('-', '/')})` : ''}`

  const handleGenerate = async () => {
    if (!editor || count === 0) return
    setGenerating(true)
    try {
      await generateConsultantInvoiceExcel(editor, rows.map(itemLabel), month)
    } catch (e) {
      alert(e instanceof Error ? e.message : '엑셀 생성에 실패했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const handleAddInvoice = async () => {
    if (!editor || count === 0) return
    const profile = profiles.find(p => p.name === editor)
    if (!profile) {
      alert(`'${editor}' 직원 계정을 찾을 수 없어 인보이스를 만들 수 없습니다.\n직원정보에 등록된 이름과 일치해야 합니다.`)
      return
    }
    if (!confirm(`${editor} · ${month}\n미팅 ${count}회로 인보이스를 추가할까요?`)) return
    setCreating(true)
    try {
      await createInvoice.mutateAsync({
        freelancerId: profile.id,
        invoiceDate: new Date().toISOString().slice(0, 10),
        invoiceMonth: month,
        items: rows.map(r => ({ itemName: itemLabel(r), quantity: 1, unitPrice: 0 })),
      })
      alert(`인보이스가 추가되었습니다 (${count}회).\n'인보이스 목록' 탭에서 금액 입력·승인하세요.`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '인보이스 추가에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">정산월</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">에세이 에디터</Label>
          <Select value={editor} onValueChange={v => v && setEditor(v)}>
            <SelectTrigger className="h-9"><span>{editor || '에디터 선택'}</span></SelectTrigger>
            <SelectContent>
              {editors.length === 0
                ? <div className="px-2 py-1.5 text-sm text-muted-foreground">이 달에 미팅 기록이 있는 에디터가 없습니다</div>
                : editors.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-1.5" disabled={!editor || count === 0 || creating} onClick={handleAddInvoice}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          인보이스 추가
        </Button>
        <Button variant="outline" className="gap-1.5" disabled={!editor || count === 0 || generating} onClick={handleGenerate}>
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          엑셀 다운로드
        </Button>
      </div>

      {editor && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="font-semibold text-base">{editor}</span>
              <span>진행 미팅 <span className="font-bold text-emerald-600 text-base">{count}</span>회</span>
            </div>
            <p className="text-xs text-muted-foreground">
              ※ 에세이 에디터 미팅일지에 <b>진행일자</b>가 입력된 미팅만 집계됩니다. 미팅 1회당 1건으로 인보이스에 들어갑니다.
            </p>
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-28">날짜</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date || '—'}</TableCell>
                    <TableCell className="font-medium">{r.student}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">{r.content || '—'}</TableCell>
                  </TableRow>
                ))}
                {count === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">진행한 미팅이 없습니다.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AutoGenerateInvoiceTab() {
  const [mode, setMode] = useState<'consultant' | 'editor'>('consultant')
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border overflow-hidden">
        <button
          onClick={() => setMode('consultant')}
          className={`px-3 h-8 text-sm font-medium ${mode === 'consultant' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >컨설턴트</button>
        <button
          onClick={() => setMode('editor')}
          className={`px-3 h-8 text-sm font-medium border-l ${mode === 'editor' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >에세이 에디터</button>
      </div>
      {mode === 'consultant' ? <ConsultantInvoicePanel /> : <EditorInvoicePanel />}
    </div>
  )
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
      alert(err instanceof Error ? err.message : t('fInvoice.cannotReadFile'))
    } finally {
      setUploading(false)
    }
  }

  const listActions = (
        <div className="flex items-center gap-2 justify-end">
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
                {t('fInvoice.excelUpload')}
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
  )

  const listView = (
    <div className="space-y-6">
      {listActions}

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
                        {/* Edit: own invoice (any non-approved) or admin (non-approved only) */}
                        {(inv.freelancerId === user?.id || isAdmin) && inv.status !== 'approved' && (
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
                        {(isAdmin || (inv.freelancerId === user?.id && inv.status !== 'approved')) && (
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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">{isAdmin ? t('fInvoice.title') : t('fInvoice.myTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{isAdmin ? t('fInvoice.subtitle') : t('fInvoice.mySubtitle')}</p>
      </div>

      {isFreelancer ? listView : (
        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">인보이스 목록</TabsTrigger>
            <TabsTrigger value="auto">자동 생성</TabsTrigger>
          </TabsList>
          <TabsContent value="list">{listView}</TabsContent>
          <TabsContent value="auto"><AutoGenerateInvoiceTab /></TabsContent>
        </Tabs>
      )}

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
