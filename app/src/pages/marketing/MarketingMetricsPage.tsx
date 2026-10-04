import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, TrendingUp, Target, Plus, ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Pencil, Trash2,
} from 'lucide-react'
import {
  useMarketingMetricsByYear, useCreateMarketingMetric, useUpdateMarketingMetric, useDeleteMarketingMetric, useSyncMarketingMetrics,
} from '@/hooks/useMarketingMetrics'
import type { MarketingMetric } from '@/types'
import { currentYearKST, currentMonthKST } from '@/lib/date'
import { useSnsContents } from '@/hooks/useSnsContents'
import { useLeads } from '@/hooks/useLeads'
import {
  monthlyTargets, attainment, FOLLOWER_ANCHORS,
} from '@/lib/marketingPlan'
import { useT } from '@/i18n/LanguageContext'
import { useLocation } from 'react-router-dom'
import { useCanEdit } from '@/hooks/usePermissions'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'

const CHANNELS = [
  { key: 'kakao', labelKey: 'mktMetrics.kakao', color: '#FEE500', textColor: '#3C1E1E', bgLight: 'bg-yellow-50', borderLight: 'border-yellow-200' },
  { key: 'instagram', labelKey: 'mktMetrics.instagram', color: '#E1306C', textColor: '#fff', bgLight: 'bg-pink-50', borderLight: 'border-pink-200' },
  { key: 'youtube', labelKey: 'mktMetrics.youtube', color: '#FF0000', textColor: '#fff', bgLight: 'bg-red-50', borderLight: 'border-red-200' },
  { key: 'blog', labelKey: 'mktMetrics.blog', color: '#03C75A', textColor: '#fff', bgLight: 'bg-green-50', borderLight: 'border-green-200' },
  { key: 'news', labelKey: 'mktMetrics.news', color: '#4A90D9', textColor: '#fff', bgLight: 'bg-blue-50', borderLight: 'border-blue-200' },
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

// ─────────── 2027 사업계획 → 월별 마케팅 목표 ───────────
// 계획서에는 '2027년 말 팔로워 4만' 같은 끝점만 있다. 그 사이 매달 무엇을
// 해야 하는지를 marketingPlan.ts 가 복리 곡선으로 채우고, 여기서는 그 목표를
// 실제 입력된 숫자(SNS 콘텐츠·리드)와 나란히 보여 준다.
function pctClass(p: number | null): string {
  if (p === null) return 'text-muted-foreground'
  if (p >= 100) return 'text-emerald-600 font-semibold'
  if (p >= 80) return 'text-amber-600'
  return 'text-red-500'
}

function BusinessPlanSection() {
  const { data: contents = [], isLoading: loadingSns } = useSnsContents()
  const { data: leads = [], isLoading: loadingLeads } = useLeads()
  const thisMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  const targets = useMemo(() => monthlyTargets(), [])

  // 실적: 그 달에 올린 콘텐츠 수와 그 콘텐츠로 늘어난 팔로워
  const snsByMonth = useMemo(() => {
    const m = new Map<string, { posts: number; follows: number; views: number }>()
    for (const c of contents) {
      const key = (c.postedAt || '').slice(0, 7)
      if (!key) continue
      const e = m.get(key) || { posts: 0, follows: 0, views: 0 }
      e.posts++; e.follows += c.follows || 0; e.views += c.views || 0
      m.set(key, e)
    }
    return m
  }, [contents])

  // 실적: 그 달에 들어온 신규 문의(리드) 건수
  const leadsByMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads) {
      const key = (l.leadDate || '').slice(0, 7)
      if (!key) continue
      m.set(key, (m.get(key) || 0) + 1)
    }
    return m
  }, [leads])

  // 팔로워 누적 실적 — 계획서 기준점(2026년 9월 1만 1,500명)에 그 뒤 콘텐츠로 늘어난 수를 더한다.
  // 인스타 앱이 보여 주는 실제 팔로워와는 차이가 날 수 있다(언팔·콘텐츠 외 유입).
  const followersByMonth = useMemo(() => {
    const m = new Map<string, number>()
    let acc = FOLLOWER_ANCHORS[0].value
    let seen = false
    for (const t of targets) {
      const s = snsByMonth.get(t.month)
      if (s) { acc += s.follows; seen = true }
      if (seen) m.set(t.month, acc)
    }
    return m
  }, [targets, snsByMonth])

  const loading = loadingSns || loadingLeads

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-1">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">2027 사업계획 — 월별 마케팅 목표</h2>
            <Badge variant="outline" className="text-[10px]">2026.10 ~ 2027.12 · 15개월</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            「2027년 사업계획 — 매출 200억」 ver.2 의 끝점(팔로워 4만 · 유료 구독자 4,000명 · NGA 100명)에서
            매달 목표를 자동으로 계산합니다. 팔로워·구독자는 매달 같은 <b>비율</b>로 늘도록 복리 곡선으로 잇습니다.
          </p>
        </CardContent>
      </Card>

      {/* 최종 목표 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-pink-50 border-pink-200">
          <CardContent className="py-3">
            <p className="text-[11px] text-pink-700">2027년 말 인스타 팔로워</p>
            <p className="text-xl font-bold text-pink-900">40,000<span className="text-sm font-normal">명</span></p>
            <p className="text-[11px] text-pink-700/70">현재 기준 11,500명 → 3.5배</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-3">
            <p className="text-[11px] text-blue-700">유료 구독자 (앱)</p>
            <p className="text-xl font-bold text-blue-900">4,000<span className="text-sm font-normal">명</span></p>
            <p className="text-[11px] text-blue-700/70">유지율 30% → 누적 가입 1.3만 명</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3">
            <p className="text-[11px] text-amber-700">월 콘텐츠 업로드</p>
            <p className="text-xl font-bold text-amber-900">약 91<span className="text-sm font-normal">개</span></p>
            <p className="text-[11px] text-amber-700/70">하루 3개 × 주 7일 = 주 21개</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="py-3">
            <p className="text-[11px] text-emerald-700">월 상담(문의)</p>
            <p className="text-xl font-bold text-emerald-900">117<span className="text-sm font-normal">건</span></p>
            <p className="text-[11px] text-emerald-700/70">컨설팅 50 + NGA 67 · 80%는 인스타</p>
          </CardContent>
        </Card>
      </div>

      {/* 월별 목표 표 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs">
                    <th className="text-left font-medium py-2 px-3">월</th>
                    <th className="text-right font-medium py-2 px-2">팔로워 목표</th>
                    <th className="text-right font-medium py-2 px-2">순증</th>
                    <th className="text-right font-medium py-2 px-2">팔로워 실적</th>
                    <th className="text-right font-medium py-2 px-2">달성</th>
                    <th className="text-right font-medium py-2 px-2 border-l">콘텐츠 목표</th>
                    <th className="text-right font-medium py-2 px-2">실적</th>
                    <th className="text-right font-medium py-2 px-2">달성</th>
                    <th className="text-right font-medium py-2 px-2 border-l">문의 목표</th>
                    <th className="text-right font-medium py-2 px-2">실적</th>
                    <th className="text-right font-medium py-2 px-2">달성</th>
                    <th className="text-right font-medium py-2 px-2 border-l">구독자 목표</th>
                    <th className="text-right font-medium py-2 px-3">필요 가입</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map(t => {
                    const sns = snsByMonth.get(t.month)
                    const posts = sns?.posts ?? null
                    const followers = followersByMonth.get(t.month) ?? null
                    const inq = leadsByMonth.get(t.month) ?? null
                    const isNow = t.month === thisMonth
                    const isPast = t.month < thisMonth
                    const dash = <span className="text-muted-foreground/40">—</span>
                    return (
                      <tr key={t.month} className={`border-b ${isNow ? 'bg-primary/5 font-medium' : isPast ? '' : 'text-muted-foreground'}`}>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {t.month.replace('-', '.')}
                          {isNow && <Badge variant="outline" className="ml-1.5 text-[9px] h-4 px-1">이번 달</Badge>}
                        </td>
                        <td className="text-right px-2 tabular-nums">{t.followers.toLocaleString()}</td>
                        <td className="text-right px-2 tabular-nums text-xs text-muted-foreground">+{t.followerGain.toLocaleString()}</td>
                        <td className="text-right px-2 tabular-nums">{followers === null ? dash : followers.toLocaleString()}</td>
                        <td className={`text-right px-2 tabular-nums text-xs ${pctClass(followers === null ? null : attainment(followers, t.followers))}`}>
                          {followers === null ? dash : `${Math.round(attainment(followers, t.followers) || 0)}%`}
                        </td>
                        <td className="text-right px-2 tabular-nums border-l">{t.contents}</td>
                        <td className="text-right px-2 tabular-nums">{posts === null ? dash : posts}</td>
                        <td className={`text-right px-2 tabular-nums text-xs ${pctClass(posts === null ? null : attainment(posts, t.contents))}`}>
                          {posts === null ? dash : `${Math.round(attainment(posts, t.contents) || 0)}%`}
                        </td>
                        <td className="text-right px-2 tabular-nums border-l">{t.inquiries}</td>
                        <td className="text-right px-2 tabular-nums">{inq === null ? dash : inq}</td>
                        <td className={`text-right px-2 tabular-nums text-xs ${pctClass(inq === null ? null : attainment(inq, t.inquiries))}`}>
                          {inq === null ? dash : `${Math.round(attainment(inq, t.inquiries) || 0)}%`}
                        </td>
                        <td className="text-right px-2 tabular-nums border-l">{t.subscribers.toLocaleString()}</td>
                        <td className="text-right px-3 tabular-nums text-xs text-muted-foreground">{t.signups.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 목표를 어떻게 뽑았는지 — 숫자를 믿으려면 근거가 보여야 한다 */}
      <Card>
        <CardContent className="py-4 text-xs space-y-2 text-muted-foreground">
          <p className="font-semibold text-foreground">이 숫자는 어디서 왔나</p>
          <ul className="space-y-1 list-disc pl-4">
            <li><b>팔로워</b> — 계획서 ④: 2026년 9월 11,500명 → 2026년 말 20,000 → 2027년 6월 말 30,000 → 2027년 말 40,000. 그 사이는 복리로 채웠습니다.</li>
            <li><b>콘텐츠</b> — 계획서 ④: 하루 3개 × 주 7일. 월 목표 = 그 달의 일수 × 3.</li>
            <li><b>문의(상담)</b> — 계획서 ②: 월 5명 신규 계약 ÷ 전환율 10% = 50건. 여기에 NGA 100명 모집에 필요한 상담 1,000건을 모집 기간(2026.10 ~ 2027.12, 15개월)에 나눈 67건을 더해 월 117건. 그중 80%(94건)가 인스타 유입이어야 합니다(계획서 ④).</li>
            <li><b>구독자</b> — 계획서 ③: 런칭 → 10 → 100 → 1,000 → 2027년 말 4,000명. 유지율 30%이므로 필요 가입 = 순증 ÷ 0.3.</li>
          </ul>
          <p className="font-semibold text-foreground pt-1">실적은 어디서 오나</p>
          <ul className="space-y-1 list-disc pl-4">
            <li><b>콘텐츠 실적</b> — 마케팅 &gt; 주간보고서에 입력한 SNS 콘텐츠 건수(게시일 기준).</li>
            <li><b>팔로워 실적</b> — 기준 11,500명 + 그 뒤 콘텐츠별 팔로우 증가 누적. 콘텐츠를 입력한 달부터 표시됩니다. 언팔로우·콘텐츠 외 유입은 반영되지 않아 인스타 앱 숫자와 차이가 날 수 있습니다.</li>
            <li><b>문의 실적</b> — 리드관리에 등록된 리드 건수(리드일 기준).</li>
            <li><b>구독자</b>는 아직 받는 곳이 없어 목표만 표시합니다.</li>
          </ul>
          <p className="pt-1">
            NGA 상담 1,000건은 모집이 시작되는 2026년 4분기부터 2027년 말까지 균등 배분했습니다.
            계획서의 ‘일 4건 × 영업일 263일’ 속도라면 같은 1,000건을 12개월에 끝내므로, 위 월 목표는 최소선입니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export function MarketingMetricsPage() {
  const t = useT()
  const canEdit = useCanEdit(useLocation().pathname)
  const [tab, setTab] = useState<'metrics' | 'plan'>('metrics')
  const [year, setYear] = useState(currentYear)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMetric, setEditingMetric] = useState<MarketingMetric | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MarketingMetric | null>(null)
  const [form, setForm] = useState(INITIAL_METRIC_FORM)
  const createMetric = useCreateMarketingMetric()
  const updateMetric = useUpdateMarketingMetric()
  const deleteMetric = useDeleteMarketingMetric()
  const syncMetrics = useSyncMarketingMetrics()

  const handleSubmitMetric = () => {
    if (!canEdit) return
    const payload = {
      year: form.year,
      month: form.month,
      channel: form.channel,
      metric: form.metric,
      value: form.value,
      annual_target: form.annualTarget || undefined,
    }
    const onSuccess = () => {
      setDialogOpen(false)
      setEditingMetric(null)
      setForm(INITIAL_METRIC_FORM)
    }
    if (editingMetric) {
      updateMetric.mutate({ id: editingMetric.id, ...payload }, { onSuccess })
    } else {
      createMetric.mutate(payload, { onSuccess })
    }
  }

  const openEditDialog = (m: MarketingMetric) => {
    if (!canEdit) return
    setEditingMetric(m)
    setForm({
      year: m.year,
      month: m.month,
      channel: m.channel,
      metric: m.metric,
      value: m.value,
      annualTarget: m.annualTarget || 0,
    })
    setDialogOpen(true)
  }

  const handleDelete = () => {
    if (!canEdit) return
    if (!deleteTarget) return
    deleteMetric.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
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
    // Find the latest month with any data, but cap at current month for current year
    let maxMonth = 0
    for (const m of metrics) {
      if (m.value > 0 && m.month > maxMonth) maxMonth = m.month
    }
    // Don't show future months (avoids trailing zeros that make graph dip)
    const capMonth = year === currentYear ? currentMonth : 12
    const displayMonths = Math.min(Math.max(maxMonth, 6), capMonth)

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
          <span>✓ {t('mktMetrics.syncDone', { n: syncMetrics.data.synced })}</span>
          <button className="text-green-600 hover:text-green-800" onClick={() => syncMetrics.reset()}>✕</button>
        </div>
      )}
      {syncMetrics.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-center justify-between">
          <span>{t('mktMetrics.syncFail')}: {(syncMetrics.error as Error)?.message || t('common.unknownError')}</span>
          <button className="text-red-600 hover:text-red-800" onClick={() => syncMetrics.reset()}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('mktMetrics.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {tab === 'plan' ? t('mktMetrics.planSubtitle') : isLoading ? t('common.loading') : t('mktMetrics.subtitle', { year })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden mr-1">
            <button
              onClick={() => setTab('metrics')}
              className={`px-3 h-9 text-sm font-medium ${tab === 'metrics' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >{t('mktMetrics.tabMetrics')}</button>
            <button
              onClick={() => setTab('plan')}
              className={`px-3 h-9 text-sm font-medium border-l ${tab === 'plan' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >{t('mktMetrics.tabPlan')}</button>
          </div>
          {tab === 'metrics' && (
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
          )}
          {tab === 'metrics' && canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={syncMetrics.isPending}
              onClick={() => syncMetrics.mutate()}
            >
              <RefreshCw className={`size-4 mr-1 ${syncMetrics.isPending ? 'animate-spin' : ''}`} />
              {syncMetrics.isPending ? t('mktMetrics.syncing') : t('mktMetrics.apiSync')}
            </Button>
          )}
          {tab === 'metrics' && canEdit && (
            <Button size="sm" className="h-9" onClick={() => { setEditingMetric(null); setForm(INITIAL_METRIC_FORM); setDialogOpen(true) }}>
              <Plus className="size-4 mr-1" />
              {t('mktMetrics.addMetric')}
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingMetric(null) }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingMetric ? t('mktMetrics.editMetric') : t('mktMetrics.addMetric')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('mktMetrics.year')}</Label>
                    <Input
                      type="number"
                      value={form.year}
                      onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('mktMetrics.month')}</Label>
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
                  <Label>{t('mktMetrics.channel')}</Label>
                  <Select value={form.channel} onValueChange={v => v && setForm(f => ({ ...f, channel: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(ch => (
                        <SelectItem key={ch.key} value={ch.key}>{t(ch.labelKey)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('mktMetrics.metricName')}</Label>
                  <Input
                    value={form.metric}
                    onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                    placeholder={t('mktMetrics.metricPlaceholder')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('mktMetrics.value')}</Label>
                    <Input
                      type="number"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('mktMetrics.annualTarget')}</Label>
                    <Input
                      type="number"
                      value={form.annualTarget}
                      onChange={e => setForm(f => ({ ...f, annualTarget: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmitMetric}
                  disabled={createMetric.isPending || updateMetric.isPending || !form.metric}
                >
                  {(createMetric.isPending || updateMetric.isPending) ? t('common.saving') : editingMetric ? t('common.save') : t('common.add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {tab === 'plan' ? <BusinessPlanSection /> : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-destructive text-sm">
          {t('common.error')}
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
                      {t(ch.labelKey)}
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
                        <Minus className="size-3.5" /> {t('common.noChange')}
                      </div>
                    )}
                  </div>

                  {/* Progress towards annual target */}
                  {ch.annualTarget > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Target className="size-3" /> {t('mktMetrics.target')} {formatNum(ch.annualTarget)}
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
                    <span className="text-sm font-medium">{t('mktMetrics.monthlyTrend')}</span>
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
                        {t(ch.labelKey)}
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
                          return [Number(value).toLocaleString(), ch ? t(ch.labelKey) : String(name)]
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '12px' }}
                        formatter={(value: string) => {
                          const ch = CHANNELS.find(c => c.key === value)
                          return ch ? t(ch.labelKey) : value
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
              const capMonth = year === currentYear ? currentMonth : 12
              const data = ch.monthlyValues.slice(0, Math.min(Math.max(ch.latestMonth + 1, 6), capMonth))
              return (
                <Card key={ch.key}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ch.color }}
                        />
                        <span className="text-sm font-medium">{t(ch.labelKey)}</span>
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

          {/* Raw Data Table */}
          <Card>
            <CardHeader className="pb-2">
              <span className="text-sm font-medium">{t('mktMetrics.dataTable')}</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('mktMetrics.month')}</TableHead>
                    <TableHead>{t('mktMetrics.channel')}</TableHead>
                    <TableHead>{t('mktMetrics.metricName')}</TableHead>
                    <TableHead className="text-right">{t('mktMetrics.value')}</TableHead>
                    <TableHead className="text-right">{t('mktMetrics.annualTarget')}</TableHead>
                    <TableHead className="w-[70px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-400">{t('common.noData')}</TableCell>
                    </TableRow>
                  ) : (
                    metrics.map(m => {
                      const ch = CHANNELS.find(c => c.key === m.channel)
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">{m.month}{t('mktMetrics.monthSuffix')}</TableCell>
                          <TableCell>
                            {ch ? (
                              <Badge style={{ backgroundColor: ch.color, color: ch.textColor }} className="text-xs">
                                {t(ch.labelKey)}
                              </Badge>
                            ) : m.channel}
                          </TableCell>
                          <TableCell className="text-sm">{m.metric}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums font-medium">{m.value.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{m.annualTarget ? m.annualTarget.toLocaleString() : '-'}</TableCell>
                          <TableCell>
                            {canEdit && (
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditDialog(m)}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('mktMetrics.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{deleteTarget?.channel}</strong> {deleteTarget?.month}{t('mktMetrics.monthSuffix')} — {deleteTarget?.metric} ({deleteTarget?.value.toLocaleString()}) {t('mktMetrics.deleteConfirmMsg')}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMetric.isPending}>
              {deleteMetric.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
