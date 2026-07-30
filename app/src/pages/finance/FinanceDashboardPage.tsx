import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Users, Receipt, Lock, Clock, CheckCircle2, XCircle, Wallet } from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useIncentivesByInstallment, type IncentiveType } from '@/hooks/useIncentives'
import { useAllExtraInstallments } from '@/hooks/useExternalFees'
import { useAllInvoices, useUpdateInvoiceStatus, useSetInvoicePaidDate, useInvoiceItems, type FreelancerInvoice } from '@/hooks/useFreelancerInvoices'
import { todayKST } from '@/lib/date'
import { Input } from '@/components/ui/input'
import { Banknote, RefreshCw, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useIncentiveLinesByPerson, downloadInvoiceExcel, type IncentiveLine } from '@/pages/finance/FreelancerInvoicesPage'
import { useIncentiveStatus, useSetIncentiveReceived, useBulkSetIncentiveReceived } from '@/hooks/useIncentiveStatus'
import { useAllClawbacks, useSetClawbackStatus, useDeleteClawback } from '@/hooks/useClawbacks'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { AlertTriangle } from 'lucide-react'

const ACCOUNTING_EMAIL = 'accounting@quantumadmissions.com'

// Freelancer commission types (partner/freelancer)
const FREELANCER_TYPES: IncentiveType[] = ['partner_sales', 'partner_fee']

const KIND_META: { key: string; label: string }[] = [
  { key: 'freelancer', label: '프리랜서 (개인)' },
  { key: 'freelancer_business', label: '프리랜서 (사업자)' },
  { key: 'sales_incentive', label: '세일즈 인센티브' },
  { key: 'partner', label: '파트너 (개인)' },
  { key: 'partner_business', label: '파트너 (사업자)' },
]
const kindLabel = (k?: string) => KIND_META.find(x => x.key === k)?.label || k || '기타'

function monthOptions(): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

interface PersonAmount {
  name: string
  amount: number
  details: { label: string; amount: number }[]
}

