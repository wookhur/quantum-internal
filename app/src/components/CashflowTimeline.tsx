import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus, Pencil, Trash2, AlertTriangle, Loader2, TrendingDown, Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/types'
import { todayKST } from '@/lib/date'
import { useInstallments } from '@/hooks/useInstallments'
import { useFixedExpenses } from '@/hooks/useFixedExpenses'
import {
  useCashEvents, useSaveCashEvent, useDeleteCashEvent,
  type CashEvent, type CashEventInput,
} from '@/hooks/useCashEvents'
import {
  buildTimeline, CASH_EVENT_LABEL, INFLOW_KINDS,
  type CashEventKind, type TimelineRow,
} from '@/lib/cashflowTimeline'

/**
 * 자금 흐름표.
 *
 * 월별 합계만 보면 '이번 달은 플러스'인데 15일에 통장이 비는 것을 못 본다.
 * 급여는 5일에 나가고 수금은 말일에 들어오기 때문이다. 그래서 날짜 단위로 센다.
 *
 * 수금은 계약관리에서 저절로 들어온다 — 신규 계약이 잡히면 회차가 따라 생기고,
 * 그 회차가 이 표의 플러스 줄이 된다. 사람이 옮겨 적지 않는다.
 */

const MONTHS_AHEAD = 6
/** 달러 수금을 원화로 환산할 때 쓰는 기본값. 화면에서 바꿀 수 있다. */
const DEFAULT_USD_RATE = 1340

const KIND_OPTIONS: CashEventKind[] = ['loan_in', 'loan_out', 'onetime_in', 'onetime_out', 'other']

