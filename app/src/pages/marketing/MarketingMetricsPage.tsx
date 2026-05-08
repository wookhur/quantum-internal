import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, TrendingUp, Target, Plus } from 'lucide-react'
import { useMarketingMetricsByYear, useCreateMarketingMetric } from '@/hooks/useMarketingMetrics'
import { currentYearKST, currentMonthKST } from '@/lib/date'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CHANNELS = [
  { key: 'kakao', label: '카카오', color: '#FEE500', textColor: '#3C1E1E' },
  { key: 'instagram', label: '인스타그램', color: '#E1306C', textColor: '#fff' },
  { key: 'youtube', label: '유튜브', color: '#FF0000', textColor: '#fff' },
  { key: 'blog', label: '블로그', color: '#03C75A', textColor: '#fff' },
  { key: 'news', label: '뉴스/기사', color: '#4A90D9', textColor: '#fff' },
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

export function MarketingMetricsPage() {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_METRIC_FORM)
  const createMetric = useCreateMarketingMetric()

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

  // Group metrics by channel for the selected month
  const channelMetrics = useMemo(() => {
    return CHANNELS.map(ch => {
      const channelData = metrics.filter(m => m.channel === ch.key && m.month === month)
      const allMonthsData = metrics.filter(m => m.channel === ch.key)

      // Sum values per metric for the selected month
      const totalValue = channelData.reduce((sum, m) => sum + (m.value || 0), 0)
      const annualTarget = channelData.length > 0 ? (channelData[0].annualTarget || 0) : 0
      const metricName = channelData.length > 0 ? channelData[0].metric : ''
      const progressPct = annualTarget > 0 ? Math.round((totalValue / annualTarget) * 100) : 0

      return {
        ...ch,
        value: totalValue,
        annualTarget,
        metricName,
        progressPct,
        monthlyData: allMonthsData,
      }
    })
  }, [metrics, month])

  // Build chart data: monthly trend per channel
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const point: Record<string, string | number> = { month: MONTH_LABELS[i] }
      CHANNELS.forEach(ch => {
        const channelMonthMetrics = metrics.filter(mt => mt.channel === ch.key && mt.month === m)
        point[ch.key] = channelMonthMetrics.reduce((sum, mt) => sum + (mt.value || 0), 0)
      })
      return point
    })
  }, [metrics])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">마케팅 지표</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : `${year}년 채널별 마케팅 성과`}
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
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-[90px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_LABELS.map((label, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {channelMetrics.map(ch => (
              <Card key={ch.key}>
                <CardContent className="py-4 space-y-3">
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
                  <div>
                    <div className="text-2xl font-bold">{ch.value.toLocaleString()}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Target className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        연간 목표: {ch.annualTarget.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {/* Progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">달성률</span>
                      <span className={`font-medium ${ch.progressPct >= 100 ? 'text-green-600' : ch.progressPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {ch.progressPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(ch.progressPct, 100)}%`,
                          backgroundColor: ch.color,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Monthly Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">월별 채널 추이</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        backgroundColor: 'hsl(var(--card))',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {CHANNELS.map(ch => (
                      <Line
                        key={ch.key}
                        type="monotone"
                        dataKey={ch.key}
                        name={ch.label}
                        stroke={ch.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
