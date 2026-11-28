import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trophy, Users, Percent, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useLeads } from '@/hooks/useLeads'
import { useContracts } from '@/hooks/useContracts'
import { summarizeConversion, type ChannelStat } from '@/lib/leadConversion'
import { channelGroupOf } from '@/lib/leadChannelGroup'
import { todayKST, shiftDays } from '@/lib/date'

/**
 * 유입경로별 성공률.
 *
 * "웨비나로 1,000건 들어와서 2건 계약, 소개로 20건 들어와서 5건 계약" 을 한
 * 화면에서 비교한다. 건수만 보면 가장 시끄러운 경로가 가장 좋아 보이기 때문에
 * 비율과 매출을 같이 세운다.
 */

/** 기간 버튼. 전환은 몇 달에 걸쳐 일어나므로 기본을 길게 잡는다. */
const RANGES = [
  { key: 'all', label: '전체' },
  { key: '365', label: '최근 1년' },
  { key: '180', label: '최근 6개월' },
  { key: '90', label: '최근 3개월' },
] as const

function won(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`
  return n.toLocaleString('ko-KR')
}

/** 전환율 막대 — 숫자만 늘어놓으면 경로 간 차이가 눈에 안 들어온다. */
function RateBar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${w}%` }} />
    </div>
  )
}

