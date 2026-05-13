import { useState, useMemo, useCallback } from 'react'
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
} from 'lucide-react'
import { useLeads, useLeadActivities, useCreateActivity, useUpdateLead } from '@/hooks/useLeads'
import type { Lead, LeadActivity, PipelineStage } from '@/types'
import { getStageConfig, GRADES } from '@/types'
import { Link } from 'react-router-dom'

// ============ Priority scoring ============

/** Grade priority: higher grades are more urgent for college admissions */
const GRADE_PRIORITY: Record<string, number> = {
  'G12': 100, '고3': 100, 'Y13': 100,
  'G11': 90, '고2': 90, 'Y12': 90,
  'G10': 75, '고1': 75, 'Y11': 75,
  'G9': 60, '중3': 60, 'Y10': 60,
  'G8': 40, '중2': 40, 'Y9': 40,
  'G7': 30, '중1': 30, 'Y8': 30,
  'Y7': 20,
  '대학생': 50,
}

/** Stages eligible for cold calling */
const COLD_CALL_STAGES: PipelineStage[] = [
  'new_lead',
  'contact_attempted',
  'no_response',
]

function getLeadPriority(lead: Lead): number {
  let score = GRADE_PRIORITY[lead.grade] || 10

  // Boost for recent leads
  const daysSince = Math.floor(
    (Date.now() - new Date(lead.leadDate).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (daysSince <= 3) score += 20
  else if (daysSince <= 7) score += 10
  else if (daysSince > 30) score -= 10

  // Stage-based adjustments
  if (lead.pipelineStage === 'new_lead') score += 15
  if (lead.pipelineStage === 'no_response') score -= 5

  return Math.max(0, Math.min(100, score))
}

function getPriorityLabel(score: number): { label: string; color: string; icon: typeof Flame } {
  if (score >= 80) return { label: '최우선', color: 'bg-red-500 text-white', icon: Flame }
  if (score >= 60) return { label: '높음', color: 'bg-orange-500 text-white', icon: Star }
  if (score >= 40) return { label: '보통', color: 'bg-yellow-500 text-white', icon: Sparkles }
  return { label: '낮음', color: 'bg-gray-400 text-white', icon: Clock }
}

// ============ Grade groups for filtering ============

const GRADE_GROUPS = [
  { label: '전체', value: 'all' },
  { label: '고등 (G10-12, 고1-3)', value: 'high' },
  { label: '중등 (G7-9, 중1-3)', value: 'middle' },
  { label: '대학생', value: 'college' },
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

// ============ Main Component ============

export function ColdCallPage() {
  const [search, setSearch] = useState('')
  const [gradeGroup, setGradeGroup] = useState('all')
  const [selectedGrade, setSelectedGrade] = useState('all')
  const [selectedSchool, setSelectedSchool] = useState('')
  const [sortBy, setSortBy] = useState<'priority' | 'date' | 'grade'>('priority')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // Fetch leads in cold-callable stages
  const { data: allLeads = [], isLoading } = useLeads()

  // Filter and score leads
  const coldCallLeads = useMemo(() => {
    let leads = allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage))

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
  }, [allLeads, gradeGroup, selectedGrade, selectedSchool, search, sortBy])

  const selectedLead = coldCallLeads.find((l) => l.id === selectedLeadId)

  // Stats
  const totalColdCallable = allLeads.filter((l) => COLD_CALL_STAGES.includes(l.pipelineStage)).length
  const highPriorityCount = coldCallLeads.filter((l) => l._priority >= 80).length
  const filteredCount = coldCallLeads.length

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden -m-6">
      {/* Left Panel: Cold Call List */}
      <div className="flex flex-col w-[460px] min-w-[400px] border-r bg-background">
        {/* Header */}
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <PhoneCall className="size-5 text-primary" />
                콜드콜
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading ? '로딩 중...' : `${filteredCount}명 / 전체 ${totalColdCallable}명`}
                {highPriorityCount > 0 && (
                  <span className="text-red-500 font-medium"> ({highPriorityCount}명 최우선)</span>
                )}
              </p>
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <ArrowUpDown className="size-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">우선순위</SelectItem>
                <SelectItem value="date">최신순</SelectItem>
                <SelectItem value="grade">학년순</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="이름, 전화번호, 학교 검색..."
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
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGrade} onValueChange={(v) => setSelectedGrade(v || 'all')}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <GraduationCap className="size-3 mr-1" />
                <SelectValue placeholder="학년" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 학년</SelectItem>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <School className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <Input
              placeholder="학교명 필터..."
              className="pl-7 h-7 text-xs"
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
            />
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
              조건에 맞는 리드가 없습니다.
            </div>
          ) : (
            coldCallLeads.map((lead) => {
              const priority = getPriorityLabel(lead._priority)
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
                          {lead.parentName} (학부모)
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
      <div className="flex-1 overflow-y-auto bg-muted/30">
        {selectedLead ? (
          <ColdCallDetail lead={selectedLead} onClose={() => setSelectedLeadId(null)} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Phone className="size-12 mb-4 opacity-30" />
            <p className="text-sm">왼쪽 목록에서 리드를 선택하세요</p>
            <p className="text-xs mt-1">리드의 상세 정보와 콜드콜 기록을 확인할 수 있습니다</p>
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
  const { data: activities = [], isLoading: activitiesLoading } = useLeadActivities(lead.id)
  const createActivity = useCreateActivity()
  const updateLead = useUpdateLead()

  const [callNote, setCallNote] = useState('')
  const [callResult, setCallResult] = useState<'connected' | 'no_answer' | 'callback' | ''>('')
  const [memoEdit, setMemoEdit] = useState(lead.memo || '')
  const [showMemoEdit, setShowMemoEdit] = useState(false)

  const priority = getPriorityLabel(lead._priority)
  const stage = getStageConfig(lead.pipelineStage)

  const handleLogCall = useCallback(() => {
    if (!callNote.trim() && !callResult) return

    const resultLabels: Record<string, string> = {
      connected: '통화 성공',
      no_answer: '부재중',
      callback: '콜백 요청',
    }

    const title = callResult ? `콜드콜 - ${resultLabels[callResult]}` : '콜드콜'
    const content = callNote.trim() || undefined

    createActivity.mutate(
      {
        leadId: lead.id,
        activityType: 'call',
        title,
        content,
        metadata: callResult ? { callResult } : undefined,
      },
      {
        onSuccess: () => {
          setCallNote('')
          setCallResult('')

          // Auto-advance stage if new_lead
          if (lead.pipelineStage === 'new_lead') {
            const newStage: PipelineStage =
              callResult === 'no_answer' ? 'no_response' : 'contact_attempted'
            updateLead.mutate({
              id: lead.id,
              data: { pipelineStage: newStage },
              previousStage: lead.pipelineStage,
            })
          }
        },
      },
    )
  }, [callNote, callResult, lead, createActivity, updateLead])

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
              우선순위 {lead._priority}점
            </Badge>
          </div>
          {lead.studentName && (
            <p className="text-sm text-muted-foreground">{lead.parentName} (학부모)</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/sales/leads/${lead.id}`}>
            <Button variant="outline" size="sm" className="text-xs gap-1">
              상세 페이지 <ChevronRight className="size-3" />
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
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">연락처</h3>
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
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">학생 정보</h3>
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
            유입 정보
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">유입 경로</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <Globe className="size-3.5 text-primary" />
                {lead.sourceChannel}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">유입일</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <Calendar className="size-3.5 text-primary" />
                {lead.leadDate}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">담당자</span>
              <p className="font-medium mt-0.5">
                {lead.assignedUser?.name || '미배정'}
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
              메모 / 특이사항
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
                수정
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
                placeholder="메모를 입력하세요..."
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveMemo} disabled={updateLead.isPending}>
                  <Save className="size-3" /> 저장
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowMemoEdit(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lead.memo || '메모 없음'}
            </p>
          )}
          {lead.requiredAction && (
            <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200">
              <span className="text-xs font-medium text-amber-700">
                필요 조치: {lead.requiredAction}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Log Input */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <PhoneCall className="size-4 text-primary" />
            콜드콜 기록
          </h3>
          <div className="space-y-3">
            {/* Call result buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={callResult === 'connected' ? 'default' : 'outline'}
                className={`h-8 text-xs gap-1.5 flex-1 ${
                  callResult === 'connected' ? 'bg-emerald-500 hover:bg-emerald-600' : ''
                }`}
                onClick={() => setCallResult(callResult === 'connected' ? '' : 'connected')}
              >
                <PhoneCall className="size-3.5" /> 통화 성공
              </Button>
              <Button
                size="sm"
                variant={callResult === 'no_answer' ? 'default' : 'outline'}
                className={`h-8 text-xs gap-1.5 flex-1 ${
                  callResult === 'no_answer' ? 'bg-red-500 hover:bg-red-600' : ''
                }`}
                onClick={() => setCallResult(callResult === 'no_answer' ? '' : 'no_answer')}
              >
                <PhoneOff className="size-3.5" /> 부재중
              </Button>
              <Button
                size="sm"
                variant={callResult === 'callback' ? 'default' : 'outline'}
                className={`h-8 text-xs gap-1.5 flex-1 ${
                  callResult === 'callback' ? 'bg-blue-500 hover:bg-blue-600' : ''
                }`}
                onClick={() => setCallResult(callResult === 'callback' ? '' : 'callback')}
              >
                <Phone className="size-3.5" /> 콜백 요청
              </Button>
            </div>

            {/* Note input */}
            <Textarea
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              rows={3}
              className="text-sm resize-none bg-white"
              placeholder="통화 내용을 기록하세요... (관심사, 질문, 특이사항 등)"
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
              콜 기록 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Activity History */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            활동 기록 ({activities.length})
          </h3>
          {activitiesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              아직 활동 기록이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((a: LeadActivity) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2.5 py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="mt-0.5">
                    {a.activityType === 'call' ? (
                      <Phone className="size-3.5 text-green-500" />
                    ) : a.activityType === 'consultation' ? (
                      <Video className="size-3.5 text-blue-500" />
                    ) : a.activityType === 'stage_change' ? (
                      <CheckCircle2 className="size-3.5 text-purple-500" />
                    ) : (
                      <Clock className="size-3.5 text-gray-400" />
                    )}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
