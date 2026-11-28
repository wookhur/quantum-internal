import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Trophy, Users, Percent } from 'lucide-react'
import { useLeads } from '@/hooks/useLeads'
import { useContracts } from '@/hooks/useContracts'
import { summarizeConversion, type ChannelStat } from '@/lib/leadConversion'
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
    })),
    contracts: contracts.map(c => ({
      leadId: c.leadId,
      totalAmount: c.totalAmount,
      currency: c.currency,
      status: c.status,
    })),
    from,
    usdRate,
  }), [leads, contracts, from, usdRate])

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
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground">달러 환율</Label>
          <Input className="h-7 w-24 text-xs" inputMode="numeric" value={usdRate}
            onChange={e => setUsdRate(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} />
        </div>
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
                {summary.channels.map((c: ChannelStat) => (
                  <tr key={c.channel} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{c.channel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.total.toLocaleString('ko-KR')}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">
                      {c.won.toLocaleString('ko-KR')}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {c.rate}%
                      {c.leadsPerWin && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          {c.leadsPerWin}:1
                        </span>
                      )}
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
                  </tr>
                ))}
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
