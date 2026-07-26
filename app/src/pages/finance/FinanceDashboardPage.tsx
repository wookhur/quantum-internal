import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Users, Receipt, Lock, Clock, CheckCircle2, XCircle, Wallet } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useIncentivesByInstallment, type IncentiveType } from '@/hooks/useIncentives'
import { useAllExtraInstallments } from '@/hooks/useExternalFees'
import { useAllInvoices, useUpdateInvoiceStatus } from '@/hooks/useFreelancerInvoices'
import { useIncentiveLinesByPerson } from '@/pages/finance/FreelancerInvoicesPage'
import { useServiceStudents } from '@/hooks/useServiceStudents'
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

  const { data: allIncentives = [], isLoading: incLoading } = useIncentivesByInstallment()
  const { data: allExtras = [], isLoading: extLoading } = useAllExtraInstallments()

  const pending = useMemo(() => invoices.filter(i => i.status === 'submitted'), [invoices])

  const invoiceSummary = useMemo(() => {
    const byKind = new Map<string, { count: number; total: number }>()
    for (const inv of invoices) {
      const k = inv.kind || 'etc'
      const e = byKind.get(k) || { count: 0, total: 0 }
      e.count++; e.total += inv.totalAmount || 0
      byKind.set(k, e)
    }
    const grandTotal = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0)
    const approvedTotal = invoices.filter(i => i.status === 'approved').reduce((s, i) => s + (i.totalAmount || 0), 0)
    const pendingTotal = invoices.filter(i => i.status === 'submitted').reduce((s, i) => s + (i.totalAmount || 0), 0)
    return { byKind, grandTotal, approvedTotal, pendingTotal }
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
          <div className="text-xs text-muted-foreground">종류별 신청</div>
          <div className="mt-1 space-y-0.5">
            {[...invoiceSummary.byKind.entries()].map(([k, e]) => (
              <div key={k} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{kindLabel(k)}</span>
                <span className="font-medium tabular-nums">{formatCurrency(e.total)} · {e.count}건</span>
              </div>
            ))}
            {invoiceSummary.byKind.size === 0 && <div className="text-[11px] text-muted-foreground">없음</div>}
          </div>
        </CardContent></Card>
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
                    <TableCell className="text-sm text-right font-semibold tabular-nums">{formatCurrency(inv.totalAmount)}</TableCell>
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

      {/* 이름 표기 불일치 진단 */}
      <Card className={nameDiagnostics.length > 0 ? 'border-amber-300' : ''}>
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
    </div>
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
