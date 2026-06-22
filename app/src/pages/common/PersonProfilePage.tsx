import { useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, User, Phone, Mail, MapPin, School, Calendar,
  DollarSign, GraduationCap, FileText, ExternalLink, Globe,
  MessageSquare, ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureAccess, getEffectiveModules, type FeatureModule } from '@/hooks/useProfiles'
import { formatCurrency, formatPhone, getStageConfig } from '@/types'
import type { PipelineStage } from '@/types'
import { useT } from '@/i18n/LanguageContext'

// ─── Row types ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
type WithProfiles = R & { profiles: { name: string } | null }

// ─── Data fetching ──────────────────────────────────────────────

function usePersonData(name: string) {
  return useQuery({
    queryKey: ['person-profile', name],
    enabled: !!name,
    queryFn: async () => {
      const q = name.trim()
      if (!q) return null

      const [leadsRes, contractsRes, studentsRes, meetingsRes, activitiesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*, profiles!leads_assigned_to_fkey(id, name)')
          .or(`parent_name.ilike.%${q}%,student_name.ilike.%${q}%`)
          .order('updated_at', { ascending: false })
          .limit(10),

        supabase
          .from('contracts')
          .select('*')
          .or(`contractor_name.ilike.%${q}%,student_name.ilike.%${q}%`)
          .order('contract_date', { ascending: false })
          .limit(10),

        supabase
          .from('service_students')
          .select('*')
          .or(`name.ilike.%${q}%,korean_name.ilike.%${q}%,parent_name.ilike.%${q}%`)
          .limit(5),

        supabase
          .from('meetings')
          .select('*, profiles:profiles!meetings_created_by_fkey(name)')
          .or(`parent_name.ilike.%${q}%,student_name.ilike.%${q}%`)
          .order('meeting_date', { ascending: false })
          .limit(20),

        supabase
          .from('leads')
          .select('id')
          .or(`parent_name.ilike.%${q}%,student_name.ilike.%${q}%`)
          .limit(5),
      ])

      const leadIds = (activitiesRes.data || []).map((l: R) => l.id as string)
      let activities: R[] = []
      if (leadIds.length > 0) {
        const { data: actData } = await supabase
          .from('lead_activities')
          .select('*, profiles:profiles!lead_activities_created_by_fkey(name)')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
          .limit(30)
        activities = (actData || []) as R[]
      }

      const studentIds = (studentsRes.data || []).map((s: R) => s.id as string)
      let serviceMeetings: R[] = []
      if (studentIds.length > 0) {
        const { data: smData } = await supabase
          .from('service_meetings')
          .select('*')
          .in('student_id', studentIds)
          .order('meeting_date', { ascending: false })
          .limit(30)
        serviceMeetings = (smData || []) as R[]
      }

      // Fetch installments for each contract
      const contractIds = (contractsRes.data || []).map((c: R) => c.id as string)
      let installments: R[] = []
      if (contractIds.length > 0) {
        const { data: instData } = await supabase
          .from('payment_installments')
          .select('*')
          .in('contract_id', contractIds)
          .order('installment_order', { ascending: true })
        installments = (instData || []) as R[]
      }

      return {
        leads: (leadsRes.data || []) as WithProfiles[],
        contracts: (contractsRes.data || []) as R[],
        students: (studentsRes.data || []) as R[],
        salesMeetings: (meetingsRes.data || []) as WithProfiles[],
        leadActivities: activities,
        serviceMeetings,
        installments,
      }
    },
  })
}

// ─── Consultant name lookup ─────────────────────────────────────
const CONSULTANTS: Record<string, string> = {
  sangbum: '한상범', jihyun: '김지현', eunyoung: '양은영',
  yeonse: '남연서', danny: 'Danny', liz: '유리즈',
}

// ─── Main Component ─────────────────────────────────────────────

