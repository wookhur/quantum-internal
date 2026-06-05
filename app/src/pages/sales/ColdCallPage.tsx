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
  Flame,
  Sparkles,
  Send,
  Video,
  Save,
  Globe,
  XCircle,
  UserX,
  Pause,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react'
import { useLeads, useLeadActivities, useCreateActivity, useUpdateLead } from '@/hooks/useLeads'
import { useEvents } from '@/hooks/useEvents'
import { useAuth } from '@/contexts/AuthContext'
import type { Lead, LeadActivity, PipelineStage } from '@/types'
import { getStageConfig, GRADES } from '@/types'
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

function getPriorityLabel(score: number, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string; icon: typeof Flame } {
  if (score >= 80) return { label: t('coldCall.rank1'), color: 'bg-red-500 text-white', icon: Flame }
  if (score >= 60) return { label: t('coldCall.rank2'), color: 'bg-orange-500 text-white', icon: Star }
  if (score >= 40) return { label: t('coldCall.rank3'), color: 'bg-yellow-500 text-white', icon: Sparkles }
  return { label: t('coldCall.rank4'), color: 'bg-gray-400 text-white', icon: Clock }
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

export function ColdCallPage() {
  const t = useT()
  const [search, setSearch] = useState('')
  const [gradeGroup, setGradeGroup] = useState('all')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [selectedSchool, setSelectedSchool] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('all')
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'grade'>('priority')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // Fetch leads in cold-callable stages
  const { data: allLeads = [], isLoading } = useLeads()
  // Fetch events for filter
  const { data: events = [] } = useEvents()

  // Build event filter options: only specific seminar/webinar events from events table
  // Generic names like just "세미나" are excluded. Matching is exact on source_channel.
  const eventFilterOptions = useMemo(() => {
    const options: { label: string; value: string }[] = []
    const seen = new Set<string>()
    const GENERIC_NAMES = new Set(['세미나', '웨비나', '세미나 참석', '웨비나 참석'])

    for (const e of events) {
      const name = e.eventName
      if (!seen.has(name) && !GENERIC_NAMES.has(name) && (name.includes('세미나') || name.includes('웨비나'))) {
        seen.add(name)
        const dateStr = e.eventDate ? `${parseInt(e.eventDate.slice(5,7))}/${parseInt(e.eventDate.slice(8,10))}` : ''
        options.push({ label: dateStr ? `${dateStr} ${name}` : name, value: name })
      }
    }
    return options
  }, [events])

  // Filter and score leads
  const coldCallLeads = useMemo(() => {
    let leads = allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage))

    // Event filter — exact match on source_channel only
    if (selectedEvent !== 'all') {
      leads = leads.filter((l) => l.sourceChannel === selectedEvent)
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

    // Score and sort
    const scored = leads.map((l) => ({ ...l, _priority: getLeadPriority(l) }))

    if (sortBy === 'priority') {
      scored.sort((a, b) => b._priority - a._priority)
    } else if (sortBy === 'date') {
      scored.sort((a, b) => new Date(b.leadDate).getTime() - new Date(a.leadDate).getTime())
    } else if (sortBy === 'grade') {
      scored.sort((a, b) => (GRADE_PRIORITY[b.grade] || 0) - (GRADE_PRIORITY[a.grade] || 0))
    }

    return scored
  }, [allLeads, gradeGroup, selectedGrade, selectedSchool, selectedEvent, search, sortBy])

  const selectedLead = coldCallLeads.find((l) => l.id === selectedLeadId)

  // Stats
  const totalColdCallable = allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage)).length
  const highPriorityCount = coldCallLeads.filter((l) => l._priority >= 80).length
  const filteredCount = coldCallLeads.length

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-3.5rem)] overflow-hidden -m-3 md:-m-6">
      {/* Left Panel: Cold Call List */}
      <div className="flex flex-col w-full md:w-[460px] md:min-w-[340px] border-b md:border-b-0 md:border-r bg-background max-h-[45vh] md:max-h-none">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <PhoneCall className="size-5 text-primary" />
                {t('coldCall.title')}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading ? t('common.loading') : t('coldCall.countSummary', { filtered: filteredCount, total: totalColdCallable })}
                {highPriorityCount > 0 && (
                  <span className="text-red-500 font-medium"> ({t('coldCall.highPriorityCount', { n: highPriorityCount })})</span>
                )}
              </p>
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <ArrowUpDown className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">{t('coldCall.sortPriority')}</SelectItem>
                <SelectItem value="date">{t('coldCall.sortDate')}</SelectItem>
                <SelectItem value="grade">{t('coldCall.sortGrade')}</SelectItem>
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
            <Select value={selectedEvent} onValueChange={(v) => setSelectedEvent(v || 'all')}>
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
              const priority = getPriorityLabel(lead._priority, t)
              const PriorityIcon = priority.icon
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
                        <Badge
                          variant="secondary"
                          className={`${priority.color} text-[10px] px-1.5 py-0 h-4 shrink-0`}
                        >
                          <PriorityIcon className="size-2.5 mr-0.5" />
                          {priority.label}
                        </Badge>
                      </div>
                      {lead.studentName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {lead.parentName} ({t('coldCall.parent')})
                        </p>
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

      {/* Right Panel: Lead Detail */}
      <div className="flex-1 overflow-y-auto bg-muted/30 min-w-0">
        {selectedLead ? (
          <ColdCallDetail lead={selectedLead} onClose={() => setSelectedLeadId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Phone className="size-12 mb-4 opacity-30" />
            <p className="text-sm">{t('coldCall.selectLead')}</p>
            <p className="text-xs mt-1">{t('coldCall.selectLeadDesc')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ Detail Panel ============

function ColdCallDetail({
  lead,
  onClose,
}: {
  lead: Lead & { _priority: number }
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const { data: activities = [], isLoading: activitiesLoading } = useLeadActivities(lead.id)
  const createActivity = useCreateActivity()
  const updateLead = useUpdateLead()

  const [callNote, setCallNote] = useState('')
  const [contactMethod, setContactMethod] = useState<ContactMethod>('call')
  const [callResult, setCallResult] = useState<string>('')
  const [memoEdit, setMemoEdit] = useState(lead.memo || '')
  const [showMemoEdit, setShowMemoEdit] = useState(false)
  const [excludeConfirm, setExcludeConfirm] = useState<PipelineStage | null>(null)

  const methodConfig = CONTACT_METHODS[contactMethod]

  const priority = getPriorityLabel(lead._priority, t)
  const stage = getStageConfig(lead.pipelineStage)

  const handleLogCall = useCallback(() => {
    if (!callNote.trim() && !callResult) return

    // Build result label from config
    const resultDef = methodConfig.results.find(r => r.value === callResult)
    const resultLabel = resultDef ? t(resultDef.labelKey) : ''
    const methodLabel = t(methodConfig.labelKey)

    const title = callResult ? `${methodLabel} - ${resultLabel}` : methodLabel
    const content = callNote.trim() || undefined

    createActivity.mutate(
      {
        leadId: lead.id,
        activityType: contactMethod,
        title,
        content,
        metadata: callResult ? { callResult, contactMethod } : { contactMethod },
      },
      {
        onSuccess: () => {
          setCallNote('')
          setCallResult('')

          // Build update payload
          const updateData: Record<string, unknown> = {}

          // Auto-advance stage if new_lead
          if (lead.pipelineStage === 'new_lead') {
            const noResponse = callResult === 'no_answer' || callResult === 'no_reply'
            updateData.pipelineStage = noResponse ? 'no_response' : 'contact_attempted'
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
  }, [callNote, callResult, contactMethod, methodConfig, lead, createActivity, updateLead, user, t])

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
            <Badge className={`${priority.color} text-xs`}>
              {t('coldCall.priorityScore', { score: lead._priority })}
            </Badge>
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

      {/* Activity History */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('coldCall.activityHistory')} ({activities.length})
          </h3>
          {activitiesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('coldCall.noActivities')}
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((a: LeadActivity) => {
                const actIcon = getActivityIcon(a.activityType)
                const ActIcon = actIcon.icon
                return (
                <div
                  key={a.id}
                  className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="mt-0.5">
                    <ActIcon className={`size-3.5 ${actIcon.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
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
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