function won(n: number): string {
  return formatCurrency(Math.round(n))
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()]
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${dow})`
}

// ───────────────────────────────────────────────────────────────────────────
// 단건 입력
// ───────────────────────────────────────────────────────────────────────────

function EventDialog({ open, onOpenChange, editing, canEdit, userId }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing?: CashEvent
  canEdit: boolean
  userId?: string
}) {
  const save = useSaveCashEvent()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CashEventInput & { magnitude: string }>(() => ({
    eventDate: editing?.eventDate || todayKST(),
    label: editing?.label || '',
    amount: editing?.amount || 0,
    kind: editing?.kind || 'onetime_out',
    currency: editing?.currency || 'KRW',
    settled: editing?.settled ?? false,
    notes: editing?.notes || '',
    magnitude: editing ? String(Math.abs(editing.amount)) : '',
  }))

  const isInflow = INFLOW_KINDS.includes(form.kind)

  const submit = async () => {
    setError(null)
    const mag = Number(form.magnitude.replace(/[^\d.]/g, ''))
    if (!form.label.trim()) return setError('내용을 적어 주세요.')
    if (!mag || mag <= 0) return setError('금액을 적어 주세요.')
    try {
      await save.mutateAsync({
        id: editing?.id,
        createdBy: userId,
        input: {
          eventDate: form.eventDate,
          label: form.label.trim(),
          // 부호는 종류에서 정한다 — 사람이 마이너스를 빼먹는 쪽이 훨씬 흔하다
          amount: isInflow ? mag : -mag,
          kind: form.kind,
          currency: form.currency,
          settled: form.settled,
          notes: form.notes,
        },
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '자금 항목 수정' : '자금 항목 추가'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">날짜</Label>
              <Input type="date" className="h-8" value={form.eventDate}
                onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">종류</Label>
              <div className="flex flex-wrap gap-1 pt-1">
                {KIND_OPTIONS.map(k => (
                  <button
                    key={k}
                    onClick={() => setForm(f => ({ ...f, kind: k }))}
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${
                      form.kind === k ? 'border-gray-900 bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {CASH_EVENT_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">내용</Label>
            <Input className="h-8" placeholder="예: 인테리어 2차 잔금"
              value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">
                금액 <span className={isInflow ? 'text-emerald-600' : 'text-red-600'}>
                  ({isInflow ? '들어옴 +' : '나감 −'})
                </span>
              </Label>
              <Input className="h-8" inputMode="numeric" placeholder="10000000"
                value={form.magnitude}
                onChange={e => setForm(f => ({ ...f, magnitude: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">통화</Label>
              <div className="flex gap-1 pt-1">
                {(['KRW', 'USD'] as const).map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, currency: c }))}
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      form.currency === c ? 'border-gray-900 bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">비고</Label>
            <Input className="h-8" value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.settled}
              onChange={e => setForm(f => ({ ...f, settled: e.target.checked }))} />
            이미 입금·집행이 끝났습니다
          </label>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={submit} disabled={!canEdit || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 본체
// ───────────────────────────────────────────────────────────────────────────

export function CashflowTimeline({ canEdit, userId }: { canEdit: boolean; userId?: string }) {
  const today = todayKST()
  const { data: installments = [], isLoading: loadingInst } = useInstallments()
  const { data: expenses = [], isLoading: loadingExp } = useFixedExpenses()
  const { data: events = [], isLoading: loadingEv } = useCashEvents()
  const del = useDeleteCashEvent()

  const [usdRate, setUsdRate] = useState(DEFAULT_USD_RATE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CashEvent | undefined>(undefined)
  const [showAll, setShowAll] = useState(false)

  /** 기준 잔고 — kind='opening' 중 가장 최근 것. */
  const opening = useMemo(() => {
    const list = events.filter(e => e.kind === 'opening').sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))
    const o = list[0]
    return o ? { date: o.eventDate, amount: o.amount, id: o.id } : undefined
  }, [events])

  const timeline = useMemo(() => buildTimeline({
    today,
    months: MONTHS_AHEAD,
    opening: opening ? { date: opening.date, amount: opening.amount } : undefined,
    installments: installments.map(i => ({
      id: i.id,
      dueDate: i.dueDate,
      label: i.label,
      amount: i.amount,
      paidAmount: i.paidAmount,
      status: i.status,
      currency: i.currency,
      contractorName: i.contract?.contractorName,
      studentName: i.contract?.studentName,
      schoolName: i.contract?.schoolName,
    })),
    expenses: expenses.filter(e => e.isActive).map(e => ({
      id: e.id,
      name: e.name,
      category: e.category,
      amount: e.amount,
      currency: e.currency,
      payDay: e.payDay,
      startMonth: e.startMonth || undefined,
      endMonth: e.endMonth || undefined,
    })),
    events,
    usdRate,
  }), [today, opening, installments, expenses, events, usdRate])

  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events])
  const loading = loadingInst || loadingExp || loadingEv

  const openNew = () => { setEditing(undefined); setDialogOpen(true) }
  const openEdit = (row: TimelineRow) => {
    const id = row.key.startsWith('ev-') ? row.key.slice(3) : row.key === 'opening' ? opening?.id : undefined
    const ev = id ? eventById.get(id) : undefined
    if (!ev) return
    setEditing(ev)
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />자금 흐름을 계산하는 중…
      </CardContent></Card>
    )
  }

  const shortfall = timeline.lowest < 0
  const rows = showAll ? timeline.rows : timeline.rows.slice(0, 60)

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={shortfall ? 'border-red-300' : 'border-emerald-200'}>
          <CardContent className="flex items-center gap-3 py-3">
            {shortfall
              ? <AlertTriangle className="size-5 shrink-0 text-red-500" />
              : <Wallet className="size-5 shrink-0 text-emerald-500" />}
            <div className="min-w-0">
              <div className={`text-lg font-bold ${shortfall ? 'text-red-600' : 'text-emerald-600'}`}>
                {won(timeline.lowest)}
              </div>
              <div className="text-xs text-muted-foreground">
                최저 잔액{timeline.lowestDate ? ` · ${dayLabel(timeline.lowestDate)}` : ''}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <TrendingDown className={`size-5 shrink-0 ${timeline.endBalance >= 0 ? 'text-blue-500' : 'text-red-500'}`} />
            <div className="min-w-0">
              <div className={`text-lg font-bold ${timeline.endBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {won(timeline.endBalance)}
              </div>
              <div className="text-xs text-muted-foreground">{MONTHS_AHEAD}개월 뒤 잔액</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3">
            <Label className="text-[11px] text-muted-foreground">적용 환율 (원/USD)</Label>
            <Input className="mt-1 h-8" inputMode="numeric" value={usdRate}
              onChange={e => setUsdRate(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} />
          </CardContent>
        </Card>
      </div>

      {shortfall && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <b>{timeline.lowestDate ? dayLabel(timeline.lowestDate) : ''}에 {won(-timeline.lowest)} 부족합니다.</b>
          {' '}그때까지 수금을 당기거나 지출을 미뤄야 합니다.
        </div>
      )}

      {!opening && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          기준 잔고가 없어 0원에서 시작합니다. 아래 <b>＋ 자금 항목</b>에서 종류를 <b>일시 수입</b>으로
          두고 ‘현재 통장 잔고’를 넣어 주세요.
        </div>
      )}

      {/* 월말 요약 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-[11px] text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">월</th>
                  <th className="px-3 py-2 text-right font-medium">들어옴</th>
                  <th className="px-3 py-2 text-right font-medium">나감</th>
                  <th className="px-3 py-2 text-right font-medium">월말 잔액</th>
                  <th className="px-3 py-2 text-right font-medium">그달 최저</th>
                </tr>
              </thead>
              <tbody>
                {timeline.months.map(m => (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-medium">{m.month.replace('-', '년 ')}월</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{m.inflow ? `+${won(m.inflow)}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-red-600 tabular-nums">{m.outflow ? `−${won(m.outflow)}` : '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${m.endBalance < 0 ? 'text-red-600' : ''}`}>
                      {won(m.endBalance)}
                    </td>
                    <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${m.lowest < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {won(m.lowest)}
                      {m.lowestDate && <span className="ml-1 opacity-60">{dayLabel(m.lowestDate)}</span>}
                    </td>
                  </tr>
                ))}
                {!timeline.months.length && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    표시할 자금 흐름이 없습니다.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 날짜순 흐름 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div>
              <p className="text-sm font-semibold">날짜순 자금 흐름</p>
              <p className="text-[11px] text-muted-foreground">
                수금은 계약관리에서 자동으로 들어옵니다 · 고정비는 설정한 지급일에 섭니다
              </p>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openNew}>
                <Plus size={12} />자금 항목
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-[11px] text-gray-500">
                <tr>
                  <th className="w-20 px-3 py-2 text-left font-medium">날짜</th>
                  <th className="px-3 py-2 text-left font-medium">내용</th>
                  <th className="px-3 py-2 text-right font-medium">금액</th>
                  <th className="px-3 py-2 text-right font-medium">잔액</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const editable = canEdit && (r.key.startsWith('ev-') || r.key === 'opening')
                  return (
                    <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
                        {dayLabel(r.date)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={r.source === 'opening' ? 'font-semibold' : ''}>{r.label}</span>
                        {r.detail && <span className="ml-1 text-[11px] text-muted-foreground">{r.detail}</span>}
                        {r.overdue && (
                          <Badge variant="outline" className="ml-1 border-amber-300 text-[10px] text-amber-700">연체</Badge>
                        )}
                        {r.settled && (
                          <Badge variant="outline" className="ml-1 border-gray-300 text-[10px] text-gray-500">완료</Badge>
                        )}
                        {r.foreign && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ${r.foreign.amount.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                        r.source === 'opening' ? 'text-gray-600'
                          : r.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {r.source === 'opening' ? won(r.amount) : `${r.amount >= 0 ? '+' : '−'}${won(Math.abs(r.amount))}`}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums ${
                        r.balance < 0 ? 'text-red-600' : ''
                      }`}>
                        {won(r.balance)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editable && (
                          <div className="flex justify-end gap-0.5">
                            <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              onClick={() => openEdit(r)}><Pencil size={12} /></button>
                            <button className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => {
                                const id = r.key.startsWith('ev-') ? r.key.slice(3) : opening?.id
                                if (id && window.confirm(`'${r.label}' 을 지울까요?`)) del.mutate(id)
                              }}><Trash2 size={12} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    표시할 자금 흐름이 없습니다.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {timeline.rows.length > rows.length && (
            <button className="w-full border-t py-2 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => setShowAll(true)}>
              {timeline.rows.length - rows.length}줄 더 보기
            </button>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <EventDialog
          key={editing?.id || 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          canEdit={canEdit}
          userId={userId}
        />
      )}
    </div>
  )
}