export function PersonProfilePage() {
  const t = useT()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const name = searchParams.get('q') || ''
  const { data, isLoading } = usePersonData(name)
  const { data: featureAccess = [] } = useFeatureAccess()

  const modules = useMemo<Set<FeatureModule>>(() => {
    if (!user) return new Set()
    return new Set(getEffectiveModules(user, featureAccess))
  }, [user, featureAccess])

  const hasSales = modules.has('sales')
  const hasFinance = modules.has('finance')
  const hasService = modules.has('service')

  if (!name) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        {t('person.enterSearch')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!data) return null

  const { leads, contracts, students, salesMeetings, leadActivities, serviceMeetings, installments } = data
  const hasAnyData = leads.length > 0 || contracts.length > 0 || students.length > 0

  // Group installments by contract
  const installmentsByContract = new Map<string, R[]>()
  for (const inst of installments) {
    const cid = inst.contract_id as string
    if (!installmentsByContract.has(cid)) installmentsByContract.set(cid, [])
    installmentsByContract.get(cid)!.push(inst)
  }

  // Build a unified timeline
  type TimelineItem = {
    id: string; date: string; phase: 'lead' | 'sales' | 'contract' | 'service'
    badge: string; badgeColor: string; title: string; desc?: string; person?: string
    link?: string
  }
  const timeline: TimelineItem[] = []

  // Lead activities
  if (hasSales) {
    for (const act of leadActivities) {
      const typeLabels: Record<string, string> = {
        note: '메모', call: '전화', katalk: '카톡', email: '이메일',
        meeting: '미팅', consultation: '상담', stage_change: '단계 변경',
        assignment_change: '담당자 변경', system: '시스템',
      }
      const typeColors: Record<string, string> = {
        call: 'bg-orange-100 text-orange-700', consultation: 'bg-green-100 text-green-700',
        stage_change: 'bg-blue-100 text-blue-700', katalk: 'bg-yellow-100 text-yellow-700',
      }
      timeline.push({
        id: `act-${act.id as string}`,
        date: act.created_at as string,
        phase: 'lead',
        badge: typeLabels[act.activity_type as string] || (act.activity_type as string),
        badgeColor: typeColors[act.activity_type as string] || 'bg-gray-100 text-gray-600',
        title: act.title as string,
        desc: typeof act.content === 'string' ? act.content : undefined,
        person: (act as unknown as { profiles: { name: string } | null }).profiles?.name,
      })
    }

    // Sales meetings
    for (const m of salesMeetings) {
      timeline.push({
        id: `smtg-${m.id as string}`,
        date: (m.meeting_date as string) || (m.created_at as string),
        phase: 'sales',
        badge: `${m.meeting_number || ''}차 상담`,
        badgeColor: 'bg-green-100 text-green-700',
        title: `${m.parent_name}${m.student_name ? ` / ${m.student_name}` : ''} 상담`,
        desc: typeof m.memo === 'string' ? m.memo : undefined,
        person: m.profiles?.name,
      })
    }
  }

  // Contract events
  if (hasFinance) {
    for (const c of contracts) {
      timeline.push({
        id: `contract-${c.id as string}`,
        date: c.contract_date as string,
        phase: 'contract',
        badge: '계약 체결',
        badgeColor: 'bg-emerald-100 text-emerald-700',
        title: `${c.contractor_name} / ${c.student_name}`,
        desc: (c.total_amount as number) > 0
          ? formatCurrency(c.total_amount as number, (c.currency as 'KRW' | 'USD') || 'KRW')
          : undefined,
        link: `/consulting/clients/${c.id as string}`,
      })
    }
  }

  // Service meetings
  if (hasService) {
    for (const sm of serviceMeetings) {
      const consultant = CONSULTANTS[sm.consultant_id as string] || (sm.consultant_id as string) || ''
      const reportBadge = sm.report_status === 'submitted' ? ' ✓리포트' : sm.report_status === 'pending' ? ' ⏳리포트' : ''
      timeline.push({
        id: `svc-${sm.id as string}`,
        date: (sm.meeting_date as string) || (sm.created_at as string),
        phase: 'service',
        badge: `${(sm.meeting_type as string) || '미팅'}${reportBadge}`,
        badgeColor: 'bg-blue-100 text-blue-700',
        title: '서비스 미팅',
        desc: typeof sm.summary === 'string' ? sm.summary : undefined,
        person: consultant,
      })
    }
  }

  // Sort chronologically
  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const phaseColors = { lead: 'border-l-violet-400', sales: 'border-l-green-400', contract: 'border-l-emerald-400', service: 'border-l-blue-400' }
  const phaseLabels = { lead: '리드', sales: '세일즈 상담', contract: '계약', service: '서비스' }
  const phaseDots = { lead: 'bg-violet-400', sales: 'bg-green-400', contract: 'bg-emerald-400', service: 'bg-blue-400' }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="size-6" />
          "{name}" {t('person.searchResults')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('person.foundSummary')
            .replace('{leads}', String(leads.length))
            .replace('{contracts}', String(contracts.length))
            .replace('{students}', String(students.length))
            .replace('{timeline}', String(timeline.length))}
        </p>
      </div>

      {!hasAnyData && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t('person.noResults')}
          </CardContent>
        </Card>
      )}

      {/* ── Person Info Cards ── */}
      <div className="grid grid-cols-1 gap-4">
        {/* Lead Info */}
        {hasSales && leads.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="size-4 text-violet-500" />
                {t('person.leadInfo')} ({leads.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leads.map(lead => {
                const stage = getStageConfig(lead.pipeline_stage as PipelineStage)
                return (
                  <div key={lead.id as string} className="flex items-start justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/sales/leads/${lead.id as string}`}
                          className="font-medium hover:text-blue-600 flex items-center gap-1"
                        >
                          {lead.parent_name as string} / {lead.student_name as string}
                          <ExternalLink className="size-3" />
                        </Link>
                        <Badge variant="outline" className={`text-[10px] h-4 status-pill status-pill--${stage.color.replace('stage-', '')}`}>
                          {stage.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {lead.source_channel && <span className="mr-3">📢 {lead.source_channel as string}</span>}
                        {lead.interest_area && <span className="mr-3">🎯 {lead.interest_area as string}</span>}
                        {lead.region && <span>📍 {lead.region as string}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {lead.current_school && <span className="mr-3"><School className="size-3 inline" /> {lead.current_school as string}</span>}
                        {lead.grade && <span>{lead.grade as string}</span>}
                      </div>
                      {lead.phone && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <Phone className="size-3 inline" /> {formatPhone(lead.phone as string)}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {(lead.lead_date as string)?.slice(0, 10)}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Contract Info */}
        {hasFinance && contracts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="size-4 text-emerald-500" />
                {t('person.contractInfo')} ({contracts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contracts.map(c => {
                const statusLabel: Record<string, string> = {
                  active: '진행 중', expiring_soon: '만료 임박', expired: '만료', cancelled: '취소',
                }
                const statusColor: Record<string, string> = {
                  active: 'bg-emerald-100 text-emerald-700', expiring_soon: 'bg-amber-100 text-amber-700',
                  expired: 'bg-gray-100 text-gray-600', cancelled: 'bg-red-100 text-red-600',
                }
                const cInsts = installmentsByContract.get(c.id as string) || []
                const totalPaid = cInsts.reduce((s, i) => s + ((i.paid_amount as number) || 0), 0)
                const totalAmount = (c.total_amount as number) || 0
                const currency = (c.currency as 'KRW' | 'USD') || 'KRW'
                return (
                  <div key={c.id as string} className="text-sm border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/consulting/clients/${c.id as string}`}
                        className="font-medium hover:text-blue-600 flex items-center gap-1"
                      >
                        {c.contractor_name as string} / {c.student_name as string}
                        <ExternalLink className="size-3" />
                      </Link>
                      <Badge variant="outline" className={`text-[10px] h-4 ${statusColor[c.status as string] || 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel[c.status as string] || c.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                      <span><Calendar className="size-3 inline" /> {(c.contract_date as string)?.slice(0, 10)} ~ {(c.expiry_date as string)?.slice(0, 10)}</span>
                      <span className="font-mono font-medium">
                        <DollarSign className="size-3 inline" />
                        {formatCurrency(totalAmount, currency)}
                      </span>
                      {totalAmount > 0 && (
                        <span className="text-[10px]">
                          ({Math.round((totalPaid / totalAmount) * 100)}% {t('person.collected')})
                        </span>
                      )}
                    </div>
                    {c.phone && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <Phone className="size-3 inline" /> {formatPhone(c.phone as string)}
                        {c.address && <span className="ml-3"><MapPin className="size-3 inline" /> {c.address as string}</span>}
                      </div>
                    )}
                    {/* Application count & additional services */}
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-4">
                      <span>
                        📋 원서 지원 수: <span className={c.application_count ? 'font-medium text-foreground' : 'text-red-400'}>
                          {c.application_count ? `${c.application_count}개` : '미입력'}
                        </span>
                      </span>
                      <span>
                        ➕ 추가 서비스: <span className={c.additional_services ? 'font-medium text-foreground' : 'text-red-400'}>
                          {(c.additional_services as string) || '미입력'}
                        </span>
                      </span>
                      <Link
                        to={`/consulting/clients/${c.id as string}`}
                        className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                      >
                        수정 <ExternalLink className="size-2.5" />
                      </Link>
                    </div>
                    {/* Installment breakdown */}
                    {cInsts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {cInsts.map(inst => {
                          const amount = (inst.amount as number) || 0
                          const paid = (inst.paid_amount as number) || 0
                          const status = inst.status as string
                          const statusBadge: Record<string, string> = {
                            paid: 'bg-emerald-100 text-emerald-700',
                            partial: 'bg-amber-100 text-amber-700',
                            pending: 'bg-gray-100 text-gray-600',
                            overdue: 'bg-red-100 text-red-600',
                          }
                          const statusText: Record<string, string> = {
                            paid: '수금완료', partial: '부분수금', pending: '미수금', overdue: '연체',
                          }
                          return (
                            <div key={inst.id as string} className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1">
                              <span className="font-medium w-20 truncate">{inst.label as string}</span>
                              <span className="font-mono">{formatCurrency(amount, currency)}</span>
                              {paid > 0 && paid < amount && (
                                <span className="font-mono text-muted-foreground">({formatCurrency(paid, currency)} 수금)</span>
                              )}
                              <Badge variant="outline" className={`text-[9px] h-3.5 ml-auto ${statusBadge[status] || 'bg-gray-100'}`}>
                                {statusText[status] || status}
                              </Badge>
                              {inst.due_date && (
                                <span className="text-muted-foreground text-[10px]">{(inst.due_date as string).slice(5)}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Service Student Info */}
        {hasService && students.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="size-4 text-blue-500" />
                {t('person.studentInfo')} ({students.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {students.map(s => (
                <div key={s.id as string} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/service/student-360?studentId=${s.id as string}`}
                      className="font-medium hover:text-blue-600 flex items-center gap-1"
                    >
                      {s.name as string}{s.korean_name ? ` / ${s.korean_name as string}` : ''}
                      <ExternalLink className="size-3" />
                    </Link>
                    {s.status && (
                      <Badge variant="outline" className="text-[10px] h-4">{s.status as string}</Badge>
                    )}
                    {s.preferred_language && (
                      <Badge variant="outline" className="text-[10px] h-4 bg-indigo-50 text-indigo-600 border-indigo-200">
                        <Globe className="size-2.5 mr-0.5" /> {s.preferred_language as string}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    {s.school && <span><School className="size-3 inline" /> {s.school as string} {s.grade || ''}</span>}
                    {s.assigned_consultant && <span>👤 {CONSULTANTS[s.assigned_consultant as string] || s.assigned_consultant}</span>}
                    {s.parent_name && <span>👪 {s.parent_name as string}</span>}
                    {s.contact && <span><Phone className="size-3 inline" /> {s.contact as string}</span>}
                    {s.email && <span><Mail className="size-3 inline" /> {s.email as string}</span>}
                    {s.communication_platform && <span>💬 {s.communication_platform as string}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Unified Timeline ── */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="size-4" />
              {t('person.timeline')} ({timeline.length}건)
            </CardTitle>
            {/* Phase legend */}
            <div className="flex gap-4 text-[10px] mt-2">
              {(['lead', 'sales', 'contract', 'service'] as const).map(p => {
                const count = timeline.filter(i => i.phase === p).length
                if (count === 0) return null
                return (
                  <span key={p} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${phaseDots[p]}`} />
                    {phaseLabels[p]} ({count})
                  </span>
                )
              })}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {timeline.map((item) => (
                <div
                  key={item.id}
                  className={`flex gap-3 text-xs border-l-2 pl-3 py-2 ${phaseColors[item.phase]}`}
                >
                  <div className="text-muted-foreground shrink-0 w-[68px] font-mono">
                    {item.date?.slice(0, 10) || '—'}
                  </div>
                  <div className="shrink-0">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.link ? (
                      <Link to={item.link} className="font-medium hover:text-blue-600 inline-flex items-center gap-1">
                        {item.title} <ArrowRight className="size-3" />
                      </Link>
                    ) : (
                      <span className="font-medium">{item.title}</span>
                    )}
                    {item.desc && (
                      <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{item.desc}</p>
                    )}
                  </div>
                  {item.person && (
                    <span className="text-muted-foreground shrink-0">{item.person}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
