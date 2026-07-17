import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Phone,
  PhoneCall,
  PhoneOff,
  Mail,
  School,
  GraduationCap,
  MapPin,
  Calendar,
  MessageSquare,
  MessageCircle,
  Clock,
  ChevronRight,
  Filter,
  Star,
  Loader2,
  CheckCircle2,
  X,
  ArrowUpDown,
  Send,
  Video,
  Save,
  Globe,
  XCircle,
  UserX,
  UserCheck,
  Pause,
  CalendarCheck,
  Trash2,
  Users2,
  type LucideIcon,
} from 'lucide-react'
import { useLeads, useLeadActivities, useCreateActivity, useUpdateLead, useDeleteActivity } from '@/hooks/useLeads'
import { LEAD_LEVELS, leadLevelConfig, type LeadLevel } from '@/lib/leadLevels'
import { useAllLeadAttendance, useUpsertLeadAttendance, ATTENDANCE_OPTIONS, type AttendanceStatus } from '@/hooks/useLeadAttendance'
import {
  useSeminarsWithRegistrations,
  useAllContactActivities,
  computeColdCallOutcome,
  leadMatchesSeminar,
  seminarSessionsForLead,
  dedupeLeadsByPerson,
  type SeminarLite,
  type ColdCallOutcome,
} from '@/hooks/useSeminarPerformance'
import { useAuth } from '@/contexts/AuthContext'
import type { Lead, LeadActivity, PipelineStage } from '@/types'
import { getStageConfig, GRADES, PIPELINE_STAGES } from '@/types'
import { Link } from 'react-router-dom'

// ============ Priority scoring ============

/**
 * Grade priority: G10/G11 are the prime consulting window.
 * G12 is slightly lower because college apps are already underway.
 */
const GRADE_PRIORITY: Record<string, number> = {
  'G11': 50, '고2': 50, 'Y12': 50,
  'G10': 48, '고1': 48, 'Y11': 48,
  'G12': 38, '고3': 38, 'Y13': 38,
  'G9': 30, '중3': 30, 'Y10': 30,
  'G8': 18, '중2': 18, 'Y9': 18,
  'G7': 12, '중1': 12, 'Y8': 12,
  'Y7': 8,
  '대학생': 20,
}

/**
 * School tier scoring — higher tier = higher likelihood of contracting.
 *
 * Tier 1 (40 pts): 제주 인가 국제학교 + 미국 탑 보딩스쿨
 * Tier 1.5 (30 pts): 기타 지역 한국 인가 국제학교 + 미국 탑 사립학교
 * Tier 2 (20 pts): 미인가 국제학교 + 명문 고등학교
 */
const SCHOOL_TIERS: { tier: number; score: number; patterns: RegExp[] }[] = [
  {
    tier: 1,
    score: 40,
    patterns: [
      // 제주 인가 국제학교
      /kis\s*jeju/i, /korea\s*international\s*school\s*jeju/i,
      /nlcs\s*jeju/i, /north\s*london\s*collegiate/i,
      /bha/i, /branksome\s*hall\s*asia/i,
      /sja\s*jeju/i, /st\.?\s*johnsbury/i,
      /제주국제/i, /한국국제학교\s*제주/i,
      // 미국 탑 보딩스쿨
      /phillips\s*(exeter|academy)/i, /andover/i,
      /deerfield/i, /lawrenceville/i,
      /hotchkiss/i, /choate/i, /choate\s*rosemary/i,
      /st\.?\s*paul/i, /groton/i,
      /middlesex/i, /milton\s*academy/i,
      /peddie/i, /loomis/i, /taft/i,
      /kent\s*school/i, /westminster/i,
      /concord\s*academy/i, /thacher/i,
      /cate\s*school/i, /webb\s*school/i,
      /hill\s*school/i, /governor/i,
      /noble/i, /greenough/i,
      /episcopal\s*high/i,
    ],
  },
  {
    tier: 1.5,
    score: 30,
    patterns: [
      // 한국 기타 지역 인가 국제학교
      /chadwick/i, /채드윅/i,
      /sfs/i, /seoul\s*foreign/i, /서울외국인/i,
      /yiss/i, /yongsan/i, /용산국제/i,
      /dulwich/i, /덜위치/i,
      /kis\s*(seoul|pangyo|분당)/i,
      /dwight/i,
      /global\s*christian/i,
      /cheongna\s*dalton/i, /청라달튼/i,
      /송도\s*국제/i,
      // 미국 탑 사립 (day school)
      /harvard[\s-]*westlake/i,
      /lakeside\s*school/i,
      /horace\s*mann/i,
      /dalton/i,
      /trinity\s*school/i,
      /collegiate\s*school/i,
      /sidwell/i,
      /national\s*cathedral/i,
      /winsor/i,
      /brearley/i,
      /spence/i,
      /poly\s*prep/i,
      /hackley/i,
      /riverdale/i,
      /fieldston/i,
    ],
  },
  {
    tier: 2,
    score: 20,
    patterns: [
      // 미인가 국제학교
      /sais/i, /서울\s*아카데미/i,
      /gpa/i, /글로벌\s*선진/i,
      /isak/i,
      /asia\s*pacific/i, /apsi/i,
      /tais/i,
      /yongsan\s*academy/i,
      /인터내셔널/i, /international\s*(christian|school)/i,
      /채드윅\s*송도/i,
      /외국인학교/i,
      // 명문 고등학교
      /대원외고/i, /한영외고/i, /명덕외고/i,
      /용인외고/i, /대일외고/i,
      /민사고/i, /민족사관/i,
      /상산고/i, /하나고/i, /세화고/i,
      /외대부고/i, /현대청운/i,
      /과학고/i, /영재학교/i,
      /자사고/i, /자율형사립/i,
      /포항공과/i, /경기과학/i, /서울과학/i,
      /세종과학/i, /대전과학/i, /한성과학/i,
    ],
  },
]