export function LeadSourceConversion() {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('all')
  const [usdRate, setUsdRate] = useState(1340)
  const navigate = useNavigate()
  /** 계약자 목록을 띄울 대상 — 이름(묶음 또는 원래 경로)과 보여 줄 리드들 */
  const [detail, setDetail] = useState<{ title: string; leadIds: string[] } | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setOpen(p => {
    const n = new Set(p)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })

  const { data: leads = [], isLoading: loadingLeads } = useLeads()
  const { data: contracts = [], isLoading: loadingContracts } = useContracts()

  const from = useMemo(
    () => (range === 'all' ? undefined : shiftDays(todayKST(), -Number(range))),
    [range],
  )

  const summary = useMemo(() => summarizeConversion({
    leads: leads.map(l => ({
      id: l.id,
      sourceChannel: l.sourceChannel,
      pipelineStage: l.pipelineStage,
      leadDate: l.leadDate,
      createdFromContract: l.createdFromContract,
    })),
    contracts: contracts.map(c => ({
      leadId: c.leadId,
      totalAmount: c.totalAmount,
      currency: c.currency,
      status: c.status,
    })),
    from,
    usdRate,
    // 유입경로 칸에 개별 행사명·콘텐츠명이 그대로 들어가 있어 100 가지로
    // 흩어져 있다. 묶어서 보여 주고, 펼치면 원래 이름이 나온다.
    groupBy: channelGroupOf,
  }), [leads, contracts, from, usdRate])

  /** 리드 → 그 리드로 맺어진 계약. 계약자 목록에서 계약관리로 넘어가는 데 쓴다. */
  const contractByLead = useMemo(() => {
    const m = new Map<string, (typeof contracts)[number]>()
    for (const c of contracts) if (c.leadId) m.set(c.leadId, c)
    return m
  }, [contracts])

  /** 달러로 맺은 계약이 하나도 없으면 환율 칸은 쓸 데가 없다 — 보이지 않게 둔다. */
  const hasUsd = useMemo(() => contracts.some(c => c.currency === 'USD'), [contracts])

  /** 기간 안에서 그 경로로 계약까지 간 리드들. 묶음이면 묶음 전체를 본다. */
  const winnersOf = (name: string, isGroup: boolean) => leads.filter(l => {
    if (l.pipelineStage !== 'contracted') return false
    const d = (l.leadDate || '').slice(0, 10)
    if (from && d && d < from) return false
    if (from && !d) return false
    const ch = (l.sourceChannel || '').trim() || '미입력'
    return isGroup ? channelGroupOf(ch) === name : ch === name
  }).map(l => l.id)

  const loading = loadingLeads || loadingContracts
  const maxRate = Math.max(...summary.channels.map(c => c.rate), 1)

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />리드와 계약을 맞춰보는 중…
      </CardContent></Card>
    )
  }

  const t = summary.total

  return (
    <div className="space-y-4">
      {/* 기간 + 환율 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg bg-muted p-0.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* 달러 계약이 있을 때만 — 없으면 뜻 없는 칸이 하나 떠 있을 뿐이다 */}
        {hasUsd && (
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground" title="달러로 맺은 계약을 원화로 환산해 계약 금액에 더합니다">
              달러 환율
            </Label>
            <Input className="h-7 w-24 text-xs" inputMode="numeric" value={usdRate}
              onChange={e => setUsdRate(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} />
          </div>
        )}
      </div>

      {/* 전체 요약 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Users className="size-5 shrink-0 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{t.total.toLocaleString('ko-KR')}건</div>
              <div className="text-xs text-muted-foreground">전체 리드</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Trophy className="size-5 shrink-0 text-emerald-500" />
            <div>
              <div className="text-lg font-bold text-emerald-600">{t.won.toLocaleString('ko-KR')}건</div>
              <div className="text-xs text-muted-foreground">계약 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <Percent className="size-5 shrink-0 text-violet-500" />
            <div>
              <div className="text-lg font-bold text-violet-600">{t.rate}%</div>
              <div className="text-xs text-muted-foreground">
                전체 전환율{t.leadsPerWin ? ` · ${t.leadsPerWin}건당 1건` : ''}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 경로별 */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-3 py-2">
            <p className="text-sm font-semibold">유입경로별 성공률</p>
            <p className="text-[11px] text-muted-foreground">
              리드관리의 유입채널과 계약관리의 리드 연결에서 자동 집계됩니다 · 해지·취소된 계약은 매출에서 제외
              {' '}· <b>▸</b> 를 누르면 어느 행사·콘텐츠였는지 펼쳐집니다
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-[11px] text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">유입경로</th>
                  <th className="px-3 py-2 text-right font-medium">리드</th>
                  <th className="px-3 py-2 text-right font-medium">계약</th>
                  <th className="px-3 py-2 text-right font-medium">전환율</th>
                  <th className="w-28 px-3 py-2 text-left font-medium" />
                  <th className="px-3 py-2 text-right font-medium" title="진행 중인 건을 뺀 값 — 경로끼리 공평한 비교">
                    종결 기준
                  </th>
                  <th className="px-3 py-2 text-right font-medium">진행 중</th>
                  <th className="px-3 py-2 text-right font-medium">계약 금액</th>
                </tr>
              </thead>
              <tbody>
                {summary.channels.flatMap((c: ChannelStat) => [
                  <tr key={c.channel} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      {(c.children?.length ?? 0) > 1 ? (
                        <button
                          onClick={() => toggle(c.channel)}
                          className="mr-1 align-middle text-gray-400 hover:text-gray-700"
                          title={`${c.children!.length}개 항목 펼치기`}
                        >
                          {open.has(c.channel)
                            ? <ChevronDown size={13} className="inline" />
                            : <ChevronRight size={13} className="inline" />}
                        </button>
                      ) : <span className="mr-1 inline-block w-[13px]" />}
                      {c.channel}
                      {(c.children?.length ?? 0) > 1 && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          {c.children!.length}종
                        </span>
                      )}
                      {c.atContract > 0 && (
                        <span
                          className="ml-1.5 rounded border border-amber-300 bg-amber-50 px-1 py-px text-[10px] font-normal text-amber-700"
                          title={`${c.atContract}건이 계약을 쓰면서 만들어진 리드입니다. 계약 안 된 경우가 기록되지 않아 분모가 비어 있어, 다른 경로와 전환율을 나란히 비교할 수 없습니다.`}
                        >
                          계약 시점 {c.atContract}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.total.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">
                      {c.won > 0 ? (
                        <button
                          className="underline decoration-dotted underline-offset-2 hover:text-emerald-800"
                          onClick={() => setDetail({ title: c.channel, leadIds: winnersOf(c.channel, true) })}
                          title="계약자 목록 보기"
                        >
                          {c.won.toLocaleString('ko-KR')}
                        </button>
                      ) : c.won.toLocaleString('ko-KR')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {/* 계약 시점 등록이 절반을 넘으면 전환율 자체가 의미가 없다 */}
                      <span className={c.atContract > c.total / 2 ? 'text-muted-foreground line-through' : ''}>
                        {c.rate}%
                      </span>
                      {c.atContract > c.total / 2 ? (
                        <span className="ml-1 text-[10px] font-normal text-amber-700">비교 불가</span>
                      ) : c.leadsPerWin ? (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          {c.leadsPerWin}:1
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2"><RateBar value={c.rate} max={maxRate} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {c.won + c.lost > 0 ? `${c.closedRate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {c.open.toLocaleString('ko-KR')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.revenue > 0 ? won(c.revenue) : '—'}
                    </td>
                  </tr>,
                  ...(open.has(c.channel) ? (c.children || []) : []).map(k => (
                    <tr key={`${c.channel}/${k.channel}`} className="border-b bg-muted/20 text-[13px] last:border-0">
                      <td className="py-1.5 pl-9 pr-3 text-muted-foreground">{k.channel}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {k.total.toLocaleString('ko-KR')}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                        {k.won ? (
                          <button
                            className="underline decoration-dotted underline-offset-2 hover:text-emerald-800"
                            onClick={() => setDetail({ title: k.channel, leadIds: winnersOf(k.channel, false) })}
                            title="계약자 목록 보기"
                          >
                            {k.won}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {k.won ? `${k.rate}%` : '—'}
                      </td>
                      <td />
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {k.won + k.lost > 0 ? `${k.closedRate}%` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {k.open.toLocaleString('ko-KR')}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {k.revenue > 0 ? won(k.revenue) : '—'}
                      </td>
                    </tr>
                  )),
                ])}
                {!summary.channels.length && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    이 기간에 유입된 리드가 없습니다.
                  </td></tr>
                )}
              </tbody>
              {!!summary.channels.length && (
                <tfoot className="border-t bg-gray-50 text-sm font-semibold">
                  <tr>
                    <td className="px-3 py-2">전체</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.total.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{t.won.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.rate}%</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">{t.won + t.lost > 0 ? `${t.closedRate}%` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.open.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.revenue > 0 ? won(t.revenue) : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <b>전환율</b>은 계약 ÷ 전체 리드입니다. 최근에 들어온 리드는 아직 결판이 안 나서 낮게 나옵니다.
            {' '}<b>종결 기준</b>은 진행 중인 건을 뺀 값이라 경로끼리 비교할 때 더 공평합니다.
            {' '}<b>N:1</b> 은 계약 1건을 얻는 데 리드가 몇 건 필요한지입니다.
            {' '}<b className="text-amber-700">계약 시점</b> 은 계약을 쓰면서 만들어진 리드입니다 —
            계약 안 된 경우가 기록되지 않아 분모가 비어 있으므로, 절반을 넘으면 전환율을 가립니다.
            문의가 올 때 리드부터 등록하시면 그때부터 비교 가능한 숫자가 쌓입니다.
          </div>
        </CardContent>
      </Card>

      {/* 계약자 목록 — 이름을 누르면 계약관리로 넘어간다 */}
      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.title} · 계약 {detail?.leadIds.length ?? 0}건
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-[11px] text-gray-500">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">학생 · 계약자</th>
                  <th className="px-2 py-1.5 text-left font-medium">유입경로</th>
                  <th className="px-2 py-1.5 text-right font-medium">계약 금액</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.leadIds || []).map(id => {
                  const l = leads.find(x => x.id === id)
                  const c = contractByLead.get(id)
                  return (
                    <tr key={id} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        {c ? (
                          <button
                            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                            onClick={() => { setDetail(null); navigate(`/consulting/clients/${c.id}`) }}
                            title="계약관리에서 열기"
                          >
                            {l?.studentName || c.studentName || '—'}
                            <ExternalLink size={11} className="opacity-60" />
                          </button>
                        ) : (
                          <span className="font-medium">{l?.studentName || '—'}</span>
                        )}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {l?.parentName || c?.contractorName || ''}
                        </span>
                        {!c && (
                          <span className="ml-1 text-[10px] text-amber-700">계약 연결 없음</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{l?.sourceChannel || '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {c ? won(c.currency === 'USD' ? (c.totalAmount || 0) * usdRate : (c.totalAmount || 0)) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {!detail?.leadIds.length && (
                  <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">계약이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            이름을 누르면 계약관리의 계약 상세로 넘어갑니다.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
