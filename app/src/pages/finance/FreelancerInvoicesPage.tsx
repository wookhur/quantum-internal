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
  Eye, Loader2, Search,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceMeetings } from '@/hooks/useServiceDashboard'
import { useConsultantName, canonicalConsultantName } from '@/lib/consultants'
import { useIncentivesByInstallment } from '@/hooks/useIncentives'
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

// ─── Parsed invoice shape (used to pre-fill the form) ──────────────────────

interface ParsedInvoice {
  invoiceDate: string
  residentNumber: string
  phone: string
  email: string
  bankAccount: string
  note?: string
  items: ItemRow[]
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
  kind,
  allowAddItems,
  businessLabels,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice?: FreelancerInvoice
  existingItems?: InvoiceItem[]
  userId: string
  initialData?: ParsedInvoice
  kind?: string
  allowAddItems?: boolean
  businessLabels?: boolean
}) {
  const t = useT()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()

  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoiceDate || invoice?.invoiceDate || new Date().toISOString().slice(0, 10))
  const [invoiceMonth, setInvoiceMonth] = useState(invoice?.invoiceMonth || getCurrentMonth())
  const [residentNumber, setResidentNumber] = useState(initialData?.residentNumber || invoice?.residentNumber || '')
  const [phone, setPhone] = useState(initialData?.phone || invoice?.phone || '')
  const [bankAccount, setBankAccount] = useState(initialData?.bankAccount || invoice?.bankAccount || '')
  const [note, setNote] = useState(initialData?.note || invoice?.note || '')
  const [items, setItems] = useState<ItemRow[]>(
    initialData?.items?.length
      ? initialData.items
      : existingItems?.length
        ? existingItems.map(it => ({ itemName: it.itemName, quantity: it.quantity, unitPrice: it.unitPrice, remark: it.remark || '' }))
        : [emptyItem()],
  )
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const totalAmount = useMemo(() => items.reduce((s, it) => s + it.quantity * it.unitPrice, 0), [items])

  const handleDownload = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      await downloadInvoiceExcel(
        { ...invoice, invoiceDate, residentNumber, phone, bankAccount, totalAmount },
        items.filter(it => it.itemName.trim() || it.unitPrice).map(it => ({
          itemName: it.itemName, quantity: it.quantity, unitPrice: it.unitPrice,
          supplyAmount: it.quantity * it.unitPrice, remark: it.remark,
        })),
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

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
          kind,
          residentNumber,
          phone,
          bankAccount,
          note,
          items: validItems,
        })
      }
      onOpenChange(false)
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`제출에 실패했습니다.\n${msg}\n\n(kind 컬럼 오류라면 freelancer_invoices 마이그레이션을 실행해 주세요.)`)
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
              <Label className="text-xs">{businessLabels ? '사업자등록번호' : t('fInvoice.residentNumber')}</Label>
              <Input value={residentNumber} onChange={e => setResidentNumber(e.target.value)} placeholder={businessLabels ? '000-00-00000' : '000000-0000000'} className="h-9" />
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

          {/* Items Table (fixed to authorized students — no manual add) */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t('fInvoice.items')}</Label>

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
            {allowAddItems && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setItems(prev => [...prev, emptyItem()])}>
                <Plus className="size-3.5" />항목 추가
              </Button>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('fInvoice.note')}</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>

        <DialogFooter>
          {invoice && (
            <Button variant="outline" className="gap-1.5 mr-auto" disabled={downloading} onClick={handleDownload}>
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              엑셀 다운로드
            </Button>
          )}
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