/** Match school name to tier score. Returns 0 if no match. */
function getSchoolTierScore(school: string): number {
  if (!school) return 0
  for (const tier of SCHOOL_TIERS) {
    if (tier.patterns.some((p) => p.test(school))) {
      return tier.score
    }
  }
  return 0
}

/** Stages eligible for cold calling */
const COLD_CALL_STAGES: PipelineStage[] = [
  'new_lead',
  'contact_attempted',
  'no_response',
]

/** Activity types that are contact logs (vs. stage/status changes). */
const CONTACT_TYPES = ['call', 'sms', 'katalk', 'email']

function getLeadPriority(lead: Lead): number {
  // Grade score (max ~50)
  let score = GRADE_PRIORITY[lead.grade] || 5

  // School tier score (max 40)
  score += getSchoolTierScore(lead.currentSchool)

  // Boost for recent leads (max +10)
  const daysSince = Math.floor(
    (Date.now() - new Date(lead.leadDate).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (daysSince <= 3) score += 10
  else if (daysSince <= 7) score += 5
  else if (daysSince > 30) score -= 5

  // Stage-based adjustments
  if (lead.pipelineStage === 'new_lead') score += 5
  if (lead.pipelineStage === 'no_response') score -= 3

  return Math.max(0, Math.min(100, score))
}

// ============ Grade groups for filtering ============

const GRADE_GROUPS = [
  { labelKey: 'coldCall.gradeAll', value: 'all' },
  { labelKey: 'coldCall.gradeHigh', value: 'high' },
  { labelKey: 'coldCall.gradeMiddle', value: 'middle' },
  { labelKey: 'coldCall.gradeCollege', value: 'college' },
]

const HIGH_GRADES = new Set(['G10', 'G11', 'G12', '고1', '고2', '고3', 'Y10', 'Y11', 'Y12', 'Y13'])
const MIDDLE_GRADES = new Set(['G7', 'G8', 'G9', '중1', '중2', '중3', 'Y7', 'Y8', 'Y9'])

function matchesGradeGroup(grade: string, group: string): boolean {
  if (group === 'all') return true
  if (group === 'high') return HIGH_GRADES.has(grade)
  if (group === 'middle') return MIDDLE_GRADES.has(grade)
  if (group === 'college') return grade === '대학생'
  return true
}

// ============ Contact method types ============

type ContactMethod = 'call' | 'sms' | 'katalk' | 'email'

interface ContactMethodConfig {
  labelKey: string
  icon: LucideIcon
  color: string
  activeColor: string
  results: { value: string; labelKey: string; icon: LucideIcon; color: string }[]
}

const CONTACT_METHODS: Record<ContactMethod, ContactMethodConfig> = {
  call: {
    labelKey: 'coldCall.methodCall',
    icon: Phone,
    color: 'border-green-200 text-green-700',
    activeColor: 'bg-green-500 hover:bg-green-600 text-white border-green-500',
    results: [
      { value: 'connected', labelKey: 'coldCall.callConnected', icon: PhoneCall, color: 'bg-emerald-500 hover:bg-emerald-600' },
      { value: 'no_answer', labelKey: 'coldCall.callNoAnswer', icon: PhoneOff, color: 'bg-red-500 hover:bg-red-600' },
      { value: 'callback', labelKey: 'coldCall.callCallback', icon: Phone, color: 'bg-blue-500 hover:bg-blue-600' },
    ],
  },
  sms: {
    labelKey: 'coldCall.methodSms',
    icon: MessageSquare,
    color: 'border-blue-200 text-blue-700',
    activeColor: 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500',
    results: [
      { value: 'sent', labelKey: 'coldCall.msgSent', icon: Send, color: 'bg-blue-500 hover:bg-blue-600' },
      { value: 'replied', labelKey: 'coldCall.msgReplied', icon: MessageCircle, color: 'bg-emerald-500 hover:bg-emerald-600' },
      { value: 'no_reply', labelKey: 'coldCall.msgNoReply', icon: Clock, color: 'bg-gray-500 hover:bg-gray-600' },
    ],
  },
  katalk: {
    labelKey: 'coldCall.methodKatalk',
    icon: MessageCircle,
    color: 'border-yellow-300 text-yellow-700',
    activeColor: 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500',
    results: [
      { value: 'sent', labelKey: 'coldCall.msgSent', icon: Send, color: 'bg-yellow-500 hover:bg-yellow-600' },
      { value: 'read', labelKey: 'coldCall.msgRead', icon: CheckCircle2, color: 'bg-blue-500 hover:bg-blue-600' },
      { value: 'replied', labelKey: 'coldCall.msgReplied', icon: MessageCircle, color: 'bg-emerald-500 hover:bg-emerald-600' },
      { value: 'no_reply', labelKey: 'coldCall.msgNoReply', icon: Clock, color: 'bg-gray-500 hover:bg-gray-600' },
    ],
  },
  email: {
    labelKey: 'coldCall.methodEmail',
    icon: Mail,
    color: 'border-purple-200 text-purple-700',
    activeColor: 'bg-purple-500 hover:bg-purple-600 text-white border-purple-500',
    results: [
      { value: 'sent', labelKey: 'coldCall.msgSent', icon: Send, color: 'bg-purple-500 hover:bg-purple-600' },
      { value: 'replied', labelKey: 'coldCall.msgReplied', icon: MessageCircle, color: 'bg-emerald-500 hover:bg-emerald-600' },
      { value: 'no_reply', labelKey: 'coldCall.msgNoReply', icon: Clock, color: 'bg-gray-500 hover:bg-gray-600' },
    ],
  },
}

/** Icon for activity type in history */
function getActivityIcon(type: string): { icon: LucideIcon; color: string } {
  switch (type) {
    case 'call': return { icon: Phone, color: 'text-green-500' }
    case 'sms': return { icon: MessageSquare, color: 'text-blue-500' }
    case 'katalk': return { icon: MessageCircle, color: 'text-yellow-500' }
    case 'email': return { icon: Mail, color: 'text-purple-500' }
    case 'consultation': return { icon: Video, color: 'text-blue-500' }
    case 'stage_change': return { icon: CheckCircle2, color: 'text-purple-500' }
    default: return { icon: Clock, color: 'text-gray-400' }
  }
}

// ============ Main Component ============

/** Standalone route page for /sales/cold-call */
export function ColdCallPage() {
  return <ColdCallView />
}

export function ColdCallView() {
  const t = useT()
  const [search, setSearch] = useState('')
  const [gradeGroup, setGradeGroup] = useState('all')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [sessionFilter, setSessionFilter] = useState<string[]>([]) // 신청 웨비나(세션) 다중선택
  const [levelFilter, setLevelFilter] = useState<'all' | LeadLevel>('all')
  const [sortBy, setSortBy] = useState<'level' | 'date' | 'grade'>('level')
  // 단계 필터: 'coldcall'(기본, 콜드콜 대상 3단계) 또는 특정 파이프라인 단계
  const [stageFilter, setStageFilter] = useState<'coldcall' | PipelineStage>('coldcall')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // Fetch leads in cold-callable stages
  const { data: allLeads = [], isLoading } = useLeads()
  // Seminars with registrant phone sets — so leads that registered for a
  // seminar are matched even if their lead source is another channel
  const { data: seminars = [] } = useSeminarsWithRegistrations()
  const { data: attendanceRows = [] } = useAllLeadAttendance()
  const attendedByLead = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const a of attendanceRows) {
      if (a.status !== 'attended') continue
      const arr = m.get(a.leadId) || []
      arr.push(a.sessionLabel || '세미나')
      m.set(a.leadId, arr)
    }
    return m
  }, [attendanceRows])
  const { data: contactActivities = [] } = useAllContactActivities()

  // Build event filter options: seminars from 세미나 관리 + legacy source channels
  const eventFilterOptions = useMemo(() => {
    const options: { label: string; value: string }[] = []
    const seen = new Set<string>()
    // 1. All seminars created in 세미나 관리
    for (const s of seminars) {
      if (!seen.has(s.title)) {
        seen.add(s.title)
        options.push({ label: s.title, value: s.title })
      }
    }
    // 2. Legacy seminar/webinar source channels not backed by a seminar record
    const leadChannels = new Set(
      allLeads
        .filter(l => COLD_CALL_STAGES.includes(l.pipelineStage))
        .map(l => l.sourceChannel)
        .filter((sc): sc is string => !!sc && sc.trim().length > 0),
    )
    const GENERIC_NAMES = new Set(['세미나', '웨비나', '세미나 참석', '웨비나 참석'])
    for (const sc of leadChannels) {
      if (!seen.has(sc) && !GENERIC_NAMES.has(sc) && (sc.includes('세미나') || sc.includes('웨비나'))) {
        seen.add(sc)
        options.push({ label: sc, value: sc })
      }
    }
    return options
  }, [allLeads, seminars])

  const selectedSeminar: SeminarLite | undefined = useMemo(
    () => seminars.find((s) => s.title === selectedEvent),
    [seminars, selectedEvent],
  )

  // Filter and score leads
  const coldCallLeads = useMemo(() => {
    // Base list: 기본은 콜드콜 대상 3단계, 특정 단계 선택 시 그 단계만
    let leads = stageFilter === 'coldcall'
      ? allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage))
      : allLeads.filter((l) => l.pipelineStage === stageFilter)

    // Event filter — source_channel match OR registered phone/email match
    if (selectedEvent !== 'all') {
      if (selectedSeminar) {
        leads = dedupeLeadsByPerson(leads.filter((l) => leadMatchesSeminar(l, selectedSeminar)))
        // Sub-webinar (session) filter — the 4 진학전략 webinars
        if (sessionFilter.length > 0) {
          leads = leads.filter((l) => {
            const applied = seminarSessionsForLead(selectedSeminar, l)
            return applied.some((s) => sessionFilter.includes(s))
          })
        }
      } else {
        leads = leads.filter((l) => l.sourceChannel === selectedEvent)
      }
    }

    // Grade group filter
    if (gradeGroup !== 'all') {
      leads = leads.filter((l) => matchesGradeGroup(l.grade, gradeGroup))
    }

    // Specific grade filter
    if (selectedGrade !== 'all') {
      leads = leads.filter((l) => l.grade === selectedGrade)
    }

    // School filter
    if (selectedSchool) {
      leads = leads.filter((l) =>
        l.currentSchool.toLowerCase().includes(selectedSchool.toLowerCase()),
      )
    }

    // Search
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      leads = leads.filter(
        (l) =>
          l.parentName.toLowerCase().includes(s) ||
          l.studentName.toLowerCase().includes(s) ||
          l.phone.includes(s) ||
          l.currentSchool.toLowerCase().includes(s),
      )
    }

    // Lead level filter
    if (levelFilter !== 'all') {
      leads = leads.filter((l) => l.leadLevel === levelFilter)
    }

    // Score and sort
    const scored = leads.map((l) => ({ ...l, _priority: getLeadPriority(l) }))

    if (sortBy === 'level') {
      scored.sort((a, b) => (leadLevelConfig(b.leadLevel)?.rank || 0) - (leadLevelConfig(a.leadLevel)?.rank || 0))
    } else if (sortBy === 'date') {
      scored.sort((a, b) => new Date(b.leadDate).getTime() - new Date(a.leadDate).getTime())
    } else if (sortBy === 'grade') {
      scored.sort((a, b) => (GRADE_PRIORITY[b.grade] || 0) - (GRADE_PRIORITY[a.grade] || 0))
    }

    return scored
  }, [allLeads, gradeGroup, selectedGrade, selectedSchool, selectedEvent, selectedSeminar, search, sortBy, levelFilter, sessionFilter, stageFilter])

  const selectedLead = coldCallLeads.find((l) => l.id === selectedLeadId)

  // Stats
  const totalColdCallable = allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage)).length
  const filteredCount = coldCallLeads.length

  // Dashboard: computed over ALL leads in scope (all stages), so leads that
  // advanced past cold-call stages (consultation, contract) still count
  const dashboardLeads = useMemo(() => {
    if (selectedEvent === 'all') return allLeads
    if (selectedSeminar) return dedupeLeadsByPerson(allLeads.filter((l) => leadMatchesSeminar(l, selectedSeminar)))
    return allLeads.filter((l) => l.sourceChannel === selectedEvent)
  }, [allLeads, selectedEvent, selectedSeminar])

  const outcome = useMemo(
    () => computeColdCallOutcome(dashboardLeads, contactActivities, selectedSeminar?.applicants ?? 0),
    [dashboardLeads, contactActivities, selectedSeminar],
  )

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] overflow-hidden -m-3 md:-m-6">
      {/* Left Panel: Cold Call List */}
      <div className="flex flex-col w-full md:w-[460px] md:min-w-[340px] border-b md:border-b-0 md:border-r bg-background max-h-[45vh] md:max-h-none">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-lg font-bold tracking-tight">{t('nav.coldCall')}</h1>
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading ? t('common.loading') : t('coldCall.countSummary', { filtered: filteredCount, total: totalColdCallable })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={stageFilter} onValueChange={(v) => setStageFilter((v as 'coldcall' | PipelineStage) || 'coldcall')}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <Filter className="size-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coldcall">{t('coldCall.stageFilterColdCall')}</SelectItem>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{t('stage.' + s.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <ArrowUpDown className="size-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="level">리드 레벨순</SelectItem>
                  <SelectItem value="date">{t('coldCall.sortDate')}</SelectItem>
                  <SelectItem value="grade">{t('coldCall.sortGrade')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lead level legend + filter */}
          <div className="rounded-lg border bg-muted/30 p-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {LEAD_LEVELS.map(l => (
                <span key={l.key} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={l.meaningKo}>
                  <span>{l.emoji}</span>
                  <span className="font-medium text-foreground/80">{l.labelEn}</span>
                </span>
              ))}
            </div>
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter((v as 'all' | LeadLevel) || 'all')}>
              <SelectTrigger className="h-7 text-xs mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 리드 레벨</SelectItem>
                {LEAD_LEVELS.map(l => (
                  <SelectItem key={l.key} value={l.key}>{l.emoji} {l.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder={t('coldCall.searchPlaceholder')}
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={gradeGroup} onValueChange={(v) => setGradeGroup(v || 'all')}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <Filter className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADE_GROUPS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {t(g.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGrade} onValueChange={(v) => setSelectedGrade(v || 'all')}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <GraduationCap className="size-3 mr-1" />
                <SelectValue placeholder={t('leads.grade')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('coldCall.allGrades')}</SelectItem>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <School className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                placeholder={t('coldCall.schoolFilter')}
                className="pl-7 h-7 text-xs"
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
              />
            </div>
            <Select value={selectedEvent} onValueChange={(v) => { setSelectedEvent(v || 'all'); setSessionFilter([]) }}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <Calendar className="size-3 mr-1" />
                <SelectValue placeholder={t('coldCall.eventFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('coldCall.allEvents')}</SelectItem>
                {eventFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-webinar (신청 웨비나) multi-select — for events with sessions like 진학전략웨비나 */}
          {selectedSeminar && selectedSeminar.sessions.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground">신청 웨비나 (복수 선택 가능)</p>
              <div className="flex flex-wrap gap-1">
                {selectedSeminar.sessions.map((s) => {
                  const on = sessionFilter.includes(s)
                  return (
                    <button
                      key={s}
                      onClick={() => setSessionFilter((prev) => on ? prev.filter((x) => x !== s) : [...prev, s])}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                    >
                      {s}
                    </button>
                  )
                })}
                {sessionFilter.length > 0 && (
                  <button onClick={() => setSessionFilter([])} className="text-[10px] px-1.5 py-0.5 text-muted-foreground hover:text-foreground">전체</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Lead List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : coldCallLeads.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('coldCall.noLeads')}
            </div>
          ) : (
            coldCallLeads.map((lead) => {
              const isSelected = lead.id === selectedLeadId
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${
                    isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {lead.studentName || lead.parentName}
                        </span>
                        {(() => {
                          const lvl = leadLevelConfig(lead.leadLevel)
                          return lvl ? (
                            <Badge variant="outline" className={`${lvl.badge} text-[10px] px-1.5 py-0 h-4 shrink-0`} title={lvl.meaningKo}>
                              {lvl.emoji} {lvl.labelEn}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 text-muted-foreground border-dashed">미분류</Badge>
                          )
                        })()}
                      </div>
                      {lead.studentName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lead.parentName} ({t('coldCall.parent')})
                        </p>
                      )}
                      {selectedSeminar && selectedSeminar.sessions.length > 0 && (() => {
                        const applied = seminarSessionsForLead(selectedSeminar, lead)
                        return applied.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {applied.map((s, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 h-4 text-indigo-600 border-indigo-200">📎 {s}</Badge>
                            ))}
                          </div>
                        ) : null
                      })()}
                      {(attendedByLead.get(lead.id) || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(attendedByLead.get(lead.id) || []).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 h-4 text-emerald-700 border-emerald-200 bg-emerald-50">✅ {s}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        {lead.currentSchool && (
                          <span className="flex items-center gap-1">
                            <School className="size-3" />
                            {lead.currentSchool}
                          </span>
                        )}
                        {lead.grade && (
                          <span className="flex items-center gap-1">
                            <GraduationCap className="size-3" />
                            {lead.grade}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {lead.sourceChannel}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        getStageConfig(lead.pipelineStage).color.replace('stage-', 'status-pill--')
                      }`}>
                        {getStageConfig(lead.pipelineStage).label}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {lead.leadDate}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel: Lead Detail or Dashboard */}
      <div className="flex-1 overflow-y-auto bg-muted/30 min-w-0">
        {selectedLead ? (
          <ColdCallDetail lead={selectedLead} seminars={seminars} attendance={attendanceRows.filter(a => a.leadId === selectedLead.id)} onClose={() => setSelectedLeadId(null)} />
        ) : (
          <ColdCallDashboard
            eventLabel={selectedEvent !== 'all' ? selectedEvent : null}
            outcome={outcome}
          />
        )}
      </div>
    </div>
  )
}

// ============ Dashboard Panel ============

function ColdCallDashboard({
  eventLabel,
  outcome,
}: {
  eventLabel: string | null
  outcome: ColdCallOutcome
}) {
  const t = useT()
  const pct = (n: number, base: number) => (base > 0 ? `${Math.round((n / base) * 100)}%` : '-')

  const statCards: { label: string; value: string; sub?: string; icon: LucideIcon; color: string }[] = [
    ...(eventLabel
      ? [{
          label: t('coldCall.dashApplicants'),
          value: String(outcome.applicants),
          sub: t('coldCall.dashLeadsMatched', { n: outcome.totalLeads }),
          icon: Users2,
          color: 'text-primary bg-primary/10',
        }]
      : [{
          label: t('coldCall.dashTotalLeads'),
          value: String(outcome.totalLeads),
          icon: Users2,
          color: 'text-primary bg-primary/10',
        }]),
    {
      label: t('coldCall.dashConfirmed'),
      value: String(outcome.confirmed),
      sub: pct(outcome.confirmed, eventLabel ? outcome.applicants : outcome.totalLeads),
      icon: PhoneCall,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: t('coldCall.dashUnreachable'),
      value: String(outcome.unreachable),
      sub: pct(outcome.unreachable, outcome.contacted),
      icon: PhoneOff,
      color: 'text-red-500 bg-red-50',
    },
    {
      label: t('coldCall.dashCallback'),
      value: String(outcome.callbackNeeded),
      icon: Clock,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: t('coldCall.dashConsult'),
      value: String(outcome.consultScheduled),
      sub: pct(outcome.consultScheduled, outcome.totalLeads),
      icon: CalendarCheck,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: t('coldCall.dashContracted'),
      value: String(outcome.contracted),
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-50',
    },
  ]

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Phone className="size-4 text-primary" />
          {t('coldCall.dashTitle')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {eventLabel || t('coldCall.dashAllEvents')}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {statCards.map((s) => {
          const StatIcon = s.icon
          return (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${s.color}`}>
                  <StatIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold leading-tight">
                    {s.value}
                    {s.sub && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{s.sub}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Progress summary */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t('coldCall.dashProgress')}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{t('coldCall.dashContacted')}</span>
              <span className="font-medium tabular-nums">
                {outcome.contacted} / {outcome.totalLeads} ({pct(outcome.contacted, outcome.totalLeads)})
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: outcome.totalLeads > 0 ? `${(outcome.contacted / outcome.totalLeads) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('coldCall.dashUncontactedNote', { n: outcome.uncontacted })}
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('coldCall.selectLeadDesc')}
      </p>
    </div>
  )
}

// ============ Detail Panel ============

function ColdCallDetail({
  lead,
  seminars,
  attendance,
  onClose,
}: {
  lead: Lead & { _priority: number }
  seminars: SeminarLite[]
  attendance: { seminarId: string; sessionLabel: string; status: AttendanceStatus }[]
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const upsertAttendance = useUpsertLeadAttendance()
  // Seminars this lead registered for, with the specific sessions they applied to
  const appliedSeminars = useMemo(() => seminars
    .map(s => ({ seminar: s, sessions: seminarSessionsForLead(s, lead) }))
    .filter(x => x.sessions.length > 0 || (x.seminar.sessions.length === 0 && leadMatchesSeminar(lead, x.seminar))),
    [seminars, lead])
  const statusOf = (seminarId: string, session: string): AttendanceStatus | '' =>
    attendance.find(a => a.seminarId === seminarId && a.sessionLabel === session)?.status || ''
  const { data: activities = [], isLoading: activitiesLoading } = useLeadActivities(lead.id)
  const createActivity = useCreateActivity()
  const updateLead = useUpdateLead()
  const deleteActivity = useDeleteActivity()

  const [callNote, setCallNote] = useState('')
  const [contactMethod, setContactMethod] = useState<ContactMethod>('call')
  const [callResult, setCallResult] = useState<string>('')
  const [callDate, setCallDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [oneOnOneSuccess, setOneOnOneSuccess] = useState(false)
  const [memoEdit, setMemoEdit] = useState(lead.memo || '')
  const [showMemoEdit, setShowMemoEdit] = useState(false)
  const [levelReason, setLevelReason] = useState(lead.leadLevelReason || '')
  const [excludeConfirm, setExcludeConfirm] = useState<PipelineStage | null>(null)
  const [deleteActivityConfirm, setDeleteActivityConfirm] = useState<string | null>(null)

  const methodConfig = CONTACT_METHODS[contactMethod]

  const stage = getStageConfig(lead.pipelineStage)

  // Split the activity feed: contact logs (calls / messages) show inside the
  // contact-log card; everything else (pipeline stage / status changes) shows
  // in the separate 활동기록 card.
  const contactLogs = activities.filter((a: LeadActivity) => CONTACT_TYPES.includes(a.activityType))
  const statusLogs = activities.filter((a: LeadActivity) => !CONTACT_TYPES.includes(a.activityType))

  const handleLogCall = useCallback(() => {
    if (!callNote.trim() && !callResult) return

    // Build result label from config
    const resultDef = methodConfig.results.find(r => r.value === callResult)
    const resultLabel = resultDef ? t(resultDef.labelKey) : ''
    const methodLabel = t(methodConfig.labelKey)

    const title = callResult ? `${methodLabel} - ${resultLabel}` : methodLabel
    const content = callNote.trim() || undefined

    // If the chosen date is today, keep the current time; otherwise stamp
    // noon local on the chosen day so the record sorts on the right date.
    const todayStr = new Date().toISOString().slice(0, 10)
    const createdAt = callDate === todayStr
      ? new Date().toISOString()
      : new Date(`${callDate}T12:00:00`).toISOString()

    const metadata: Record<string, unknown> = { contactMethod }
    if (callResult) metadata.callResult = callResult
    if (oneOnOneSuccess) metadata.oneOnOneConsult = true

    createActivity.mutate(
      {
        leadId: lead.id,
        activityType: contactMethod,
        title,
        content,
        metadata,
        createdAt,
      },
      {
        onSuccess: () => {
          setCallNote('')
          setCallResult('')
          setCallDate(new Date().toISOString().slice(0, 10))
          setOneOnOneSuccess(false)

          // Build update payload
          const updateData: Record<string, unknown> = {}

          // Stage auto-advance from a contact log:
          // - 부재중/무응답(no_answer/no_reply) → 항상 '응답없음'으로 통일
          //   (단, 상담 예약 이후로 진행된 리드는 되돌리지 않음)
          // - 그 외 결과(통화 성공 등) → 신규 리드면 '컨택 시도'로 이동
          const noResponse = callResult === 'no_answer' || callResult === 'no_reply'
          if (noResponse) {
            if (COLD_CALL_STAGES.includes(lead.pipelineStage) && lead.pipelineStage !== 'no_response') {
              updateData.pipelineStage = 'no_response'
            }
          } else if (lead.pipelineStage === 'new_lead') {
            updateData.pipelineStage = 'contact_attempted'
          }

          // Auto-assign current user if lead has no assignee
          if (!lead.assignedTo && user) {
            updateData.assignedTo = user.id
          }

          if (Object.keys(updateData).length > 0) {
            updateLead.mutate({
              id: lead.id,
              data: updateData,
              previousStage: lead.pipelineStage,
            })
          }
        },
      },
    )
  }, [callNote, callResult, callDate, oneOnOneSuccess, contactMethod, methodConfig, lead, createActivity, updateLead, user, t])

  const handleExclude = useCallback(
    (targetStage: PipelineStage) => {
      updateLead.mutate(
        {
          id: lead.id,
          data: { pipelineStage: targetStage },
          previousStage: lead.pipelineStage,
        },
        {
          onSuccess: () => {
            setExcludeConfirm(null)
            onClose()
          },
        },
      )
    },
    [lead, updateLead, onClose],
  )

  const handleAdvanceStage = useCallback(
    (targetStage: PipelineStage) => {
      updateLead.mutate({
        id: lead.id,
        data: { pipelineStage: targetStage },
        previousStage: lead.pipelineStage,
      }, {
        onSuccess: () => onClose(),
      })
    },
    [lead, updateLead, onClose],
  )

  const handleSaveMemo = useCallback(() => {
    updateLead.mutate(
      { id: lead.id, data: { memo: memoEdit }, previousStage: lead.pipelineStage },
      { onSuccess: () => setShowMemoEdit(false) },
    )
  }, [lead, memoEdit, updateLead])

  const setLevel = (v: string | null) =>
    updateLead.mutate({ id: lead.id, data: { leadLevel: (v as LeadLevel) || undefined }, previousStage: lead.pipelineStage })
  const saveLevelReason = () =>
    updateLead.mutate({ id: lead.id, data: { leadLevelReason: levelReason }, previousStage: lead.pipelineStage })

  // One row in either the contact-log list or the status-change list.
  const renderActivity = (a: LeadActivity) => {
    const actIcon = getActivityIcon(a.activityType)
    const ActIcon = actIcon.icon
    const isDeleting = deleteActivityConfirm === a.id
    return (
      <div
        key={a.id}
        className="group flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0"
      >
        <div className="mt-0.5">
          <ActIcon className={`size-3.5 ${actIcon.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
            {a.title}
            {a.metadata?.oneOnOneConsult === true && (
              <Badge className="bg-violet-600 hover:bg-violet-600 text-white text-[10px] px-1.5 py-0 h-4 gap-0.5">
                <UserCheck className="size-2.5" />
                {t('coldCall.oneOnOneBadge')}
              </Badge>
            )}
          </p>
          {a.content && (
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
              {a.content}
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">
            {new Date(a.createdAt).toLocaleString('ko-KR')}
            {a.createdByUser && ` · ${a.createdByUser.name}`}
          </p>
        </div>
        {isDeleting ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px] px-2"
              disabled={deleteActivity.isPending}
              onClick={() =>
                deleteActivity.mutate(
                  { id: a.id, leadId: lead.id },
                  {
                    onSuccess: () => {
                      setDeleteActivityConfirm(null)
                      // Contact logging auto-assigns the logger as
                      // the sales assignee — if their last contact
                      // record on this lead is deleted, unassign them
                      const wasAssigneeRecord =
                        lead.assignedTo &&
                        a.createdBy === lead.assignedTo &&
                        CONTACT_TYPES.includes(a.activityType)
                      const hasOtherContactByAssignee = activities.some(
                        (other) =>
                          other.id !== a.id &&
                          CONTACT_TYPES.includes(other.activityType) &&
                          other.createdBy === lead.assignedTo,
                      )
                      if (wasAssigneeRecord && !hasOtherContactByAssignee) {
                        updateLead.mutate({
                          id: lead.id,
                          data: { assignedTo: null } as unknown as Partial<Lead>,
                          previousStage: lead.pipelineStage,
                        })
                      }
                    },
                  },
                )
              }
            >
              {deleteActivity.isPending ? <Loader2 className="size-3 animate-spin" /> : t('common.delete')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={() => setDeleteActivityConfirm(null)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            onClick={() => setDeleteActivityConfirm(a.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold">{lead.studentName || lead.parentName}</h2>
            <span className={`status-pill status-pill--${stage.color.replace('stage-', '')}`}>
              {stage.label}
            </span>
            {(() => {
              const lvl = leadLevelConfig(lead.leadLevel)
              return lvl ? (
                <Badge variant="outline" className={`${lvl.badge} text-xs`} title={lvl.meaningKo}>
                  {lvl.emoji} {lvl.labelEn}
                </Badge>
              ) : null
            })()}
          </div>
          {lead.studentName && (
            <p className="text-sm text-muted-foreground">{lead.parentName} ({t('coldCall.parent')})</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/sales/leads/${lead.id}`}>
            <Button variant="outline" size="sm" className="text-xs gap-1">
              {t('coldCall.detailPage')} <ChevronRight className="size-3" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Lead level + reason */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">리드 레벨</h3>
            <Select value={lead.leadLevel || ''} onValueChange={setLevel}>
              <SelectTrigger className="h-8 text-sm w-52">
                <SelectValue placeholder="리드 레벨 선택" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_LEVELS.map(l => (
                  <SelectItem key={l.key} value={l.key}>{l.emoji} {l.labelEn} · {l.labelKo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leadLevelConfig(lead.leadLevel) && (
              <span className="text-[11px] text-muted-foreground">{leadLevelConfig(lead.leadLevel)!.meaningKo}</span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] text-muted-foreground">선택 이유 (메모)</label>
              <Textarea value={levelReason} onChange={e => setLevelReason(e.target.value)} rows={2} placeholder="예: 상담 반응 좋음, 계약 의사 있음 등" className="text-sm" />
            </div>
            <Button size="sm" variant="outline" onClick={saveLevelReason} disabled={updateLead.isPending}>{t('common.save')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Seminar attendance (신청 웨비나별 참석 상태 → 세미나관리 연동) */}
      {appliedSeminars.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">세미나 참석 (세미나관리 연동)</h3>
            {appliedSeminars.map(({ seminar, sessions }) => (
              <div key={seminar.id} className="space-y-1.5">
                <p className="text-sm font-medium">{seminar.title}</p>
                {(sessions.length ? sessions : ['']).map((session) => {
                  const st = statusOf(seminar.id, session)
                  return (
                    <div key={session} className="flex items-center gap-2">
                      <span className="text-xs flex-1 truncate">{session || '(전체)'}</span>
                      <Select value={st || ''} onValueChange={(v) => v && upsertAttendance.mutate({ leadId: lead.id, seminarId: seminar.id, sessionLabel: session, status: v as AttendanceStatus })}>
                        <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="상태 선택" /></SelectTrigger>
                        <SelectContent>
                          {ATTENDANCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.ko}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {st !== 'attended' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
                          onClick={() => upsertAttendance.mutate({ leadId: lead.id, seminarId: seminar.id, sessionLabel: session, status: 'attended' })}>
                          <CheckCircle2 className="size-3" /> 참석완료
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">참석예정/미정/연락안됨/참석완료 선택 시 세미나관리 집계에 반영되고, 참석완료는 리드 이름 옆에 뱃지로 쌓입니다.</p>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Contact Info */}
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('coldCall.contactInfo')}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground shrink-0" />
                <a href={`tel:${lead.phone}`} className="text-primary hover:underline font-medium">
                  {lead.phone}
                </a>
              </div>
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.contactChannel && (
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="size-4 text-muted-foreground shrink-0" />
                  <span>{lead.contactChannel}</span>
                </div>
              )}
              {lead.region && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground shrink-0" />
                  <span>{lead.region}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Student Info */}
        <Card>
          <CardContent className="p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('coldCall.studentInfo')}</h3>
            <div className="space-y-2">
              {lead.currentSchool && (
                <div className="flex items-center gap-2 text-sm">
                  <School className="size-4 text-muted-foreground shrink-0" />
                  <span>{lead.currentSchool}</span>
                </div>
              )}
              {lead.grade && (
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="size-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{lead.grade}</span>
                </div>
              )}
              {lead.interestArea && (
                <div className="flex items-center gap-2 text-sm">
                  <Star className="size-4 text-muted-foreground shrink-0" />
                  <span>{lead.interestArea}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Source & Lead Info */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
            {t('coldCall.sourceInfo')}
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">{t('coldCall.sourceChannel')}</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <Globe className="size-3.5 text-primary" />
                {lead.sourceChannel}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{t('coldCall.leadDate')}</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <Calendar className="size-3.5 text-primary" />
                {lead.leadDate}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">{t('coldCall.assignee')}</span>
              <p className="font-medium mt-0.5">
                {lead.assignedUser?.name || t('common.unassigned')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memo */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('coldCall.memoNotes')}
            </h3>
            {!showMemoEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => {
                  setMemoEdit(lead.memo || '')
                  setShowMemoEdit(true)
                }}
              >
                {t('common.edit')}
              </Button>
            )}
          </div>
          {showMemoEdit ? (
            <div className="space-y-2">
              <Textarea
                value={memoEdit}
                onChange={(e) => setMemoEdit(e.target.value)}
                rows={3}
                className="text-sm resize-none"
                placeholder={t('coldCall.memoPlaceholder')}
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveMemo} disabled={updateLead.isPending}>
                  <Save className="size-3" /> {t('common.save')}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowMemoEdit(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lead.memo || t('common.noMemo')}
            </p>
          )}
          {lead.requiredAction && (
            <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200">
              <span className="text-xs font-medium text-amber-700">
                {t('coldCall.requiredAction')}: {lead.requiredAction}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact Log Input */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <PhoneCall className="size-4 text-primary" />
            {t('coldCall.contactLog')}
          </h3>
          <div className="space-y-3">
            {/* Contact method selector */}
            <div className="flex gap-1.5">
              {(Object.entries(CONTACT_METHODS) as [ContactMethod, ContactMethodConfig][]).map(([key, cfg]) => {
                const MethodIcon = cfg.icon
                const isActive = contactMethod === key
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant="outline"
                    className={`h-8 text-xs gap-1.5 flex-1 ${isActive ? cfg.activeColor : cfg.color}`}
                    onClick={() => {
                      setContactMethod(key)
                      setCallResult('')
                    }}
                  >
                    <MethodIcon className="size-3.5" />
                    {t(cfg.labelKey)}
                  </Button>
                )
              })}
            </div>

            {/* Result buttons (dynamic per method) */}
            <div className="flex gap-2">
              {methodConfig.results.map((res) => {
                const ResIcon = res.icon
                const isActive = callResult === res.value
                return (
                  <Button
                    key={res.value}
                    size="sm"
                    variant={isActive ? 'default' : 'outline'}
                    className={`h-8 text-xs gap-1.5 flex-1 ${isActive ? res.color : ''}`}
                    onClick={() => setCallResult(isActive ? '' : res.value)}
                  >
                    <ResIcon className="size-3.5" />
                    {t(res.labelKey)}
                  </Button>
                )
              })}
            </div>

            {/* Contact date + 1:1 상담유도 성공 toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">{t('coldCall.contactDate')}</span>
              <Input
                type="date"
                value={callDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCallDate(e.target.value || new Date().toISOString().slice(0, 10))}
                className="h-8 text-xs bg-white w-auto"
              />
              <Button
                type="button"
                size="sm"
                variant={oneOnOneSuccess ? 'default' : 'outline'}
                className={`h-8 text-xs gap-1.5 ${oneOnOneSuccess ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'text-violet-700 border-violet-200 hover:bg-violet-50'}`}
                onClick={() => setOneOnOneSuccess((v) => !v)}
              >
                <UserCheck className="size-3.5" />
                {t('coldCall.oneOnOneSuccess')}
              </Button>
            </div>

            {/* Note input */}
            <Textarea
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              rows={3}
              className="text-sm resize-none bg-white"
              placeholder={t('coldCall.callNotePlaceholder')}
            />

            <Button
              onClick={handleLogCall}
              disabled={(!callNote.trim() && !callResult) || createActivity.isPending}
              className="w-full gap-2"
            >
              {createActivity.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t('coldCall.saveContactLog')}
            </Button>

            {/* Contact-log history: accumulates right under the save button */}
            {contactLogs.length > 0 && (
              <div className="pt-2 border-t border-primary/15">
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                  {t('coldCall.contactLogHistory')} ({contactLogs.length})
                </p>
                <div className="rounded-lg bg-white/70 px-3">
                  {contactLogs.map(renderActivity)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage Actions: Advance or Exclude */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Advance to next stage */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('coldCall.stageChange')}
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 flex-1 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={() => handleAdvanceStage('consultation_scheduled')}
              >
                <CalendarCheck className="size-3.5" />
                {t('coldCall.scheduleConsultation')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 flex-1 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                onClick={() => handleAdvanceStage('first_consultation')}
              >
                <Video className="size-3.5" />
                {t('coldCall.firstConsultation')}
              </Button>
            </div>
          </div>

          <div className="border-t" />

          {/* Exclude from cold call */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('coldCall.excludeFromList')}
            </h3>

            {excludeConfirm ? (
              <div className="rounded-lg border-2 border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-sm font-medium text-red-800">
                  {t('coldCall.excludeConfirmTitle', { stage: t('stage.' + excludeConfirm) })}
                </p>
                <p className="text-xs text-red-600">
                  {t('coldCall.excludeConfirmDesc')}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleExclude(excludeConfirm)}
                    disabled={updateLead.isPending}
                  >
                    {updateLead.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                    {t('common.confirm')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setExcludeConfirm(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setExcludeConfirm('rejected')}
                >
                  <XCircle className="size-3.5" />
                  {t('stage.rejected')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 flex-1 border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => setExcludeConfirm('lost')}
                >
                  <UserX className="size-3.5" />
                  {t('stage.lost')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 flex-1 border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => setExcludeConfirm('on_hold')}
                >
                  <Pause className="size-3.5" />
                  {t('stage.on_hold')}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity History — pipeline/status changes only */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('coldCall.activityHistory')} ({statusLogs.length})
          </h3>
          {activitiesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : statusLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('coldCall.noActivities')}
            </p>
          ) : (
            <div className="space-y-2">
              {statusLogs.map(renderActivity)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
