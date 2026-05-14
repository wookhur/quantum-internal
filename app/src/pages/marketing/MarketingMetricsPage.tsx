import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Loader2, TrendingUp, Target, Plus, ArrowUpRight, ArrowDownRight, Minus, RefreshCw,
} from 'lucide-react'
import { useMarketingMetricsByYear, useCreateMarketingMetric, useSyncMarketingMetrics } from '@/hooks/useMarketingMetrics'
import { currentYearKST, currentMonthKST } from '@/lib/date'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'

const CHANNELS = [
  { key: 'kakao', label: '카카오 채널', color: '#FEE500', textColor: '#3C1E1E', bgLight: 'bg-yellow-50', borderLight: 'border-yellow-200' },
  { key: 'instagram', label: '인스타그램', color: '#E1306C', textColor: '#fff', bgLight: 'bg-pink-50', borderLight: 'border-pink-200' },
  { key: 'youtube', label: '유튜브', color: '#FF0000', textColor: '#fff', bgLight: 'bg-red-50', borderLight: 'border-red-200' },
  { key: 'blog', label: '블로그', color: '#03C75A', textColor: '#fff', bgLight: 'bg-green-50', borderLight: 'border-green-200' },
  { key: 'news', label: '뉴스/기사', color: '#4A90D9', textColor: '#fff', bgLight: 'bg-blue-50', borderLight: 'border-blue-200' },
] as const

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

const currentYear = currentYearKST()
const currentMonth = currentMonthKST()

const INITIAL_METRIC_FORM = {
  year: currentYear,
  month: currentMonth,
  channel: 'kakao',
  metric: '',
  value: 0,
  annualTarget: 0,
}

function formatNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`
  return n.toLocaleString()
}

export function MarketingMetricsPage() {
  const [year, setYear] = useState(currentYear)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_METRIC_FORM)
  const createMetric = useCreateMarketingMetric()
  const syncMetrics = useSyncMarketingMetrics()

  const handleCreateMetric = () => {
    createMetric.mutate(
      {
        year: form.year,
        month: form.month,
        channel: form.channel,
        metric: form.metric,
        value: form.value,
        annual_target: form.annualTarget || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_METRIC_FORM)
        },
      }
    )
  }

  const { data: metrics = [], isLoading, error } = useMarketingMetricsByYear(year)

  // Build per-channel summary
  const channelSummaries = useMemo(() => {
    return CHANNELS.map(ch => {
      const channelData = metrics
        .filter(m => m.channel === ch.key)
        .sort((a, b) => a.month - b.month)

      const withValues = channelData.filter(m => m.value > 0)
      const latest = withValues.length > 0 ? withValues[withValues.length - 1] : null
      const previous = withValues.length > 1 ? withValues[withValues.length - 2] : null
      const annualTarget = channelData.length > 0 ? (channelData[0].annualTarget || 0) : 0
      const metricName = channelData.length > 0 ? channelData[0].metric : ''

      const currentValue = latest?.value || 0
      const prevValue = previous?.value || 0
      const change = prevValue > 0 ? currentValue - prevValue : 0
      const changePct = prevValue > 0 ? Math.round(((currentValue - prevValue) / prevValue) * 100) : 0
      const progressPct = annualTarget > 0 ? Math.round((currentValue / annualTarget) * 100) : 0
      const latestMonth = latest?.month || 0

      // Monthly data for sparkline
      const monthlyValues = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const found = channelData.find(d => d.month === m)
        return { month: MONTH_LABELS[i], value: found?.value || 0 }
      })

      return {
        ...ch,
        currentValue,
        prevValue,
        change,
        changePct,
        annualTarget,
        metricName,
        progressPct,
        latestMonth,
        monthlyValues,
        hasData: withValues.length > 0,
      }
    })
  }, [metrics])

  // Build chart data: monthly trend per channel (only channels with data)
  const chartData = useMemo(() => {
    // Find the latest month with any data
    let maxMonth = 0
    for (const m of metrics) {
      if (m.value > 0 && m.month > maxMonth) maxMonth = m.month
    }
    const displayMonths = Math.max(maxMonth + 1, 6) // show at least 6 months

    return Array.from({ length: Math.min(displayMonths, 12) }, (_, i) => {
      const m = i + 1
      const point: Record<string, string | number> = { month: MONTH_LABELS[i] }
      CHANNELS.forEach(ch => {
        const found = metrics.find(mt => mt.channel === ch.key && mt.month === m)
        point[ch.key] = found?.value || 0
      })
      return point
    })
  }, [metrics])

  const activeChannels = channelSummaries.filter(ch => ch.hasData)

  return (
    <div className="space-y-6">
      {/* Sync result feedback */}
      {syncMetrics.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-center justify-between">
          <span>✓ 동기화 완료 — {syncMetrics.data.synced}개 채널 업데이트됨</span>
          <button className="text-green-600 hover:text-green-800" onClick={() => syncMetrics.reset()}>✕</button>
        </div>
      )}
      {syncMetrics.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-center justify-between">
          <span>동기화 실패: {(syncMetrics.error as Error)?.message || '알 수 없는 오류'}</span>
          <button className="text-red-600 hover:text-red-800" onClick={() => syncMetrics.reset()}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">마케팅 지표</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? '로딩 중...' : `${year}년 채널별 팔로워 추이 및 성과`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={syncMetrics.isPending}
            onClick={() => syncMetrics.mutate()}
          >
            <RefreshCw className={`size-4 mr-1 ${syncMetrics.isPending ? 'animate-spin' : ''}`} />
            {syncMetrics.isPending ? '동기화 중...' : 'API 동기화'}
          </Button>
          <Button size="sm" className="h-9" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-1" />
            지표 추가
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>지표 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>연도</Label>
                    <Input
                      type="number"
                      value={form.year}
                      onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>월</Label>
                    <Select value={String(form.month)} onValueChange={v => setForm(f => ({ ...f, month: Number(v) }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_LABELS.map((label, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>채널</Label>
                  <Select value={form.channel} onValueChange={v => v && setForm(f => ({ ...f, channel: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(ch => (
                        <SelectItem key={ch.key} value={ch.key}>{ch.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>지표명</Label>
                  <Input
                    value={form.metric}
                    onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                    placeholder="예: 팔로워 수, 조회수"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>값</Label>
                    <Input
                      type="number"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>연간 목표 (선택)</Label>
                    <Input
                      type="number"
                      value={form.annualTarget}
                      onChange={e => setForm(f => ({ ...f, annualTarget: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateMetric}
                  disabled={createMetric.isPending || !form.metric}
                >
                  {createMetric.isPending ? '저장 중...' : '추가'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-destructive text-sm">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : (
        <>
          {/* Channel Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {channelSummaries.map(ch => (
              <Card key={ch.key} className={`overflow-hidden ${ch.bgLight} ${ch.borderLight} border`}>
                <CardContent className="py-4 space-y-3">
                  {/* Channel label + metric name */}
                  <div className="flex items-center justify-between">
                    <div
                      className="px-2.5 py-1 rounded-md text-xs font-semibold"
                      style={{ backgroundColor: ch.color, color: ch.textColor }}
                    >
                      {ch.label}
                    </div>
                    {ch.metricName && (
                      <span className="text-[10px] text-muted-foreground">{ch.metricName}</span>
                    )}
                  </div>

                  {/* Current value + change */}
                  <div>
                    <div className="text-2xl font-bold">{ch.hasData ? formatNum(ch.currentValue) : '-'}</div>
                    {ch.hasData && ch.change !== 0 && (
                      <div className={`flex items-center gap-1 mt-0.5 text-xs font-medium ${ch.change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {ch.change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {ch.change > 0 ? '+' : ''}{formatNum(ch.change)}
                        <span className="text-muted-foreground font-normal">
                          ({ch.changePct > 0 ? '+' : ''}{ch.changePct}% vs {MONTH_LABELS[(ch.latestMonth - 2 + 12) % 12]})
                        </span>
                      </div>
                    )}
                    {ch.hasData && ch.change === 0 && ch.prevValue > 0 && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        <Minus className="size-3.5" /> 변동 없음
                      </div>
                    )}
                  </div>

                  {/* Progress towards annual target */}
                  {ch.annualTarget > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Target className="size-3" /> 목표 {formatNum(ch.annualTarget)}
                        </span>
                        <span className={`font-semibold ${ch.progressPct >= 100 ? 'text-emerald-600' : ch.progressPct >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {ch.progressPct}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(ch.progressPct, 100)}%`,
                            backgroundColor: ch.color,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Mini sparkline */}
                  {ch.hasData && (
                    <div className="h-[40px] -mx-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ch.monthlyValues.filter(d => d.value > 0)}>
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke={ch.color}
                            fill={ch.color}
                            fillOpacity={0.15}
                            strokeWidth={2}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Trend Chart */}
          {activeChannels.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">월별 채널 추이</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeChannels.map(ch => (
                      <Badge
                        key={ch.key}
                        variant="outline"
                        className="text-[10px] h-5 gap-1"
                        style={{ borderColor: ch.color, color: ch.color }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.color }} />
                        {ch.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={formatNum} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(var(--border))',
                          backgroundColor: 'hsl(var(--card))',
                          fontSize: '12px',
                        }}
                        formatter={(value: unknown, name: unknown) => {
                          const ch = CHANNELS.find(c => c.key === name)
                          return [Number(value).toLocaleString(), ch?.label || String(name)]
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px' }}
                        formatter={(value: string) => {
                          const ch = CHANNELS.find(c => c.key === value)
                          return ch?.label || value
                        }}
                      />
                      {CHANNELS.map(ch => (
                        <Line
                          key={ch.key}
                          type="monotone"
                          dataKey={ch.key}
                          name={ch.key}
                          stroke={ch.color}
                          strokeWidth={2}
                          dot={{ r: 4, strokeWidth: 2 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-channel detail charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeChannels.map(ch => {
              const data = ch.monthlyValues.slice(0, Math.max(ch.latestMonth + 1, 6))
              return (
                <Card key={ch.key}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ch.color }}
                        />
                        <span className="text-sm font-medium">{ch.label}</span>
                        <span className="text-xs text-muted-foreground">{ch.metricName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-lg">{formatNum(ch.currentValue)}</span>
                        {ch.annualTarget > 0 && (
                          <span className="text-muted-foreground">/ {formatNum(ch.annualTarget)}</span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatNum} />
                          <Tooltip
                            contentStyle={{
                              borderRadius: '8px',
                              border: '1px solid hsl(var(--border))',
                              backgroundColor: 'hsl(var(--card))',
                              fontSize: '12px',
                            }}
                            formatter={(value: unknown) => [Number(value).toLocaleString(), ch.metricName]}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke={ch.color}
                            fill={ch.color}
                            fillOpacity={0.1}
                            strokeWidth={2}
                            dot={{ r: 3, fill: ch.color }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
