import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Search, Plus, Pencil, Trash2, GraduationCap, Phone, Mail, User as UserIcon,
  CalendarDays, FileText, NotebookPen, Link2, Copy, Check, ExternalLink, Power,
  Sparkles, Loader2, ChevronDown, ChevronUp, Hourglass, AlertTriangle, Star, BookOpen,
  Lock, Unlock, MessageSquare, Send, Flag,
  PenTool, BookText, FolderArchive,
} from 'lucide-react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/date'
import { contractYearOf, DEFAULT_ANNUAL_MEETING_TARGET } from '@/lib/meetingProgress'
import {
  useMentors, useStudentCoaching, useUpsertCoaching, useDeleteCoaching,
  useMentorSessions, useAddMentorSession, useDeleteMentorSession, useAllMentorAssignments,
  majorTierAmount, majorTierLabel, COACHING_MONTHLY,
  type StudentCoaching, type Mentor,
} from '@/hooks/useMentors'
import { studentPickerLabel, compareStudentsKo } from '@/lib/studentDisplay'
import { MAJOR_TRACKS, MAJOR_TRACK_LABEL, majorsForTrack, OTHER_MAJOR, gradeBucket } from '@/lib/majorTaxonomy'
import {
  useEditorMeetings, useCreateEditorMeeting, useUpdateEditorMeeting, useDeleteEditorMeeting,
  type EditorMeeting,
} from '@/hooks/useEditorMeetings'
import {
  useServiceStudents, useCreateServiceStudent, useUpdateServiceStudent, useDeleteServiceStudent,
  useServiceMeetings, useCreateServiceMeeting, useUpdateServiceMeeting, useDeleteServiceMeeting,
  useServiceDiary, useCreateServiceDiary, useUpdateServiceDiary, useDeleteServiceDiary,
  useHeldMeetingsByStudent,
} from '@/hooks/useServiceStudents'
import {
  useServiceReports, useCreateServiceReport, useDeleteServiceReport,
} from '@/hooks/useServiceReports'
import {
  useServiceFollowups, useCreateFollowup, useBulkCreateFollowups,
  useToggleFollowup, useUpdateFollowup, useDeleteFollowup, splitFollowupText,
} from '@/hooks/useServiceFollowups'
import {
  usePortalTokens, useCreatePortalToken, useTogglePortalToken, useDeletePortalToken,
} from '@/hooks/usePortalTokens'
import {
  useECActivities, useCreateECActivity, useUpdateECActivity, useDeleteECActivity,
  useAllECPartners,
  type ECActivity,
} from '@/hooks/useECActivities'
import {
  useEssayPlans, useCreateEssayPlan, useUpdateEssayPlan, useDeleteEssayPlan,
  essayEndMonth, essayMonthCount, type EssayPlan,
} from '@/hooks/useEssayPlans'
import { useContracts } from '@/hooks/useContracts'
import {
  useStudentApplications, useUpsertStudentApplication, useDeleteStudentApplication,
  APPLICATION_STATUSES, APPLICATION_TYPES, type StudentApplication,
} from '@/hooks/useStudentApplications'
import type { Contract } from '@/types'
import {
  useAcademicSupport, useCreateAcademicSupport, useUpdateAcademicSupport, useDeleteAcademicSupport,
  type AcademicSupportItem,
} from '@/hooks/useAcademicSupport'
import {
  useIssueReports, useCreateIssueReport, useUpdateIssueReport, useDeleteIssueReport,
  useCreateIssueComment, useDeleteIssueComment, type IssueReport,
} from '@/hooks/useIssueReports'
import type {
  ServiceStudent, ServiceMeeting, ServiceReportStatus, ServiceDiaryEntry,
  ServiceReportCategory,
} from '@/types'
import { formatCurrency } from '@/types'
import { useProfiles, canAccessAccount } from '@/hooks/useProfiles'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'

// Consultant pool + helpers (shared with KPI page)
import { useConsultantPool, useConsultantName, consultantNameKey } from '@/lib/consultants'
import { kpiDotColor, KPI_TIERS } from '@/lib/kpi'
import { useStudentKpis, KPI_MAX } from '@/hooks/useConsultantKpis'
import { useStudentStatusFlags } from '@/hooks/useServiceDashboard'

const COMM_PLATFORMS = ['KakaoTalk', 'WhatsApp', 'WeChat', 'Email', 'Etc'] as const

const MEETING_TYPES = ['1st', '2nd', '3rd', '4th', '5th', 'Regular', 'Complain'] as const

const WEEK_PATTERNS = [
  { value: '1/3', label: '1/3주차' },
  { value: '2/4', label: '2/4주차' },
] as const

const DAYS_OF_WEEK = ['월', '화', '수', '목', '금', '토', '일'] as const

