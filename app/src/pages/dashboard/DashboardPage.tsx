import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, FileSignature,
  ArrowUpRight, AlertCircle, Calendar, CheckCircle2, Loader2,
} from 'lucide-react'
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayKST, currentMonthStrKST, formatTimeKST } from '@/lib/date'
import type { PipelineStage } from '@/types'

// --- Real data hooks ---

function useTodayMeetings() {
  const today = todayKST()
  return useQuery({
    queryKey: ['dashboard-meetings', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .gte('meeting_date', today + 'T00:00:00')
        .lte('meeting_date', today + 'T23:59:59')
        .order('meeting_date', { ascending: true })
      if (error) throw error
      return data || []
    },
  })
}

function useDashboardTodos() {
  return useQuery({
    queryKey: ['dashboard-todos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .neq('status', 'done')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true })
        .limit(5)
      if (error) throw error
      return data || []
    },
  })
}

function usePipelineStats() {
  return useQuery({
    queryKey: ['dashboard-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('pipeline_stage')
      if (error) throw error
      return data || []
    },
  })
}

function useMonthlyLeadCount() {
  const currentMonth = currentMonthStrKST()
  return useQuery({
    queryKey: ['dashboard-leads', currentMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, source_channel, created_at')
        .gte('created_at', currentMonth + '-01')
      if (error) throw error
      return data || []
    },
  })
}

function useContractStats() {
  return useQuery({
    queryKey: ['dashboard-contracts'],
    queryFn: async () => {
      const [contractsRes, paymentsRes] = await Promise.all([
        supabase.from('contracts').select('id, status').eq('status', 'active'),
        supabase.from('payments').select('outstanding_amount'),
      ])
      if (contractsRes.error) throw contractsRes.error
      if (paymentsRes.error) throw paymentsRes.error
      const outstanding = (paymentsRes.data || []).reduce((sum, p) => sum + (p.outstanding_amount || 0), 0)
      const overdueCount = (paymentsRes.data || []).filter(p => (p.outstanding_amount || 0) > 0).length
      return { activeContracts: (contractsRes.data || []).length, outstanding, overdueCount }
    },
  })
}

// --- Constants ---

const PIPELINE_STAGES: { key: PipelineStage; name: string; color: string }[] = [
  { key: 'new_lead', name: '신규 리드', color: '#FDAB3D' },
  { key: 'contact_attempted', name: '컨택 시도', color: '#FFCB00' },
  { key: 'consultation_scheduled', name: '상담 예약', color: '#00C875' },
  { key: 'first_consultation', name: '1차 상담', color: '#0073EA' },
  { key: 'second_consultation', name: '2차 상담', color: '#A25DDC' },
  { key: 'third_consultation', name: '3차 상담', color: '#784BD1' },
  { key: 'contract_review', name: '계약 검토', color: '#FF158A' },
  { key: 'contracted', name: '계약 완료', color: '#00C875' },
]

const CHANNEL_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  seminar: '#3B82F6',
  kakao: '#FEE500',
  referral: '#059669',
  website: '#6366F1',
  other: '#9CA3AF',
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  seminar: '세미나',
  kakao: '카카오톡',
  referral: '소개/추천',
  website: '웹사이트',
  other: '기타',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: '긴급',
  medium: '보통',
  low: '낮음',
}

function formatKRW(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `₩${(n / 10_000).toLocaleString()}만`
  return `₩${n.toLocaleString()}`
}

