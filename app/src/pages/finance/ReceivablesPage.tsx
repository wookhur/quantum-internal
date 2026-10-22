import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, Download, ChevronDown, ChevronRight, AlertTriangle, Printer,
} from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import { formatCurrency } from '@/types'
import { todayKST } from '@/lib/date'
import {
  monthlyReceivables, monthLabel, addMonths, daysPastDue, AGING_LABEL,
  type Currency, type ReceivableMonth, type ReceivablesResult,
} from '@/lib/monthlyReceivables'
import type { PaymentInstallment } from '@/types'

/**
 * 월별 미수금 현황.
 *
 * 월별 수금 화면은 한 달씩만 보여줘서, "몇 월 것이 얼마나 밀려 있나"를 보려면 달을
 * 하나씩 넘겨 가며 세어야 했다. 여기서는 납기월별로 청구·수금·미수를 한 표에 놓고,
 * 밀린 기간별(연령) 분포를 함께 본다. 엑셀로 내보내 결산에 쓴다.
 *
 * 통화는 섞지 않는다 — 원화와 달러를 더하면 원화로 보이는 엉뚱한 수가 나온다.
 */
export function ReceivablesPage() {
  const navigate = useNavigate()
  const { data: installments = [], isLoading, error } = useInstallments()
  const today = todayKST()
  const thisMonth = today.slice(0, 7)

  // 기본 구간: 지난 12개월 ~ 앞으로 6개월. 미래 분납도 '아직 안 받은 돈'이라 같이 본다.
  const [from, setFrom] = useState(() => addMonths(thisMonth, -11))
  const [to, setTo] = useState(() => addMonths(thisMonth, 6))
  const [currency, setCurrency] = useState<Currency>('KRW')
  const [open, setOpen] = useState<Set<string>>(new Set())

  // USD 계약이 하나도 없으면 통화 전환 버튼을 띄울 이유가 없다
  const hasUsd = useMemo(
    () => installments.some(i => (i.currency || 'KRW') === 'USD' && i.amount > 0),
    [installments],
  )

  const result = useMemo(
    () => monthlyReceivables(installments, { currency, from, to, today }),
    [installments, currency, from, to, today],
  )

  const shown = useMemo(
    // 아무 일도 없던 달까지 다 내보이면 표가 길어 읽히지 않는다
    () => result.months.filter(m => m.billed > 0 || m.unpaid > 0),
    [result.months],
  )

  const totals = useMemo(() => {
    const t = { billed: 0, collected: 0, unpaid: 0, overdue: 0, count: 0 }
    for (const m of shown) {
      t.billed += m.billed; t.collected += m.collected
      t.unpaid += m.unpaid; t.overdue += m.overdue; t.count += m.count
    }
    return t
  }, [shown])

  const money = (n: number) => formatCurrency(n, currency)
  const toggle = (k: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="size-8 animate-spin text-blue-500" /></div>
  }
  if (error) {
    return <div className="flex items-center justify-center h-[60vh]"><p className="text-red-500">자료를 불러오지 못했습니다.</p></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">월별 미수금</h1>
          <p className="text-muted-foreground text-sm">
            납기월 기준으로 청구·수금·미수를 봅니다. 취소·해지 계약과 환불된 금액은 빠져 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUsd && (
            <div className="flex rounded-md border overflow-hidden text-sm">
              {(['KRW', 'USD'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 transition-colors ${
                    currency === c ? 'bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-900' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c === 'KRW' ? '원화' : '달러'}
                </button>
              ))}
            </div>
          )}
          <Input type="month" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" title="시작 월" />
          <span className="text-muted-foreground">~</span>
          <Input type="month" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" title="종료 월" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" /> 인쇄
          </Button>
          <Button
            size="sm" className="gap-1.5"
            disabled={shown.length === 0}
            onClick={() => exportReceivables(shown, result, currency, from, to, today)}
          >
            <Download className="size-3.5" /> Excel
          </Button>
        </div>
      </div>

      {/* ── 지금 밀려 있는 돈 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="현재 총 미수금" value={money(result.totalUnpaid)} tone="plain"
              note="고른 기간과 무관하게 지금 남아 있는 전부" />
        <Stat label="그중 연체" value={money(result.totalOverdue)} tone="danger"
              note="납기일이 지났는데 아직 못 받은 돈" />
        <Stat label="납기 전" value={money(result.aging.notDue)} tone="muted"
              note="아직 받을 때가 안 된 돈" />
        <Stat label={`${monthLabel(from)} ~ ${monthLabel(to)} 미수`} value={money(totals.unpaid)} tone="warn"
              note={`${totals.count}건`} />
      </div>

      {/* ── 연령 분석 ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">연령 분석</h2>
            <span className="text-xs text-muted-foreground">얼마나 오래 밀렸는지 — 오래될수록 받기 어렵습니다</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(Object.keys(AGING_LABEL) as (keyof typeof AGING_LABEL)[]).map(k => {
              const v = result.aging[k]
              const pct = result.aging.total > 0 ? (v / result.aging.total) * 100 : 0
              const danger = k === 'd61to90' || k === 'over90'
              return (
                <div key={k} className={`rounded-lg border p-3 ${danger && v > 0 ? 'border-red-200 bg-red-50/40' : ''}`}>
                  <div className="text-xs text-muted-foreground">{AGING_LABEL[k]}</div>
                  <div className={`text-base font-semibold tabular-nums mt-0.5 ${danger && v > 0 ? 'text-red-700' : ''}`}>
                    {money(v)}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${danger ? 'bg-red-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{pct.toFixed(0)}%</div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 납기일이 없어 집계에 못 들어간 건 — 조용히 빠지면 합계가 안 맞는데 이유를 알 수 없다 */}
      {result.undated.count > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <b>납기일이 없는 분납 {result.undated.count}건 ({money(result.undated.amount)})</b> 은 월별 표에서 빠져 있습니다.
            어느 달에 넣을지 알 수 없어서입니다 — 계약 상세에서 납기일을 적어 주시면 표에 들어옵니다.
          </div>
        </div>
      )}

      {/* ── 월별 표 ── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">납기월</TableHead>
                <TableHead className="text-right">청구액</TableHead>
                <TableHead className="text-right">수금액</TableHead>
                <TableHead className="text-right">미수금</TableHead>
                <TableHead className="text-right">그중 연체</TableHead>
                <TableHead className="text-right w-20">수금률</TableHead>
                <TableHead className="text-right w-16">건수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    이 기간에 납기가 잡힌 분납이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {shown.map(m => {
                const isOpen = open.has(m.monthKey)
                const rate = m.billed > 0 ? (m.collected / m.billed) * 100 : 0
                return (
                  <Fragment key={m.monthKey}>
                    <TableRow
                      className={`cursor-pointer ${m.monthKey === thisMonth ? 'bg-blue-50/40' : ''}`}
                      onClick={() => m.count > 0 && toggle(m.monthKey)}
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {m.count > 0
                            ? (isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />)
                            : <span className="w-3.5" />}
                          {monthLabel(m.monthKey)}
                          {m.monthKey === thisMonth && <Badge variant="outline" className="text-[10px] ml-1">이번 달</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.billed)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{money(m.collected)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{m.unpaid > 0 ? money(m.unpaid) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.overdue > 0 ? <span className="text-red-600 font-medium">{money(m.overdue)}</span> : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.billed > 0 ? `${rate.toFixed(0)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.count || '—'}</TableCell>
                    </TableRow>
                    {isOpen && m.items.map(inst => (
                      <DetailRow key={inst.id} inst={inst} today={today} currency={currency}
                                 onOpen={() => navigate(`/consulting/clients/${inst.contractId}`)} />
                    ))}
                  </Fragment>
                )
              })}
            </TableBody>
            {shown.length > 0 && (
              <TableFooter className="border-t-2 bg-muted/40 font-semibold">
                <TableRow>
                  <TableCell>합계</TableCell>
                  <TableCell className="text-right tabular-nums">{money(totals.billed)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{money(totals.collected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(totals.unpaid)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-600">{money(totals.overdue)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.billed > 0 ? `${((totals.collected / totals.billed) * 100).toFixed(0)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{totals.count}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, note, tone }: {
  label: string; value: string; note?: string
  tone: 'plain' | 'danger' | 'warn' | 'muted'
}) {
  const color = tone === 'danger' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : tone === 'muted' ? 'text-muted-foreground' : ''
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
        {note && <div className="text-[11px] text-muted-foreground mt-0.5">{note}</div>}
      </CardContent>
    </Card>
  )
}

function DetailRow({ inst, today, currency, onOpen }: {
  inst: PaymentInstallment; today: string; currency: Currency; onOpen: () => void
}) {
  const over = inst.dueDate ? daysPastDue(inst.dueDate, today) : 0
  const rest = Math.max(inst.amount - inst.paidAmount, 0)
  return (
    <TableRow className="bg-muted/20 text-sm cursor-pointer hover:bg-muted/40" onClick={onOpen}>
      <TableCell className="pl-9">
        <div className="truncate">{inst.contract?.studentName || '—'}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {inst.contract?.contractorName || ''} · {inst.label}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(inst.amount, currency)}</TableCell>
      <TableCell className="text-right tabular-nums text-emerald-700">
        {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount, currency) : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(rest, currency)}</TableCell>
      <TableCell className="text-right">
        {over > 0
          ? <span className="text-red-600 text-xs font-medium">{over}일 연체</span>
          : <span className="text-muted-foreground text-xs">납기 전</span>}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums" colSpan={2}>
        {inst.dueDate || '납기일 없음'}
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────── 엑셀 내보내기 ───────────────────────────
// 요약(월별) 과 상세(건별) 두 장. 결산에 그대로 쓰도록 숫자는 숫자로 넣는다
// — 글자로 넣으면 엑셀에서 더할 수 없다.
async function exportReceivables(
  months: ReceivableMonth[],
  result: ReceivablesResult,
  currency: Currency,
  from: string,
  to: string,
  today: string,
) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const fmt = currency === 'USD' ? '$#,##0.00' : '#,##0'

  // ── 요약 ──
  const s1 = wb.addWorksheet('월별 미수금')
  s1.columns = [
    { header: '납기월', key: 'month', width: 14 },
    { header: '청구액', key: 'billed', width: 16 },
    { header: '수금액', key: 'collected', width: 16 },
    { header: '미수금', key: 'unpaid', width: 16 },
    { header: '그중 연체', key: 'overdue', width: 16 },
    { header: '납기 전', key: 'notDue', width: 16 },
    { header: '수금률', key: 'rate', width: 10 },
    { header: '미수 건수', key: 'count', width: 10 },
  ]
  const head = (ws: ReturnType<typeof wb.addWorksheet>) => {
    const r = ws.getRow(1)
    r.font = { bold: true, size: 11 }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
  }
  head(s1)

  for (const m of months) {
    s1.addRow({
      month: monthLabel(m.monthKey),
      billed: m.billed, collected: m.collected, unpaid: m.unpaid,
      overdue: m.overdue, notDue: m.notDue,
      rate: m.billed > 0 ? m.collected / m.billed : null,
      count: m.count,
    })
  }
  const t = months.reduce((a, m) => ({
    billed: a.billed + m.billed, collected: a.collected + m.collected,
    unpaid: a.unpaid + m.unpaid, overdue: a.overdue + m.overdue,
    notDue: a.notDue + m.notDue, count: a.count + m.count,
  }), { billed: 0, collected: 0, unpaid: 0, overdue: 0, notDue: 0, count: 0 })
  const totalRow = s1.addRow({
    month: '합계', billed: t.billed, collected: t.collected, unpaid: t.unpaid,
    overdue: t.overdue, notDue: t.notDue,
    rate: t.billed > 0 ? t.collected / t.billed : null, count: t.count,
  })
  totalRow.font = { bold: true }
  for (const c of ['B', 'C', 'D', 'E', 'F']) s1.getColumn(c).numFmt = fmt
  s1.getColumn('G').numFmt = '0%'

  // 연령 분석을 요약 아래에 붙인다 — 결산 보고에 같이 들어간다
  s1.addRow({})
  const agingHead = s1.addRow({ month: '연령 분석', billed: '금액' })
  agingHead.font = { bold: true }
  for (const k of Object.keys(AGING_LABEL) as (keyof typeof AGING_LABEL)[]) {
    s1.addRow({ month: AGING_LABEL[k], billed: result.aging[k] })
  }
  s1.addRow({ month: '현재 총 미수금', billed: result.totalUnpaid }).font = { bold: true }

  // ── 상세 ──
  const s2 = wb.addWorksheet('미수 상세')
  s2.columns = [
    { header: '납기월', key: 'month', width: 12 },
    { header: '납기일', key: 'due', width: 12 },
    { header: '학생', key: 'student', width: 14 },
    { header: '계약자', key: 'contractor', width: 14 },
    { header: '항목', key: 'label', width: 14 },
    { header: '청구액', key: 'amount', width: 16 },
    { header: '수금액', key: 'paid', width: 16 },
    { header: '미수금', key: 'rest', width: 16 },
    { header: '연체일', key: 'overdue', width: 10 },
    { header: '상태', key: 'status', width: 10 },
  ]
  head(s2)
  const STATUS: Record<string, string> = { paid: '완납', partial: '부분납', overdue: '연체', pending: '예정' }
  for (const m of months) {
    for (const i of m.items) {
      const over = i.dueDate ? daysPastDue(i.dueDate, today) : 0
      s2.addRow({
        month: monthLabel(m.monthKey),
        due: i.dueDate || '',
        student: i.contract?.studentName || '',
        contractor: i.contract?.contractorName || '',
        label: i.label,
        amount: i.amount,
        paid: i.paidAmount,
        rest: Math.max(i.amount - i.paidAmount, 0),
        overdue: over || null,
        status: STATUS[i.status] || i.status,
      })
    }
  }
  for (const c of ['F', 'G', 'H']) s2.getColumn(c).numFmt = fmt

  const buf = await wb.xlsx.writeBuffer()
  const { saveAs } = await import('file-saver')
  const name = `월별미수금_${currency}_${from}_${to}.xlsx`
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
}