function groupByPerson(
  items: { displayName: string; incentiveAmount: number; incentiveType: IncentiveType; studentName: string }[],
): PersonAmount[] {
  const map = new Map<string, PersonAmount>()
  for (const item of items) {
    let entry = map.get(item.displayName)
    if (!entry) { entry = { name: item.displayName, amount: 0, details: [] }; map.set(item.displayName, entry) }
    entry.amount += item.incentiveAmount
    entry.details.push({ label: `${item.studentName} (${item.incentiveType})`, amount: item.incentiveAmount })
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

export function FinanceDashboardPage() {
  const t = useT()
  const { user } = useAuth()
  const isAccounting = (user?.email || '').toLowerCase() === ACCOUNTING_EMAIL
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'
  const allowed = isAccounting || isAdmin

  const months = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState<string>(months[0])

  const { data: invoices = [], isLoading: invLoading } = useAllInvoices(month === 'all' ? undefined : month)
  const updateStatus = useUpdateInvoiceStatus()
  const setPaidDate = useSetInvoicePaidDate()
  const [detailInv, setDetailInv] = useState<FreelancerInvoice | null>(null)
  const [exporting, setExporting] = useState(false)

  const { data: allIncentives = [], isLoading: incLoading } = useIncentivesByInstallment()
  const { data: allExtras = [], isLoading: extLoading } = useAllExtraInstallments()

  const pending = useMemo(() => invoices.filter(i => i.status === 'submitted'), [invoices])
  // 지급 원장: 승인완료 인보이스(미지급 먼저, 그다음 지급일 최신)
  const approvedList = useMemo(() =>
    invoices.filter(i => i.status === 'approved').sort((a, b) => {
      if (!!a.paidDate !== !!b.paidDate) return a.paidDate ? 1 : -1
      return (b.paidDate || b.invoiceDate || '').localeCompare(a.paidDate || a.invoiceDate || '')
    }), [invoices])

  const invoiceSummary = useMemo(() => {
    const byKind = new Map<string, { count: number; total: number }>()
    for (const inv of invoices) {
      const k = inv.kind || 'etc'
      const e = byKind.get(k) || { count: 0, total: 0 }
      e.count++; e.total += inv.totalAmount || 0
      byKind.set(k, e)
    }
    const grandTotal = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0)
    // 승인완료·미지급(=지급 예정) vs 지급완료(paidDate 있음)
    const approvedTotal = invoices.filter(i => i.status === 'approved' && !i.paidDate).reduce((s, i) => s + (i.totalAmount || 0), 0)
    const pendingTotal = invoices.filter(i => i.status === 'submitted').reduce((s, i) => s + (i.totalAmount || 0), 0)
    const paidTotal = invoices.filter(i => !!i.paidDate).reduce((s, i) => s + (i.totalAmount || 0), 0)
    const paidCount = invoices.filter(i => !!i.paidDate).length
    return { byKind, grandTotal, approvedTotal, pendingTotal, paidTotal, paidCount }
  }, [invoices])

  // ─── 미지급 현황 (기존): 프리랜서 커미션 + 서비스 수수료 ───
  const freelancerCommission = useMemo(() => {
    const unpaid = allIncentives.filter(e => !e.isPaid && FREELANCER_TYPES.includes(e.incentiveType))
    return { total: unpaid.reduce((s, e) => s + e.incentiveAmount, 0), count: unpaid.length, byPerson: groupByPerson(unpaid) }
  }, [allIncentives])

  const serviceFees = useMemo(() => {
    const unpaid: { name: string; amount: number; studentName: string; label: string }[] = []
    for (const ext of allExtras) for (const s of ext.revenueShares) {
      if (!s.isPaid) unpaid.push({ name: s.recipientName, amount: s.amount, studentName: ext.studentName, label: ext.label })
    }
    const map = new Map<string, PersonAmount>()
    for (const item of unpaid) {
      let entry = map.get(item.name)
      if (!entry) { entry = { name: item.name, amount: 0, details: [] }; map.set(item.name, entry) }
      entry.amount += item.amount
      entry.details.push({ label: `${item.studentName} - ${item.label}`, amount: item.amount })
    }
    return { total: unpaid.reduce((s, e) => s + e.amount, 0), count: unpaid.length, byPerson: [...map.values()].sort((a, b) => b.amount - a.amount) }
  }, [allExtras])

  // ─── 이름 표기 불일치 진단: 같은 학생이 인센티브에서 여러 이름으로 분산 ───
  const linesByPerson = useIncentiveLinesByPerson()
  const incentiveStatus = useIncentiveStatus()
  const setIncentiveReceived = useSetIncentiveReceived()
  const bulkSetIncentiveReceived = useBulkSetIncentiveReceived()
  const { data: students = [] } = useServiceStudents()
  const nameDiagnostics = useMemo(() => {
    const norm = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
    const studentByName = new Map<string, { id: string; name?: string; koreanName?: string }>()
    for (const st of students) {
      if (st.name) studentByName.set(norm(st.name), st)
      if (st.koreanName) studentByName.set(norm(st.koreanName), st)
    }
    type Row = { id: string; student?: { name?: string; koreanName?: string }; labels: Set<string>; persons: Set<string>; count: number }
    const byStudent = new Map<string, Row>()
    linesByPerson.forEach((lines, person) => {
      for (const l of lines) {
        const studentPart = (l.label.split('·')[0] || '').trim()
        if (!studentPart) continue
        const st = studentByName.get(norm(studentPart))
        const key = st ? `s:${st.id}` : `?:${norm(studentPart)}`
        const e = byStudent.get(key) || { id: key, student: st, labels: new Set<string>(), persons: new Set<string>(), count: 0 }
        e.labels.add(studentPart); e.persons.add(person); e.count++
        byStudent.set(key, e)
      }
    })
    return [...byStudent.values()].filter(r => r.student && r.labels.size > 1).sort((a, b) => b.count - a.count)
  }, [linesByPerson, students])

  // ─── 중복 의심 진단: 같은 학생·같은 금액이 계약(contract)과 서비스(service) 양쪽에서 잡히면 이중 입력 의심 ───
  const dupDiagnostics = useMemo(() => {
    const norm = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
    const canonByName = new Map<string, string>()
    for (const st of students) {
      const canon = [st.koreanName, st.name].filter(Boolean).join(' ')
      if (st.name) canonByName.set(norm(st.name), canon)
      if (st.koreanName) canonByName.set(norm(st.koreanName), canon)
    }
    type L = { source: 'contract' | 'service'; amount: number; month: string; person: string }
    const byStudent = new Map<string, { name: string; lines: L[] }>()
    linesByPerson.forEach((lines, person) => {
      for (const l of lines) {
        const studentPart = (l.label.split('·')[0] || '').trim()
        if (!studentPart) continue
        const canon = canonByName.get(norm(studentPart)) || studentPart
        const key = norm(canon)
        const src: 'contract' | 'service' = l.id.startsWith('c:') ? 'contract' : 'service'
        const e = byStudent.get(key) || { name: canon, lines: [] }
        e.lines.push({ source: src, amount: l.amount, month: l.month, person })
        byStudent.set(key, e)
      }
    })
    const flagged: { name: string; amount: number; contract: number; service: number; persons: string[] }[] = []
    for (const e of byStudent.values()) {
      const byAmount = new Map<number, { contract: number; service: number; persons: Set<string> }>()
      for (const l of e.lines) {
        const a = byAmount.get(l.amount) || { contract: 0, service: 0, persons: new Set<string>() }
        a[l.source]++; a.persons.add(l.person); byAmount.set(l.amount, a)
      }
      for (const [amount, a] of byAmount) {
        if (a.contract > 0 && a.service > 0) flagged.push({ name: e.name, amount, contract: a.contract, service: a.service, persons: [...a.persons] })
      }
    }
    return flagged.sort((a, b) => b.amount - a.amount)
  }, [linesByPerson, students])

  // ─── 외부서비스 이중 입력 진단: 같은 학생·같은 파트너(EC)가 계약 추가비용(A)과 Student360 EC(B) 양쪽에 존재 ───
  const { data: programFees = [] } = useAllServiceProgramFees()

  // ─── 환불 현황: 서비스(EC/학습지원) 환불신청·완료 ───
  const refunds = useMemo(() => {
    const label = (f: typeof programFees[number]) => [f.studentKoreanName, f.studentName].filter(Boolean).join(' ') || f.studentName || '—'
    const requested = programFees.filter(f => f.refundStatus === 'requested').map(f => ({ ...f, who: label(f) }))
    const completed = programFees.filter(f => f.refundStatus === 'completed').map(f => ({ ...f, who: label(f) }))
    const completedTotal = completed.reduce((s, f) => s + (f.refundAmount || 0), 0)
    return { requested, completed, completedTotal }
  }, [programFees])

  // ─── 환불 현황: 계약(분납금) 환불신청·완료 ───
  const { data: allInstallments = [] } = useInstallments()
  const contractRefunds = useMemo(() => {
    const who = (i: typeof allInstallments[number]) => i.contract?.studentName || i.contract?.contractorName || '—'
    const requested = allInstallments.filter(i => i.refundStatus === 'requested').map(i => ({ ...i, who: who(i) }))
    const completed = allInstallments.filter(i => i.refundStatus === 'completed').map(i => ({ ...i, who: who(i) }))
    const completedTotal = completed.reduce((s, i) => s + (i.refundAmount || 0), 0)
    return { requested, completed, completedTotal }
  }, [allInstallments])
  const refundTotalCount = refunds.requested.length + refunds.completed.length + contractRefunds.requested.length + contractRefunds.completed.length

  const ecDoubleEntry = useMemo(() => {
    const norm = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
    const canonByName = new Map<string, string>()
    for (const st of students) {
      const canon = [st.koreanName, st.name].filter(Boolean).join(' ')
      if (st.name) canonByName.set(norm(st.name), canon)
      if (st.koreanName) canonByName.set(norm(st.koreanName), canon)
    }
    const resolve = (raw?: string) => (raw ? (canonByName.get(norm(raw)) || raw) : '')
    // B: 학생 → 파트너(EC) → 금액합
    const ecByStudent = new Map<string, Map<string, { partner: string; amount: number }>>()
    for (const f of programFees) {
      const canon = resolve(f.studentName); if (!canon) continue
      const key = norm(canon)
      const partner = f.label || 'EC'
      const m = ecByStudent.get(key) || new Map()
      const e = m.get(norm(partner)) || { partner, amount: 0 }
      e.amount += f.billedAmount || 0
      m.set(norm(partner), e); ecByStudent.set(key, m)
    }
    // A: 계약 추가비용 라벨이 그 학생 EC 파트너명을 포함하면 이중 입력 의심
    const flagged: { student: string; partner: string; contractAmount: number; ecAmount: number; hasShare: boolean; label: string }[] = []
    for (const ext of allExtras) {
      const canon = resolve(ext.studentName); if (!canon) continue
      const partners = ecByStudent.get(norm(canon)); if (!partners) continue
      for (const [pn, info] of partners) {
        if (norm(ext.label).includes(pn)) {
          flagged.push({ student: canon, partner: info.partner, contractAmount: ext.amount, ecAmount: info.amount, hasShare: (ext.revenueShares?.length || 0) > 0, label: ext.label })
        }
      }
    }
    return flagged.sort((a, b) => b.contractAmount - a.contractAmount)
  }, [allExtras, programFees, students])

  // 항목 조회 → 회사 양식(견적서)으로 인보이스 1건 다운로드 (파일명 = 직원 이름)
  const downloadOne = async (inv: FreelancerInvoice) => {
    const { data: itemRows } = await supabase
      .from('freelancer_invoice_items')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('item_order', { ascending: true })
    const items = ((itemRows || []) as Record<string, unknown>[]).map(r => ({
      itemName: (r.item_name as string) || '',
      quantity: Number(r.quantity) || 0,
      unitPrice: Number(r.unit_price) || 0,
      supplyAmount: Number(r.supply_amount) || 0,
      remark: (r.remark as string) || null,
    }))
    await downloadInvoiceExcel(inv, items)
  }

  // 승인건 전체를 회사 양식으로 각각 다운로드 (직원 이름 파일명)
  const handleExportApproved = async () => {
    if (!approvedList.length || exporting) return
    setExporting(true)
    try {
      for (const inv of approvedList) {
        await downloadOne(inv)
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (e) {
      alert('엑셀 생성 중 오류가 발생했습니다. 다시 시도해 주세요.')
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">재무 대시보드는 재무담당(회계) 또는 관리자만 볼 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header + month */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('financeDash.title')}</h1>
          <p className="text-muted-foreground text-sm">각 인원이 제출한 인보이스를 한곳에서 승인·관리하고, 지급 예정·미지급을 파악합니다.</p>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            className="h-9 gap-1.5"
            disabled={approvedList.length === 0 || exporting}
            title={approvedList.length === 0 ? '승인완료된 인보이스가 없습니다' : '승인 인보이스를 회사 양식(견적서)으로 각각 다운로드 · 파일명=직원이름'}
            onClick={handleExportApproved}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            승인건 회사양식 ({approvedList.length})
          </Button>
          <div className="space-y-1">
            <Label className="text-xs">정산월</Label>
            <Select value={month} onValueChange={v => v && setMonth(v)}>
              <SelectTrigger className="h-9 w-40"><span>{month === 'all' ? '전체' : month}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ② 인보이스 지급 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Wallet className="size-4" /> 전체 신청 총액</div>
          <div className="text-xl font-bold mt-1">{formatCurrency(invoiceSummary.grandTotal)}</div>
          <div className="text-[11px] text-muted-foreground">{invoices.length}건</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="size-4 text-amber-500" /> 승인 대기</div>
          <div className="text-xl font-bold mt-1 text-amber-600">{formatCurrency(invoiceSummary.pendingTotal)}</div>
          <div className="text-[11px] text-muted-foreground">{pending.length}건</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-500" /> 승인 완료(지급 예정)</div>
          <div className="text-xl font-bold mt-1 text-emerald-600">{formatCurrency(invoiceSummary.approvedTotal)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Banknote className="size-4 text-indigo-500" /> 지급 완료</div>
          <div className="text-xl font-bold mt-1 text-indigo-600">{formatCurrency(invoiceSummary.paidTotal)}</div>
          <div className="text-[11px] text-muted-foreground">{invoiceSummary.paidCount}건</div>
        </CardContent></Card>
      </div>

      {/* 종류별 전사 현황판 */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          종류별 인보이스 현황 <span className="font-normal">({month === 'all' ? '전체 기간' : month})</span>
        </h2>
        {invLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {KIND_META.map(km => (
              <CategoryBoard
                key={km.key}
                label={km.label}
                invoices={invoices.filter(i => (i.kind || 'etc') === km.key)}
                onSelect={setDetailInv}
              />
            ))}
          </div>
        )}
      </div>

      {/* ① 승인 대기함 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Clock className="size-4 text-amber-500" />
            <span className="font-semibold text-sm">승인 대기함</span>
            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">{pending.length}건</Badge>
          </div>
          {invLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : pending.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">승인 대기 중인 인보이스가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">제출자</TableHead>
                  <TableHead className="w-40">종류</TableHead>
                  <TableHead className="w-24">정산월</TableHead>
                  <TableHead className="text-right w-32">금액</TableHead>
                  <TableHead className="w-28">제출일</TableHead>
                  <TableHead className="w-40 text-right">승인/반려</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm font-medium">{inv.freelancerName || inv.freelancerEmail || '-'}</TableCell>
                    <TableCell className="text-sm"><Badge variant="outline">{kindLabel(inv.kind)}</Badge></TableCell>
                    <TableCell className="text-sm tabular-nums">{inv.invoiceMonth}</TableCell>
                    <TableCell className="text-sm text-right font-semibold tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetailInv(inv)}
                        className="text-primary hover:underline underline-offset-2 tabular-nums"
                        title="인보이스 상세 보기"
                      >
                        {formatCurrency(inv.totalAmount)}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.invoiceDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: inv.id, status: 'approved' })}>
                          <CheckCircle2 className="size-4" /> 승인
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-red-700 border-red-200 hover:bg-red-50"
                          disabled={updateStatus.isPending}
                          onClick={() => { if (confirm('이 인보이스를 반려할까요?')) updateStatus.mutate({ id: inv.id, status: 'rejected' }) }}>
                          <XCircle className="size-4" /> 반려
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 인센티브 지급 원장 (월 선택 · 계약·서비스 인센티브) */}
      <IncentivePayoutLedger
        linesByPerson={linesByPerson}
        status={incentiveStatus}
        months={months}
        defaultMonth={month === 'all' ? months[0] : month}
        canToggle={allowed}
        onToggle={(id, received, m) => setIncentiveReceived.mutate({ key: id, received, month: m })}
        onBulk={rows => bulkSetIncentiveReceived.mutate(rows)}
        toggling={setIncentiveReceived.isPending || bulkSetIncentiveReceived.isPending}
      />

      {/* 인센티브 차감(환불) 현황 */}
      <ClawbackSection />

      {/* 인보이스 지급 원장 (승인완료 → 지급완료) */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Banknote className="size-4 text-indigo-500" />
            <span className="font-semibold text-sm">인보이스 지급 원장 (승인완료 · 지급완료)</span>
            <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50">{approvedList.length}건</Badge>
            <span className="text-[11px] text-muted-foreground ml-auto">지급이 나간 인보이스는 "지급완료 처리"로 지급일을 기록하세요. 중복·이월 판단 근거가 됩니다.</span>
          </div>
          {invLoading ? (
            <div className="py-14 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : approvedList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">승인완료된 인보이스가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">제출자</TableHead>
                  <TableHead className="w-36">종류</TableHead>
                  <TableHead className="w-24">정산월</TableHead>
                  <TableHead className="text-right w-32">금액</TableHead>
                  <TableHead className="w-24">상태</TableHead>
                  <TableHead className="text-right w-80">지급완료 처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedList.map(inv => (
                  <TableRow key={inv.id} className={inv.paidDate ? 'bg-indigo-50/30' : ''}>
                    <TableCell className="text-sm font-medium">{inv.freelancerName || inv.freelancerEmail || '-'}</TableCell>
                    <TableCell className="text-sm"><Badge variant="outline">{kindLabel(inv.kind)}</Badge></TableCell>
                    <TableCell className="text-sm tabular-nums">{inv.invoiceMonth}</TableCell>
                    <TableCell className="text-sm text-right font-semibold tabular-nums">
                      <button type="button" onClick={() => setDetailInv(inv)} className="text-primary hover:underline underline-offset-2 tabular-nums" title="인보이스 상세 보기">
                        {formatCurrency(inv.totalAmount)}
                      </button>
                    </TableCell>
                    <TableCell>
                      {inv.paidDate
                        ? <StatusBadge status="paid" />
                        : <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">지급예정</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <PaidActionCell inv={inv} disabled={setPaidDate.isPending} onSet={(id, d) => setPaidDate.mutate({ id, paidDate: d })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 환불 현황 (서비스 EC/학습지원) */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Wallet className="size-4 text-rose-500" />
            <span className="font-semibold text-sm">환불 현황</span>
            <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">신청중 {refunds.requested.length + contractRefunds.requested.length}건</Badge>
            <Badge variant="outline" className="text-rose-700 border-rose-300 bg-rose-50">완료 {refunds.completed.length + contractRefunds.completed.length}건 · {formatCurrency(refunds.completedTotal + contractRefunds.completedTotal)}</Badge>
          </div>
          {refundTotalCount === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">환불 신청·완료 내역이 없습니다.</div>
          ) : (
            <div className="p-3 space-y-4">
              {/* 환불신청중 — 처리 대기 */}
              {(refunds.requested.length > 0 || contractRefunds.requested.length > 0) && (
                <div>
                  <div className="text-xs font-semibold text-orange-700 mb-1.5">환불신청중 (처리 대기)</div>
                  <div className="space-y-1.5">
                    {refunds.requested.map(f => (
                      <div key={f.id} className="rounded-md border border-orange-200 bg-orange-50/50 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">{f.who} <span className="text-xs text-muted-foreground">· {f.label}{f.source === 'academic' ? ' (학습지원)' : ' (EC)'}</span></span>
                          <span className="text-xs text-muted-foreground">신청일 {f.refundDate || '—'} · 서비스금액 {f.billedAmount != null ? formatCurrency(f.billedAmount, f.currency as 'KRW' | 'USD') : '—'}</span>
                        </div>
                        {f.refundReason && <p className="text-xs text-orange-700 mt-1 whitespace-pre-wrap">사유: {f.refundReason}</p>}
                      </div>
                    ))}
                    {contractRefunds.requested.map(i => (
                      <div key={i.id} className="rounded-md border border-orange-200 bg-orange-50/50 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">{i.who} <span className="text-xs text-muted-foreground">· {i.label} (계약)</span></span>
                          <span className="text-xs text-muted-foreground">신청일 {i.refundDate || '—'} · 환불금액 {i.refundAmount != null ? formatCurrency(i.refundAmount, i.currency) : '—'}</span>
                        </div>
                        {(i.refundAccount || i.refundReason) && (
                          <div className="text-xs text-orange-700 mt-1">
                            {i.refundAccount && <div>계좌: {i.refundAccount}</div>}
                            {i.refundReason && <div className="whitespace-pre-wrap">사유: {i.refundReason}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">환불 처리(신청·완료)는 서비스는 서비스입금관리에서, 계약은 계약관리에서 진행됩니다. 여기서는 결과만 확인합니다.</p>
                </div>
              )}
              {/* 환불완료 */}
              {(refunds.completed.length > 0 || contractRefunds.completed.length > 0) && (
                <div>
                  <div className="text-xs font-semibold text-rose-700 mb-1.5">환불완료</div>
                  <div className="space-y-1.5">
                    {refunds.completed.map(f => (
                      <div key={f.id} className="rounded-md border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">{f.who} <span className="text-xs text-muted-foreground">· {f.label}{f.source === 'academic' ? ' (학습지원)' : ' (EC)'}</span></span>
                          <span className="text-sm font-mono font-medium text-rose-700">{f.refundAmount != null ? formatCurrency(f.refundAmount, f.currency as 'KRW' | 'USD') : '—'}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">완료일 {f.refundDate || '—'}{f.refundReason ? ` · 사유: ${f.refundReason}` : ''}</div>
                      </div>
                    ))}
                    {contractRefunds.completed.map(i => (
                      <div key={i.id} className="rounded-md border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">{i.who} <span className="text-xs text-muted-foreground">· {i.label} (계약)</span></span>
                          <span className="text-sm font-mono font-medium text-rose-700">{i.refundAmount != null ? formatCurrency(i.refundAmount, i.currency) : '—'}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          완료일 {i.refundDate || '—'}{i.refundAccount ? ` · 계좌: ${i.refundAccount}` : ''}{i.refundReason ? ` · 사유: ${i.refundReason}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 이름 표기 불일치 진단 — 문제가 있을 때만 표시 */}
      {nameDiagnostics.length > 0 && (
      <Card className="border-amber-300">
        <CardContent className="p-0">
          <div className={`flex items-center gap-2 px-4 py-3 border-b ${nameDiagnostics.length > 0 ? 'bg-amber-50' : ''}`}>
            <AlertTriangle className={`size-4 ${nameDiagnostics.length > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
            <span className="font-semibold text-sm">이름 표기 불일치 학생 (인센티브 분산)</span>
            <Badge variant="outline" className={nameDiagnostics.length > 0 ? 'text-amber-700 border-amber-300 bg-amber-50' : ''}>{nameDiagnostics.length}명</Badge>
          </div>
          {nameDiagnostics.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">이름이 여러 형태로 나뉜 학생이 없습니다. (전 직원 인센티브 기준)</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">학생 (서비스 학생기록 기준)</TableHead>
                    <TableHead>인센티브에서 발견된 이름 표기</TableHead>
                    <TableHead className="w-20 text-center">건수</TableHead>
                    <TableHead className="w-48">관련 직원</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nameDiagnostics.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{[r.student?.koreanName, r.student?.name].filter(Boolean).join(' ') || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {[...r.labels].map(l => <Badge key={l} variant="outline" className="text-[11px]">{l}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-sm">{r.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{[...r.persons].join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">같은 학생인데 계약서·서비스 기록에 이름이 다르게(한글/영어·띄어쓰기 등) 입력돼 인센티브가 분산 표시됩니다. 원천 기록(계약서 학생명 / Student360 학생기록)의 이름을 하나로 통일하면 합쳐집니다. 금액 계산 자체는 정상입니다.</p>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* 중복 의심 진단 — 문제가 있을 때만 표시 */}
      {dupDiagnostics.length > 0 && (
      <Card className="border-red-300">
        <CardContent className="p-0">
          <div className={`flex items-center gap-2 px-4 py-3 border-b ${dupDiagnostics.length > 0 ? 'bg-red-50' : ''}`}>
            <AlertTriangle className={`size-4 ${dupDiagnostics.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            <span className="font-semibold text-sm">중복 의심 인센티브 (계약·서비스 이중 입력)</span>
            <Badge variant="outline" className={dupDiagnostics.length > 0 ? 'text-red-700 border-red-300 bg-red-50' : ''}>{dupDiagnostics.length}건</Badge>
          </div>
          {dupDiagnostics.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">계약·서비스 양쪽에서 같은 금액으로 잡힌 인센티브가 없습니다.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-56">학생</TableHead>
                    <TableHead className="text-right w-32">금액</TableHead>
                    <TableHead className="w-40">중복 출처</TableHead>
                    <TableHead className="w-48">관련 직원</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dupDiagnostics.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-right font-semibold tabular-nums">{formatCurrency(r.amount)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="text-amber-700">계약 {r.contract}건</span> · <span className="text-emerald-700">서비스 {r.service}건</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.persons.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">같은 학생·같은 금액이 <b>계약</b>과 <b>서비스입금관리(EC)</b> 양쪽에서 잡혀 인센티브가 이중 계산됐을 가능성이 큽니다. 같은 매출을 한 곳에만 남기고 다른 한 곳의 기록을 삭제하면 해소됩니다. (EC 프로그램은 서비스입금관리에만 기록 권장)</p>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* 외부서비스 이중 입력 진단 — 문제가 있을 때만 표시 */}
      {ecDoubleEntry.length > 0 && (
      <Card className="border-red-300">
        <CardContent className="p-0">
          <div className={`flex items-center gap-2 px-4 py-3 border-b ${ecDoubleEntry.length > 0 ? 'bg-red-50' : ''}`}>
            <AlertTriangle className={`size-4 ${ecDoubleEntry.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            <span className="font-semibold text-sm">외부서비스 이중 입력 (계약 추가비용 ↔ Student360 EC)</span>
            <Badge variant="outline" className={ecDoubleEntry.length > 0 ? 'text-red-700 border-red-300 bg-red-50' : ''}>{ecDoubleEntry.length}건</Badge>
          </div>
          {ecDoubleEntry.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">계약 추가비용과 Student360 EC 양쪽에 동시에 잡힌 외부서비스가 없습니다.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-56">학생</TableHead>
                    <TableHead className="w-32">외부서비스</TableHead>
                    <TableHead className="w-40">계약 추가비용(A)</TableHead>
                    <TableHead className="w-40">Student360 EC(B)</TableHead>
                    <TableHead className="w-28">수익배분</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ecDoubleEntry.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium">{r.student}</TableCell>
                      <TableCell className="text-sm">{r.partner}</TableCell>
                      <TableCell className="text-sm tabular-nums">{formatCurrency(r.contractAmount)} <span className="text-[11px] text-muted-foreground">· {r.label}</span></TableCell>
                      <TableCell className="text-sm tabular-nums">{formatCurrency(r.ecAmount)}</TableCell>
                      <TableCell className="text-xs">{r.hasShare ? <span className="text-red-600 font-medium">있음(인센티브 이중)</span> : <span className="text-muted-foreground">없음(매출만 이중)</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">같은 학생·같은 외부서비스가 <b>계약 추가비용(A)</b>과 <b>Student360 EC(B)</b> 양쪽에 입력돼 매출이 이중 집계됩니다. <b>수익배분 "있음"</b>은 인센티브까지 이중. 한 곳만 남기세요(권장: Student360 EC 유지, 계약 추가비용의 해당 항목 삭제).</p>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* ③ 미지급 현황 (기존): 프리랜서 커미션 + 서비스 수수료 */}
      {(incLoading || extLoading) ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">미지급 현황 (수금 완료·미정산)</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('financeDash.totalToPay')}:</span>
              <span className="text-lg font-bold">{formatCurrency(freelancerCommission.total + serviceFees.total)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PayoutCard title={t('financeDash.freelancerCommission')} color="purple" persons={freelancerCommission.byPerson} icon={<Users className="size-4 text-purple-500" />} t={t} />
            <PayoutCard title={t('financeDash.serviceFee')} color="amber" persons={serviceFees.byPerson} icon={<Receipt className="size-4 text-amber-500" />} t={t} />
          </div>
        </>
      )}

      <InvoiceDetailDialog invoice={detailInv} onClose={() => setDetailInv(null)} />
    </div>
  )
}

// ─── Invoice detail popup (제출된 인보이스 내역) ─────────────────────────────
function InvoiceDetailDialog({ invoice, onClose }: { invoice: FreelancerInvoice | null; onClose: () => void }) {
  const { data: items = [], isLoading } = useInvoiceItems(invoice?.id)
  const updateStatus = useUpdateInvoiceStatus()
  const setPaid = useSetInvoicePaidDate()
  const [downloading, setDownloading] = useState(false)
  const open = !!invoice
  const busy = updateStatus.isPending || setPaid.isPending

  // 회사 양식(견적서)으로 다운로드 — 파일명 = 직원 이름
  const downloadForm = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      await downloadInvoiceExcel(invoice, items.map(it => ({
        itemName: it.itemName, quantity: it.quantity, unitPrice: it.unitPrice, supplyAmount: it.supplyAmount, remark: it.remark,
      })))
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  // 승인/반려를 실수로 눌렀을 때 대기(제출) 상태로 되돌림. 지급완료였다면 지급일도 해제.
  const revertToSubmitted = () => {
    if (!invoice) return
    const label = invoice.status === 'approved' ? '승인' : '반려'
    if (!confirm(`이 인보이스의 ${label}을(를) 취소하고 '승인 대기'로 되돌릴까요?${invoice.paidDate ? '\n(지급완료 기록도 함께 해제됩니다.)' : ''}`)) return
    if (invoice.paidDate) setPaid.mutate({ id: invoice.id, paidDate: null })
    updateStatus.mutate({ id: invoice.id, status: 'submitted' }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>인보이스 상세</DialogTitle></DialogHeader>
        {invoice && (
          <div className="space-y-4">
            {/* 헤더 정보 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">제출자</span><span className="font-medium">{invoice.freelancerName || invoice.freelancerEmail || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">종류</span><span className="font-medium">{kindLabel(invoice.kind)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">정산월</span><span className="font-medium tabular-nums">{invoice.invoiceMonth}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">제출일</span><span className="font-medium tabular-nums">{invoice.invoiceDate}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">상태</span><StatusBadge status={invoice.paidDate ? 'paid' : invoice.status} /></div>
              {invoice.bankAccount && <div className="flex justify-between col-span-2"><span className="text-muted-foreground">입금 계좌</span><span className="font-medium">{invoice.bankAccount}</span></div>}
              {invoice.phone && <div className="flex justify-between"><span className="text-muted-foreground">연락처</span><span className="font-medium">{invoice.phone}</span></div>}
              {invoice.residentNumber && <div className="flex justify-between"><span className="text-muted-foreground">주민/사업자번호</span><span className="font-medium">{invoice.residentNumber}</span></div>}
            </div>

            {/* 품목 내역 */}
            <div>
              <div className="text-sm font-semibold mb-2">항목 내역</div>
              {isLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">등록된 항목 내역이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">No</TableHead>
                      <TableHead>항목명</TableHead>
                      <TableHead className="text-right w-16">수량</TableHead>
                      <TableHead className="text-right w-28">단가</TableHead>
                      <TableHead className="text-right w-28">공급가</TableHead>
                      <TableHead className="w-32">비고</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={it.id}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm">{it.itemName || '-'}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{it.quantity}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatCurrency(it.unitPrice)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums font-medium">{formatCurrency(it.supplyAmount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{it.remark || ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* 합계 & 메모 */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold">합계</span>
              <span className="text-base font-bold tabular-nums">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            {invoice.note && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">메모</div>
                <p className="whitespace-pre-wrap">{invoice.note}</p>
              </div>
            )}

            {/* 액션: 회사 양식 다운로드 + 승인/반려 되돌리기 */}
            <div className="flex items-center justify-between gap-2 border-t pt-3 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5"
                disabled={downloading} onClick={downloadForm}>
                {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                회사 양식 다운로드
              </Button>
              {(invoice.status === 'approved' || invoice.status === 'rejected') && (
                <Button variant="outline" size="sm" className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                  disabled={busy} onClick={revertToSubmitted}>
                  <RefreshCw className="size-3.5" /> {invoice.status === 'approved' ? '승인' : '반려'} 취소 · 대기로
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── 인센티브 차감(환불) 현황 ────────────────────────────────────────────────
function ClawbackSection() {
  const { data: clawbacks = [] } = useAllClawbacks()
  const setStatus = useSetClawbackStatus()
  const del = useDeleteClawback()
  if (clawbacks.length === 0) return null
  const rows = [...clawbacks].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1) ||
    (b.deductMonth || '').localeCompare(a.deductMonth || ''))
  const pending = clawbacks.filter(c => c.status === 'pending')
  const pendingTotal = pending.reduce((s, c) => s + c.amount, 0)
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-wrap">
          <RefreshCw className="size-4 text-rose-500" />
          <span className="font-semibold text-sm">인센티브 환급 현황</span>
          <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">환급신청 {pending.length}건 · {formatCurrency(pendingTotal)}</Badge>
          <span className="text-[11px] text-muted-foreground ml-auto">환불로 회수할 세일즈 인센티브. 급여 지급 후 "환급완료"로 표시. 인보이스·지급원장에는 (−)로 자동 반영됩니다.</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">담당자</TableHead>
              <TableHead>학생/사유</TableHead>
              <TableHead className="w-20">출처</TableHead>
              <TableHead className="w-24">차감월</TableHead>
              <TableHead className="text-right w-28">차감액</TableHead>
              <TableHead className="w-40 text-right">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(c => (
              <TableRow key={c.id} className={c.status === 'deducted' ? 'bg-muted/30' : ''}>
                <TableCell className="text-sm font-medium">{c.contributorName}</TableCell>
                <TableCell className="text-sm">
                  <div>{c.studentName || '—'}</div>
                  {c.reason && <div className="text-[11px] text-muted-foreground">{c.reason}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.source === 'contract' ? '계약' : '서비스'}</TableCell>
                <TableCell className="text-sm tabular-nums">{c.deductMonth}</TableCell>
                <TableCell className="text-sm text-right font-semibold tabular-nums text-rose-600">−{formatCurrency(c.amount)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {c.status === 'deducted' ? (
                      <>
                        <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">환급완료</Badge>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: c.id, status: 'pending' })}>되돌리기</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: c.id, status: 'deducted' })}>환급완료 처리</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" disabled={del.isPending}
                      onClick={() => { if (confirm('이 차감 기록을 삭제할까요? (인보이스/지급원장의 (−)반영도 사라집니다)')) del.mutate(c.id) }}>
                      <XCircle className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── 인센티브 지급 원장 (월 선택 · 전사) ──────────────────────────────────────
function IncentivePayoutLedger({ linesByPerson, status, months, defaultMonth, canToggle, onToggle, onBulk, toggling }: {
  linesByPerson: Map<string, IncentiveLine[]>
  status: Map<string, { received: boolean; receivedMonth?: string }>
  months: string[]
  defaultMonth: string
  canToggle: boolean
  onToggle: (id: string, received: boolean, month: string) => void
  onBulk: (rows: { key: string; received: boolean; month: string }[]) => void
  toggling: boolean
}) {
  const [m, setM] = useState(defaultMonth)

  // 선택 월 M 기준 라인 수집:
  //  · 지급완료(당월): received && receivedMonth === M
  //  · 미지급(누적): !received && origin월 <= M  (미수령분은 이월되어 누적 표시)
  //  · 전체(all): 모든 라인
  const rows = useMemo(() => {
    const out: { person: string; line: IncentiveLine; received: boolean; receivedMonth?: string }[] = []
    linesByPerson.forEach((lines, person) => {
      for (const l of lines) {
        const st = status.get(l.id)
        const received = !!st?.received
        if (m === 'all') {
          out.push({ person, line: l, received, receivedMonth: st?.receivedMonth })
        } else if (received && st?.receivedMonth === m) {
          out.push({ person, line: l, received: true, receivedMonth: st?.receivedMonth })
        } else if (!received && l.month <= m) {
          out.push({ person, line: l, received: false })
        }
      }
    })
    return out.sort((a, b) => a.person.localeCompare(b.person) || (b.line.amount - a.line.amount))
  }, [linesByPerson, status, m])

  const paidTotal = rows.filter(r => r.received).reduce((s, r) => s + r.line.amount, 0)
  const pendingTotal = rows.filter(r => !r.received).reduce((s, r) => s + r.line.amount, 0)
  const personCount = new Set(rows.map(r => r.person)).size
  const pendingRows = rows.filter(r => !r.received)

  // 전체 라인(이미 지급완료 포함)을 각 발생월로 재정렬 — 현재 월 필터와 무관하게 전 기간 대상
  const allLineRows = useMemo(() => {
    const out: { key: string; month: string }[] = []
    linesByPerson.forEach(lines => lines.forEach(l => out.push({ key: l.id, month: l.month })))
    return out
  }, [linesByPerson])

  // 미지급 전체를 각 라인의 발생월 기준으로 일괄 지급완료
  const bulkPayByOrigin = () => {
    if (!pendingRows.length) return
    if (!confirm(`미지급 ${pendingRows.length}건을 각 항목의 발생월 기준으로 지급완료 처리할까요?\n(예: 2026-06 발생분 → 2026-06 지급완료)`)) return
    onBulk(pendingRows.map(r => ({ key: r.line.id, received: true, month: r.line.month })))
  }

  // 전체(이미 지급완료 포함)를 발생월로 재정렬 — 잘못 찍힌 월 정리용
  const realignAll = () => {
    if (!allLineRows.length) return
    if (!confirm(`전체 ${allLineRows.length}건을 각 항목의 발생월로 지급완료 재정렬할까요?\n이미 지급완료된 건의 월도 발생월로 덮어씁니다. (잘못된 월 정리용)`)) return
    onBulk(allLineRows.map(r => ({ key: r.key, received: true, month: r.month })))
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-wrap">
          <Banknote className="size-4 text-violet-500" />
          <span className="font-semibold text-sm">인센티브 지급 원장</span>
          <Badge variant="outline" className="text-violet-700 border-violet-200 bg-violet-50">{rows.length}건 · {personCount}명</Badge>
          {canToggle && pendingRows.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 gap-1 text-violet-700 border-violet-300 hover:bg-violet-50"
              disabled={toggling} onClick={bulkPayByOrigin}>
              <Banknote className="size-4" /> 발생월 기준 일괄 지급완료 ({pendingRows.length}건)
            </Button>
          )}
          {canToggle && allLineRows.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground hover:text-violet-700"
              disabled={toggling} onClick={realignAll} title="이미 지급완료된 건 포함, 전체를 발생월로 다시 맞춤(잘못된 월 정리)">
              <RefreshCw className="size-3.5" /> 전체 발생월로 재정렬
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">정산월</Label>
            <Select value={m} onValueChange={v => v && setM(v)}>
              <SelectTrigger className="h-8 w-36"><span>{m === 'all' ? '전체 기간' : m}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기간</SelectItem>
                {months.map(mm => <SelectItem key={mm} value={mm}>{mm}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-3 divide-x border-b text-center">
          <div className="py-2">
            <div className="text-[11px] text-muted-foreground">{m === 'all' ? '지급완료(전체)' : `${m} 지급완료`}</div>
            <div className="text-sm font-bold text-violet-600 tabular-nums">{formatCurrency(paidTotal)}</div>
          </div>
          <div className="py-2">
            <div className="text-[11px] text-muted-foreground">미지급(누적)</div>
            <div className="text-sm font-bold text-amber-600 tabular-nums">{formatCurrency(pendingTotal)}</div>
          </div>
          <div className="py-2">
            <div className="text-[11px] text-muted-foreground">대상 인원</div>
            <div className="text-sm font-bold tabular-nums">{personCount}명</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            해당 월 인센티브 내역이 없습니다. {m !== 'all' && '상단에서 다른 월(예: 6월)을 선택해 보세요.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">대상자</TableHead>
                <TableHead>인센티브 항목</TableHead>
                <TableHead className="w-20">출처</TableHead>
                <TableHead className="w-20">발생월</TableHead>
                <TableHead className="text-right w-28">금액</TableHead>
                <TableHead className="w-56 text-right">지급 처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`${r.person}:${r.line.id}`} className={r.received ? 'bg-violet-50/30' : ''}>
                  <TableCell className="text-sm font-medium">{r.person}</TableCell>
                  <TableCell className="text-sm">
                    <div className="truncate max-w-[280px]" title={r.line.sourceDetail}>{r.line.label}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.line.source === 'contract' ? '계약' : '서비스'}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{r.line.month}</TableCell>
                  <TableCell className="text-sm text-right font-semibold tabular-nums">{formatCurrency(r.line.amount)}</TableCell>
                  <TableCell className="text-right">
                    {r.received ? (
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant="outline" className="text-violet-700 border-violet-200 bg-violet-50 gap-1"><Banknote className="size-3" /> 지급 {r.receivedMonth || ''}</Badge>
                        {canToggle && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" disabled={toggling}
                            onClick={() => onToggle(r.line.id, false, r.receivedMonth || m)}>취소</Button>
                        )}
                      </div>
                    ) : canToggle ? (
                      <PayLineCell line={r.line} months={months} disabled={toggling}
                        onPay={(month) => onToggle(r.line.id, true, month)} />
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-200">미지급</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
          지급완료 버튼은 각 항목의 <b>발생월</b>로 기본 설정됩니다(예: 2026-06 발생분 → 2026-06 지급완료). 실제 지급월이 다르면 옆 드롭다운으로 바꿔 기록하세요.
          미지급 전체를 한 번에 소급 처리하려면 상단 <b>발생월 기준 일괄 지급완료</b>를 쓰세요. 처리 후 남는 미지급분이 곧 이월분입니다.
        </p>
      </CardContent>
    </Card>
  )
}

// 라인별 지급완료: 발생월을 기본으로 하되 실제 지급월을 바꿔 기록할 수 있음
function PayLineCell({ line, months, disabled, onPay }: {
  line: IncentiveLine
  months: string[]
  disabled: boolean
  onPay: (month: string) => void
}) {
  const [pm, setPm] = useState(line.month)
  const opts = months.includes(line.month) ? months : [line.month, ...months]
  return (
    <div className="flex items-center justify-end gap-1">
      <Select value={pm} onValueChange={v => v && setPm(v)}>
        <SelectTrigger className="h-8 w-24 text-xs"><span>{pm}</span></SelectTrigger>
        <SelectContent>
          {opts.map(mm => <SelectItem key={mm} value={mm}>{mm}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-8 gap-1 text-violet-700 border-violet-200 hover:bg-violet-50"
        disabled={disabled} onClick={() => onPay(pm)}>
        <Banknote className="size-4" /> 지급완료
      </Button>
    </div>
  )
}

// ─── 종류별 현황판 카드 ────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted: { label: '승인대기', cls: 'text-amber-700 border-amber-200 bg-amber-50' },
  approved: { label: '승인완료', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  paid: { label: '지급완료', cls: 'text-indigo-700 border-indigo-200 bg-indigo-50' },
  rejected: { label: '반려', cls: 'text-red-700 border-red-200 bg-red-50' },
  draft: { label: '작성중', cls: 'text-muted-foreground' },
}

function StatusBadge({ status }: { status?: string }) {
  const m = STATUS_META[status || ''] || { label: status || '-', cls: '' }
  return <Badge variant="outline" className={`text-[10px] shrink-0 ${m.cls}`}>{m.label}</Badge>
}

function CategoryBoard({ label, invoices, onSelect }: {
  label: string
  invoices: FreelancerInvoice[]
  onSelect: (inv: FreelancerInvoice) => void
}) {
  const total = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0)
  const pendingCount = invoices.filter(i => i.status === 'submitted').length
  // 제출일 최신순
  const rows = [...invoices].sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''))
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <span className="text-xs font-normal text-muted-foreground shrink-0 tabular-nums">
            {invoices.length}건 · {formatCurrency(total)}
          </span>
        </CardTitle>
        {pendingCount > 0 && (
          <div className="text-[11px] text-amber-600">승인대기 {pendingCount}건</div>
        )}
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">해당 기간 인보이스 없음</p>
        ) : (
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {rows.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inv.freelancerName || inv.freelancerEmail || '-'}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {inv.invoiceMonth}{inv.invoiceDate ? ` · 제출 ${inv.invoiceDate}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={inv.paidDate ? 'paid' : inv.status} />
                  <button
                    type="button"
                    onClick={() => onSelect(inv)}
                    className="text-sm font-semibold tabular-nums text-primary hover:underline underline-offset-2"
                    title="인보이스 상세 보기"
                  >
                    {formatCurrency(inv.totalAmount)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── 지급완료 처리 셀 (지급일 기록/수정/취소) ────────────────────────────────
function PaidActionCell({ inv, disabled, onSet }: {
  inv: FreelancerInvoice
  disabled: boolean
  onSet: (id: string, paidDate: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [d, setD] = useState(inv.paidDate || todayKST())

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input type="date" value={d} onChange={e => setD(e.target.value)} className="h-8 w-36 text-sm" />
        <Button size="sm" className="h-8" disabled={disabled} onClick={() => { onSet(inv.id, d || todayKST()); setEditing(false) }}>저장</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>취소</Button>
        {inv.paidDate && (
          <Button size="sm" variant="ghost" className="h-8 text-red-600" disabled={disabled}
            onClick={() => { onSet(inv.id, null); setEditing(false) }}>지급취소</Button>
        )}
      </div>
    )
  }
  if (inv.paidDate) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50 gap-1"><Banknote className="size-3" /> 지급 {inv.paidDate}</Badge>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => { setD(inv.paidDate || todayKST()); setEditing(true) }}>수정</Button>
      </div>
    )
  }
  return (
    <Button size="sm" variant="outline" className="h-8 gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
      disabled={disabled} onClick={() => { setD(todayKST()); setEditing(true) }}>
      <Banknote className="size-4" /> 지급완료 처리
    </Button>
  )
}

// ─── Payout detail card ──────────────────────────────────────────────────────

function PayoutCard({ title, color, persons, icon, t }: {
  title: string
  color: 'purple' | 'blue' | 'amber'
  persons: PersonAmount[]
  icon?: React.ReactNode
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const colorMap = {
    purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
  }
  const c = colorMap[color]

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {persons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('financeDash.noPending')}</p>
        ) : persons.map((p) => (
          <div key={p.name} className={`${c.bg} rounded-lg p-3`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-semibold ${c.text}`}>{p.name}</span>
              <span className={`text-sm font-bold ${c.text}`}>{formatCurrency(p.amount)}</span>
            </div>
            <div className="space-y-1">
              {p.details.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate mr-2">{d.label}</span>
                  <span className="shrink-0">{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