/** Download a single invoice as the uploaded 견적서 template, filled in. */
async function downloadInvoiceExcel(
  invoice: FreelancerInvoice,
  items: { itemName: string; quantity: number; unitPrice: number; supplyAmount: number; remark?: string | null }[],
) {
  const { default: ExcelJS } = await import('exceljs')
  const res = await fetch('/freelancer-invoice-template.xlsx')
  if (!res.ok) throw new Error('견적서 양식 파일을 불러올 수 없습니다.')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await res.arrayBuffer())
  const ws = wb.worksheets[0]
  for (let i = wb.worksheets.length - 1; i >= 1; i--) wb.removeWorksheet(wb.worksheets[i].id)

  const set = (ref: string, v: unknown) => { try { ws.getCell(ref).value = (v ?? '') as never } catch { /* ignore */ } }
  // Date + supplier (freelancer) info
  set('C5', invoice.invoiceDate)
  set('F6', invoice.freelancerName)
  set('H6', invoice.residentNumber)
  set('F7', invoice.phone)
  set('F8', invoice.freelancerEmail)

  // Find the 합계(total) row so item rows don't overwrite it.
  let sumRow = 23
  for (let r = 15; r <= 80; r++) {
    const v = ws.getCell(r, 1).value
    if (v != null && String(v).includes('합')) { sumRow = r; break }
  }
  const dataStart = 15
  let capacity = sumRow - dataStart
  if (items.length > capacity) {
    const extra = items.length - capacity
    ws.spliceRows(sumRow, 0, ...Array.from({ length: extra }, () => [] as unknown[]))
    sumRow += extra; capacity += extra
  }
  for (let i = 0; i < capacity; i++) {
    const r = dataStart + i
    if (i < items.length) {
      const it = items[i]
      ws.getCell(r, 1).value = i + 1              // No.
      ws.getCell(r, 2).value = it.itemName        // 품명
      ws.getCell(r, 3).value = it.quantity        // 수량
      ws.getCell(r, 4).value = it.unitPrice        // 단가
      ws.getCell(r, 5).value = it.supplyAmount     // 공급가액
      ws.getCell(r, 6).value = it.remark || null   // 비고
    } else {
      ws.getCell(r, 1).value = null
      ws.getCell(r, 2).value = null
      ws.getCell(r, 3).value = null
    }
  }
  ws.getCell(sumRow, 5).value = invoice.totalAmount  // 합계

  // 입금계좌 row (label contains 입금)
  for (let r = sumRow; r <= sumRow + 4; r++) {
    const v = ws.getCell(r, 1).value
    if (v != null && String(v).includes('입금')) { ws.getCell(r, 1).value = `입금계좌 : ${invoice.bankAccount || ''}`; break }
  }

  const out = await wb.xlsx.writeBuffer()
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `견적서_${invoice.freelancerName || 'invoice'}_${invoice.invoiceMonth}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ─── Business invoice: template download + upload parsing (사업자) ──────────

function saveBlob(buf: ArrayBuffer, name: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

const BIZ_INFO_LABELS = ['상호(회사명)', '사업자등록번호', '대표자명', '연락처', '이메일', '입금계좌']
const BIZ_ITEM_HEADER_ROW = 10

async function downloadBusinessTemplate() {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('인보이스')
  ws.columns = [{ width: 18 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 20 }]
  ws.getCell('A1').value = '■ 발행자 정보 (B열에 값을 입력하세요)'
  ws.getCell('A1').font = { bold: true }
  BIZ_INFO_LABELS.forEach((label, i) => {
    const c = ws.getCell(`A${i + 2}`)
    c.value = label
    c.font = { bold: true }
  })
  ws.getCell(`A${BIZ_ITEM_HEADER_ROW - 1}`).value = '■ 품목 (여러 줄 입력 가능, 예시 줄은 지우고 작성)'
  ws.getCell(`A${BIZ_ITEM_HEADER_ROW - 1}`).font = { bold: true }
  ;['품목', '수량', '단가', '비고'].forEach((h, i) => {
    const c = ws.getCell(BIZ_ITEM_HEADER_ROW, i + 1)
    c.value = h; c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
  })
  ws.getCell(BIZ_ITEM_HEADER_ROW + 1, 1).value = '예) 컨설팅 용역'
  ws.getCell(BIZ_ITEM_HEADER_ROW + 1, 2).value = 1
  ws.getCell(BIZ_ITEM_HEADER_ROW + 1, 3).value = 1000000
  const out = await wb.xlsx.writeBuffer()
  saveBlob(out as ArrayBuffer, '인보이스_양식.xlsx')
}

async function parseBusinessInvoice(file: File): Promise<ParsedInvoice> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('엑셀에서 시트를 찾을 수 없습니다.')
  const cell = (ref: string) => {
    const v = ws.getCell(ref).value as unknown
    if (v == null) return ''
    if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
      return String((v as Record<string, unknown>).text).trim()
    }
    return String(v).trim()
  }
  // Info values are in column B, rows 2..7 (order = BIZ_INFO_LABELS)
  const company = cell('B2')
  const bizNo = cell('B3')
  const ceo = cell('B4')
  const phone = cell('B5')
  const email = cell('B6')
  const bankAccount = cell('B7')

  const items: ItemRow[] = []
  for (let r = BIZ_ITEM_HEADER_ROW + 1; r <= BIZ_ITEM_HEADER_ROW + 200; r++) {
    const name = cell(`A${r}`)
    if (!name) continue
    if (name.startsWith('예)')) continue
    const qty = Number(cell(`B${r}`)) || 1
    const price = Number(cell(`C${r}`).replace(/[,₩\s]/g, '')) || 0
    const remark = cell(`D${r}`)
    items.push({ itemName: name, quantity: qty, unitPrice: price, remark })
  }
  if (items.length === 0) throw new Error('품목이 비어 있습니다. 양식의 품목 표를 채워주세요.')

  return {
    invoiceDate: new Date().toISOString().slice(0, 10),
    residentNumber: bizNo,
    phone,
    email,
    bankAccount,
    note: [company && `상호: ${company}`, ceo && `대표자: ${ceo}`].filter(Boolean).join(' / '),
    items,
  }
}

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
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadInvoiceExcel(invoice, items)
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

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

        <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1.5 mr-auto" disabled={downloading} onClick={handleDownload}>
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              엑셀 다운로드
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                className="gap-1.5 text-red-600 hover:text-red-700"
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

export interface IncentiveLine { label: string; amount: number; month: string }

/** Per person NAME → ALL their sales-incentive lines (with settlement month). */
function useIncentiveLinesByPerson() {
  const { data: entries = [] } = useIncentivesByInstallment()
  return useMemo(() => {
    const map = new Map<string, IncentiveLine[]>()
    entries.forEach(e => {
      const dateRef = e.isPaid ? e.paidDate : (e.dueDate || e.contractDate)
      if (!dateRef || e.incentiveAmount <= 0) return
      const name = canonicalConsultantName(e.displayName)
      if (!name) return
      const arr = map.get(name) || []
      arr.push({ label: e.studentName || e.contractorName || e.incentiveType, amount: e.incentiveAmount, month: dateRef.slice(0, 7) })
      map.set(name, arr)
    })
    return map
  }, [entries])
}

// ─── Main Page ────────────────────────────────────────────────────────────

export function FreelancerInvoicesPage(
  { kind = 'freelancer', business = false }: { kind?: 'freelancer' | 'sales_incentive' | 'partner'; business?: boolean } = {},
) {
  const t = useT()
  const { user } = useAuth()
  const isAccounting = (user?.email || '').toLowerCase() === ACCOUNTING_EMAIL
  const isIncentive = kind === 'sales_incentive'
  const isPartner = kind === 'partner'
  // Distinct storage kind so each list is separate (e.g. 'freelancer_business')
  const storageKind = business ? `${kind}_business` : kind
  // Auto-issue from a data source only for freelancer/incentive individual flows
  const isAuto = !business && (kind === 'freelancer' || kind === 'sales_incentive')
  const [uploadError, setUploadError] = useState<string | undefined>()
  const [uploading, setUploading] = useState(false)

  const invoiceTitle = (
    isIncentive ? '세일즈인센티브 인보이스'
    : isPartner ? `파트너사 인보이스${business ? ' (사업자)' : ' (개인)'}`
    : `프리랜서 인보이스${business ? ' (사업자)' : ' (개인)'}`
  )

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<FreelancerInvoice | undefined>()
  const [detailInvoice, setDetailInvoice] = useState<FreelancerInvoice | undefined>()
  const [exporting, setExporting] = useState(false)
  const [uploadedData, setUploadedData] = useState<ParsedInvoice | undefined>()

  const { data: editItems } = useInvoiceItems(editInvoice?.id)

  const { data: allInvoices = [], isLoading: allLoading } = useFreelancerInvoices(
    isAccounting ? (selectedMonth === 'all' ? undefined : selectedMonth) : undefined, storageKind,
  )
  const { data: myInvoices = [], isLoading: myLoading } = useMyInvoices(
    !isAccounting ? user?.id : undefined, storageKind,
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

  // Pre-fill source for the issue form: billable students (freelancer) or
  // the person's sales-incentive lines (incentive).
  const issueMonth = selectedMonth === 'all' ? getCurrentMonth() : selectedMonth
  const byConsultant = useConsultantBillable(issueMonth)
  const linesByPerson = useIncentiveLinesByPerson()
  const myName = canonicalConsultantName(user?.name)
  // Each incentive (already 수금-collected) reflects in its own settlement
  // month — no carry-over. Invoice for a month = all that month's incentives.
  const issueItems = useMemo<{ label: string; amount: number }[]>(() => {
    if (isIncentive) {
      return (linesByPerson.get(myName) || [])
        .filter(l => l.month === issueMonth)
        .map(l => ({ label: l.label, amount: l.amount }))
    }
    return (byConsultant.get(myName) || []).filter(r => r.billable).map(r => ({ label: r.label, amount: 0 }))
  }, [isIncentive, linesByPerson, myName, issueMonth, byConsultant])

  // "인보이스 발행" — open the form pre-filled with this month's source lines.
  const openIssueInvoice = () => {
    const initial: ParsedInvoice = {
      invoiceDate: new Date().toISOString().slice(0, 10),
      residentNumber: '', phone: '', email: user?.email || '', bankAccount: '',
      items: issueItems.length
        ? issueItems.map(r => ({ itemName: r.label, quantity: 1, unitPrice: r.amount, remark: '' }))
        : [emptyItem()],
    }
    setEditInvoice(undefined)
    setUploadedData(initial)
    setFormOpen(true)
  }

  // Partner 개인: open a blank manual form (add items freely)
  const openManualInvoice = () => {
    setEditInvoice(undefined)
    setUploadedData({
      invoiceDate: new Date().toISOString().slice(0, 10),
      residentNumber: '', phone: '', email: user?.email || '', bankAccount: '',
      items: [emptyItem()],
    })
    setFormOpen(true)
  }

  // 사업자: parse uploaded Excel → open form pre-filled for review + submit
  const handleBusinessUpload = async (file: File) => {
    setUploadError(undefined)
    setUploading(true)
    try {
      const parsed = await parseBusinessInvoice(file)
      setEditInvoice(undefined)
      setUploadedData(parsed)
      setFormOpen(true)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '엑셀을 읽지 못했습니다.')
    } finally {
      setUploading(false)
    }
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

  // Creation panel varies: auto issue / manual add / business Excel upload
  const creationPanel = business ? (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">사업자 인보이스 — 엑셀 양식으로 제출</div>
        <p className="text-[12px] text-muted-foreground">
          ① 아래에서 양식을 내려받아 발행자 정보와 품목을 작성한 뒤 ② 그 파일을 업로드하면 내용이 채워진 인보이스 폼이 열립니다. 확인 후 제출하세요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => downloadBusinessTemplate().catch(() => setUploadError('양식 다운로드에 실패했습니다.'))}>
            <Download className="size-4" />샘플 양식 다운로드
          </Button>
          <label>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBusinessUpload(f); e.target.value = '' }}
            />
            <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}엑셀 업로드
            </span>
          </label>
        </div>
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </CardContent>
    </Card>
  ) : isPartner ? (
    <div className="flex items-center gap-3">
      <Button className="gap-1.5" onClick={openManualInvoice}>
        <Plus className="size-4" />인보이스 추가
      </Button>
      <p className="text-[12px] text-muted-foreground">품목을 직접 입력해 인보이스를 발행합니다.</p>
    </div>
  ) : (
    <>
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">정산월</Label>
          <Select value={issueMonth} onValueChange={v => v && setSelectedMonth(v)}>
            <SelectTrigger className="h-9 w-40"><span>{issueMonth}</span></SelectTrigger>
            <SelectContent>{monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button className="gap-1.5" onClick={openIssueInvoice} disabled={issueItems.length === 0}>
          <Plus className="size-4" />인보이스 발행
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm">
            <b>{issueMonth}</b> {isIncentive ? '정산 대상 인센티브' : '청구 가능 학생'} <span className="font-bold text-emerald-600">{issueItems.length}</span>{isIncentive ? '건' : '명'}
            {!isIncentive && <span className="text-muted-foreground"> · 미팅리포트 월 2회 업로드 완료 학생만 발행 가능</span>}
          </div>
          {issueItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isIncentive ? '이 달에 정산할(수금 완료) 세일즈 인센티브가 없습니다.' : '이 달에 조건을 충족한 학생이 없습니다. (미팅리포트 2회 업로드 필요)'}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {issueItems.map((r, i) => <Badge key={i} variant="outline">{r.label}{isIncentive ? ` · ${formatKRW(r.amount)}` : ''}</Badge>)}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">"인보이스 발행"을 누르면 {isIncentive ? '이 달 정산 대상 인센티브가 품명·금액에' : '위 학생이 품명에'} 채워진 폼이 열립니다. 여러 건 발행할 수 있습니다.</p>
        </CardContent>
      </Card>
    </>
  )

  const freelancerView = (
    <div className="space-y-4">
      {creationPanel}
      <div className="text-sm font-semibold text-gray-700">내 인보이스</div>
      {listView}
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">{invoiceTitle}{isAccounting ? ' (재무)' : ''}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAccounting
            ? '제출된 인보이스를 확인·승인하고 엑셀로 다운로드합니다.'
            : (business
                ? '엑셀 양식을 내려받아 작성한 뒤 업로드하여 인보이스를 제출합니다.'
                : isIncentive ? '이 달 발생한 세일즈 인센티브로 정산 인보이스를 발행하세요.'
                : isPartner ? '품목을 직접 입력해 인보이스를 발행합니다.'
                : '이 달 서비스를 제공한 학생으로 인보이스를 발행하세요.')}
        </p>
      </div>

      {isAccounting ? (
        isAuto ? (
          <Tabs defaultValue="list" className="space-y-4">
            <TabsList>
              <TabsTrigger value="list">인보이스 목록</TabsTrigger>
              <TabsTrigger value="missing">미제출 현황</TabsTrigger>
            </TabsList>
            <TabsContent value="list">{listView}</TabsContent>
            <TabsContent value="missing"><MissingInvoices month={issueMonth} kind={kind} /></TabsContent>
          </Tabs>
        ) : listView
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
          kind={storageKind}
          allowAddItems={business || isPartner}
          businessLabels={business}
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

function MissingInvoices({ month, kind = 'freelancer' }: { month: string; kind?: string }) {
  const isIncentive = kind === 'sales_incentive'
  const { data: invoices = [] } = useFreelancerInvoices(month, kind)
  const { data: profiles = [] } = useProfiles()
  const byConsultant = useConsultantBillable(month)
  const linesByPerson = useIncentiveLinesByPerson()
  const send = useSendMessage()
  const [sending, setSending] = useState<string | null>(null)

  const rows = useMemo(() => {
    const source = new Map<string, number>()
    if (isIncentive) {
      linesByPerson.forEach((lines, name) => {
        const c = lines.filter(l => l.month === month).length
        if (c) source.set(name, c)
      })
    } else {
      byConsultant.forEach((students, name) => {
        const c = students.filter(s => s.billable).length
        if (c > 0) source.set(name, c)
      })
    }
    const out: { name: string; count: number; status: 'none' | 'submitted' | 'approved' }[] = []
    source.forEach((count, name) => {
      const theirs = invoices.filter(inv => canonicalConsultantName(inv.freelancerName) === name)
      const status = theirs.some(i => i.status === 'approved') ? 'approved'
        : theirs.some(i => i.status === 'submitted') ? 'submitted' : 'none'
      out.push({ name, count, status })
    })
    return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [isIncentive, byConsultant, linesByPerson, invoices, month])

  const request = async (name: string) => {
    const profile = profiles.find(p => canonicalConsultantName(p.name) === name)
    if (!profile) { alert(`'${name}' 직원 계정을 찾을 수 없습니다.`); return }
    setSending(name)
    try {
      const msg = isIncentive
        ? `[인보이스 요청] ${month} 세일즈인센티브 정산 인보이스를 발행·제출해 주세요. (인센티브 발생 내역이 있습니다)`
        : `[인보이스 요청] ${month} 프리랜서 인보이스를 발행·제출해 주세요. (청구 가능 학생이 있습니다)`
      await send.mutateAsync({ receiverId: profile.id, content: msg })
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
          {month} {isIncentive ? '인센티브 발생자별' : '청구 대상 컨설턴트별'} 인보이스 제출 현황입니다. '승인완료'가 아닌 대상에게 요청 메시지를 보낼 수 있습니다.
        </div>
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>{isIncentive ? '발생자' : '컨설턴트'}</TableHead>
              <TableHead className="text-center w-28">{isIncentive ? '발생 건' : '청구 가능'}</TableHead>
              <TableHead className="w-40">상태</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">대상이 없습니다.</TableCell></TableRow>
            )}
            {rows.map(r => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-center">{r.count}{isIncentive ? '건' : '명'}</TableCell>
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
