import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'
import { useCanEdit } from '@/hooks/usePermissions'
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
import { useAllEditorMeetings } from '@/hooks/useEditorMeetings'
import { useConsultantName, canonicalConsultantName, consultantNameKey } from '@/lib/consultants'
import { useIncentivesByInstallment } from '@/hooks/useIncentives'
import { useServiceIncentiveLines } from '@/hooks/useServiceIncentives'
import { useAllClawbacks } from '@/hooks/useClawbacks'
import { useAllEssayPlans, essayLineForMonth } from '@/hooks/useEssayPlans'
import { useIncentiveStatus, useSetIncentiveReceived } from '@/hooks/useIncentiveStatus'
import { useProfiles, canAccessAccount } from '@/hooks/useProfiles'
import { useSendMessage } from '@/hooks/useMessages'
import {
  useFreelancerInvoices,
  useMyInvoices,
  useInvoiceItems,
  useCreateInvoice,
  useUpdateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  invoiceDisplayName,
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
  invoiceMonth?: string   // 정산월 — 발행 시 화면에서 고른 정산월(issueMonth)을 그대로 사용
  name?: string   // 수령인(신청인) 성명 — 대리작성 시 표시용
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

// 입금계좌 문자열 ↔ 은행명/계좌번호/예금주 (저장은 " / "로 결합)
function splitBank(s: string): { bankName: string; accountNumber: string; accountHolder: string } {
  if (!s) return { bankName: '', accountNumber: '', accountHolder: '' }
  if (s.includes(' / ')) {
    const [bankName = '', accountNumber = '', accountHolder = ''] = s.split(' / ')
    return { bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountHolder: accountHolder.trim() }
  }
  return { bankName: '', accountNumber: s.trim(), accountHolder: '' }
}
function joinBank(bankName: string, accountNumber: string, accountHolder: string): string {
  if (!bankName && !accountNumber && !accountHolder) return ''
  return `${bankName.trim()} / ${accountNumber.trim()} / ${accountHolder.trim()}`
}

// ─── Invoice Form Dialog ──────────────────────────────────────────────────

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  existingItems,
  userId,
  initialData,
  kind,
  allowAddItems,
  businessLabels,
  canEdit,
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
  canEdit: boolean
}) {
  const t = useT()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()

  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoiceDate || invoice?.invoiceDate || new Date().toISOString().slice(0, 10))
  const [invoiceMonth, setInvoiceMonth] = useState(invoice?.invoiceMonth || initialData?.invoiceMonth || getCurrentMonth())
  const [clientName, setClientName] = useState(initialData?.name || invoice?.clientName || '')
  const [residentNumber, setResidentNumber] = useState(initialData?.residentNumber || invoice?.residentNumber || '')
  const [phone, setPhone] = useState(initialData?.phone || invoice?.phone || '')
  const initBank = splitBank(initialData?.bankAccount || invoice?.bankAccount || '')
  const [bankName, setBankName] = useState(initBank.bankName)
  const [accountNumber, setAccountNumber] = useState(initBank.accountNumber)
  const [accountHolder, setAccountHolder] = useState(initBank.accountHolder)
  const bankAccount = joinBank(bankName, accountNumber, accountHolder)
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

  // 발행/업로드로 사전 채워진 데이터가 있으면 폼이 열릴 때 확실히 반영(이름 자동 채움 보장)
  useEffect(() => {
    if (!open || !initialData) return
    if (initialData.items?.length) setItems(initialData.items.map(it => ({ ...it })))
    if (initialData.invoiceDate) setInvoiceDate(initialData.invoiceDate)
    setClientName(initialData.name || '')
    setResidentNumber(initialData.residentNumber || '')
    setPhone(initialData.phone || '')
    setNote(initialData.note || '')
    const b = splitBank(initialData.bankAccount || '')
    setBankName(b.bankName); setAccountNumber(b.accountNumber); setAccountHolder(b.accountHolder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData])

  const totalAmount = useMemo(() => items.reduce((s, it) => s + it.quantity * it.unitPrice, 0), [items])

  const handleDownload = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      await downloadInvoiceExcel(
        { ...invoice, invoiceDate, clientName, residentNumber, phone, bankAccount, totalAmount },
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
    if (!canEdit) return
    const validItems = items.filter(it => it.itemName.trim())
    if (validItems.length === 0) return
    setSaving(true)
    try {
      if (invoice) {
        await updateInvoice.mutateAsync({
          id: invoice.id,
          invoiceDate,
          clientName,
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
          clientName,
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

          {/* 수령인(신청인) 성명 — 대리작성 시 로그인 계정이 아닌 이 이름으로 표시 */}
          <div className="space-y-1.5">
            <Label className="text-xs">성명 (수령인) <span className="text-[10px] text-muted-foreground">· 미입력 시 로그인 계정 이름으로 표시</span></Label>
            <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="예: 홍길동" className="h-9" />
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
            <div className="grid grid-cols-3 gap-2">
              <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="은행명 (예: 국민)" className="h-9" />
              <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="계좌번호" className="h-9" />
              <Input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="예금주" className="h-9" />
            </div>
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
                        {canEdit && items.length > 1 && (
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
            {canEdit && allowAddItems && (
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
          {canEdit && (
            <Button onClick={handleSave} disabled={saving || !items.some(it => it.itemName.trim())} className="gap-1.5">
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {t('fInvoice.submit')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invoice Detail Dialog ────────────────────────────────────────────────

/** Download a single invoice as the uploaded 견적서 template, filled in. */
export async function downloadInvoiceExcel(
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
  // 시트명을 해당 정산월로 (템플릿 기본은 특정 월로 고정돼 있음)
  const mn = monthNum(invoice.invoiceMonth)
  if (mn) { try { ws.name = `${mn}월` } catch { /* ignore */ } }

  const set = (ref: string, v: unknown) => { try { ws.getCell(ref).value = (v ?? '') as never } catch { /* ignore */ } }
  // Date + supplier (freelancer) info
  set('C5', invoice.invoiceDate)
  set('F6', invoice.clientName || invoice.freelancerName)
  set('H6', invoice.residentNumber)
  set('F7', invoice.phone)
  set('F8', invoice.freelancerEmail)
  // 입금 정보(헤더): 은행명 F9, 계좌번호 H9 (bankAccount = "은행명 / 계좌번호 / 예금주")
  const bank = splitBank(invoice.bankAccount || '')
  set('F9', bank.bankName)
  set('H9', bank.accountNumber || invoice.bankAccount || '')

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
  // 파일명 = 직원(제출자) 이름
  a.download = `${invoiceDisplayName(invoice)}.xlsx`
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

// Serve the real 견적서 template (public/business-invoice-template.xlsx)
async function downloadBusinessTemplate() {
  const res = await fetch('/business-invoice-template.xlsx')
  if (!res.ok) throw new Error('양식 파일을 불러올 수 없습니다.')
  saveBlob(await res.arrayBuffer(), '프리랜서 인보이스 샘플.xlsx')
}

// 프리랜서(개인)용 양식 — 품목표: C=날짜, D=영상명, E=단가, G=비고 (헤더 11행)
async function downloadFreelancerTemplate() {
  const res = await fetch('/freelancer-individual-template.xlsx')
  if (!res.ok) throw new Error('양식 파일을 불러올 수 없습니다.')
  saveBlob(await res.arrayBuffer(), '프리랜서 인보이스 샘플.xlsx')
}


/**
 * Parse the freelancer-individual 견적서 template.
 *  F6=성명, H6=주민등록번호, F7=전화번호, F8=이메일, C5=날짜,
 *  품목표: 12행부터 (D=영상명/품명, E=단가, G=비고), 'B열 합 계' 행 전까지,
 *  'B열 입금계좌 : ...' 행에 입금계좌.
 */
async function parseFreelancerInvoice(file: File): Promise<ParsedInvoice> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('엑셀에서 시트를 찾을 수 없습니다.')
  const cell = (ref: string) => {
    const v = ws.getCell(ref).value as unknown
    if (v == null) return ''
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      if ('text' in o) return String(o.text).trim()
      if ('result' in o) return String(o.result).trim()
      if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('').trim()
    }
    return String(v).trim()
  }
  const num = (s: string) => Number(String(s).replace(/[,₩\s]/g, '')) || 0

  const name = cell('F6')
  const bizNo = cell('H6')
  const phone = cell('F7')
  const email = cell('F8')
  const rawDate = cell('C5')

  let sumRow = 28
  let bankAccount = ''
  for (let r = 11; r <= 120; r++) {
    const b = cell(`B${r}`)
    if (b.includes('합') || /^total$/i.test(b)) { sumRow = r; break }
  }
  for (let r = 11; r <= 140; r++) {
    const b = cell(`B${r}`)
    if (b.includes('입금') || b.includes('은행계좌') || /bank|account/i.test(b)) {
      bankAccount = b.replace(/^.*(입금계좌|은행계좌\s*정보|bank account)\s*:?\s*/i, '').trim()
      break
    }
  }

  const items: ItemRow[] = []
  for (let r = 12; r < sumRow; r++) {
    const itemName = cell(`D${r}`)
    const price = num(cell(`E${r}`))
    if (!itemName && !price) continue
    items.push({
      itemName: itemName || '(품명 없음)',
      quantity: 1,
      unitPrice: price,
      remark: cell(`G${r}`),
    })
  }
  if (items.length === 0) throw new Error('품목이 비어 있습니다. 양식의 영상명·단가를 채워주세요.')

  let invoiceDate = new Date().toISOString().slice(0, 10)
  const iso = rawDate.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
  if (iso) invoiceDate = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  return {
    invoiceDate,
    name,
    residentNumber: bizNo,
    phone,
    email,
    bankAccount,
    note: name ? `성명: ${name}` : '',
    items,
  }
}

/**
 * Parse a filled 견적서 template. Layout (matches the sample):
 *  C5=날짜, F6=성명, H6=주민/사업자번호, F7=전화번호, F8=이메일,
 *  품목표: 15행부터 (B=품명, C=수량, D=단가, E=공급가액, F=비고), '합 계' 행 전까지,
 *  '입금계좌 : ...' 행에 입금계좌.
 */
async function parseBusinessInvoice(file: File): Promise<ParsedInvoice> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('엑셀에서 시트를 찾을 수 없습니다.')
  const cell = (ref: string) => {
    const v = ws.getCell(ref).value as unknown
    if (v == null) return ''
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      if ('text' in o) return String(o.text).trim()
      if ('result' in o) return String(o.result).trim()
      if ('richText' in o) return (o.richText as { text: string }[]).map(t => t.text).join('').trim()
    }
    return String(v).trim()
  }
  const num = (s: string) => Number(String(s).replace(/[,₩\s]/g, '')) || 0

  const name = cell('F6')
  const bizNo = cell('H6')
  const phone = cell('F7')
  const email = cell('F8')
  const rawDate = cell('C5')

  // Find 합계 / 입금계좌 rows (column A)
  let sumRow = 23
  let bankAccount = ''
  for (let r = 14; r <= 80; r++) {
    const a = cell(`A${r}`)
    if (a.includes('합')) { sumRow = r; break }
  }
  for (let r = 14; r <= 90; r++) {
    const a = cell(`A${r}`)
    if (a.includes('입금')) { bankAccount = a.replace(/^.*입금계좌\s*:?\s*/, '').trim(); break }
  }

  const items: ItemRow[] = []
  for (let r = 15; r < sumRow; r++) {
    const itemName = cell(`B${r}`)
    const price = num(cell(`D${r}`))
    if (!itemName && !price) continue
    items.push({
      itemName: itemName || '(품명 없음)',
      quantity: num(cell(`C${r}`)) || 1,
      unitPrice: price,
      remark: cell(`F${r}`),
    })
  }
  if (items.length === 0) throw new Error('품목이 비어 있습니다. 양식의 품명·단가를 채워주세요.')

  // Normalize date (accept YYYY-MM-DD or MM.DD.YYYY etc.); fallback to today
  let invoiceDate = new Date().toISOString().slice(0, 10)
  const iso = rawDate.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
  const mdy = rawDate.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)
  if (iso) invoiceDate = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  else if (mdy) invoiceDate = `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`

  return {
    invoiceDate,
    name,
    residentNumber: bizNo,
    phone,
    email,
    bankAccount,
    note: name ? `성명/상호: ${name}` : '',
    items,
  }
}

function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoice,
  canEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: FreelancerInvoice
  canEdit: boolean
}) {
  const t = useT()
  const { user } = useAuth()
  const { data: items = [] } = useInvoiceItems(invoice.id)
  const updateStatus = useUpdateInvoiceStatus()
  const deleteInvoice = useDeleteInvoice()
  const isAccounting = canAccessAccount(user)
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
            <div><span className="text-muted-foreground">{t('fInvoice.freelancer')}:</span> <span className="font-medium">{invoiceDisplayName(invoice)}</span></div>
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
            {canEdit && canDelete && (
              <Button
                variant="outline"
                className="gap-1.5 text-red-600 hover:text-red-700"
                disabled={deleteInvoice.isPending}
                onClick={async () => {
                  if (!canEdit) return
                  const isApproved = invoice.status === 'approved'
                  const confirmMsg = isApproved
                    ? t('fInvoice.deleteApprovedConfirm', {
                        name: invoiceDisplayName(invoice),
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
            {canEdit && isAccounting && invoice.status === 'submitted' && (
              <>
                <Button
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-700"
                  onClick={async () => { if (!canEdit) return; await updateStatus.mutateAsync({ id: invoice.id, status: 'rejected' }); onOpenChange(false) }}
                  disabled={updateStatus.isPending}
                >
                  <XCircle className="size-4" />
                  {t('fInvoice.reject')}
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={async () => { if (!canEdit) return; await updateStatus.mutateAsync({ id: invoice.id, status: 'approved' }); onOpenChange(false) }}
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
      name: invoiceDisplayName(inv),
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

/** "2026-06" → 6 (월 숫자) */
function monthNum(m?: string): number { return m ? Number(m.slice(5, 7)) : 0 }
/** from~to 사이 개월 수 (예: 2026-06 → 2026-08 = 2) */
function monthsBetween(from?: string, to?: string): number {
  if (!from || !to) return 0
  const [y1, m1] = from.split('-').map(Number)
  const [y2, m2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/** Treat a student as active unless their status explicitly says otherwise. */
function isActiveStudent(status?: string): boolean {
  if (!status) return true
  return !/(pause|중단|중지|hold|ended|종료|해지|complete|완료|graduat|졸업|inactive|finish|cancel|취소)/i.test(status)
}

function studentLabel(name?: string, koreanName?: string): string {
  const ko = (koreanName || '').trim()
  const en = (name || '').trim()
  if (ko && en && ko !== en) return `${ko} (${en})`
  return ko || en || '—'
}

// ─── Shared: accounting access + billable students ─────────────────────────


export interface BillableStudent { id: string; label: string; done: number; billable: boolean; billableMonths: number; pairs: [string, string][] }

/** 미팅일자 배열을 시간순 2개씩 짝지어, 2번째 미팅이 해당 달(YYYY-MM)인 짝들의 [1번째, 2번째] 일자 반환. */
function pairsClosingInMonth(dates: string[], month: string): [string, string][] {
  const sorted = [...dates].sort()
  const out: [string, string][] = []
  for (let i = 1; i < sorted.length; i += 2) {
    if ((sorted[i] || '').slice(0, 7) === month) out.push([sorted[i - 1], sorted[i]])
  }
  return out
}
/** 짝 미팅일자를 비고/툴팁용 문자열로: "미팅 2건: 2026-07-15, 2026-08-02" */
function pairDetail(pair: [string, string]): string {
  return `미팅 2건: ${pair[0]}, ${pair[1]}`
}

/** Per consultant NAME → active students with 관리비 청구 대상 (정확방식/소급).
 *  리포트완료(미취소) 미팅을 시간순 2개씩 짝지어, 각 짝의 '2번째 미팅이 있는 달'에 관리비 1개월치를 청구.
 *  누적 계산이라 예: 7월 1회 + 8/2 1회 → 8월(2번째 미팅월)에 1개월치가 잡힘(소급). 짝은 달마다 1번만 청구됨. */
function useConsultantBillable(month: string) {
  const consultantName = useConsultantName()
  const { data: students = [] } = useServiceStudents()
  const { end } = monthRange(month)
  // 이번 달 말까지의 전체 미팅(누적) — 지난 달 미팅과 짝지어 소급 판정
  const { data: meetings = [] } = useAllServiceMeetings('2000-01-01', end)

  return useMemo(() => {
    // 학생별 리포트완료(미취소) 미팅일자 수집
    const datesByStudent = new Map<string, string[]>()
    for (const mt of meetings) {
      if ((mt.reportStatus === 'submitted' || !!mt.reportUrl) && mt.status !== 'cancelled' && mt.meetingDate) {
        const arr = datesByStudent.get(mt.studentId) || []
        arr.push(mt.meetingDate)
        datesByStudent.set(mt.studentId, arr)
      }
    }
    // 학생별: 이번 달에 마감된 짝(들)과 각 짝의 미팅일자
    const pairsByStudent = new Map<string, [string, string][]>()
    datesByStudent.forEach((dates, sid) => {
      const pairs = pairsClosingInMonth(dates, month)
      if (pairs.length) pairsByStudent.set(sid, pairs)
    })
    // 이름 매칭을 대소문자·공백에 견고하게: 정규화 키로 그룹핑, 표시용 이름은 함께 보관
    const byConsultant = new Map<string, { name: string; students: BillableStudent[] }>()
    students.filter(s => isActiveStudent(s.status) && !s.paused && s.assignedConsultant).forEach(s => {
      const display = consultantName(s.assignedConsultant)
      const key = consultantNameKey(display)
      const pairs = pairsByStudent.get(s.id) || []
      const entry = byConsultant.get(key) || { name: display, students: [] }
      entry.students.push({ id: s.id, label: studentLabel(s.name, s.koreanName), done: pairs.length, billable: pairs.length >= 1, billableMonths: pairs.length, pairs })
      byConsultant.set(key, entry)
    })
    return byConsultant
  }, [students, meetings, consultantName, month])
}

export interface IncentiveLine { id: string; label: string; amount: number; month: string; source: 'contract' | 'service'; sourceDetail: string }

/** Per person NAME → ALL their sales-incentive lines (with settlement month).
 *  Combines contract-based incentives with service (EC/Academic) incentives
 *  from 서비스입금관리 (청구금액 × 파트너사 소속팀 수수료율, 수금 완료분). */
export function useIncentiveLinesByPerson() {
  const { data: entries = [] } = useIncentivesByInstallment()
  const serviceLines = useServiceIncentiveLines()
  const { data: students = [] } = useServiceStudents()
  const { data: clawbacks = [] } = useAllClawbacks()
  return useMemo(() => {
    // 계약서 학생명(자유 텍스트)을 Student360 학생기록 기준 한글+영어 이름으로 해소
    const normName = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
    const canonByName = new Map<string, string>()
    for (const st of students) {
      const canon = [st.koreanName, st.name].filter(Boolean).join(' ')
      if (st.name) canonByName.set(normName(st.name), canon)
      if (st.koreanName) canonByName.set(normName(st.koreanName), canon)
    }
    const resolveStudent = (raw?: string) => (raw ? (canonByName.get(normName(raw)) || raw) : '')

    const map = new Map<string, IncentiveLine[]>()
    entries.forEach(e => {
      // 'sp-' 항목(Student360 EC 서비스프로그램)은 useServiceIncentiveLines가 이미 계산하므로
      // 여기서 제외해 이중계산 방지. (rs- 계약 추가회차·일반 계약 인센티브는 유지)
      if (e.key.startsWith('sp-')) return
      const dateRef = e.isPaid ? e.paidDate : (e.dueDate || e.contractDate)
      if (!dateRef || e.incentiveAmount <= 0) return
      const name = canonicalConsultantName(e.displayName)
      if (!name) return
      const arr = map.get(name) || []
      const studentLabel = resolveStudent(e.studentName) || e.contractorName || e.incentiveType
      const sourceDetail = `계약 · ${[e.contractorName, e.installmentLabel, `${e.incentiveType} ${e.percentage}%`].filter(Boolean).join(' · ')} · 회차키 ${e.key}`
      arr.push({ id: `c:${e.key}`, label: studentLabel, amount: e.incentiveAmount, month: dateRef.slice(0, 7), source: 'contract', sourceDetail })
      map.set(name, arr)
    })
    serviceLines.forEach(sl => {
      if (!sl.name) return
      const arr = map.get(sl.name) || []
      const partner = sl.label.split(' · ')[1] || 'EC'
      arr.push({ id: sl.id, label: sl.label, amount: sl.amount, month: sl.month, source: 'service', sourceDetail: `서비스(EC) · ${partner} · 수금 ${sl.month}` })
      map.set(sl.name, arr)
    })
    // 환불 인센티브 차감: (−)라인으로 반영 → 지급원장·인보이스에서 순액 자동 반영
    for (const cb of clawbacks) {
      const name = canonicalConsultantName(cb.contributorName)
      if (!name || !cb.amount) continue
      const arr = map.get(name) || []
      arr.push({
        id: `cb:${cb.id}`,
        label: `${cb.studentName || ''} 환급(차감)`.trim(),
        amount: -Math.abs(cb.amount),
        month: cb.deductMonth,
        source: cb.source,
        sourceDetail: `환불 인센티브 환급${cb.reason ? ' · ' + cb.reason : ''}`,
      })
      map.set(name, arr)
    }
    return map
  }, [entries, serviceLines, students, clawbacks])
}

// ─── Main Page ────────────────────────────────────────────────────────────

export function FreelancerInvoicesPage(
  { kind = 'freelancer', business = false }: { kind?: 'freelancer' | 'sales_incentive' | 'partner'; business?: boolean } = {},
) {
  const t = useT()
  const canEdit = useCanEdit(useLocation().pathname)
  const { user } = useAuth()
  const isAccounting = canAccessAccount(user)
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
        inv.freelancerName?.toLowerCase().includes(q) || inv.clientName?.toLowerCase().includes(q) ||
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
  const { data: essayPlans = [] } = useAllEssayPlans()
  const { data: allEditorMeetings = [] } = useAllEditorMeetings()  // 에세이 에디터 미팅일지(전체)
  const { data: allStudentsForEditor = [] } = useServiceStudents()
  // 관리자/회계는 다른 컨설턴트의 자동반영 화면을 그대로 미리볼 수 있음 (진단·검증용)
  const { data: previewProfiles = [] } = useProfiles()
  const isManager = isAccounting || user?.role === 'admin'
  const [previewName, setPreviewName] = useState<string>('')
  const effectiveName = isManager && previewName ? previewName : (user?.name || '')
  const previewNameOptions = useMemo(() => {
    const names = new Set<string>()
    for (const p of previewProfiles) {
      const n = canonicalConsultantName(p.name)
      if (n && !/^[0-9a-f-]{36}$/i.test(n)) names.add(n)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [previewProfiles])
  const myName = canonicalConsultantName(effectiveName)
  // 수령 상태: 클릭한 것만 그 달에 수령완료. 미수령 건은 다음 달로 자동 이월(원래 달 태그 유지).
  const incentiveStatus = useIncentiveStatus()
  const setIncentiveReceived = useSetIncentiveReceived()

  type DItem = { id: string; label: string; amount: number; originMonth?: string; received: boolean; sourceDetail?: string }
  const displayItems = useMemo<DItem[]>(() => {
    if (isIncentive) {
      const out: DItem[] = []
      for (const l of (linesByPerson.get(myName) || [])) {
        const st = incentiveStatus.get(l.id)
        if (st?.received) {
          if (st.receivedMonth === issueMonth) out.push({ id: l.id, label: l.label, amount: l.amount, originMonth: l.month, received: true, sourceDetail: l.sourceDetail })
        } else if (l.month <= issueMonth) {
          out.push({ id: l.id, label: l.label, amount: l.amount, originMonth: l.month, received: false, sourceDetail: l.sourceDetail })
        }
      }
      return out
    }
    const myKey = consultantNameKey(effectiveName)
    // 관리비: 2회 미팅 완료 학생 (단가는 발행 시 수기입력 → amount 0)
    //   ⚠️ '내가 원서·에세이를 담당하는' 학생만 관리비에서 제외 → 에세이 라인으로 대체(같은 사람 중복 방지).
    //   관리만 하고 에세이는 다른 사람이 하는 학생은 관리비를 그대로 유지(각자 다른 업무 대가라 중복 아님).
    const myEssayStudentIds = new Set(
      essayPlans.filter(p => consultantNameKey(p.consultantName || '') === myKey).map(p => p.studentId),
    )
    const mgmt: DItem[] = (byConsultant.get(myKey)?.students || [])
      .filter(r => r.billable && !myEssayStudentIds.has(r.id))
      // 짝(2회 미팅)마다 라인 1개 — 소급 등으로 2건 이상이면 각 짝의 미팅일자를 비고에 담음
      .flatMap(r => r.pairs.map((pair, k) => ({
        id: r.pairs.length > 1 ? `${r.label}#${k + 1}` : r.label,
        label: r.pairs.length > 1 ? `${r.label} (${k + 1}/${r.pairs.length}개월분·소급)` : r.label,
        amount: 0,
        received: false,
        sourceDetail: pairDetail(pair),
      })))
    // 원서·에세이: 담당 컨설턴트=본인 & 시작월~12월 범위면 그 달치 자동 계산 (미팅 조건 무관)
    const essay: DItem[] = essayPlans
      .filter(p => consultantNameKey(p.consultantName || '') === myKey)
      .map(p => {
        const line = essayLineForMonth(p, issueMonth)
        if (!line) return null
        const who = [p.studentKoreanName, p.studentName].filter(Boolean).join(' ') || p.studentName || '학생'
        return { id: `essay:${p.id}:${issueMonth}`, label: `${who} · 원서에세이 (${line.index}/${line.count}월차)`, amount: line.amount, received: false }
      })
      .filter((x): x is DItem => x !== null)

    // 에세이 에디터(이원화): 본인이 진행한 에디터 미팅을 학생별 2개씩 짝 → 2번째 미팅이 있는 달에 청구(관리비와 동일 정확방식/소급).
    //   원서·에세이 플랜(÷12월)이 있는 학생은 제외 — 그건 별도 체계(컨설턴트+에디터 동일인 케이스)라 이중청구 방지.
    const planStudentIds = new Set(essayPlans.map(p => p.studentId))
    const editorDates = new Map<string, string[]>()
    for (const m of allEditorMeetings) {
      if (!m.meetingDate || planStudentIds.has(m.studentId)) continue
      if (consultantNameKey(m.editor || '') !== myKey) continue
      const arr = editorDates.get(m.studentId) || []
      arr.push(m.meetingDate)
      editorDates.set(m.studentId, arr)
    }
    const studentsById = new Map(allStudentsForEditor.map(s => [s.id, s]))
    const editorLines: DItem[] = []
    editorDates.forEach((dates, sid) => {
      const pairs = pairsClosingInMonth(dates, issueMonth)
      if (!pairs.length) return
      const s = studentsById.get(sid)
      const who = s ? studentLabel(s.name, s.koreanName) : '학생'
      pairs.forEach((pair, k) => {
        editorLines.push({
          id: pairs.length > 1 ? `editor:${sid}#${k + 1}` : `editor:${sid}`,
          label: `${who} · 에세이에디터${pairs.length > 1 ? ` (${k + 1}/${pairs.length}개월분·소급)` : ''}`,
          amount: 0,
          received: false,
          sourceDetail: pairDetail(pair),
        })
      })
    })

    return [...mgmt, ...essay, ...editorLines]
  }, [isIncentive, linesByPerson, myName, issueMonth, byConsultant, incentiveStatus, essayPlans, allEditorMeetings, allStudentsForEditor, effectiveName])

  // 발행 대상 = 아직 수령완료 안 된 항목
  const issueItems = useMemo(() => displayItems.filter(d => !d.received).map(d => ({
    label: d.label, amount: d.amount,
    carried: !!d.originMonth && d.originMonth < issueMonth,
    originMonth: d.originMonth,
    sourceDetail: d.sourceDetail,   // 미팅 2건 일자 등 → 비고에 기록
  })), [displayItems, issueMonth])

  // 이월(원래 달 < 현재 달) 미수령만 보기 필터
  const [agedOnly, setAgedOnly] = useState(false)
  const renderedItems = useMemo(
    () => agedOnly ? displayItems.filter(d => !d.received && !!d.originMonth && d.originMonth < issueMonth) : displayItems,
    [agedOnly, displayItems, issueMonth],
  )

  // 수령/미수령 변경은 회계(accounting) 계정만 — 본인 임의 조작 방지
  const canToggleReceived = isAccounting
  const toggleReceived = (id: string, currentlyReceived: boolean) => {
    if (!canToggleReceived) return
    setIncentiveReceived.mutate({ key: id, received: !currentlyReceived, month: issueMonth })
  }

  // "인보이스 발행" — open the form pre-filled with this month's source lines.
  const openIssueInvoice = () => {
    if (!canEdit) return
    const initial: ParsedInvoice = {
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceMonth: issueMonth,   // 라벨(정산월)을 항목 계산에 쓴 정산월과 일치시킴
      residentNumber: '', phone: '', email: user?.email || '', bankAccount: '',
      items: issueItems.length
        ? issueItems.map(r => ({
            itemName: r.carried ? `(${monthNum(r.originMonth)}월분) ${r.label}` : r.label,
            quantity: 1,
            unitPrice: r.amount,
            remark: [
              r.sourceDetail || '',
              r.carried ? `${monthNum(r.originMonth)}월 발생 · ${monthsBetween(r.originMonth, issueMonth)}개월 이월(소급)` : '',
            ].filter(Boolean).join(' · '),
          }))
        : [emptyItem()],
    }
    setEditInvoice(undefined)
    setUploadedData(initial)
    setFormOpen(true)
  }

  // Partner 개인: open a blank manual form (add items freely)
  const openManualInvoice = () => {
    if (!canEdit) return
    setEditInvoice(undefined)
    setUploadedData({
      invoiceDate: new Date().toISOString().slice(0, 10),
      residentNumber: '', phone: '', email: user?.email || '', bankAccount: '',
      items: [emptyItem()],
    })
    setFormOpen(true)
  }

  // 엑셀 업로드 → 파싱 → 검토용 폼 열기 (사업자 / 프리랜서 개인 공용)
  const handleExcelUpload = async (file: File, parser: (f: File) => Promise<ParsedInvoice>) => {
    if (!canEdit) return
    setUploadError(undefined)
    setUploading(true)
    try {
      const parsed = await parser(file)
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
                        <div>{invoiceDisplayName(inv)}</div>
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
                        {canEdit && (inv.freelancerId === user?.id || isAccounting) && inv.status !== 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => { if (!canEdit) return; setEditInvoice(inv); setFormOpen(true) }}
                          >
                            <FileText className="size-3.5" />
                          </Button>
                        )}
                        {/* Delete: admin always, freelancer only if not approved */}
                        {canEdit && (isAccounting || (inv.freelancerId === user?.id && inv.status !== 'approved')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            disabled={deleteInvoice.isPending}
                            onClick={async () => {
                              if (!canEdit) return
                              const isApproved = inv.status === 'approved'
                              const confirmMsg = isApproved
                                ? t('fInvoice.deleteApprovedConfirm', {
                                    name: invoiceDisplayName(inv),
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
          {canEdit && (
            <label>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelUpload(f, parseBusinessInvoice); e.target.value = '' }}
              />
              <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}엑셀 업로드
              </span>
            </label>
          )}
        </div>
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </CardContent>
    </Card>
  ) : isPartner ? (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">파트너사 인보이스 — 엑셀 양식 업로드 또는 직접 입력 (대리 발행)</div>
        <p className="text-[12px] text-muted-foreground">
          ① 양식을 내려받아 <b>파트너 성명·계좌·주민(사업자)번호·품목</b>을 작성한 뒤 ② 업로드하면 그 정보로 인보이스 폼이 열립니다. (로그인한 사람이 아닌 파트너 정보로 발행) · 또는 ‘직접 입력’으로 수기 작성.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => downloadFreelancerTemplate().catch(() => setUploadError('양식 다운로드에 실패했습니다.'))}>
            <Download className="size-4" />양식 다운로드
          </Button>
          {canEdit && (
            <label>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelUpload(f, parseFreelancerInvoice); e.target.value = '' }}
              />
              <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}양식 업로드
              </span>
            </label>
          )}
          {canEdit && (
            <Button variant="ghost" className="gap-1.5" onClick={openManualInvoice}>
              <Plus className="size-4" />직접 입력
            </Button>
          )}
        </div>
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </CardContent>
    </Card>
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
        {isManager && (
          <div>
            <Label className="text-xs">미리보기 대상</Label>
            <Select value={previewName || '__self__'} onValueChange={v => setPreviewName(v && v !== '__self__' ? v : '')}>
              <SelectTrigger className="h-9 w-44"><span>{previewName || '나 (본인)'}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="__self__">나 (본인)</SelectItem>
                {previewNameOptions.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {canEdit && (
          <Button className="gap-1.5" onClick={openIssueInvoice} disabled={issueItems.length === 0 || (isManager && !!previewName)}>
            <Plus className="size-4" />인보이스 발행
          </Button>
        )}
        {isManager && !!previewName && (
          <p className="text-[12px] text-amber-600 self-center">👁 {previewName} 미리보기 중 — 발행하려면 대상을 ‘나’로 바꾸세요</p>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="text-sm flex items-center gap-2 flex-wrap">
            <span>
              <b>{issueMonth}</b> {isIncentive ? '정산 대상 인센티브' : '청구 가능 학생'} <span className="font-bold text-emerald-600">{displayItems.length}</span>{isIncentive ? '건' : '명'}
            </span>
            {isIncentive && (() => {
              const agedCount = displayItems.filter(d => !d.received && !!d.originMonth && d.originMonth < issueMonth).length
              return (
                <>
                  <span className="text-muted-foreground">· 수령완료 {displayItems.filter(d => d.received).length} / 미수령 {displayItems.filter(d => !d.received).length}</span>
                  {agedCount > 0 && (
                    <button type="button" onClick={() => setAgedOnly(v => !v)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${agedOnly ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'}`}>
                      이월 미수령 {agedCount}건{agedOnly ? ' ✕' : ''}
                    </button>
                  )}
                </>
              )
            })()}
            {!isIncentive && <span className="text-muted-foreground"> · 관리비: 미팅리포트 2회 완료 학생(원서·에세이 신청 학생 제외) · 원서·에세이: 시작월~12월 매월 자동(금액 자동)</span>}
          </div>
          {renderedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{agedOnly ? '이월된 미수령 인센티브가 없습니다.' : (isIncentive ? '이 달에 정산할(수금 완료) 세일즈 인센티브가 없습니다.' : '이 달에 조건을 충족한 학생이 없습니다. (미팅리포트 2회 업로드 필요)')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {renderedItems.map((r) => {
                if (!isIncentive) return (
                  <Badge key={r.id} variant="outline" title={r.sourceDetail || undefined} className={r.amount > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : ''}>
                    {r.label}{r.amount > 0 ? ` · ${formatKRW(r.amount)}` : ''}
                  </Badge>
                )
                const carried = !!r.originMonth && r.originMonth < issueMonth
                const delay = carried ? monthsBetween(r.originMonth, issueMonth) : 0
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleReceived(r.id, r.received)}
                    disabled={!canToggleReceived}
                    title={`${r.sourceDetail || ''}\n${!canToggleReceived ? '수령 여부는 회계 계정만 변경할 수 있습니다' : (r.received ? '수령완료 — 클릭하면 미수령으로 되돌립니다' : '클릭하면 이 달 수령완료로 표시됩니다')}`}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${canToggleReceived ? 'cursor-pointer' : 'cursor-default'} ${
                      r.received
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : carried
                          ? 'bg-amber-50 border-amber-300 text-amber-800 hover:border-emerald-400'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'
                    }`}
                  >
                    {r.received && <CheckCircle2 className="size-3" />}
                    <span>{r.label} · {formatKRW(r.amount)}</span>
                    {carried && <span className={`text-[10px] font-medium ${r.received ? 'text-emerald-100' : 'text-amber-600'}`}>({monthNum(r.originMonth)}월분{delay > 0 ? ` · ${delay}개월 이월` : ''})</span>}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {isIncentive
              ? `수령완료(초록) 표시는 회계 계정만 변경할 수 있습니다${canToggleReceived ? '' : ' — 현재 계정은 조회만 가능'}. 미수령 건은 다음 달로 자동 이월되어 (원래 달) 태그로 계속 표시되고, "인보이스 발행"은 미수령 건을 이름·금액에 채웁니다.`
              : '"인보이스 발행"을 누르면 위 학생이 이름에 채워진 폼이 열립니다. 여러 건 발행할 수 있습니다.'}
          </p>
          {isIncentive && displayItems.length > 0 && (
            <details className="mt-1 rounded-md border bg-muted/20 p-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">🔎 원천 상세 보기 (진단용) — 각 인센티브가 어디서 나왔는지</summary>
              <div className="mt-2 divide-y">
                {displayItems.map(d => (
                  <div key={d.id} className="flex items-start gap-3 py-1.5 text-xs">
                    <span className="font-medium w-44 shrink-0 truncate">{d.label}</span>
                    <span className="tabular-nums w-20 shrink-0 text-right">{formatKRW(d.amount)}</span>
                    <span className="text-muted-foreground flex-1 break-all">{d.sourceDetail || '(원천 정보 없음)'}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* 프리랜서 개인: 자동 반영 대상이 아닌 프리랜서는 엑셀 양식으로 제출 */}
      {kind === 'freelancer' && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">위 목록에 해당하지 않는 프리랜서 — 엑셀 양식으로 제출</div>
            <p className="text-[12px] text-muted-foreground">
              업무영역이 자동 반영 대상이 아닌 경우, ① 양식을 내려받아 작성한 뒤 ② 업로드하면 내용이 채워진 인보이스 폼이 열립니다. 확인 후 제출하세요.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => downloadFreelancerTemplate().catch(() => setUploadError('양식 다운로드에 실패했습니다.'))}>
                <Download className="size-4" />양식 다운로드
              </Button>
              {canEdit && (
                <label>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelUpload(f, parseFreelancerInvoice); e.target.value = '' }}
                  />
                  <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}엑셀 업로드
                  </span>
                </label>
              )}
            </div>
            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
          </CardContent>
        </Card>
      )}
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
                : isPartner ? '이름을 직접 입력해 인보이스를 발행합니다.'
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
            <TabsContent value="missing"><MissingInvoices month={issueMonth} kind={kind} canEdit={canEdit} /></TabsContent>
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
          canEdit={canEdit}
        />
      )}

      {detailInvoice && (
        <InvoiceDetailDialog
          open={!!detailInvoice}
          onOpenChange={open => { if (!open) setDetailInvoice(undefined) }}
          invoice={detailInvoice}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}

// ─── Missing-invoice tracking (accounting) ─────────────────────────────────

function MissingInvoices({ month, kind = 'freelancer', canEdit }: { month: string; kind?: string; canEdit: boolean }) {
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
      byConsultant.forEach((entry) => {
        const c = entry.students.filter(s => s.billable).length
        if (c > 0) source.set(entry.name, c)
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
    if (!canEdit) return
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
                  {canEdit && r.status !== 'approved' && (
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