const TIME_OPTIONS = Array.from({ length: 144 }, (_, i) => {
  const h = Math.floor(i / 6)
  const m = (i % 6) * 10
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

function formatRegularSchedule(schedule?: string): string | undefined {
  if (!schedule) return undefined
  const [week, day, time] = schedule.split('|')
  if (!week || !day) return schedule
  return `${week}주차 ${day}요일${time ? ' ' + time : ''}`
}

// ── EC Service constants ──
import { EC_PARTNERS } from '@/lib/ecPartners'

const EC_SALES_PRESETS = [
  'Aidan Lee', 'Cindy', 'Eva', 'Jisoo', 'Maryam', 'Sam', 'Wook', '김지현', '남연서',
] as const

const ACADEMY_PRESETS = [
  '숨마스프렙', '와이즈조인', '이준형코치',  // Korean (alphabetical)
  'CRI', 'IVYPenn Edu', 'Prime', 'tutor Ava', // English (alphabetical)
] as const

const SEASON_OPTIONS = ['방학', '학기중'] as const
const SERVICE_MONTH_OPTIONS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '여름특강', '겨울특강'] as const

/** Student statuses. finished/canceled = archived (hidden from active list). */
const STUDENT_STATUS_OPTIONS = [
  { value: 'active', labelKey: 'student360.statusActive' },
  { value: 'finished', labelKey: 'student360.statusFinished' },
  { value: 'canceled', labelKey: 'student360.statusCanceled' },
] as const

/** 상태값 표기 편차(active/Active/진행중, finished/완료, canceled/취소 …)를 표준값으로 정규화.
 *  → 언어설정에 따라 진행중/Active 처럼 일관되게 표시되도록 한다. */
export function normalizeStatus(status?: string): string {
  const s = (status || '').trim().toLowerCase()
  if (!s) return ''
  if (['active', '진행중', '진행 중', 'in progress', 'ongoing'].includes(s)) return 'active'
  if (['finished', 'done', 'completed', 'complete', '완료', '서비스 완료', '종료'].includes(s)) return 'finished'
  if (['canceled', 'cancelled', '취소', '서비스 취소', '해지'].includes(s)) return 'canceled'
  return s
}

export function isArchivedStatus(status?: string): boolean {
  const s = normalizeStatus(status)
  return s === 'finished' || s === 'canceled'
}

function statusLabelFor(t: (k: string) => string, status?: string): string {
  const o = STUDENT_STATUS_OPTIONS.find(x => x.value === normalizeStatus(status))
  return o ? t(o.labelKey) : (status || '')
}

function ecSalesSelectVal(stored?: string) {
  if (!stored) return ''
  return (EC_SALES_PRESETS as readonly string[]).includes(stored) ? stored : '직접입력'
}
function ecSalesCustomVal(stored?: string) {
  if (!stored) return ''
  return (EC_SALES_PRESETS as readonly string[]).includes(stored) ? '' : stored
}
function ecSalesFinal(select: string, custom: string): string | undefined {
  if (!select) return undefined
  return select === '직접입력' ? (custom.trim() || undefined) : select
}

const ESSAY_EDITORS = ['Danny Kim', 'Soomee Park', '한상범+양은영'] as const

// KPI dot color legend, expressed as % of KPI_MAX so it always matches kpiDotColor().
const KPI_LEGEND = [
  { color: 'bg-emerald-500', label: `≥${Math.round((KPI_TIERS.green / KPI_MAX) * 100)}%` },
  { color: 'bg-yellow-400', label: `≥${Math.round((KPI_TIERS.yellow / KPI_MAX) * 100)}%` },
  { color: 'bg-red-500', label: `≥${Math.round((KPI_TIERS.red / KPI_MAX) * 100)}%` },
  { color: 'bg-black', label: `<${Math.round((KPI_TIERS.red / KPI_MAX) * 100)}%` },
]

/** Tooltip text for the hourglass: lists which meetings are missing a summary report. */
function missingReportTitle(items: { date?: string; type?: string }[] | undefined, header: string): string {
  if (!items || items.length === 0) return header
  const lines = items
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(it => {
      const d = it.date ? `${Number(it.date.slice(5, 7))}/${Number(it.date.slice(8, 10))}` : '날짜미상'
      const elapsed = it.date ? Math.max(0, Math.floor((Date.now() - new Date(`${it.date}T00:00:00`).getTime()) / 86400000)) : null
      const ago = elapsed != null ? ` — ${elapsed}일 경과` : ''
      return `· ${d}${it.type ? ` ${it.type}` : ''}${ago}`
    })
  return `${header} (${items.length})\n${lines.join('\n')}`
}

function reportSaveError(e: unknown) {
  const msg = (e as { message?: string })?.message || String(e)
  // Surface the real reason instead of failing silently.
  alert(`저장 실패 / Save failed:\n${msg}`)
}

const REPORT_META: Record<ServiceReportStatus, { labelKey: string; className: string }> = {
  none: { labelKey: 'student360.reportNone', className: 'bg-gray-100 text-gray-600' },
  pending: { labelKey: 'student360.reportPending', className: 'bg-amber-100 text-amber-700' },
  submitted: { labelKey: 'student360.reportSubmitted', className: 'bg-emerald-100 text-emerald-700' },
}

// Meeting-diary columns (from the original Meeting Diary sheet)
// 미팅다이어리 6개 섹션 (자동생성·편집·표시 공통 구조)
//  1 Meeting Summary · 2 QnA · 3 Concerns · 4 Assignments · 5 Follow-up Commitments · 6 Next Meeting Agenda
const DIARY_FIELDS = [
  { key: 'meetingSummary', label: 'Meeting Summary' },
  { key: 'questionsConcerns', label: 'QnA' },
  { key: 'criticalIssue', label: 'Concerns' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'followUpCommitments', label: 'Follow-up Commitments' },
  { key: 'nextMeetingAgenda', label: 'Next Meeting Agenda' },
] as const satisfies ReadonlyArray<{ key: keyof ServiceDiaryEntry; label: string }>

export function Student360Page() {
  const t = useT()
  const { user } = useAuth()
  const canEdit = useCanEdit(useLocation().pathname)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [consultantFilter, setConsultantFilter] = useState('')
  const [essayEditorFilter, setEssayEditorFilter] = useState('all')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [ecPartnerFilter, setEcPartnerFilter] = useState('all')
  const [showArchive, setShowArchive] = useState(false)
  const [pausedOnly, setPausedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('student'))

  // Keep ?student= in the URL in sync so links from the KPI page (and back/forward) work.
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (selectedId) next.set('student', selectedId)
      else next.delete('student')
      return next
    }, { replace: true })
  }, [selectedId, setSearchParams])

  // Reverse sync: when the URL's ?student= changes (e.g. a notification's "자세히 보기"
  // navigates here while the page is already mounted), open that student's card.
  const studentParam = searchParams.get('student')
  useEffect(() => {
    if (studentParam && studentParam !== selectedId) setSelectedId(studentParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentParam])

  const { data: students = [], isLoading } = useServiceStudents()

  // ── Mentor 계정 게이팅: 멘토관리에 등록된 사람(이메일 매칭)은 Mentor Support 섹션만, 배정된 학생만 열람 ──
  const { data: gateMentors = [] } = useMentors()
  const { data: gateAssignments = [] } = useAllMentorAssignments()
  const mentorUser = useMemo(() => {
    const email = (user?.email || '').trim().toLowerCase()
    if (!email) return null
    return gateMentors.find(m => (m.email || '').trim().toLowerCase() === email) || null
  }, [gateMentors, user?.email])
  const isPrivileged = user?.role === 'admin' || user?.role === 'c_level' || user?.role === 'account'
  const isMentorOnly = !!mentorUser && !isPrivileged
  const mentorStudentIds = useMemo(() => {
    if (!isMentorOnly || !mentorUser) return null
    return new Set(gateAssignments.filter(a => a.mentorId === mentorUser.id).map(a => a.studentId))
  }, [isMentorOnly, mentorUser, gateAssignments])
  const { data: studentKpis = {} } = useStudentKpis()
  const statusFlags = useStudentStatusFlags()
  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  const { data: heldByStudent } = useHeldMeetingsByStudent()

  // 학생 카드용: 현재 연차에 완료된 미팅 수 / 목표(기본 24)
  const meetingProgressFor = (s: ServiceStudent) => {
    const target = s.contractDetails?.annualMeetingTarget || DEFAULT_ANNUAL_MEETING_TARGET
    const arr = heldByStudent?.get(s.id) || []
    const cy = contractYearOf(s.startDate, todayKST())
    const completed = arr.filter(m => contractYearOf(s.startDate, m.date) === cy).length
    return { completed, target }
  }

  // Consultants who actually have at least one student (for the filter dropdown).
  // Match by NAME so legacy slug IDs (e.g. 'yeonse') and live profile UUIDs
  // referring to the same person both count as "in use".
  const activeConsultants = useMemo(() => {
    const usedNames = new Set(
      students
        .map(s => s.assignedConsultant)
        .filter((id): id is string => !!id)
        .map(id => consultantName(id))
    )
    return consultantPool.filter(c => usedNames.has(c.name))
  }, [students, consultantPool, consultantName])

  // Selected filter resolves to a canonical name so a pick of 남연서 (live UUID)
  // also matches legacy 'yeonse' rows and vice versa.
  // 실제 배정된 에세이 에디터 목록(필터 드롭다운용)
  const activeEditors = useMemo(() => {
    const set = new Set<string>()
    for (const s of students) if (s.essayEditor) set.add(s.essayEditor)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [students])

  // EC 파트너 필터: 전체 학생의 신청 파트너사 → studentId별 집합 + 옵션 목록 (EC 추가의 Partner 목록과 동일)
  const { data: ecPartners = [] } = useAllECPartners()
  const ecPartnersByStudent = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const r of ecPartners) {
      if (!m.has(r.studentId)) m.set(r.studentId, new Set())
      m.get(r.studentId)!.add(r.partner)
    }
    return m
  }, [ecPartners])
  const ecPartnerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of ecPartners) set.add(r.partner)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [ecPartners])

  const filterName = consultantFilter ? consultantName(consultantFilter) : ''

  // Archived = 서비스 완료(finished) / 서비스 취소(canceled). Archived students keep
  // all their data but are hidden from the active list; the 아카이브 tab shows them.
  // 공통 필터(담당자·에세이에디터·학년·검색·멘토·일시중지) — 활성/아카이브 토글만 제외.
  // 탭 카운트와 목록이 항상 같은 기준을 쓰도록 여기서 한 번만 거른다.
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (mentorStudentIds && !mentorStudentIds.has(s.id)) return false
      if (pausedOnly && !s.paused) return false
      if (filterName && consultantName(s.assignedConsultant) !== filterName) return false
      if (essayEditorFilter !== 'all' && (s.essayEditor || '') !== essayEditorFilter) return false
      if (gradeFilter !== 'all' && gradeBucket(s.grade) !== gradeFilter) return false
      if (ecPartnerFilter !== 'all' && !(ecPartnersByStudent.get(s.id)?.has(ecPartnerFilter))) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.koreanName || '').toLowerCase().includes(q) ||
        (s.school || '').toLowerCase().includes(q) ||
        (s.parentName || '').toLowerCase().includes(q)
      )
    })
  }, [students, search, filterName, consultantName, gradeFilter, essayEditorFilter, ecPartnerFilter, ecPartnersByStudent, pausedOnly, mentorStudentIds])
  const archiveCount = useMemo(() => baseFiltered.filter(s => isArchivedStatus(s.status)).length, [baseFiltered])
  const activeCount = baseFiltered.length - archiveCount

  // 학년 필터 옵션: 실제 학생들의 학년을 G12→G6→기타 순으로
  const gradeOptions = useMemo(() => {
    const present = new Set(students.filter(s => !isArchivedStatus(s.status)).map(s => gradeBucket(s.grade)))
    return ['G12', 'G11', 'G10', 'G9', 'G8', 'G7', 'G6', '기타'].filter(g => present.has(g))
  }, [students])

  const pausedCount = useMemo(() => students.filter(s => s.paused && !isArchivedStatus(s.status)).length, [students])
  const filtered = useMemo(() =>
    baseFiltered
      .filter(s => showArchive ? isArchivedStatus(s.status) : !isArchivedStatus(s.status))
      .sort(compareStudentsKo),
    [baseFiltered, showArchive],
  )

  const selected = students.find(s => s.id === selectedId) || null

  // 계약관리 연동: 학생 이름으로 매칭(취소 아님 우선, 계약일 최신) → 계약유형·원서지원수·계약서 자동 표시
  const { data: allContractsForLink = [] } = useContracts()
  const linkedContract = useMemo(() => {
    if (!selected) return undefined
    const norm = (v?: string) => (v || '').replace(/\s+/g, '').toLowerCase()
    const nm = norm(selected.name)
    const kn = norm(selected.koreanName)
    // 정확 일치(공백/대소문자 무시) + 합쳐진 형태("김은서 Amy Kim") 대응
    const forms = new Set([nm, kn, nm + kn, kn + nm].filter(Boolean))
    const cands = allContractsForLink.filter(c => {
      const sn = norm(c.studentName)
      if (!sn) return false
      if (forms.has(sn)) return true
      // 계약 학생명이 학생의 (한글/영문) 전체 이름을 포함하면 매칭
      if (kn && kn.length >= 2 && sn.includes(kn)) return true
      if (nm && nm.length >= 3 && sn.includes(nm)) return true
      return false
    })
    if (cands.length === 0) return undefined
    return [...cands].sort((a, b) => {
      const ac = a.status === 'cancelled' ? 1 : 0
      const bc = b.status === 'cancelled' ? 1 : 0
      if (ac !== bc) return ac - bc
      return (b.contractDate || '').localeCompare(a.contractDate || '')
    })[0]
  }, [selected, allContractsForLink])
  const statusLabel = (status?: string) => {
    const o = STUDENT_STATUS_OPTIONS.find(x => x.value === normalizeStatus(status))
    return o ? t(o.labelKey) : (status || '')
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-3.5rem)] -m-3 md:-m-6 p-3 md:p-6">
      {/* ── Student list ── */}
      <div className="lg:w-80 shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">
            {t('nav.student360')}{' '}
            <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </h1>
          {canEdit && (
            <StudentDialog
              trigger={<Button size="sm"><Plus className="size-4 mr-1" />{t('student360.newStudent')}</Button>}
              onSaved={(s) => setSelectedId(s.id)}
              createdBy={user?.id}
              canEdit={canEdit}
            />
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('student360.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Select
            value={consultantFilter || '__all__'}
            onValueChange={v => setConsultantFilter(v === '__all__' ? '' : (v ?? ''))}
          >
            <SelectTrigger className="w-full">
              <span className="truncate">
                {consultantFilter ? consultantName(consultantFilter) : t('student360.allConsultants')}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('student360.allConsultants')}</SelectItem>
              {activeConsultants.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={essayEditorFilter} onValueChange={v => setEssayEditorFilter(v ?? 'all')}>
            <SelectTrigger className="w-full">
              <span className="truncate">{essayEditorFilter === 'all' ? '전체 에세이에디터' : essayEditorFilter}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 에세이에디터</SelectItem>
              {activeEditors.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={gradeFilter} onValueChange={v => setGradeFilter(v ?? 'all')}>
            <SelectTrigger className="w-full">
              <span className="truncate">{gradeFilter === 'all' ? t('student360.allGrades') : gradeFilter}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('student360.allGrades')}</SelectItem>
              {gradeOptions.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ecPartnerFilter} onValueChange={v => setEcPartnerFilter(v ?? 'all')}>
            <SelectTrigger className="w-full">
              <span className="truncate">{ecPartnerFilter === 'all' ? '전체 EC 파트너' : ecPartnerFilter}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 EC 파트너</SelectItem>
              {ecPartnerOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Active / Archive toggle */}
        <div className="mb-2 flex rounded-md border overflow-hidden text-xs">
          <button
            onClick={() => { setShowArchive(false); setSelectedId(null) }}
            className={`flex-1 py-1.5 font-medium transition-colors ${!showArchive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('student360.activeTab')} ({activeCount})
          </button>
          <button
            onClick={() => { setShowArchive(true); setSelectedId(null) }}
            className={`flex-1 py-1.5 font-medium border-l transition-colors ${showArchive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t('student360.archiveTab')} ({archiveCount})
          </button>
        </div>
        {!showArchive && pausedCount > 0 && (
          <button
            onClick={() => setPausedOnly(v => !v)}
            className={`mb-2 w-full py-1.5 rounded-md border text-xs font-medium transition-colors ${pausedOnly ? 'bg-amber-500 border-amber-500 text-white' : 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
          >
            💤 {t('student360.onLeaveOnly')} ({pausedCount}){pausedOnly ? ' ✕' : ''}
          </button>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
          <span className="font-medium">KPI</span>
          {KPI_LEGEND.map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`inline-block size-2 rounded-full ${l.color}`} />{l.label}
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {isLoading && <p className="text-sm text-muted-foreground px-1">{t('common.loading')}</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">{t('student360.noStudents')}</p>
          )}
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                s.id === selectedId ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-sm truncate">
                    {studentPickerLabel(s)}
                  </span>
                  {s.paused && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 bg-amber-50 text-amber-700 border-amber-200">💤 {t('student360.onLeave')}</Badge>
                  )}
                  {statusFlags.missingReports.has(s.id) && (
                    <span title={missingReportTitle(statusFlags.missingReportDetails.get(s.id), t('student360.missingReportTooltip'))}>
                      <Hourglass className="size-3.5 text-red-500 shrink-0" />
                    </span>
                  )}
                  {statusFlags.pendingFollowups.has(s.id) && (
                    <span title={t('student360.pendingFollowupTooltip')}>
                      <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
                    </span>
                  )}
                  {s.assignedConsultant && (
                    <span className="text-xs text-muted-foreground/70 truncate">
                      {consultantName(s.assignedConsultant)}
                    </span>
                  )}
                  <span
                    className={`inline-block size-2 rounded-full shrink-0 ${kpiDotColor(studentKpis[s.id]?.score)}`}
                    title={studentKpis[s.id]
                      ? `KPI ${studentKpis[s.id].score.toFixed(1)}/${KPI_MAX} (${Math.round((studentKpis[s.id].score / KPI_MAX) * 100)}%)`
                      : 'KPI —'}
                  />
                </div>
                {s.status && (
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${isArchivedStatus(s.status) ? (normalizeStatus(s.status) === 'canceled' ? 'text-red-600 border-red-200' : 'text-gray-500 border-gray-300') : ''}`}>{statusLabel(s.status)}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {[s.school, s.grade].filter(Boolean).join(' · ') || '—'}
              </div>
              {(() => {
                const { completed, target } = meetingProgressFor(s)
                return (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <MeetingProgressBar completed={completed} target={target} />
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{completed}/{target}</span>
                  </div>
                )
              })()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {t('student360.selectHint')}
          </div>
        ) : (
          isMentorOnly ? (
          // 멘토 계정: 개인정보·컨설팅 내용 비공개 — Mentor Support 섹션만 노출
          <div className="space-y-4">
            <CoachingSection studentId={selected.id} createdBy={user?.id} canEdit={false} restrictMentorId={mentorUser?.id} />
          </div>
          ) : (
          <div className="space-y-4">
            <ProfileSection student={selected} linkedContract={linkedContract} onDeleted={() => setSelectedId(null)} createdBy={user?.id} canEdit={canEdit} />
            <EssayServiceSection studentId={selected.id} applicationCount={linkedContract?.applicationCount ?? selected.applicationCount} defaultConsultant={consultantName(selected.assignedConsultant)} createdBy={user?.id} canEdit={canEdit} locked={!!selected.essayLocked} />
            <ECServicesSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
            <AcademicSupportSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
            <CoachingSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
            <PortalLinksSection studentId={selected.id} studentName={selected.name} createdBy={user?.id} canEdit={canEdit} />
            <IssueReportSection studentId={selected.id} studentName={selected.name} userId={user?.id} userName={user?.name} isAdmin={user?.role === 'admin' || user?.role === 'c_level'} canEdit={canEdit} />
            <MeetingsSection student={selected} createdBy={user?.id} authorName={user?.name} canEdit={canEdit} />
            <DiarySection studentId={selected.id} authorName={user?.name} createdBy={user?.id} canEdit={canEdit} />
            <EditorMeetingsSection studentId={selected.id} createdBy={user?.id} defaultEditor={selected.essayEditor} canEdit={canEdit} />
            <ArchiveSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
          </div>
          )
        )}
      </div>
    </div>
  )
}

// ───────────────────── Meeting progress (미팅 진행률) ─────────────────────

interface MeetingYearGroup {
  year: number
  meetings: ServiceMeeting[]   // 해당 연차의 모든 미팅(상태 무관), 최신순
  completed: number            // 완료(held) 미팅 수
  target: number
  isCurrent: boolean
}

/** 계약 시작일 기준으로 미팅을 연차별로 묶고, 연차별 완료 수를 집계한다. */
function groupMeetingsByYear(
  student: ServiceStudent,
  meetings: ServiceMeeting[],
  todayISO: string,
): { years: MeetingYearGroup[]; currentYear: number; target: number } {
  const target = student.contractDetails?.annualMeetingTarget || DEFAULT_ANNUAL_MEETING_TARGET
  const start = student.startDate
  const currentYear = contractYearOf(start, todayISO)
  const map = new Map<number, ServiceMeeting[]>()
  for (const m of meetings) {
    const y = contractYearOf(start, m.meetingDate || m.createdAt)
    if (!map.has(y)) map.set(y, [])
    map.get(y)!.push(m)
  }
  if (!map.has(currentYear)) map.set(currentYear, [])
  const maxYear = Math.max(currentYear, ...map.keys())
  const years: MeetingYearGroup[] = []
  for (let y = 1; y <= maxYear; y++) {
    const ms = map.get(y) || []
    years.push({
      year: y,
      meetings: ms,
      completed: ms.filter(m => m.status === 'held').length,
      target,
      isCurrent: y === currentYear,
    })
  }
  return { years, currentYear, target }
}

/** 총 target칸의 초록색 가로 막대. 완료 1회당 한 칸씩 채워진다. */
function MeetingProgressBar({ completed, target }: { completed: number; target: number }) {
  const filled = Math.min(completed, target)
  const over = Math.max(0, completed - target)
  return (
    <div className="flex items-center gap-0.5 w-full" role="img" aria-label={`${completed} / ${target}`}>
      {Array.from({ length: target }).map((_, i) => (
        <div key={i} className={`flex-1 h-2.5 rounded-sm transition-colors ${i < filled ? 'bg-emerald-500' : 'bg-muted'}`} />
      ))}
      {over > 0 && <span className="text-[10px] text-emerald-600 font-semibold ml-1 shrink-0">+{over}</span>}
    </div>
  )
}

// ────────────────────────── Profile ──────────────────────────
function ProfileSection({ student, linkedContract, onDeleted, createdBy, canEdit }: {
  student: ServiceStudent
  linkedContract?: Contract
  onDeleted: () => void
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const del = useDeleteServiceStudent()
  const update = useUpdateServiceStudent()
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pReturn, setPReturn] = useState('')
  const [pReason, setPReason] = useState('')
  const applyPause = () => {
    update.mutate({ id: student.id, paused: true, pauseReason: pReason.trim() || undefined, pauseReturnDate: pReturn || undefined }, { onSuccess: () => setPauseOpen(false) })
  }
  const resume = () => {
    if (!confirm(t('student360.resumeConfirm'))) return
    update.mutate({ id: student.id, paused: false, pauseReason: '', pauseReturnDate: '' })
  }

  return (
    <Card className={student.paused ? 'border-amber-300' : ''}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <UserIcon className="size-5 text-primary" />
          {student.name}
          {student.koreanName && <span className="text-muted-foreground font-normal">· {student.koreanName}</span>}
          {student.status && <Badge variant="outline" className={isArchivedStatus(student.status) ? (normalizeStatus(student.status) === 'canceled' ? 'text-red-600 border-red-200' : 'text-gray-500 border-gray-300') : ''}>{statusLabelFor(t, student.status)}</Badge>}
          {student.paused && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
              💤 {t('student360.onLeave')}{student.pauseReturnDate ? ` · ${t('student360.returnExpected')} ${student.pauseReturnDate}` : ''}
            </Badge>
          )}
        </CardTitle>
        {canEdit && (
          <div className="flex gap-2">
            {student.paused ? (
              <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={update.isPending} onClick={resume}>
                <Power className="size-4 mr-1" />{t('student360.resume')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="text-amber-700 border-amber-200 hover:bg-amber-50"
                onClick={() => { setPReturn(''); setPReason(''); setPauseOpen(true) }}>
                💤 {t('student360.setOnLeave')}
              </Button>
            )}
            <StudentDialog
              student={student}
              createdBy={createdBy}
              canEdit={canEdit}
              trigger={<Button variant="outline" size="sm"><Pencil className="size-4 mr-1" />{t('common.edit')}</Button>}
            />
            <Button
              variant="outline" size="sm"
              onClick={() => {
                if (!canEdit) return
                if (confirm(t('student360.confirmDeleteStudent'))) {
                  del.mutate(student.id, { onSuccess: onDeleted })
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Field icon={<Mail className="size-4" />} label={t('student360.email')} value={student.email} />
        <Field icon={<Mail className="size-4" />} label={t('student360.parentEmail')} value={student.parentEmail} />
        <Field icon={<Phone className="size-4" />} label={t('student360.contact')} value={student.contact} />
        <Field icon={<UserIcon className="size-4" />} label={t('student360.parentName')} value={student.parentName} />
        <Field label={t('student360.nationality')} value={student.nationality} />
        <Field label={t('student360.region')} value={student.region} />
        <Field label={t('student360.grade')} value={student.grade} />
        <Field icon={<GraduationCap className="size-4" />} label={t('student360.school')} value={student.school} />
        <ConsultantField student={student} canEdit={canEdit} />
        <Field label={t('student360.essayEditor')} value={student.essayEditor} />
        <Field label={t('student360.contractType')} value={linkedContract?.contractType ?? student.contractType} />
        <Field label={t('contracts.applicationCount')} value={(linkedContract?.applicationCount ?? student.applicationCount) != null ? `${linkedContract?.applicationCount ?? student.applicationCount}개` : undefined} />
        <Field label={t('student360.majorTrack')} value={[student.majorTrack ? MAJOR_TRACK_LABEL[student.majorTrack] : '', student.majorDetail].filter(Boolean).join(' · ') || undefined} />
        <Field label={t('student360.majors')} value={student.majors} />
        <Field label={t('student360.status')} value={statusLabelFor(t, student.status)} />
        <Field label={t('student360.acceptedUni')} value={student.acceptedUni} />
        <Field label={t('student360.commPlatform')} value={student.communicationPlatform} />
        <Field label={t('student360.preferredLanguage')} value={student.preferredLanguage} />
        <Field label="생일 (Birthday)" value={student.birthDate} />
        <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label={t('student360.startDate')} value={student.startDate} />
          <Field label={t('student360.endDate')} value={student.endDate} />
        </div>
        <Field label={t('student360.address')} value={student.address} />
        <Field icon={<CalendarDays className="size-4" />} label={t('student360.regularMeetingSchedule')} value={formatRegularSchedule(student.regularMeetingSchedule)} />
        {student.notes && (
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground mb-1">{t('student360.notes')}</p>
            <p className="whitespace-pre-wrap">{student.notes}</p>
          </div>
        )}
        {student.paused && (
          <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            💤 {t('student360.onLeaveBanner')}
            {student.pauseReturnDate && <> · {t('student360.returnExpected')} <b>{student.pauseReturnDate}</b></>}
            {student.pauseReason && <div className="text-xs text-amber-700 mt-0.5 whitespace-pre-wrap">{t('student360.reasonOptional')}: {student.pauseReason}</div>}
          </div>
        )}
      </CardContent>

      {/* 휴면(On Leave) 처리 다이얼로그 */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t('student360.setOnLeave')}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{t('student360.onLeaveDesc')}</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('student360.returnDateOptional')}</Label>
              <Input type="date" value={pReturn} onChange={e => setPReturn(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('student360.reasonOptional')}</Label>
              <Input value={pReason} onChange={e => setPReason(e.target.value)} placeholder={t('student360.onLeaveReasonPh')} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>{t('common.cancel')}</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" disabled={update.isPending} onClick={applyPause}>{t('student360.setOnLeave')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Field({ icon, label, value }: { icon?: ReactNode; label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">{icon}{label}</p>
      <p>{value || '—'}</p>
    </div>
  )
}

// 담당 컨설턴트 + 변경 이력. 현재 담당자는 assignedConsultant(그대로), 변경은 이력에 from→to·날짜로 기록.
function ConsultantField({ student, canEdit }: { student: ServiceStudent; canEdit: boolean }) {
  const t = useT()
  const consultantName = useConsultantName()
  const consultantPool = useConsultantPool()
  const update = useUpdateServiceStudent()
  const today = new Date().toISOString().slice(0, 10)
  const [adding, setAdding] = useState(false)
  const [newC, setNewC] = useState('')
  const [date, setDate] = useState(today)
  const history = student.consultantHistory || []

  const saveChange = () => {
    if (!canEdit || !newC) return
    const entry = { from: student.assignedConsultant || undefined, to: newC, date: date || today }
    update.mutate({ id: student.id, assignedConsultant: newC, consultantHistory: [...history, entry] })
    setAdding(false); setNewC(''); setDate(today)
  }
  // 이력 삭제(정정용): 가장 최근 변경을 지우면 현재 담당자를 그 전 값으로 되돌린다.
  const removeEntry = (i: number) => {
    const entry = history[i]
    const next = history.filter((_, idx) => idx !== i)
    const data: { id: string; consultantHistory: typeof next; assignedConsultant?: string } = { id: student.id, consultantHistory: next }
    if (i === history.length - 1) data.assignedConsultant = entry.from || undefined
    update.mutate(data)
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{t('student360.consultant')}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span>{consultantName(student.assignedConsultant) || '—'}</span>
        {canEdit && !adding && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs gap-0.5" onClick={() => setAdding(true)}>
            <Plus className="size-3" />{t('student360.consultantChange')}
          </Button>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {history.map((h, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{h.date}</span>
              <span>·</span>
              <span>{consultantName(h.from) || '—'} → {consultantName(h.to)}</span>
              {canEdit && (
                <button className="ml-0.5 text-red-400 hover:text-red-600" title={t('common.delete')} onClick={() => removeEntry(i)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <select value={newC} onChange={e => setNewC(e.target.value)} className="h-7 rounded border px-1 text-xs bg-background">
            <option value="">{t('common.select')}</option>
            {consultantPool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 rounded border px-1 text-xs bg-background" />
          <Button size="sm" className="h-7 text-xs" onClick={saveChange} disabled={!newC}>{t('common.save')}</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setNewC('') }}>{t('common.cancel')}</Button>
        </div>
      )}
    </div>
  )
}


// ────────────────────────── EC Services ──────────────────────────
function ECServicesSection({ studentId, createdBy, canEdit }: { studentId: string; createdBy?: string; canEdit: boolean }) {
  const { data: activities = [] } = useECActivities(studentId)
  const del = useDeleteECActivity()
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="size-5 text-primary" />
          {t('student360.ecService')}
          <span className="text-muted-foreground font-normal">({activities.length})</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {canEdit && (
            <span onClick={e => e.stopPropagation()}>
              <ECActivityDialog
                studentId={studentId}
                createdBy={createdBy}
                canEdit={canEdit}
                trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
              />
            </span>
          )}
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-3">
        {activities.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('student360.noEcServices')}</p>
        )}
        {activities.map(a => (
          <div key={a.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{a.partner || '—'}</span>
                {a.serviceMonth && <Badge variant="outline" className="text-[10px] h-4 bg-purple-50 text-purple-700 border-purple-200">{a.serviceMonth}</Badge>}
                {a.refundStatus && (
                  <Badge variant="outline" className={a.refundStatus === 'completed' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-orange-100 text-orange-700 border-orange-200'}>
                    {a.refundStatus === 'completed' ? '환불완료' : '환불신청중'}{a.refundDate ? ` · ${a.refundStatus === 'completed' ? '완료' : '신청'} ${a.refundDate}` : ''}
                  </Badge>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <ECActivityDialog
                    studentId={studentId}
                    activity={a}
                    createdBy={createdBy}
                    canEdit={canEdit}
                    trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
                  />
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDeleteGeneric'))) del.mutate({ id: a.id, studentId }) }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="text-xs">{[a.periodStart, a.periodEnd].filter(Boolean).join(' ~ ') || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">특이사항</p>
                <p className="whitespace-pre-wrap">{a.program || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">금액</p>
                <p className="text-sm font-medium">{a.billedAmount != null ? `₩${a.billedAmount.toLocaleString()}` : '—'}</p>
              </div>
            </div>
            {(a.salesContributor1 || a.salesContributor2) && (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Sales Contributor</p>
                <p>{[a.salesContributor1, a.salesContributor2].filter(Boolean).join(' / ')}</p>
              </div>
            )}
            {a.refundStatus && (a.refundReason || a.refundAmount != null) && (
              <div className={`rounded-md border px-2.5 py-1.5 text-xs ${a.refundStatus === 'completed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                <span className="font-medium">{a.refundStatus === 'completed' ? '환불완료' : '환불신청중'}</span>
                {a.refundAmount != null && <> · ₩{a.refundAmount.toLocaleString()}</>}
                {a.refundReason && <div className="mt-0.5 whitespace-pre-wrap">사유: {a.refundReason}</div>}
              </div>
            )}
          </div>
        ))}
      </CardContent>
      )}
    </Card>
  )
}

// ── 환불신청 알림 (재무담당자에게) ──
function financeRecipientIds(profiles: { id: string; email?: string; role?: string; isAccount?: boolean }[]): string[] {
  // 환불 등 재무 알림 수신자 = 재무(account) 권한자
  const ids = profiles
    .filter(p => canAccessAccount(p))
    .map(p => p.id)
  return [...new Set(ids)]
}
function notifyRefundRequested(
  profiles: { id: string; email?: string; role?: string }[],
  opts: { label: string; source: 'ec' | 'academic'; feeId: string; studentId: string; excludeId?: string },
) {
  const ids = financeRecipientIds(profiles).filter(id => id !== opts.excludeId)
  if (!ids.length) return
  createNotificationsForUsers(ids, {
    type: 'refund_requested',
    title: '환불 신청',
    message: `${opts.source === 'ec' ? '외부서비스(EC)' : '학습지원'} 환불이 신청되었습니다 · ${opts.label}. 서비스입금관리에서 금액 확인 후 처리해주세요.`,
    link: '/service/external-fees',
    metadata: { source: opts.source, feeId: opts.feeId, studentId: opts.studentId },
  }).catch(() => {})
}

function ECActivityDialog({ studentId, activity, trigger, createdBy, canEdit }: {
  studentId: string
  activity?: ECActivity
  trigger: ReactNode
  createdBy?: string
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const create = useCreateECActivity()
  const update = useUpdateECActivity()
  const { data: profiles = [] } = useProfiles()
  const t = useT()

  const buildForm = () => ({
    partner: activity?.partner || '',
    serviceMonth: activity?.serviceMonth || '',
    periodStart: activity?.periodStart || '',
    periodEnd: activity?.periodEnd || '',
    program: activity?.program || '',
    billed: activity?.billedAmount != null ? String(activity.billedAmount) : '',
    sc1Select: ecSalesSelectVal(activity?.salesContributor1),
    sc1Custom: ecSalesCustomVal(activity?.salesContributor1),
    sc2Select: ecSalesSelectVal(activity?.salesContributor2),
    sc2Custom: ecSalesCustomVal(activity?.salesContributor2),
    refund: activity?.refundStatus === 'requested' ? 'requested' : 'none',
    refundReason: activity?.refundReason || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  // 환불완료는 재무담당자(서비스입금관리)만 처리 — 여기선 읽기전용 표시
  const isRefundCompleted = activity?.refundStatus === 'completed'

  const submit = () => {
    if (!canEdit) return
    // 환불: 완료 상태면 손대지 않음(재무 담당 영역), 아니면 신청/해제만
    const refundPatch = isRefundCompleted
      ? {}
      : form.refund === 'requested'
        ? { refundStatus: 'requested' as const, refundDate: activity?.refundDate || todayKST(), refundReason: form.refundReason || null }
        : { refundStatus: null, refundAmount: null, refundDate: null, refundReason: null }
    const payload = {
      studentId,
      partner: form.partner || undefined,
      serviceMonth: form.serviceMonth || undefined,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      program: form.program || undefined,
      billedAmount: form.billed ? Number(form.billed) : undefined,
      salesContributor1: ecSalesFinal(form.sc1Select, form.sc1Custom),
      salesContributor2: ecSalesFinal(form.sc2Select, form.sc2Custom),
      createdBy,
    }
    const newlyRequested = !!activity && refundPatch.refundStatus === 'requested' && activity.refundStatus !== 'requested'
    if (activity) {
      update.mutate({ id: activity.id, ...payload, ...refundPatch }, {
        onSuccess: () => {
          setOpen(false)
          if (newlyRequested) notifyRefundRequested(profiles, { label: form.partner || 'EC', source: 'ec', feeId: activity.id, studentId, excludeId: createdBy })
        },
        onError: reportSaveError,
      })
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false), onError: reportSaveError })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{activity ? t('student360.ecServiceEdit') : t('student360.ecServiceAdd')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Partner */}
          <div>
            <Label className="text-xs">Partner</Label>
            <Select value={form.partner || null} onValueChange={v => set('partner', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {[...EC_PARTNERS].sort((a, b) => a.localeCompare(b, 'ko')).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* 교육 월 (교육비 처리 월) */}
          <div>
            <Label className="text-xs">교육 월 <span className="text-muted-foreground font-normal">(서비스입금관리에서 몇월 교육비인지 표시)</span></Label>
            <Select value={form.serviceMonth || null} onValueChange={v => set('serviceMonth', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {SERVICE_MONTH_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Period */}
          <div>
            <Label className="text-xs">Period</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <Label className="text-[10px] text-muted-foreground">Start</Label>
                <Input type="date" value={form.periodStart} onChange={e => set('periodStart', e.target.value)} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">End</Label>
                <Input type="date" value={form.periodEnd} onChange={e => set('periodEnd', e.target.value)} />
              </div>
            </div>
          </div>
          {/* 특이사항 */}
          <div>
            <Label className="text-xs">특이사항</Label>
            <Textarea
              className="mt-1"
              placeholder={t('student360.programPlaceholder')}
              value={form.program}
              onChange={e => set('program', e.target.value)}
              rows={3}
            />
          </div>
          {/* 금액 (세일즈 금액) */}
          <div>
            <Label className="text-xs">금액 (원)</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              placeholder="예: 500000"
              value={form.billed}
              onChange={e => set('billed', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">세일즈한 서비스 금액. 재무 · 서비스관리에서 수금 처리됩니다.</p>
          </div>
          {/* 환불 (기존 항목만) */}
          {activity && (
            <div>
              <Label className="text-xs">환불</Label>
              {isRefundCompleted ? (
                <div className="mt-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  환불완료
                  {activity.refundAmount != null && <> · <span className="font-mono">{formatCurrency(activity.refundAmount, 'KRW')}</span></>}
                  {activity.refundDate && <> · {activity.refundDate}</>}
                  {activity.refundReason && <p className="text-xs text-rose-600 mt-1 whitespace-pre-wrap">사유: {activity.refundReason}</p>}
                  <p className="text-[10px] text-rose-400 mt-0.5">재무 담당자가 환불 처리를 완료했습니다.</p>
                </div>
              ) : (
                <>
                  <Select value={form.refund} onValueChange={v => set('refund', v || 'none')}>
                    <SelectTrigger className="mt-1">
                      <span className="text-left">{form.refund === 'requested' ? '환불신청' : '환불 없음'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">환불 없음</SelectItem>
                      <SelectItem value="requested">환불신청</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.refund === 'requested' && (
                    <Textarea
                      className="mt-2"
                      placeholder="환불 사유·상황을 적어주세요. (재무담당자가 확인합니다) 예: 학부모 개인사정으로 8월 중도 취소 요청, 잔여 2개월분 환불 예정"
                      value={form.refundReason}
                      onChange={e => set('refundReason', e.target.value)}
                      rows={3}
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">&lsquo;환불신청&rsquo;으로 저장하면 재무(서비스입금관리)에 전달됩니다. 금액 확인·완료 처리는 재무에서 진행되며, 완료되면 여기에 환불액·완료일이 기록됩니다.</p>
                </>
              )}
            </div>
          )}
          {/* Sales Contributor 1 */}
          <div>
            <Label className="text-xs">Sales Contributor 1</Label>
            <Select value={form.sc1Select || null} onValueChange={v => set('sc1Select', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {EC_SALES_PRESETS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="직접입력">{t('student360.customInput')}</SelectItem>
              </SelectContent>
            </Select>
            {form.sc1Select === '직접입력' && (
              <Input
                className="mt-1"
                placeholder={t('student360.customInputPlaceholder')}
                value={form.sc1Custom}
                onChange={e => set('sc1Custom', e.target.value)}
              />
            )}
          </div>
          {/* Sales Contributor 2 */}
          <div>
            <Label className="text-xs">Sales Contributor 2</Label>
            <Select value={form.sc2Select || null} onValueChange={v => set('sc2Select', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {EC_SALES_PRESETS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                <SelectItem value="직접입력">{t('student360.customInput')}</SelectItem>
              </SelectContent>
            </Select>
            {form.sc2Select === '직접입력' && (
              <Input
                className="mt-1"
                placeholder={t('student360.customInputPlaceholder')}
                value={form.sc2Custom}
                onChange={e => set('sc2Custom', e.target.value)}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 원서 목록: 계약 원서지원수만큼 칸 자동 생성 (대학명·상태·유형·마감일) ──
const selectCls = 'h-8 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring disabled:opacity-60'

function ApplicationSlots({ studentId, count, canEdit }: { studentId: string; count: number; canEdit: boolean }) {
  const { data: apps = [] } = useStudentApplications(studentId)
  const upsert = useUpsertStudentApplication()
  const emptyCount = Math.max(0, count - apps.length)
  const totalSlots = apps.length + emptyCount
  const addSlot = () => upsert.mutate({ studentId, university: '', sortOrder: Math.max(apps.length, count) })
  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/30 p-3 space-y-2">
      <div className="text-sm font-semibold text-sky-800">원서 목록 <span className="font-normal text-xs text-muted-foreground">· 계약 원서지원수 {count}개</span></div>
      <div className="space-y-1.5">
        {apps.map((a, i) => <AppRow key={a.id} studentId={studentId} app={a} index={i} canEdit={canEdit} />)}
        {Array.from({ length: emptyCount }).map((_, i) => <AppRow key={`empty-${i}`} studentId={studentId} index={apps.length + i} canEdit={canEdit} />)}
        {totalSlots === 0 && (
          <p className="text-xs text-muted-foreground">계약관리에서 <b>원서지원수</b>를 입력하면 칸이 자동 생성됩니다. 아래 버튼으로 직접 추가할 수도 있습니다.</p>
        )}
      </div>
      {canEdit && (
        <button onClick={addSlot} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sky-200 py-1.5 text-xs text-sky-700 hover:bg-sky-50">
          <Plus className="size-3.5" /> 원서 추가
        </button>
      )}
    </div>
  )
}

function AppRow({ studentId, app, index, canEdit }: { studentId: string; app?: StudentApplication; index: number; canEdit: boolean }) {
  const upsert = useUpsertStudentApplication()
  const del = useDeleteStudentApplication()
  const [university, setUniversity] = useState(app?.university || '')
  const [status, setStatus] = useState(app?.status || '')
  const [appType, setAppType] = useState(app?.appType || '')
  const [deadline, setDeadline] = useState(app?.deadline || '')
  const savedId = useRef<string | undefined>(app?.id)
  useEffect(() => {
    if (app) { setUniversity(app.university || ''); setStatus(app.status || ''); setAppType(app.appType || ''); setDeadline(app.deadline || ''); savedId.current = app.id }
  }, [app?.id, app?.university, app?.status, app?.appType, app?.deadline])

  const persist = (patch: Partial<StudentApplication>) => {
    if (!canEdit) return
    const next = { university, status, appType, deadline, ...patch }
    if (!savedId.current && !next.university && !next.status && !next.appType && !next.deadline) return
    upsert.mutate(
      { studentId, id: savedId.current, sortOrder: index, ...next },
      { onSuccess: (newId) => { if (newId && !savedId.current) savedId.current = newId as string } },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-white/70 px-2 py-1.5">
      <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <Input value={university} disabled={!canEdit} onChange={e => setUniversity(e.target.value)} onBlur={() => persist({ university })} placeholder="대학명" className="h-8 min-w-[140px] flex-1 text-sm" />
      <select value={status} disabled={!canEdit} onChange={e => { setStatus(e.target.value); persist({ status: e.target.value }) }} className={selectCls}>
        <option value="">상태</option>
        {APPLICATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={appType} disabled={!canEdit} onChange={e => { setAppType(e.target.value); persist({ appType: e.target.value }) }} className={selectCls}>
        <option value="">유형</option>
        {APPLICATION_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
      </select>
      <Input type="date" value={deadline} disabled={!canEdit} onChange={e => setDeadline(e.target.value)} onBlur={() => persist({ deadline })} className="h-8 w-36 text-xs" title="마감일" />
      {canEdit && savedId.current && (
        <button onClick={() => { if (confirm('이 원서 칸을 삭제할까요?')) del.mutate({ id: savedId.current!, studentId }) }} className="text-muted-foreground hover:text-red-500">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ────────────────────────── 원서·에세이 서비스 (컨설턴트 월 급여) ──────────────────────────
function EssayServiceSection({ studentId, applicationCount, defaultConsultant, createdBy, canEdit: canEditProp, locked }: { studentId: string; applicationCount?: number; defaultConsultant?: string; createdBy?: string; canEdit: boolean; locked?: boolean }) {
  const t = useT()
  const { data: plans = [] } = useEssayPlans(studentId)
  const del = useDeleteEssayPlan()
  const update = useUpdateServiceStudent()
  const [expanded, setExpanded] = useState(false)
  const canEdit = canEditProp && !locked   // 잠금 시 편집 불가
  // 금액은 관리자·회계 + 본인(담당 컨설턴트)에게만 노출
  const { user } = useAuth()
  const isManager = user?.role === 'admin' || user?.role === 'c_level' || canAccessAccount(user)
  const myKey = consultantNameKey(user?.name || '')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-5 text-primary" />
          원서·에세이 서비스
          <span className="text-muted-foreground font-normal">({plans.length})</span>
          {locked && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1"><Lock className="size-3" />{t('student360.sectionLocked')}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          {canEdit && (
            <span onClick={e => e.stopPropagation()}>
              <EssayServiceDialog
                studentId={studentId}
                defaultConsultant={defaultConsultant}
                createdBy={createdBy}
                canEdit={canEdit}
                trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />추가</Button>}
              />
            </span>
          )}
          {canEditProp && (
            <Button size="sm" variant="ghost" className={`size-7 ${locked ? 'text-amber-600' : 'text-muted-foreground'}`}
              title={locked ? t('student360.unlockToEdit') : t('student360.lockToEdit')}
              onClick={e => { e.stopPropagation(); update.mutate({ id: studentId, essayLocked: !locked }) }}>
              {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            </Button>
          )}
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-3">
        {/* 원서 목록: 계약 원서지원수(N)만큼 칸 자동 생성 */}
        <ApplicationSlots studentId={studentId} count={applicationCount || 0} canEdit={canEdit} />
        {plans.length === 0 && (
          <p className="text-sm text-muted-foreground">등록된 원서·에세이 서비스가 없습니다. 총액과 시작월을 등록하면 인보이스 발행 시 매월 자동 계산됩니다.</p>
        )}
        {plans.map(p => {
          const count = essayMonthCount(p.startMonth)
          return (
            <div key={p.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{p.consultantName || '담당 미지정'}</span>
                  {p.packageLabel && <Badge variant="outline" className="text-[10px] h-4 bg-sky-50 text-sky-700 border-sky-200">{p.packageLabel}</Badge>}
                  <Badge variant="outline" className="text-[10px] h-4 bg-indigo-50 text-indigo-700 border-indigo-200">
                    {p.startMonth} ~ {essayEndMonth(p.startMonth)} · {count}개월
                  </Badge>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <EssayServiceDialog studentId={studentId} plan={p} defaultConsultant={defaultConsultant} createdBy={createdBy} canEdit={canEdit}
                      trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>} />
                    <Button size="sm" variant="ghost" onClick={() => { if (!canEdit) return; if (confirm('이 원서·에세이 서비스를 삭제할까요?')) del.mutate({ id: p.id, studentId }) }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {(() => {
                const canSeeAmount = isManager || (!!p.consultantName && consultantNameKey(p.consultantName) === myKey)
                const monthly = count > 0 ? Math.floor((p.totalAmount || 0) / count) : 0
                return (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                    {canSeeAmount ? (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground">총 금액</p>
                          <p className="font-medium">{p.totalAmount > 0 ? formatCurrency(p.totalAmount, 'KRW') : <span className="text-muted-foreground">미입력</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">월 지급액 (÷{count})</p>
                          <p className="font-medium text-indigo-700">{p.totalAmount > 0 ? <>{formatCurrency(monthly, 'KRW')}<span className="text-xs text-muted-foreground">/월</span></> : '—'}</p>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">금액</p>
                        <p className="text-muted-foreground">비공개</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">비고</p>
                      <p className="whitespace-pre-wrap">{p.notes || '—'}</p>
                    </div>
                  </div>
                )
              })()}
              <p className="text-[11px] text-muted-foreground">인보이스 발행 시 {p.consultantName || '담당 컨설턴트'}의 해당 월 인보이스에 <b>총액÷개월수</b>로 시작월~12월 매월 자동 추가됩니다.</p>
            </div>
          )
        })}
      </CardContent>
      )}
    </Card>
  )
}

const SERVICE_YEAR = new Date().getFullYear()

function EssayServiceDialog({ studentId, plan, defaultConsultant, createdBy, canEdit, trigger }: {
  studentId: string
  plan?: EssayPlan
  defaultConsultant?: string
  createdBy?: string
  canEdit: boolean
  trigger: ReactNode
}) {
  const { user } = useAuth()
  const isManager = user?.role === 'admin' || user?.role === 'c_level' || canAccessAccount(user)
  const create = useCreateEssayPlan()
  const update = useUpdateEssayPlan()
  const consultantPool = useConsultantPool()
  // 담당자 드롭다운 = 컨설턴트 풀 + 에세이 에디터 (오타·띄어쓰기 방지 → 인보이스 매칭 정확)
  const consultantOptions = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const c of consultantPool) { const k = consultantNameKey(c.name); if (k && !byKey.has(k)) byKey.set(k, c.name) }
    for (const e of ESSAY_EDITORS) { const k = consultantNameKey(e); if (k && !byKey.has(k)) byKey.set(k, e) }
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [consultantPool])
  const [open, setOpen] = useState(false)
  const [consultant, setConsultant] = useState(plan?.consultantName || defaultConsultant || '')
  const [startMonth, setStartMonth] = useState(plan?.startMonth || `${SERVICE_YEAR}-06`)
  const [count, setCount] = useState(() => (plan?.packageLabel || '').match(/\d+/)?.[0] || '')
  const [total, setTotal] = useState(plan?.totalAmount ? String(plan.totalAmount) : '')
  const [notes, setNotes] = useState(plan?.notes || '')

  const totalNum = Number(total) || 0
  const months = essayMonthCount(startMonth)
  const monthly = months > 0 ? Math.floor(totalNum / months) : 0
  const lastMonthly = months > 0 ? totalNum - monthly * (months - 1) : 0

  const save = () => {
    if (!canEdit || !consultant.trim() || !startMonth) return
    // 금액은 관리자·회계만 설정 — 비관리자 편집 시 기존 금액 보존
    const base = {
      consultantName: consultant.trim(),
      startMonth,
      packageLabel: count ? `원서 ${count}개` : undefined,
      notes: notes.trim() || undefined,
      ...(isManager ? { totalAmount: totalNum } : {}),
    }
    if (plan) update.mutate({ id: plan.id, studentId, ...base }, { onSuccess: () => setOpen(false) })
    else create.mutate({ studentId, ...base, totalAmount: isManager ? totalNum : 0, currency: 'KRW', createdBy }, { onSuccess: () => setOpen(false) })
  }

  return (
    <>
    <span onClick={() => setOpen(true)}>{trigger}</span>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{plan ? '원서·에세이 서비스 수정' : '원서·에세이 서비스 추가'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">담당 컨설턴트 <span className="text-muted-foreground font-normal">(컨설턴트·에세이 에디터)</span></Label>
            <select
              className="mt-1 h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={consultant}
              onChange={e => setConsultant(e.target.value)}
            >
              <option value="">담당자 선택</option>
              {consultant && !consultantOptions.includes(consultant) && <option value={consultant}>{consultant}</option>}
              {consultantOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">시작월 (신청월)</Label>
              <Input className="mt-1" type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">총 원서 갯수</Label>
              <Input className="mt-1" type="number" min={0} value={count} onChange={e => setCount(e.target.value)} placeholder="예: 10" />
            </div>
          </div>
          {isManager ? (
            <>
              <div>
                <Label className="text-xs">총 금액 (원) <span className="text-muted-foreground font-normal">· 관리자·회계 전용</span></Label>
                <Input className="mt-1" type="number" min={0} value={total} onChange={e => setTotal(e.target.value)} placeholder="예: 10000000" />
              </div>
              <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 space-y-0.5">
                <div>기간: <b>{startMonth}</b> ~ <b>{essayEndMonth(startMonth)}</b> (그해 12월 종료) · <b>{months}개월</b></div>
                <div>월 지급액(단가): <b>{formatCurrency(monthly, 'KRW')}</b>{months > 1 && <> · 12월 <b>{formatCurrency(lastMonthly, 'KRW')}</b> (잔액 보정)</>}</div>
                <div className="text-indigo-500">인보이스 발행 시 시작월~12월 매월 자동 추가됩니다.</div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              금액은 관리자·회계만 입력·조회할 수 있습니다. 담당자·시작월·갯수만 저장됩니다.
            </div>
          )}
          <div>
            <Label className="text-xs">비고</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={save} disabled={!consultant.trim() || !startMonth || create.isPending || update.isPending}>
            {(create.isPending || update.isPending) && <Loader2 className="size-4 mr-1 animate-spin" />}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

// ────────────────────────── Academic Support ──────────────────────────
function AcademicSupportSection({ studentId, createdBy, canEdit }: { studentId: string; createdBy?: string; canEdit: boolean }) {
  const { data: items = [] } = useAcademicSupport(studentId)
  const del = useDeleteAcademicSupport()
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-5 text-primary" />
          {t('student360.academicSupport')}
          <span className="text-muted-foreground font-normal">({items.length})</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {canEdit && (
            <span onClick={e => e.stopPropagation()}>
              <AcademicSupportDialog
                studentId={studentId}
                createdBy={createdBy}
                canEdit={canEdit}
                trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
              />
            </span>
          )}
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('student360.noAcademicSupport')}</p>
        )}
        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.academyName || '—'}</span>
                {item.serviceMonth && <Badge variant="outline" className="text-[10px] h-4 bg-purple-50 text-purple-700 border-purple-200">{item.serviceMonth}</Badge>}
                {item.refundStatus && (
                  <Badge variant="outline" className={item.refundStatus === 'completed' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-orange-100 text-orange-700 border-orange-200'}>
                    {item.refundStatus === 'completed' ? '환불완료' : '환불신청중'}{item.refundDate ? ` · ${item.refundStatus === 'completed' ? '완료' : '신청'} ${item.refundDate}` : ''}
                  </Badge>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <AcademicSupportDialog
                    studentId={studentId}
                    item={item}
                    createdBy={createdBy}
                    canEdit={canEdit}
                    trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
                  />
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDeleteGeneric'))) del.mutate({ id: item.id, studentId }) }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('student360.subject')}</p>
                <p>{item.subject || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('student360.seasonPeriod')}</p>
                <p>
                  {item.season && <span className="mr-1.5">{item.season}</span>}
                  <span className="text-xs text-muted-foreground">
                    {[item.periodStart, item.periodEnd].filter(Boolean).join(' ~ ')}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('student360.specialNotes')}</p>
                <p className="whitespace-pre-wrap">{item.notes || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">금액</p>
                <p className="font-medium">{item.billedAmount != null ? `₩${item.billedAmount.toLocaleString()}` : '—'}</p>
              </div>
            </div>
            {(item.salesContributor1 || item.salesContributor2) && (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Sales Contributor</p>
                <p>{[item.salesContributor1, item.salesContributor2].filter(Boolean).join(' / ')}</p>
              </div>
            )}
            {item.refundStatus && (item.refundReason || item.refundAmount != null) && (
              <div className={`rounded-md border px-2.5 py-1.5 text-xs ${item.refundStatus === 'completed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                <span className="font-medium">{item.refundStatus === 'completed' ? '환불완료' : '환불신청중'}</span>
                {item.refundAmount != null && <> · ₩{item.refundAmount.toLocaleString()}</>}
                {item.refundReason && <div className="mt-0.5 whitespace-pre-wrap">사유: {item.refundReason}</div>}
              </div>
            )}
          </div>
        ))}
      </CardContent>
      )}
    </Card>
  )
}

function AcademicSupportDialog({ studentId, item, trigger, createdBy, canEdit }: {
  studentId: string
  item?: AcademicSupportItem
  trigger: ReactNode
  createdBy?: string
  canEdit: boolean
}) {
  const consultantPool = useConsultantPool()
  const [open, setOpen] = useState(false)
  const create = useCreateAcademicSupport()
  const update = useUpdateAcademicSupport()
  const { data: profiles = [] } = useProfiles()
  const t = useT()

  const buildForm = () => ({
    academySelect: item?.academyName && (ACADEMY_PRESETS as readonly string[]).includes(item.academyName)
      ? item.academyName : item?.academyName ? '직접입력' : '',
    academyCustom: item?.academyName && !(ACADEMY_PRESETS as readonly string[]).includes(item.academyName)
      ? item.academyName : '',
    subject: item?.subject || '',
    serviceMonth: item?.serviceMonth || '',
    season: item?.season || '',
    periodStart: item?.periodStart || '',
    periodEnd: item?.periodEnd || '',
    notes: item?.notes || '',
    billed: item?.billedAmount != null ? String(item.billedAmount) : '',
    salesContributor1: item?.salesContributor1 || '',
    salesContributor2: item?.salesContributor2 || '',
    refund: item?.refundStatus === 'requested' ? 'requested' : 'none',
    refundReason: item?.refundReason || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  // 환불완료는 재무담당자(서비스입금관리)만 처리 — 여기선 읽기전용 표시
  const isRefundCompleted = item?.refundStatus === 'completed'

  const submit = () => {
    if (!canEdit) return
    const resolvedAcademy = form.academySelect === '직접입력'
      ? (form.academyCustom.trim() || undefined)
      : (form.academySelect || undefined)
    const refundPatch = isRefundCompleted
      ? {}
      : form.refund === 'requested'
        ? { refundStatus: 'requested' as const, refundDate: item?.refundDate || todayKST(), refundReason: form.refundReason || null }
        : { refundStatus: null, refundAmount: null, refundDate: null, refundReason: null }
    const payload = {
      studentId,
      academyName: resolvedAcademy,
      subject: form.subject || undefined,
      serviceMonth: form.serviceMonth || undefined,
      season: form.season || undefined,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      notes: form.notes || undefined,
      billedAmount: form.billed ? Number(form.billed) : undefined,
      salesContributor1: form.salesContributor1 || undefined,
      salesContributor2: form.salesContributor2 || undefined,
      createdBy,
    }
    const newlyRequested = !!item && refundPatch.refundStatus === 'requested' && item.refundStatus !== 'requested'
    if (item) {
      update.mutate({ id: item.id, ...payload, ...refundPatch }, {
        onSuccess: () => {
          setOpen(false)
          if (newlyRequested) notifyRefundRequested(profiles, { label: resolvedAcademy || 'Academic', source: 'academic', feeId: item.id, studentId, excludeId: createdBy })
        },
        onError: reportSaveError,
      })
    } else {
      create.mutate(payload, { onSuccess: () => setOpen(false), onError: reportSaveError })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? t('student360.academicSupportEdit') : t('student360.academicSupportAdd')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* 학원명 */}
          <div>
            <Label className="text-xs">{t('student360.academyName')}</Label>
            <Select value={form.academySelect || null} onValueChange={v => set('academySelect', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {ACADEMY_PRESETS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                <SelectItem value="직접입력">{t('student360.customInput')}</SelectItem>
              </SelectContent>
            </Select>
            {form.academySelect === '직접입력' && (
              <Input
                className="mt-1"
                placeholder={t('student360.academyNamePlaceholder')}
                value={form.academyCustom}
                onChange={e => set('academyCustom', e.target.value)}
              />
            )}
          </div>
          {/* 과목명 */}
          <div>
            <Label className="text-xs">{t('student360.subjectLabel')}</Label>
            <Input
              placeholder={t('student360.subjectPlaceholder')}
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
            />
          </div>
          {/* 금액 */}
          <div>
            <Label className="text-xs">금액 (원)</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 500000"
              value={form.billed}
              onChange={e => set('billed', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">세일즈한 서비스 금액. 재무 · 서비스관리에서 수금 처리됩니다.</p>
          </div>
          {/* 환불 (기존 항목만) */}
          {item && (
            <div>
              <Label className="text-xs">환불</Label>
              {isRefundCompleted ? (
                <div className="mt-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  환불완료
                  {item.refundAmount != null && <> · <span className="font-mono">{formatCurrency(item.refundAmount, 'KRW')}</span></>}
                  {item.refundDate && <> · {item.refundDate}</>}
                  {item.refundReason && <p className="text-xs text-rose-600 mt-1 whitespace-pre-wrap">사유: {item.refundReason}</p>}
                  <p className="text-[10px] text-rose-400 mt-0.5">재무 담당자가 환불 처리를 완료했습니다.</p>
                </div>
              ) : (
                <>
                  <Select value={form.refund} onValueChange={v => set('refund', v || 'none')}>
                    <SelectTrigger className="mt-1">
                      <span className="text-left">{form.refund === 'requested' ? '환불신청' : '환불 없음'}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">환불 없음</SelectItem>
                      <SelectItem value="requested">환불신청</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.refund === 'requested' && (
                    <Textarea
                      className="mt-2"
                      placeholder="환불 사유·상황을 적어주세요. (재무담당자가 확인합니다) 예: 학부모 개인사정으로 8월 중도 취소 요청, 잔여분 환불 예정"
                      value={form.refundReason}
                      onChange={e => set('refundReason', e.target.value)}
                      rows={3}
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">&lsquo;환불신청&rsquo;으로 저장하면 재무(서비스입금관리)에 전달됩니다. 금액 확인·완료 처리는 재무에서 진행되며, 완료되면 여기에 환불액·완료일이 기록됩니다.</p>
                </>
              )}
            </div>
          )}
          {/* 교육 월 + 시기 (같은 라인) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">교육 월 <span className="text-muted-foreground font-normal">(입금관리 표시)</span></Label>
              <Select value={form.serviceMonth || null} onValueChange={v => set('serviceMonth', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_MONTH_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('student360.season')}</Label>
              <Select value={form.season || null} onValueChange={v => set('season', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {SEASON_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('student360.period')}</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <Label className="text-[10px] text-muted-foreground">Start</Label>
                <Input type="date" value={form.periodStart} onChange={e => set('periodStart', e.target.value)} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">End</Label>
                <Input type="date" value={form.periodEnd} onChange={e => set('periodEnd', e.target.value)} />
              </div>
            </div>
          </div>
          {/* 특이사항 */}
          <div>
            <Label className="text-xs">{t('student360.specialRequestLabel')}</Label>
            <Textarea
              className="mt-1"
              placeholder={t('student360.specialRequestPlaceholder')}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
            />
          </div>
          {/* Sales Contributor 1 */}
          <div>
            <Label className="text-xs">Sales Contributor 1</Label>
            <Select value={form.salesContributor1 || null} onValueChange={v => set('salesContributor1', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {consultantPool.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Sales Contributor 2 */}
          <div>
            <Label className="text-xs">Sales Contributor 2</Label>
            <Select value={form.salesContributor2 || null} onValueChange={v => set('salesContributor2', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {consultantPool.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────── Portal Links ──────────────────────────
function PortalLinksSection({ studentId, studentName, createdBy, canEdit }: {
  studentId: string
  studentName: string
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const { data: tokens = [], isLoading } = usePortalTokens(studentId)
  const createToken = useCreatePortalToken()
  const toggleToken = useTogglePortalToken()
  const deleteToken = useDeletePortalToken()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const baseUrl = window.location.origin

  const handleCreate = () => {
    if (!canEdit) return
    createToken.mutate({
      studentId,
      label: `${studentName} ${t('portal.parentLink')}`,
      createdBy,
    })
  }

  const handleCopy = (token: string, id: string) => {
    navigator.clipboard.writeText(`${baseUrl}/portal/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-5 text-primary" />
          {t('portal.clientLinks')}
          <span className="text-muted-foreground font-normal">({tokens.length})</span>
        </CardTitle>
        {canEdit && (
          <Button
            size="sm" variant="outline"
            onClick={handleCreate}
            disabled={createToken.isPending}
          >
            <Plus className="size-4 mr-1" />
            {t('portal.generateLink')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {!isLoading && tokens.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('portal.noLinks')}</p>
        )}
        {tokens.map((tk) => {
          const url = `${baseUrl}/portal/${tk.token}`
          const isCopied = copiedId === tk.id
          return (
            <div
              key={tk.id}
              className={`rounded-lg border p-3 ${tk.isActive ? '' : 'opacity-50 bg-gray-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {tk.label && <span className="text-sm font-medium">{tk.label}</span>}
                    <Badge variant="outline" className={tk.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500'}>
                      {tk.isActive ? t('portal.active') : t('portal.inactive')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded truncate max-w-[300px]">
                      {url}
                    </code>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t('portal.createdAt')}: {new Date(tk.createdAt).toLocaleDateString('ko-KR')}
                    {tk.expiresAt && ` · ${t('portal.expiresAt')}: ${new Date(tk.expiresAt).toLocaleDateString('ko-KR')}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleCopy(tk.token, tk.id)}
                    title={t('portal.copyLink')}
                  >
                    {isCopied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                  </Button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 transition-colors"
                    title={t('portal.openLink')}
                  >
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </a>
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => { if (!canEdit) return; toggleToken.mutate({ id: tk.id, studentId, isActive: !tk.isActive }) }}
                      title={tk.isActive ? t('portal.deactivate') : t('portal.activate')}
                    >
                      <Power className={`size-4 ${tk.isActive ? 'text-emerald-500' : 'text-gray-400'}`} />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => {
                        if (!canEdit) return
                        if (confirm(t('portal.confirmDelete'))) {
                          deleteToken.mutate({ id: tk.id, studentId })
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ────────────────────────── Issue Report ──────────────────────────
function IssueReportSection({ studentId, studentName, userId, userName, isAdmin, canEdit }: {
  studentId: string
  studentName: string
  userId?: string
  userName?: string
  isAdmin: boolean
  canEdit: boolean
}) {
  const { data: issues = [] } = useIssueReports(studentId)
  const createIssue = useCreateIssueReport()
  const updateIssue = useUpdateIssueReport()
  const deleteIssue = useDeleteIssueReport()
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, content: '', isPrivate: false })

  const hasPrivate = issues.some((i) => i.isPrivate)

  const submit = () => {
    if (!form.content.trim()) return
    createIssue.mutate(
      { studentId, studentName, reportDate: form.date, content: form.content.trim(), isPrivate: form.isPrivate, createdBy: userId, authorName: userName },
      { onSuccess: () => { setForm({ date: today, content: '', isPrivate: false }); setShowForm(false) } },
    )
  }

  return (
    <Card className="border-rose-200">
      <CardHeader className="py-3 cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="size-4 text-rose-500" />
            Issue Report
            <span className="text-muted-foreground font-normal text-sm">({issues.length})</span>
            {hasPrivate && <Lock className="size-3.5 text-amber-500" />}
          </CardTitle>
          <Button size="sm" variant="ghost" className="size-7" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {canEdit && (showForm ? (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-8 rounded-md border px-2 text-sm bg-background" />
                <label className="flex items-center gap-1.5 text-sm ml-auto cursor-pointer">
                  {form.isPrivate ? <Lock className="size-3.5 text-amber-500" /> : <Unlock className="size-3.5 text-muted-foreground" />}
                  비공개
                  <Switch checked={form.isPrivate} onCheckedChange={(v) => setForm((f) => ({ ...f, isPrivate: v }))} />
                </label>
              </div>
              <Textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} placeholder="이슈 내용을 입력하세요..." rows={3} className="text-sm" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>취소</Button>
                <Button size="sm" onClick={submit} disabled={!form.content.trim() || createIssue.isPending}>등록</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="size-3.5" /> 이슈 추가
            </Button>
          ))}

          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">등록된 이슈가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {issues.map((issue) => (
                <IssueReportItem
                  key={issue.id} issue={issue} studentId={studentId}
                  userId={userId} userName={userName} isAdmin={isAdmin} canEdit={canEdit}
                  onToggleLock={() => updateIssue.mutate({ id: issue.id, studentId, isPrivate: !issue.isPrivate })}
                  onDelete={() => { if (confirm('이 이슈를 삭제할까요?')) deleteIssue.mutate({ id: issue.id, studentId }) }}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function IssueReportItem({ issue, studentId, userId, userName, isAdmin, canEdit, onToggleLock, onDelete }: {
  issue: IssueReport
  studentId: string
  userId?: string
  userName?: string
  isAdmin: boolean
  canEdit: boolean
  onToggleLock: () => void
  onDelete: () => void
}) {
  const createComment = useCreateIssueComment()
  const deleteComment = useDeleteIssueComment()
  const [comment, setComment] = useState('')
  const canModify = isAdmin || issue.createdBy === userId

  const submitComment = () => {
    if (!comment.trim()) return
    createComment.mutate(
      { issueId: issue.id, studentId, content: comment.trim(), createdBy: userId, authorName: userName },
      { onSuccess: () => setComment('') },
    )
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{issue.reportDate}</span>
            {issue.authorName && <span>· {issue.authorName}</span>}
            {issue.isPrivate && (
              <span className="inline-flex items-center gap-0.5 text-amber-600"><Lock className="size-3" /> 비공개</span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{issue.content}</p>
        </div>
        {canModify && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button size="sm" variant="ghost" className="size-6" title={issue.isPrivate ? '공개로 전환' : '비공개로 전환'} onClick={onToggleLock}>
              {issue.isPrivate ? <Lock className="size-3.5 text-amber-500" /> : <Unlock className="size-3.5 text-muted-foreground" />}
            </Button>
            <Button size="sm" variant="ghost" className="size-6" onClick={onDelete}>
              <Trash2 className="size-3.5 text-red-400" />
            </Button>
          </div>
        )}
      </div>

      {issue.comments.length > 0 && (
        <div className="pl-3 border-l-2 border-muted space-y-1.5 mt-2">
          {issue.comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 group">
              <div className="text-xs min-w-0">
                <span className="font-medium">{c.authorName || '—'}</span>
                <span className="text-muted-foreground ml-1.5">{new Date(c.createdAt).toLocaleDateString('ko-KR')}</span>
                <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.content}</p>
              </div>
              {(isAdmin || c.createdBy === userId) && (
                <Button size="sm" variant="ghost" className="size-5 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => deleteComment.mutate({ id: c.id, studentId })}>
                  <Trash2 className="size-3 text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-1.5 pt-1">
          <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
          <Input
            value={comment} onChange={(e) => setComment(e.target.value)} placeholder="피드백/솔루션 댓글..."
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
          />
          <Button size="sm" variant="ghost" className="size-8 shrink-0" onClick={submitComment} disabled={!comment.trim() || createComment.isPending}>
            <Send className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────── Student create/edit dialog ──────────────────────────
function StudentDialog({ student, trigger, onSaved, createdBy, canEdit }: {
  student?: ServiceStudent
  trigger: ReactNode
  onSaved?: (s: ServiceStudent) => void
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceStudent()
  const update = useUpdateServiceStudent()
  const buildForm = () => ({
    name: student?.name || '',
    koreanName: student?.koreanName || '',
    email: student?.email || '',
    parentEmail: student?.parentEmail || '',
    nationality: student?.nationality || '',
    parentName: student?.parentName || '',
    contact: student?.contact || '',
    region: student?.region || '',
    grade: student?.grade || '',
    school: student?.school || '',
    assignedConsultant: student?.assignedConsultant || '',
    essayEditor: student?.essayEditor || '',
    majors: student?.majors || '',
    majorTrack: student?.majorTrack || '',
    majorDetail: student?.majorDetail || '',
    majorIsOther: !!(student?.majorDetail && !majorsForTrack(student?.majorTrack).includes(student.majorDetail)),
    contractType: student?.contractType || '',
    applicationCount: student?.applicationCount ? String(student.applicationCount) : '',
    additionalServices: student?.additionalServices || '',
    communicationPlatform: student?.communicationPlatform || '',
    preferredLanguage: student?.preferredLanguage || '',
    birthDate: student?.birthDate || '',
    startDate: student?.startDate || '',
    endDate: student?.endDate || '',
    status: student?.status || '',
    notes: student?.notes || '',
    acceptedUni: student?.acceptedUni || '',
    address: student?.address || '',
    scheduleWeek: student?.regularMeetingSchedule?.split('|')[0] || '',
    scheduleDay: student?.regularMeetingSchedule?.split('|')[1] || '',
    scheduleTime: student?.regularMeetingSchedule?.split('|')[2] || '',
  })
  const [form, setForm] = useState(buildForm)

  // Reset to a clean form (or the student's values) every time the dialog opens
  useEffect(() => { if (open) setForm(buildForm()) }, [open])

  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    if (!canEdit) return
    if (!form.name.trim()) return
    const payload = {
      name: form.name.trim(),
      koreanName: form.koreanName || undefined,
      email: form.email || undefined,
      parentEmail: form.parentEmail || undefined,
      nationality: form.nationality || undefined,
      parentName: form.parentName || undefined,
      contact: form.contact || undefined,
      region: form.region || undefined,
      grade: form.grade || undefined,
      school: form.school || undefined,
      assignedConsultant: form.assignedConsultant || undefined,
      essayEditor: form.essayEditor || undefined,
      majors: form.majors || undefined,
      majorTrack: form.majorTrack || undefined,
      majorDetail: form.majorDetail || undefined,
      contractType: form.contractType || undefined,
      applicationCount: form.applicationCount ? Number(form.applicationCount) : undefined,
      additionalServices: form.additionalServices || undefined,
      communicationPlatform: form.communicationPlatform || undefined,
      preferredLanguage: form.preferredLanguage || undefined,
      birthDate: form.birthDate || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      status: form.status || undefined,
      notes: form.notes || undefined,
      acceptedUni: form.acceptedUni || undefined,
      address: form.address || undefined,
      regularMeetingSchedule: (form.scheduleWeek && form.scheduleDay && form.scheduleTime)
        ? `${form.scheduleWeek}|${form.scheduleDay}|${form.scheduleTime}`
        : undefined,
    }
    if (student) {
      update.mutate({ id: student.id, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
    } else {
      create.mutate({ ...payload, createdBy }, {
        onSuccess: (s) => { setOpen(false); onSaved?.(s) },
        onError: reportSaveError,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{student ? t('student360.editStudent') : t('student360.newStudent')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <LabeledInput label={`${t('student360.name')} *`} value={form.name} onChange={v => set('name', v)} />
          <LabeledInput label={t('student360.koreanName')} value={form.koreanName} onChange={v => set('koreanName', v)} />
          <LabeledInput label="생일 (Birthday)" value={form.birthDate} onChange={v => set('birthDate', v)} type="date" />
          <LabeledInput label={t('student360.email')} value={form.email} onChange={v => set('email', v)} />
          <LabeledInput label={t('student360.parentEmail')} value={form.parentEmail} onChange={v => set('parentEmail', v)} />
          <LabeledInput label={t('student360.contact')} value={form.contact} onChange={v => set('contact', v)} />
          <LabeledInput label={t('student360.parentName')} value={form.parentName} onChange={v => set('parentName', v)} />
          <LabeledInput label={t('student360.nationality')} value={form.nationality} onChange={v => set('nationality', v)} />
          <LabeledInput label={t('student360.region')} value={form.region} onChange={v => set('region', v)} />
          <LabeledInput label={t('student360.grade')} value={form.grade} onChange={v => set('grade', v)} />
          <LabeledInput label={t('student360.school')} value={form.school} onChange={v => set('school', v)} />
          <div>
            <Label className="text-xs">{t('student360.consultant')}</Label>
            <select value={form.assignedConsultant} onChange={e => set('assignedConsultant', e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="">—</option>
              {consultantPool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              {form.assignedConsultant && !consultantPool.some(c => c.id === form.assignedConsultant) && (
                <option value={form.assignedConsultant}>{consultantName(form.assignedConsultant)}</option>
              )}
            </select>
          </div>
          <div>
            <Label className="text-xs">{t('student360.essayEditor')}</Label>
            <select value={form.essayEditor} onChange={e => set('essayEditor', e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="">{t('student360.unassigned')}</option>
              {ESSAY_EDITORS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          {/* 전공: 1단계 계열 → 2단계 세부전공(연동). 목록에 없으면 Other로 직접 입력 */}
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('student360.majorTrack')}</Label>
              <select value={form.majorTrack} onChange={e => setForm(f => ({ ...f, majorTrack: e.target.value, majorDetail: '', majorIsOther: false }))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">—</option>
                {MAJOR_TRACKS.map(tr => <option key={tr.key} value={tr.key}>{tr.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t('student360.majorDetail')}</Label>
              <select
                value={form.majorIsOther ? OTHER_MAJOR : form.majorDetail}
                disabled={!form.majorTrack}
                onChange={e => {
                  const v = e.target.value
                  if (v === OTHER_MAJOR) setForm(f => ({ ...f, majorIsOther: true, majorDetail: '' }))
                  else setForm(f => ({ ...f, majorIsOther: false, majorDetail: v }))
                }}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">—</option>
                {majorsForTrack(form.majorTrack).map(mj => <option key={mj} value={mj}>{mj}</option>)}
                <option value={OTHER_MAJOR}>Other</option>
              </select>
              {form.majorIsOther && (
                <Input className="h-9 mt-1" placeholder={t('student360.majorDetailOther')} value={form.majorDetail} onChange={e => setForm(f => ({ ...f, majorDetail: e.target.value }))} />
              )}
            </div>
          </div>
          <LabeledInput label={t('student360.majors')} value={form.majors} onChange={v => set('majors', v)} />
          <LabeledInput label={t('student360.contractType')} value={form.contractType} onChange={v => set('contractType', v)} />
          <LabeledInput label={t('student360.applicationCount')} value={form.applicationCount} onChange={v => set('applicationCount', v)} />
          <div className="col-span-2">
            <LabeledInput label={t('student360.additionalServices')} value={form.additionalServices} onChange={v => set('additionalServices', v)} />
          </div>
          <div>
            <Label className="text-xs">{t('student360.status')}</Label>
            <select value={form.status || 'active'} onChange={e => set('status', e.target.value || 'active')}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              {STUDENT_STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
              {form.status && !STUDENT_STATUS_OPTIONS.some(o => o.value === form.status) && (
                <option value={form.status}>{form.status}</option>
              )}
            </select>
          </div>
          <LabeledInput label={t('student360.acceptedUni')} value={form.acceptedUni} onChange={v => set('acceptedUni', v)} />
          <div>
            <Label className="text-xs">{t('student360.commPlatform')}</Label>
            <Select value={form.communicationPlatform} onValueChange={v => set('communicationPlatform', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {COMM_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('student360.preferredLanguage')}</Label>
            <Select value={form.preferredLanguage} onValueChange={v => set('preferredLanguage', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {(['Korean', 'English', 'Both'] as const).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('student360.startDate')}</Label>
              <Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t('student360.endDate')}</Label>
              <Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('student360.address')}</Label>
            <Input value={form.address} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('student360.regularMeetingSchedule')}</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <Select value={form.scheduleWeek} onValueChange={v => set('scheduleWeek', v)}>
                <SelectTrigger><SelectValue placeholder={t('student360.weekPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {WEEK_PATTERNS.map(wp => (
                    <SelectItem key={wp.value} value={wp.value}>{wp.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.scheduleDay} onValueChange={v => set('scheduleDay', v)}>
                <SelectTrigger><SelectValue placeholder={t('student360.dayPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(d => (
                    <SelectItem key={d} value={d}>{d}요일</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={form.scheduleTime} onValueChange={v => set('scheduleTime', v)}>
                <SelectTrigger><SelectValue placeholder={t('student360.timePlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map(tm => (
                    <SelectItem key={tm} value={tm}>{tm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('student360.notes')}</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LabeledInput({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

// ─────────────────── Mentor Support (학습코칭 + 전공별) ───────────────────
const wonKR = (n: number) => `₩${n.toLocaleString('ko-KR')}`
const mentorFullName = (m?: Pick<Mentor, 'koreanName' | 'englishName'> | null) =>
  m ? ([m.koreanName, m.englishName].filter(Boolean).join(' ') || '멘토') : '—'

function CoachingSection({ studentId, createdBy, canEdit, restrictMentorId }: {
  studentId: string; createdBy?: string; canEdit: boolean; restrictMentorId?: string
}) {
  const { data: mentors = [] } = useMentors()
  const { data: allItems = [] } = useStudentCoaching(studentId)
  const [expanded, setExpanded] = useState(!!restrictMentorId)

  const mentorById = useMemo(() => new Map(mentors.map(m => [m.id, m])), [mentors])
  const typeOf = (c: StudentCoaching) => mentorById.get(c.mentorId || '')?.type || 'coaching'

  let coachingItems = allItems.filter(c => typeOf(c) === 'coaching')
  let majorItems = allItems.filter(c => typeOf(c) === 'major')
  if (restrictMentorId) {
    coachingItems = coachingItems.filter(c => c.mentorId === restrictMentorId)
    majorItems = majorItems.filter(c => c.mentorId === restrictMentorId)
  }
  const count = coachingItems.length + majorItems.length
  const coachingPool = mentors.filter(m => m.type === 'coaching')
  const majorPool = mentors.filter(m => m.type === 'major')
  const showAdd = canEdit && !restrictMentorId   // 멘토 본인 화면에서는 배정 CRUD 숨김

  return (
    <Card className="border-emerald-200">
      <CardHeader className="bg-emerald-50/40 rounded-t-xl py-3 cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-5 text-emerald-600" />
            Mentor Support <span className="text-muted-foreground font-normal">({count})</span>
          </CardTitle>
          <Button size="sm" variant="ghost" className="size-7" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-5 pt-0">
        <LearningCoachBlock studentId={studentId} createdBy={createdBy} items={coachingItems} pool={coachingPool} mentorById={mentorById} showAdd={showAdd} />
        <MajorMentorBlock studentId={studentId} createdBy={createdBy} items={majorItems} pool={majorPool} mentorById={mentorById} showAdd={showAdd} canLogSessions={canEdit || !!restrictMentorId} />
      </CardContent>
      )}
    </Card>
  )
}

// ── 학습코칭 멘토 (월 300,000원/학생) ──
function LearningCoachBlock({ studentId, createdBy, items, pool, mentorById, showAdd }: {
  studentId: string; createdBy?: string; items: StudentCoaching[]; pool: Mentor[]; mentorById: Map<string, Mentor>; showAdd: boolean
}) {
  const upsert = useUpsertCoaching()
  const del = useDeleteCoaching()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ mentorId: '', startDate: '', schedule: '', fieldNotes: '' })
  const reset = () => { setEditingId(null); setForm({ mentorId: '', startDate: '', schedule: '', fieldNotes: '' }) }
  const startEdit = (c: StudentCoaching) => { setEditingId(c.id); setForm({ mentorId: c.mentorId || '', startDate: c.startDate || '', schedule: c.schedule || '', fieldNotes: c.fieldNotes || '' }) }
  const save = () => {
    if (!form.mentorId && !form.schedule && !form.fieldNotes) return
    upsert.mutate({ id: editingId || undefined, studentId, mentorId: form.mentorId || undefined, startDate: form.startDate || undefined, schedule: form.schedule || undefined, fieldNotes: form.fieldNotes || undefined, createdBy }, { onSuccess: reset })
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-emerald-800">학습코칭 멘토 <span className="font-normal text-xs text-muted-foreground">· 월 {wonKR(COACHING_MONTHLY)}/학생</span></div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">배정된 학습코칭 멘토가 없습니다.</p>}
      {items.map(c => (
        <div key={c.id} className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
              <span>{mentorFullName(mentorById.get(c.mentorId || ''))}</span>
              {c.startDate && <Badge variant="outline">시작 {c.startDate}</Badge>}
              {c.schedule && <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">{c.schedule}</Badge>}
            </div>
            {showAdd && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm('삭제하시겠습니까?')) del.mutate({ id: c.id, studentId }) }}><Trash2 className="size-3.5" /></Button>
              </div>
            )}
          </div>
          {c.fieldNotes && <p className="text-sm mt-2 whitespace-pre-wrap">{c.fieldNotes}</p>}
        </div>
      ))}
      {showAdd && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{editingId ? '코칭 수정' : '코칭 추가'}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">멘토</Label>
              <select value={form.mentorId} onChange={e => setForm(f => ({ ...f, mentorId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">멘토 선택</option>
                {pool.map(m => <option key={m.id} value={m.id}>{mentorFullName(m)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">코칭 스케줄</Label>
            <Input value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder="예: 주3회, 월/목/토" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">코칭 분야 (메모)</Label>
            <Textarea value={form.fieldNotes} onChange={e => setForm(f => ({ ...f, fieldNotes: e.target.value }))} rows={2} placeholder="예: AP Calculus 단원평가 대비, 주간 학습계획 점검" className="text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            {editingId && <Button size="sm" variant="outline" onClick={reset}>취소</Button>}
            <Button size="sm" onClick={save} disabled={upsert.isPending}><Plus className="size-3.5 mr-1" />{editingId ? '저장' : '추가'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 전공별 멘토 (회당 지급 · 세션 로그) ──
function MajorMentorBlock({ studentId, createdBy, items, pool, mentorById, showAdd, canLogSessions }: {
  studentId: string; createdBy?: string; items: StudentCoaching[]; pool: Mentor[]; mentorById: Map<string, Mentor>; showAdd: boolean; canLogSessions: boolean
}) {
  const upsert = useUpsertCoaching()
  const del = useDeleteCoaching()
  const [form, setForm] = useState({ mentorId: '', startDate: '', fieldNotes: '' })
  const reset = () => setForm({ mentorId: '', startDate: '', fieldNotes: '' })
  const save = () => {
    if (!form.mentorId) return
    upsert.mutate({ studentId, mentorId: form.mentorId, startDate: form.startDate || undefined, fieldNotes: form.fieldNotes || undefined, createdBy }, { onSuccess: reset })
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-indigo-800">전공별 멘토 <span className="font-normal text-xs text-muted-foreground">· 회당 지급 (세션 1회 = 등급 단가)</span></div>
      {items.length === 0 && <p className="text-sm text-muted-foreground">배정된 전공별 멘토가 없습니다.</p>}
      {items.map(c => {
        const m = mentorById.get(c.mentorId || '')
        return (
          <div key={c.id} className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                <span>{mentorFullName(m)}</span>
                {m?.tier && <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50">{majorTierLabel(m.tier)} · {wonKR(majorTierAmount(m.tier))}/회</Badge>}
                {c.startDate && <Badge variant="outline">시작 {c.startDate}</Badge>}
              </div>
              {showAdd && (
                <Button size="sm" variant="ghost" onClick={() => { if (confirm('삭제하시겠습니까? (세션 기록도 함께 삭제됩니다)')) del.mutate({ id: c.id, studentId }) }}><Trash2 className="size-3.5" /></Button>
              )}
            </div>
            {c.fieldNotes && <p className="text-sm whitespace-pre-wrap">{c.fieldNotes}</p>}
            <MajorSessionLog coachingId={c.id} tier={m?.tier} createdBy={createdBy} canLog={canLogSessions} />
          </div>
        )
      })}
      {showAdd && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">전공별 멘토 추가</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">멘토 (등급·단가)</Label>
              <select value={form.mentorId} onChange={e => setForm(f => ({ ...f, mentorId: e.target.value }))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                <option value="">멘토 선택</option>
                {pool.map(m => <option key={m.id} value={m.id}>{mentorFullName(m)}{m.tier ? ` — ${majorTierLabel(m.tier)} ${wonKR(majorTierAmount(m.tier))}/회` : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">시작일 (선택)</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">메모 (선택)</Label>
            <Textarea value={form.fieldNotes} onChange={e => setForm(f => ({ ...f, fieldNotes: e.target.value }))} rows={2} placeholder="예: 리서치 페이퍼 지도 · 전공 심화" className="text-sm" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={upsert.isPending}><Plus className="size-3.5 mr-1" />추가</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 전공별 멘토 세션 로그 (날짜 + 코멘트 = 1회) ──
function MajorSessionLog({ coachingId, tier, createdBy, canLog }: { coachingId: string; tier?: string; createdBy?: string; canLog: boolean }) {
  const { data: sessions = [] } = useMentorSessions(coachingId)
  const add = useAddMentorSession()
  const del = useDeleteMentorSession()
  const [date, setDate] = useState('')
  const [comment, setComment] = useState('')
  const amount = majorTierAmount(tier)
  const save = () => {
    if (!date) return
    add.mutate({ coachingId, sessionDate: date, comment: comment || undefined, createdBy }, { onSuccess: () => { setDate(''); setComment('') } })
  }
  return (
    <div className="rounded-md border border-indigo-100 bg-white/60 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-indigo-700">세션 기록 <span className="text-muted-foreground font-normal">({sessions.length}회 · 합계 {wonKR(sessions.length * amount)})</span></span>
      </div>
      {sessions.length === 0 && <p className="text-xs text-muted-foreground">기록된 세션이 없습니다.</p>}
      {sessions.map(s => (
        <div key={s.id} className="flex items-start justify-between gap-2 rounded border border-indigo-50 bg-indigo-50/40 px-2 py-1.5">
          <div className="min-w-0 text-xs">
            <span className="font-medium tabular-nums">{s.sessionDate}</span>
            <span className="ml-2 text-indigo-600 tabular-nums">{wonKR(amount)}</span>
            {s.comment && <div className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{s.comment}</div>}
          </div>
          {canLog && (
            <button onClick={() => { if (confirm('이 세션 기록을 삭제할까요?')) del.mutate({ id: s.id, coachingId }) }} className="shrink-0 text-muted-foreground hover:text-red-500">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {canLog && (
        <div className="flex flex-col gap-1.5 pt-0.5 sm:flex-row sm:items-end">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">진행 날짜</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 w-40 text-sm" />
          </div>
          <div className="flex-1 space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">진행 내용 (코멘트)</Label>
            <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="예: 리서치 주제 확정 · 데이터 분석 지도" className="h-8 text-sm" />
          </div>
          <Button size="sm" onClick={save} disabled={add.isPending || !date}><Plus className="size-3.5 mr-1" />세션 추가</Button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────── Meetings ──────────────────────────
function MeetingsSection({ student, createdBy, authorName, canEdit }: {
  student: ServiceStudent
  createdBy?: string
  authorName?: string
  canEdit: boolean
}) {
  const studentId = student.id
  const t = useT()
  const consultantName = useConsultantName()
  const { data: meetings = [] } = useServiceMeetings(studentId)
  const del = useDeleteServiceMeeting()

  const { years } = useMemo(
    () => groupMeetingsByYear(student, meetings, todayKST()),
    [student, meetings],
  )
  const multiYear = years.length > 1
  // 다년 계약이면 현재 연차만 기본 펼침
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({})
  const isOpen = (y: MeetingYearGroup) => openYears[y.year] ?? y.isCurrent
  // 미팅리포트: 섹션 접기(기본 접힘)
  const [expanded, setExpanded] = useState(false)

  const renderMeeting = (m: ServiceMeeting) => (
    <div key={m.id} className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{m.meetingDate || '—'}</span>
          {m.meetingType && <Badge variant="outline">{m.meetingType}</Badge>}
          {m.meetingMode && (
            <Badge variant="outline" className={m.meetingMode === 'online' ? 'text-sky-700 border-sky-200 bg-sky-50' : 'text-emerald-700 border-emerald-200 bg-emerald-50'}>
              {t(m.meetingMode === 'online' ? 'student360.meetingModeOnline' : 'student360.meetingModeInPerson')}
            </Badge>
          )}
          <span className="text-muted-foreground font-normal">{consultantName(m.consultantId)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={REPORT_META[m.reportStatus].className}>
            <FileText className="size-3 mr-1" />{t(REPORT_META[m.reportStatus].labelKey)}
          </Badge>
          {canEdit && (
            <AutoDiaryButton studentId={studentId} meeting={m} createdBy={createdBy} authorName={authorName} canEdit={canEdit} />
          )}
          {canEdit && (
            <MeetingDialog
              studentId={studentId} meeting={m} createdBy={createdBy} canEdit={canEdit}
              trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
            />
          )}
          {canEdit && (
            <Button
              size="sm" variant="ghost"
              onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDelete'))) del.mutate({ id: m.id, studentId }) }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {m.summary && <p className="text-sm mt-2 whitespace-pre-wrap">{m.summary}</p>}
      {(m.prepUrl || m.reportUrl) && (
        <div className="mt-1 flex flex-wrap gap-3">
          {m.prepUrl && (
            <a href={m.prepUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              {t('student360.meetingPrepUrl')}
            </a>
          )}
          {m.reportUrl && (
            <a href={m.reportUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              {t('student360.reportLink')}{m.reportDate ? ` · ${m.reportDate}` : ''}
            </a>
          )}
        </div>
      )}
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-5 text-primary" />
          {t('student360.meetings')} <span className="text-muted-foreground font-normal">({meetings.length})</span>
        </CardTitle>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <MeetingDialog
              studentId={studentId} createdBy={createdBy} canEdit={canEdit}
              trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
            />
          )}
          <Button size="sm" variant="ghost" className="size-7" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-3">
        {meetings.length === 0 && <p className="text-sm text-muted-foreground">{t('student360.noMeetings')}</p>}

        {/* 단일 연도 계약: 기존처럼 평면 리스트 */}
        {!multiYear && meetings.map(renderMeeting)}

        {/* 다년 계약: 연차별 접기/펼치기 드롭다운 (연차별 진행률 막대 포함) */}
        {multiYear && years.map(yg => {
          const open = isOpen(yg)
          return (
            <div key={yg.year} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setOpenYears(m => ({ ...m, [yg.year]: !open }))}
                className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/30 transition-colors rounded-lg"
              >
                <span className="flex items-center gap-2 text-sm font-semibold shrink-0">
                  {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  {t('student360.contractYear', { n: yg.year })}
                  {yg.isCurrent && <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">{t('student360.currentYearBadge')}</Badge>}
                </span>
                <span className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{yg.completed} / {yg.target}</span>
                  <span className="hidden sm:block w-40 max-w-[45%]"><MeetingProgressBar completed={yg.completed} target={yg.target} /></span>
                </span>
              </button>
              {open && (
                <div className="border-t p-3 space-y-2">
                  {yg.meetings.length === 0
                    ? <p className="text-sm text-muted-foreground">{t('student360.noMeetings')}</p>
                    : yg.meetings.map(renderMeeting)}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
      )}
    </Card>
  )
}

// ─── Essay-editor meetings (simple memo, separate from consultant meetings) ───
function EditorMeetingsSection({ studentId, createdBy, defaultEditor, canEdit }: { studentId: string; createdBy?: string; defaultEditor?: string; canEdit: boolean }) {
  const { data: items = [] } = useEditorMeetings(studentId)
  const create = useCreateEditorMeeting()
  const update = useUpdateEditorMeeting()
  const del = useDeleteEditorMeeting()

  // 에세이에디터: 섹션 접기(기본 접힘)
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ meetingDate: '', editor: defaultEditor || '', content: '' })
  const reset = () => { setEditingId(null); setForm({ meetingDate: '', editor: defaultEditor || '', content: '' }) }

  const startEdit = (m: EditorMeeting) => {
    if (!canEdit) return
    setEditingId(m.id)
    setForm({ meetingDate: m.meetingDate || '', editor: m.editor || '', content: m.content || '' })
  }

  const save = () => {
    if (!canEdit) return
    if (!form.content.trim() && !form.meetingDate) return
    const payload = { studentId, meetingDate: form.meetingDate || undefined, editor: form.editor || undefined, content: form.content || undefined }
    if (editingId) {
      update.mutate({ id: editingId, ...payload }, { onSuccess: reset })
    } else {
      create.mutate({ ...payload, createdBy }, { onSuccess: reset })
    }
  }

  return (
    <Card className="border-teal-200">
      <CardHeader className="bg-teal-50/40 rounded-t-xl py-3 cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenTool className="size-5 text-teal-600" />
            에세이 에디터 미팅 <span className="text-muted-foreground font-normal">({items.length})</span>
          </CardTitle>
          <Button size="sm" variant="ghost" className="size-7" onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
        {items.map(m => (
          <div key={m.id} className="rounded-lg border border-teal-100 bg-teal-50/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{m.meetingDate || '—'}</span>
                {m.editor && <Badge variant="outline" className="border-teal-300 text-teal-700">{m.editor}</Badge>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (!canEdit) return; if (confirm('삭제하시겠습니까?')) del.mutate({ id: m.id, studentId }) }}><Trash2 className="size-3.5" /></Button>
                </div>
              )}
            </div>
            {m.content && <p className="text-sm mt-2 whitespace-pre-wrap">{m.content}</p>}
          </div>
        ))}

        {canEdit && (
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{editingId ? '미팅 수정' : '미팅 추가'}</div>
            <div className="flex gap-2">
              <Input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="h-8 text-sm w-40" />
              <Select value={form.editor} onValueChange={v => setForm(f => ({ ...f, editor: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="에디터 선택" /></SelectTrigger>
                <SelectContent>{ESSAY_EDITORS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="미팅 내용 메모..." rows={2} className="text-sm" />
            <div className="flex justify-end gap-2">
              {editingId && <Button size="sm" variant="outline" onClick={reset}>취소</Button>}
              <Button size="sm" onClick={save} disabled={create.isPending || update.isPending || (!form.content.trim() && !form.meetingDate)}>
                <Plus className="size-3.5 mr-1" />{editingId ? '저장' : '추가'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  )
}

function MeetingDialog({ studentId, meeting, trigger, createdBy, canEdit }: {
  studentId: string
  meeting?: ServiceMeeting
  trigger: ReactNode
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceMeeting()
  const update = useUpdateServiceMeeting()
  const buildForm = () => ({
    meetingDate: meeting?.meetingDate || '',
    meetingType: meeting?.meetingType || '',
    meetingMode: meeting?.meetingMode || '',
    consultantId: meeting?.consultantId || '',
    summary: meeting?.summary || '',
    prepUrl: meeting?.prepUrl || '',
    reportStatus: (meeting?.reportStatus || 'none') as string,
    reportUrl: meeting?.reportUrl || '',
    reportDate: meeting?.reportDate || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    if (!canEdit) return
    // A report link implies the report is submitted — auto-promote from 'none'.
    const effectiveReportStatus = (form.reportUrl && form.reportStatus === 'none')
      ? 'submitted'
      : (form.reportStatus as ServiceReportStatus)
    const payload = {
      meetingDate: form.meetingDate || undefined,
      meetingType: form.meetingType || undefined,
      meetingMode: form.meetingMode || undefined,
      consultantId: form.consultantId || undefined,
      summary: form.summary || undefined,
      prepUrl: form.prepUrl || undefined,
      reportStatus: effectiveReportStatus,
      reportUrl: form.reportUrl || undefined,
      reportDate: form.reportDate || undefined,
    }
    if (meeting) {
      update.mutate({ id: meeting.id, studentId, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
    } else {
      create.mutate({ studentId, ...payload, createdBy }, { onSuccess: () => setOpen(false), onError: reportSaveError })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{meeting ? t('student360.editMeeting') : t('student360.newMeeting')}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {/* 1줄: 미팅일 / 담당 컨설턴트 */}
          <div>
            <Label className="text-xs">{t('student360.meetingDate')}</Label>
            <Input type="date" value={form.meetingDate} onChange={e => set('meetingDate', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('student360.consultant')}</Label>
            <select value={form.consultantId} onChange={e => set('consultantId', e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="">—</option>
              {consultantPool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              {form.consultantId && !consultantPool.some(c => c.id === form.consultantId) && (
                <option value={form.consultantId}>{consultantName(form.consultantId)}</option>
              )}
            </select>
          </div>
          {/* 2줄: 유형 / 진행 형식 */}
          <div>
            <Label className="text-xs">{t('student360.meetingType')}</Label>
            <Select value={form.meetingType} onValueChange={v => set('meetingType', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('student360.meetingMode')}</Label>
            <Select value={form.meetingMode} onValueChange={v => set('meetingMode', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="online">{t('student360.meetingModeOnline')}</SelectItem>
                <SelectItem value="in_person">{t('student360.meetingModeInPerson')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* 3줄: 상담 준비 자료 / 리포트 링크 */}
          <LabeledInput label={t('student360.meetingPrepUrl')} value={form.prepUrl} onChange={v => set('prepUrl', v)} />
          <LabeledInput label={t('student360.reportUrl')} value={form.reportUrl} onChange={v => set('reportUrl', v)} />
          {/* 4줄: 리포트 상태 / 리포트일 */}
          <div>
            <Label className="text-xs">{t('student360.reportStatus')}</Label>
            <Select value={form.reportStatus} onValueChange={v => set('reportStatus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('student360.reportNone')}</SelectItem>
                <SelectItem value="pending">{t('student360.reportPending')}</SelectItem>
                <SelectItem value="submitted">{t('student360.reportSubmitted')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('student360.reportDate')}</Label>
            <Input type="date" value={form.reportDate} onChange={e => set('reportDate', e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('student360.summary')}</Label>
            <Textarea value={form.summary} onChange={e => set('summary', e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────── Diary ──────────────────────────
function DiarySection({ studentId, authorName, createdBy, canEdit }: {
  studentId: string
  authorName?: string
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const { data: entries = [] } = useServiceDiary(studentId)
  const del = useDeleteServiceDiary()
  const [diarySearch, setDiarySearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // 미팅다이어리: 섹션 접기(기본 펼침)
  const [expanded, setExpanded] = useState(true)

  const visibleEntries = useMemo(() => {
    const q = diarySearch.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(d =>
      (d.entryDate || '').toLowerCase().includes(q) ||
      DIARY_FIELDS.some(f => (d[f.key] || '').toLowerCase().includes(q))
    )
  }, [entries, diarySearch])

  const toggleOne = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const allCollapsed = visibleEntries.length > 0 && visibleEntries.every(d => collapsed.has(d.id))
  const setAll = (collapse: boolean) =>
    setCollapsed(collapse ? new Set(visibleEntries.map(d => d.id)) : new Set())

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookText className="size-5 text-primary" />
          {t('student360.diary')} <span className="text-muted-foreground font-normal">({entries.length})</span>
        </CardTitle>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {expanded && visibleEntries.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setAll(!allCollapsed)}>
              {allCollapsed
                ? <><ChevronDown className="size-4 mr-1" />{t('student360.expandAll')}</>
                : <><ChevronUp className="size-4 mr-1" />{t('student360.collapseAll')}</>}
            </Button>
          )}
          {canEdit && (
            <DiaryDialog
              studentId={studentId} authorName={authorName} createdBy={createdBy} canEdit={canEdit}
              trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
            />
          )}
          <Button size="sm" variant="ghost" className="size-7" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('student360.diarySearchPlaceholder')}
            value={diarySearch}
            onChange={(e) => setDiarySearch(e.target.value)}
          />
        </div>
        {entries.length === 0 && <p className="text-sm text-muted-foreground">{t('student360.noDiary')}</p>}
        {entries.length > 0 && visibleEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('student360.diaryNoMatch')}</p>
        )}
        {visibleEntries.map(d => {
          const isCollapsed = collapsed.has(d.id)
          return (
          <div key={d.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{d.entryDate || '—'}</span>
                {d.authorId && <span className="text-muted-foreground font-normal">{d.authorId}</span>}
                {d.nextMeetingDate ? (
                  <Badge variant="outline" className="text-[10px] font-normal shrink-0 bg-blue-50 text-blue-700 border-blue-200">
                    {t('student360.nextMeetingDate')} {d.nextMeetingDate}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-normal shrink-0 text-amber-700 border-amber-200 bg-amber-50">
                    {t('student360.nextMeetingDateMissing')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => toggleOne(d.id)}
                  title={isCollapsed ? t('student360.expand') : t('student360.collapse')}
                >
                  {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                </Button>
                {canEdit && (
                  <DiaryDialog
                    studentId={studentId} entry={d} authorName={authorName} createdBy={createdBy} canEdit={canEdit}
                    trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
                  />
                )}
                {canEdit && (
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDelete'))) del.mutate({ id: d.id, studentId }) }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {!isCollapsed && (<>
            {(d.prepUrl || d.summaryUrl) && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {d.prepUrl && (
                  <a href={d.prepUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {t('student360.prepUrl')}
                  </a>
                )}
                {d.summaryUrl && (
                  <a href={d.summaryUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {t('student360.summaryUrl')}
                  </a>
                )}
              </div>
            )}
            <div className="mt-2 space-y-2">
              {/* 6개 섹션 순서대로: Meeting Summary · QnA · Concerns · Assignments · Follow-up Commitments · Next Meeting Agenda */}
              {d.meetingSummary && (
                <div><p className="text-xs font-medium text-muted-foreground">Meeting Summary</p><p className="text-sm whitespace-pre-wrap">{d.meetingSummary}</p></div>
              )}
              {d.questionsConcerns && (
                <div><p className="text-xs font-medium text-muted-foreground">QnA</p><p className="text-sm whitespace-pre-wrap">{d.questionsConcerns}</p></div>
              )}
              {d.criticalIssue && (
                <div><p className="text-xs font-medium text-muted-foreground">Concerns</p><p className="text-sm whitespace-pre-wrap">{d.criticalIssue}</p></div>
              )}
              <FollowupChecklist
                studentId={studentId}
                diaryId={d.id}
                category="assignment"
                label="Assignments"
                fallbackText={d.assignments}
                createdBy={createdBy}
                showToggle={false}
                canEdit={canEdit}
              />
              <FollowupChecklist
                studentId={studentId}
                diaryId={d.id}
                category="followup"
                label="Follow-up Commitments"
                fallbackText={d.followUpCommitments}
                createdBy={createdBy}
                canEdit={canEdit}
              />
              {d.nextMeetingAgenda && (
                <div><p className="text-xs font-medium text-muted-foreground">Next Meeting Agenda</p><p className="text-sm whitespace-pre-wrap">{d.nextMeetingAgenda}</p></div>
              )}
            </div>
            </>)}
          </div>
          )
        })}
      </CardContent>
      )}
    </Card>
  )
}

function DiaryDialog({ studentId, entry, trigger, authorName, createdBy, canEdit }: {
  studentId: string
  entry?: ServiceDiaryEntry
  trigger: ReactNode
  authorName?: string
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceDiary()
  const update = useUpdateServiceDiary()
  const bulkCreateFollowups = useBulkCreateFollowups()
  const buildForm = () => ({
    entryDate: entry?.entryDate || new Date().toISOString().slice(0, 10),
    prepUrl: entry?.prepUrl || '',
    summaryUrl: entry?.summaryUrl || '',
    agendaItems: entry?.agendaItems || '',
    meetingSummary: entry?.meetingSummary || '',
    extracurricularNotes: entry?.extracurricularNotes || '',
    identityNarrativeNotes: entry?.identityNarrativeNotes || '',
    questionsConcerns: entry?.questionsConcerns || '',
    nextMeetingAgenda: entry?.nextMeetingAgenda || '',
    nextMeetingDate: entry?.nextMeetingDate || '',
    followUpCommitments: entry?.followUpCommitments || '',
    assignments: entry?.assignments || '',
    criticalDates: entry?.criticalDates || '',
    criticalIssue: entry?.criticalIssue || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!canEdit) return
    const payload = {
      entryDate: form.entryDate || undefined,
      prepUrl: form.prepUrl || undefined,
      summaryUrl: form.summaryUrl || undefined,
      agendaItems: form.agendaItems || undefined,
      meetingSummary: form.meetingSummary || undefined,
      extracurricularNotes: form.extracurricularNotes || undefined,
      identityNarrativeNotes: form.identityNarrativeNotes || undefined,
      questionsConcerns: form.questionsConcerns || undefined,
      nextMeetingAgenda: form.nextMeetingAgenda || undefined,
      nextMeetingDate: form.nextMeetingDate || undefined,
      followUpCommitments: form.followUpCommitments || undefined,
      assignments: form.assignments || undefined,
      criticalDates: form.criticalDates || undefined,
      criticalIssue: form.criticalIssue || undefined,
    }
    if (entry) {
      update.mutate({ id: entry.id, studentId, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
    } else {
      create.mutate({ studentId, ...payload, authorId: authorName, createdBy }, {
        onSuccess: (created) => {
          // 미팅에서 만드는 경로와 동작을 맞춘다 — 직접 만든 다이어리도
          // 적어둔 텍스트가 체크 항목으로 만들어져야 추적이 가능하다.
          if (created?.id) {
            const followupItems = splitFollowupText(form.followUpCommitments || '')
            if (followupItems.length) {
              bulkCreateFollowups.mutate({ studentId, diaryId: created.id, category: 'followup', items: followupItems, createdBy })
            }
            const assignmentItems = splitFollowupText(form.assignments || '')
            if (assignmentItems.length) {
              bulkCreateFollowups.mutate({ studentId, diaryId: created.id, category: 'assignment', items: assignmentItems, createdBy })
            }
          }
          setOpen(false)
        },
        onError: reportSaveError,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? t('student360.editDiary') : t('student360.newDiary')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('student360.entryDate')}</Label>
              <Input type="date" value={form.entryDate} onChange={e => setField('entryDate', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t('student360.nextMeetingDate')}</Label>
              <Input type="date" value={form.nextMeetingDate} onChange={e => setField('nextMeetingDate', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('student360.prepUrl')}</Label>
              <Input placeholder="https://..." value={form.prepUrl} onChange={e => setField('prepUrl', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t('student360.summaryUrl')}</Label>
              <Input placeholder="https://..." value={form.summaryUrl} onChange={e => setField('summaryUrl', e.target.value)} />
            </div>
          </div>
          {DIARY_FIELDS.map(f => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Textarea
                value={form[f.key]}
                onChange={e => setField(f.key, e.target.value)}
                rows={3}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────── Archive ──────────────────────────
type PerGradeCategory = 'strength_result' | 'strength_report' | 'grade_report' | 'grade_analysis'

const ARCHIVE_PER_GRADE: { key: PerGradeCategory; labelKey: string }[] = [
  { key: 'strength_result', labelKey: 'archive.strengthResult' },
  { key: 'strength_report', labelKey: 'archive.strengthReport' },
  { key: 'grade_report',    labelKey: 'archive.gradeReport' },
  { key: 'grade_analysis',  labelKey: 'archive.gradeAnalysis' },
]

function ArchiveSection({ studentId, createdBy, canEdit }: { studentId: string; createdBy?: string; canEdit: boolean }) {
  const t = useT()
  const { data: reports = [] } = useServiceReports(studentId)

  const byCategory = (cat: ServiceReportCategory) => reports.filter(r => r.category === cat)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderArchive className="size-5 text-primary" />
          {t('archive.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ARCHIVE_PER_GRADE.map(g => (
          <PerGradeArchiveBlock
            key={g.key}
            studentId={studentId}
            createdBy={createdBy}
            canEdit={canEdit}
            category={g.key}
            title={t(g.labelKey)}
            rows={byCategory(g.key)}
          />
        ))}
        <OtherArchiveBlock
          studentId={studentId}
          createdBy={createdBy}
          canEdit={canEdit}
          rows={byCategory('other')}
        />
      </CardContent>
    </Card>
  )
}

function PerGradeArchiveBlock({
  studentId, createdBy, category, title, rows, canEdit,
}: {
  studentId: string
  createdBy?: string
  category: PerGradeCategory
  title: string
  rows: { id: string; grade?: string; url: string }[]
  canEdit: boolean
}) {
  const t = useT()
  const create = useCreateServiceReport()
  const del = useDeleteServiceReport()
  const [adding, setAdding] = useState(false)
  const [grade, setGrade] = useState('')
  const [url, setUrl] = useState('')

  const save = () => {
    if (!canEdit) return
    if (!url.trim()) return
    create.mutate(
      { studentId, category, grade: grade || undefined, url: url.trim(), createdBy },
      {
        onError: reportSaveError,
        onSuccess: () => { setGrade(''); setUrl(''); setAdding(false) },
      },
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm">{title}</p>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(v => !v)}>
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {rows.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">{t('archive.empty')}</p>
      )}
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-[10px] shrink-0">{r.grade || '—'}</Badge>
            <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline truncate flex-1">
              {r.url}
            </a>
            {canEdit && (
              <Button
                size="sm" variant="ghost"
                onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDelete'))) del.mutate({ id: r.id, studentId }) }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <div className="grid grid-cols-[100px_1fr_auto] gap-2 mt-2">
          <Input placeholder={t('archive.gradePlaceholder')} value={grade} onChange={e => setGrade(e.target.value)} />
          <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
          <Button size="sm" onClick={save} disabled={!url.trim()}>{t('common.save')}</Button>
        </div>
      )}
    </div>
  )
}

function OtherArchiveBlock({
  studentId, createdBy, rows, canEdit,
}: {
  studentId: string
  createdBy?: string
  rows: { id: string; label?: string; url: string }[]
  canEdit: boolean
}) {
  const t = useT()
  const create = useCreateServiceReport()
  const del = useDeleteServiceReport()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const save = () => {
    if (!canEdit) return
    if (!url.trim()) return
    create.mutate(
      { studentId, category: 'other', label: label || undefined, url: url.trim(), createdBy },
      { onError: reportSaveError, onSuccess: () => { setLabel(''); setUrl(''); setAdding(false) } },
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm">{t('archive.other')}</p>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(v => !v)}>
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {rows.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">{t('archive.empty')}</p>
      )}
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            {r.label && <Badge variant="outline" className="text-[10px] shrink-0">{r.label}</Badge>}
            <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline truncate flex-1">
              {r.url}
            </a>
            {canEdit && (
              <Button
                size="sm" variant="ghost"
                onClick={() => { if (!canEdit) return; if (confirm(t('student360.confirmDelete'))) del.mutate({ id: r.id, studentId }) }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <div className="grid grid-cols-[140px_1fr_auto] gap-2 mt-2">
          <Input placeholder={t('archive.labelPlaceholder')} value={label} onChange={e => setLabel(e.target.value)} />
          <Input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
          <Button size="sm" onClick={save} disabled={!url.trim()}>{t('common.save')}</Button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────── Auto-Diary (AI) ──────────────────────────
function AutoDiaryButton({ studentId, meeting, createdBy, authorName, canEdit }: {
  studentId: string
  meeting: ServiceMeeting
  createdBy?: string
  authorName?: string
  canEdit: boolean
}) {
  const t = useT()
  const create = useCreateServiceDiary()
  const bulkCreateFollowups = useBulkCreateFollowups()
  const updateMeeting = useUpdateServiceMeeting()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setUrl(meeting.reportUrl || '')
      setText('')
      setError(null)
    }
  }, [open, meeting.reportUrl])

  const run = async () => {
    if (!canEdit) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('extract-meeting-diary', {
        body: { url: url || undefined, text: text || undefined },
      })
      if (fnError) {
        // The default message ("non-2xx") hides the real reason; read the body.
        let detail = fnError.message || String(fnError)
        const ctx = (fnError as { context?: Response }).context
        if (ctx && typeof ctx.text === 'function') {
          try {
            const raw = await ctx.text()
            try {
              const parsed = JSON.parse(raw) as { error?: string; message?: string }
              detail = parsed.error || parsed.message || raw || detail
            } catch {
              detail = raw || detail
            }
          } catch { /* ignore */ }
        }
        throw new Error(detail)
      }
      if (!data?.ok) throw new Error(data?.error || 'Extraction failed')

      const d = data.diary as Record<string, string>
      create.mutate(
        {
          studentId,
          entryDate: meeting.meetingDate || new Date().toISOString().slice(0, 10),
          agendaItems: d.agendaItems || undefined,
          meetingSummary: d.meetingSummary || undefined,
          extracurricularNotes: d.extracurricularNotes || undefined,
          identityNarrativeNotes: d.identityNarrativeNotes || undefined,
          questionsConcerns: d.questionsConcerns || undefined,
          nextMeetingAgenda: d.nextMeetingAgenda || undefined,
          nextMeetingDate: d.nextMeetingDate || undefined,
          followUpCommitments: d.followUpCommitments || undefined,
          assignments: d.assignments || undefined,
          criticalDates: d.criticalDates || undefined,
          criticalIssue: d.criticalIssue || undefined,
          authorId: authorName,
          createdBy,
        },
        {
          onSuccess: (created) => {
            if (created?.id) {
              const followupItems = splitFollowupText(d.followUpCommitments || '')
              if (followupItems.length) {
                bulkCreateFollowups.mutate({
                  studentId,
                  diaryId: created.id,
                  category: 'followup',
                  items: followupItems,
                  createdBy,
                })
              }
              const assignmentItems = splitFollowupText(d.assignments || '')
              if (assignmentItems.length) {
                bulkCreateFollowups.mutate({
                  studentId,
                  diaryId: created.id,
                  category: 'assignment',
                  items: assignmentItems,
                  createdBy,
                })
              }
            }
            // The meeting diary IS the report — mark the meeting as submitted so
            // dashboards/KPI/invoices stop showing it as 미제출.
            updateMeeting.mutate({
              id: meeting.id,
              studentId,
              reportStatus: 'submitted',
              reportUrl: url || meeting.reportUrl || undefined,
            })
            setOpen(false)
          },
          onError: (e) => setError((e as { message?: string })?.message || String(e)),
        },
      )
    } catch (e) {
      setError((e as { message?: string })?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>
        <Button size="sm" variant="ghost" title={t('autoDiary.tooltip')}>
          <Sparkles className="size-3.5" />
        </Button>
      </span>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('autoDiary.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('autoDiary.help')}</p>
          <div>
            <Label className="text-xs">{t('autoDiary.urlLabel')}</Label>
            <Input
              placeholder="https://docs.google.com/... or drive.google.com/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t('autoDiary.textLabel')}</Label>
            <Textarea
              placeholder={t('autoDiary.textPlaceholder')}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 whitespace-pre-wrap">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={run} disabled={loading || (!url && !text)}>
            {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
            {t('autoDiary.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ────────────────────────── Follow-up Checklist ──────────────────────────
function FollowupChecklist({ studentId, diaryId, fallbackText, createdBy, category = 'followup', labelKey = 'student360.followUpCommitments', label, showToggle = true, canEdit }: {
  studentId: string
  diaryId: string
  fallbackText?: string
  createdBy?: string
  category?: string
  labelKey?: string
  label?: string
  showToggle?: boolean
  canEdit: boolean
}) {
  const t = useT()
  const heading = label ?? t(labelKey)
  const { data: all = [] } = useServiceFollowups(studentId)
  const items = useMemo(
    () => all.filter(f => f.diaryId === diaryId && (f.category || 'followup') === category),
    [all, diaryId, category],
  )
  const toggle = useToggleFollowup()
  const create = useCreateFollowup()
  const update = useUpdateFollowup()
  const del = useDeleteFollowup()
  const bulkCreate = useBulkCreateFollowups()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const startEdit = (id: string, text: string) => { if (!canEdit) return; setEditingId(id); setEditDraft(text) }
  const saveEdit = () => {
    if (!canEdit) return
    const v = editDraft.trim()
    if (!editingId || !v) { setEditingId(null); return }
    update.mutate({ id: editingId, studentId, text: v }, { onSuccess: () => setEditingId(null), onError: reportSaveError })
  }

  // Nothing to render: no structured items AND no raw text
  if (!items.length && !fallbackText && !adding) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{heading}</p>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  const save = () => {
    if (!canEdit) return
    const v = draft.trim()
    if (!v) { setAdding(false); return }
    create.mutate(
      { studentId, diaryId, category, text: v, createdBy },
      { onSuccess: () => { setDraft(''); setAdding(false) }, onError: reportSaveError },
    )
  }

  const doneCount = items.filter(i => i.done).length

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">
          {heading}
          {items.length > 0 && (
            <span className="ml-1 text-muted-foreground/70">
              {showToggle ? `(${doneCount}/${items.length})` : `(${items.length})`}
            </span>
          )}
        </p>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      {/* 아직 체크 항목이 없고 텍스트만 있는 경우 — 텍스트를 보여주고,
          한 번의 클릭으로 체크 가능한 항목으로 바꿀 수 있게 한다.
          (예전 다이어리나 텍스트만 수정한 다이어리가 여기에 해당) */}
      {items.length === 0 && fallbackText && (
        <div className="space-y-1.5">
          <p className="text-sm whitespace-pre-wrap text-muted-foreground italic">{fallbackText}</p>
          {canEdit && splitFollowupText(fallbackText).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={bulkCreate.isPending}
              onClick={() => bulkCreate.mutate(
                { studentId, diaryId, category, items: splitFollowupText(fallbackText), createdBy },
                { onError: reportSaveError },
              )}
            >
              {t('student360.convertToChecklist')}
            </Button>
          )}
        </div>
      )}

      <ul className="space-y-1.5">
        {items.map(f => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            {showToggle && editingId !== f.id && (
              <Switch
                checked={f.done}
                disabled={!canEdit}
                onCheckedChange={(v) => { if (!canEdit) return; toggle.mutate({ id: f.id, studentId, done: !!v }) }}
                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-red-500"
              />
            )}
            {editingId === f.id ? (
              <>
                <Input
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                  className="flex-1 h-8"
                  autoFocus
                />
                <Button size="sm" onClick={saveEdit} disabled={!editDraft.trim()}>{t('common.save')}</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>{t('common.cancel')}</Button>
              </>
            ) : (
              <>
                {showToggle && f.done && (
                  <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">완료됨</Badge>
                )}
                <span className={`flex-1 ${showToggle && f.done ? 'line-through text-muted-foreground' : ''}`}>
                  {f.text}
                </span>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-primary" onClick={() => startEdit(f.id, f.text)}>
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => { if (!canEdit) return; del.mutate({ id: f.id, studentId }) }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="flex gap-2 mt-2">
          <Input
            placeholder={t('followup.placeholder')}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" onClick={save} disabled={!draft.trim()}>
            {t('common.save')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setDraft(''); setAdding(false) }}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}