export function DashboardPage() {
  const { data: todayMeetings = [], isLoading: meetingsLoading } = useTodayMeetings()
  const { data: todos = [], isLoading: todosLoading } = useDashboardTodos()
  const { data: pipelineLeads = [], isLoading: pipelineLoading } = usePipelineStats()
  const { data: monthlyLeads = [], isLoading: leadsLoading } = useMonthlyLeadCount()
  const { data: contractStats, isLoading: contractsLoading } = useContractStats()

  // Pipeline counts
  const pipelineData = useMemo(() => {
    const counts: Record<string, number> = {}
    pipelineLeads.forEach((l: { pipeline_stage: string }) => {
      counts[l.pipeline_stage] = (counts[l.pipeline_stage] || 0) + 1
    })
    return PIPELINE_STAGES.map(s => ({ ...s, count: counts[s.key] || 0 }))
  }, [pipelineLeads])

  // Channel distribution
  const channelData = useMemo(() => {
    const counts: Record<string, number> = {}
    monthlyLeads.forEach((l: { source_channel: string }) => {
      const ch = l.source_channel || 'other'
      counts[ch] = (counts[ch] || 0) + 1
    })
    return Object.entries(counts)
      .map(([key, value]) => ({
        name: CHANNEL_LABELS[key] || key,
        value,
        color: CHANNEL_COLORS[key] || '#9CA3AF',
      }))
      .sort((a, b) => b.value - a.value)
  }, [monthlyLeads])

  const totalLeads = monthlyLeads.length
  const totalConsultations = pipelineLeads.filter(
    (l: { pipeline_stage: string }) =>
      ['first_consultation', 'second_consultation', 'contract_review', 'contracted'].includes(l.pipeline_stage)
  ).length
  const totalContracted = pipelineLeads.filter(
    (l: { pipeline_stage: string }) => l.pipeline_stage === 'contracted'
  ).length
  const conversionRate = totalConsultations > 0 ? ((totalContracted / totalConsultations) * 100).toFixed(1) : '0'

  const outstanding = contractStats?.outstanding || 0
  const overdueCount = contractStats?.overdueCount || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground">{todayKST()} 전사 현황</p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 신규 리드 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 신규 리드</CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalLeads}명</div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ArrowUpRight className="size-3 text-success" />
                  이번 달 기준
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 상담 & 계약 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">상담 → 계약</CardTitle>
            <FileSignature className="size-4 text-accent" />
          </CardHeader>
          <CardContent>
            {pipelineLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {totalConsultations}건 → {totalContracted}건
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  전환율 <span className="font-semibold text-foreground">{conversionRate}%</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 미수금 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">미수금 합계</CardTitle>
            <AlertCircle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {contractsLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">{formatKRW(outstanding)}</div>
                <p className="text-xs text-muted-foreground mt-1">{overdueCount}건 미수금</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 오늘 미팅 수 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">오늘 미팅</CardTitle>
            <Calendar className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {meetingsLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{todayMeetings.length}건</div>
                <p className="text-xs text-muted-foreground mt-1">{todayKST()} 기준</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 유입 채널 분포 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">유입 채널 분포</CardTitle>
            <CardDescription>이번 달 리드</CardDescription>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : channelData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                이번 달 리드 데이터가 없습니다
              </div>
            ) : (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="none">
                      {channelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5 flex-1">
                  {channelData.map((ch) => (
                    <div key={ch.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: ch.color }} />
                        <span>{ch.name}</span>
                      </div>
                      <span className="font-medium">{ch.value}명</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 파이프라인 요약 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">파이프라인 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              pipelineData.map((stage) => (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: stage.color }} />
                  <span className="text-sm flex-1">{stage.name}</span>
                  <span className="text-sm font-semibold">{stage.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Meetings + Todos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 오늘 미팅 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="size-4" /> 오늘 미팅
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {meetingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : todayMeetings.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                오늘 예정된 미팅이 없습니다
              </div>
            ) : (
              todayMeetings.map((m: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-sm font-mono text-muted-foreground shrink-0 mt-0.5">
                    {formatTimeKST(m.meeting_date as string)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {String(m.parent_name || '')}{m.student_name ? ` / ${String(m.student_name)}` : ''}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {(m.meeting_number as number) || 1}차 미팅
                      </Badge>
                      {m.source_channel ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {String(m.source_channel)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 할일 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4" /> 급한 할일
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : todos.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                진행 중인 할일이 없습니다
              </div>
            ) : (
              todos.map((t: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    t.priority === 'high' ? 'bg-destructive' :
                    t.priority === 'medium' ? 'bg-warning' : 'bg-muted-foreground'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{String(t.title || '')}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {PRIORITY_LABELS[(t.priority as string) || 'medium']}
                      </span>
                      {t.due_date ? (
                        <span className="text-xs text-muted-foreground">
                          · 마감: {String(t.due_date).slice(0, 10)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
