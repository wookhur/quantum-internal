import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  Lock, Unlock, MessageSquare, Send,
} from 'lucide-react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import { supabase } from '@/lib/supabase'
import {
  useEditorMeetings, useCreateEditorMeeting, useUpdateEditorMeeting, useDeleteEditorMeeting,
  type EditorMeeting,
} from '@/hooks/useEditorMeetings'
import {
  useServiceStudents, useCreateServiceStudent, useUpdateServiceStudent, useDeleteServiceStudent,
  useServiceMeetings, useCreateServiceMeeting, useUpdateServiceMeeting, useDeleteServiceMeeting,
  useServiceDiary, useCreateServiceDiary, useUpdateServiceDiary, useDeleteServiceDiary,
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
  type ECActivity,
} from '@/hooks/useECActivities'
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

// Consultant pool + helpers (shared with KPI page)
import { useConsultantPool, useConsultantName } from '@/lib/consultants'
import { kpiDotColor } from '@/lib/kpi'
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
  'Cindy', 'Eva', 'Jisoo', 'Liz', 'Maryam', 'Sam', 'Wook', '김지현', '남연서',
] as const

const ACADEMY_PRESETS = [
  '숨마스프렙', '와이즈조인', '이준형코치',  // Korean (alphabetical)
  'CRI', 'IVYPenn Edu', 'Prime', 'tutor Ava', // English (alphabetical)
] as const

const SEASON_OPTIONS = ['방학', '학기중'] as const

/** Student statuses. finished/canceled = archived (hidden from active list). */
const STUDENT_STATUS_OPTIONS = [
  { value: 'active', labelKey: 'student360.statusActive' },
  { value: 'finished', labelKey: 'student360.statusFinished' },
  { value: 'canceled', labelKey: 'student360.statusCanceled' },
] as const

export function isArchivedStatus(status?: string): boolean {
  return status === 'finished' || status === 'canceled'
}

function statusLabelFor(t: (k: string) => string, status?: string): string {
  const o = STUDENT_STATUS_OPTIONS.find(x => x.value === status)
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

const ESSAY_EDITORS = ['Somee Park', 'Danny Kim', '한상범+양은영'] as const

// KPI dot color legend, expressed as % of KPI_MAX so it always matches kpiDotColor().
const KPI_LEGEND = [
  { color: 'bg-emerald-500', label: `≥${Math.round((9 / KPI_MAX) * 100)}%` },
  { color: 'bg-yellow-400', label: `≥${Math.round((7 / KPI_MAX) * 100)}%` },
  { color: 'bg-red-500', label: `≥${Math.round((5 / KPI_MAX) * 100)}%` },
  { color: 'bg-black', label: `<${Math.round((5 / KPI_MAX) * 100)}%` },
]

/** Tooltip text for the hourglass: lists which meetings are missing a summary report. */
function missingReportTitle(items: { date?: string; type?: string }[] | undefined, header: string): string {
  if (!items || items.length === 0) return header
  const lines = items
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(it => {
      const d = it.date ? `${Number(it.date.slice(5, 7))}/${Number(it.date.slice(8, 10))}` : '날짜미상'
      return `· ${d}${it.type ? ` ${it.type}` : ''}`
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
const DIARY_FIELDS = [
  { key: 'agendaItems', labelKey: 'student360.agendaItems' },
  { key: 'meetingSummary', labelKey: 'student360.meetingSummary' },
  { key: 'extracurricularNotes', labelKey: 'student360.extracurricularNotes' },
  { key: 'identityNarrativeNotes', labelKey: 'student360.identityNarrativeNotes' },
  { key: 'questionsConcerns', labelKey: 'student360.questionsConcerns' },
  { key: 'nextMeetingAgenda', labelKey: 'student360.nextMeetingAgenda' },
  { key: 'followUpCommitments', labelKey: 'student360.followUpCommitments' },
  { key: 'assignments', labelKey: 'student360.assignments' },
  { key: 'criticalDates', labelKey: 'student360.criticalDates' },
  { key: 'criticalIssue', labelKey: 'student360.criticalIssue' },
] as const satisfies ReadonlyArray<{ key: keyof ServiceDiaryEntry; labelKey: string }>

export function Student360Page() {
  const t = useT()
  const { user } = useAuth()
  const canEdit = useCanEdit(useLocation().pathname)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [consultantFilter, setConsultantFilter] = useState('')
  const [showArchive, setShowArchive] = useState(false)
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

  const { data: students = [], isLoading } = useServiceStudents()
  const { data: studentKpis = {} } = useStudentKpis()
  const statusFlags = useStudentStatusFlags()
  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()

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
  const filterName = consultantFilter ? consultantName(consultantFilter) : ''

  // Archived = 서비스 완료(finished) / 서비스 취소(canceled). Archived students keep
  // all their data but are hidden from the active list; the 아카이브 tab shows them.
  const archiveCount = useMemo(() => students.filter(s => isArchivedStatus(s.status)).length, [students])
  const activeCount = students.length - archiveCount

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (showArchive ? !isArchivedStatus(s.status) : isArchivedStatus(s.status)) return false
      if (filterName && consultantName(s.assignedConsultant) !== filterName) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.koreanName || '').toLowerCase().includes(q) ||
        (s.school || '').toLowerCase().includes(q) ||
        (s.parentName || '').toLowerCase().includes(q)
      )
    })
  }, [students, search, filterName, consultantName, showArchive])

  const selected = students.find(s => s.id === selectedId) || null
  const statusLabel = (status?: string) => {
    const o = STUDENT_STATUS_OPTIONS.find(x => x.value === status)
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
        <Select
          value={consultantFilter || '__all__'}
          onValueChange={v => setConsultantFilter(v === '__all__' ? '' : (v ?? ''))}
        >
          <SelectTrigger className="mb-3">
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
                    {s.name}{s.koreanName ? ` · ${s.koreanName}` : ''}
                  </span>
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
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${isArchivedStatus(s.status) ? (s.status === 'canceled' ? 'text-red-600 border-red-200' : 'text-gray-500 border-gray-300') : ''}`}>{statusLabel(s.status)}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {[s.school, s.grade].filter(Boolean).join(' · ') || '—'}
              </div>
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
          <div className="space-y-4">
            <ProfileSection student={selected} onDeleted={() => setSelectedId(null)} createdBy={user?.id} canEdit={canEdit} />
            <ECServicesSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
            <AcademicSupportSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
            <PortalLinksSection studentId={selected.id} studentName={selected.name} createdBy={user?.id} canEdit={canEdit} />
            <IssueReportSection studentId={selected.id} studentName={selected.name} userId={user?.id} userName={user?.name} isAdmin={user?.role === 'admin' || user?.role === 'c_level'} canEdit={canEdit} />
            <MeetingsSection studentId={selected.id} createdBy={user?.id} authorName={user?.name} canEdit={canEdit} />
            {selected.essayEditor && (
              <EditorMeetingsSection studentId={selected.id} createdBy={user?.id} defaultEditor={selected.essayEditor} canEdit={canEdit} />
            )}
            <DiarySection studentId={selected.id} authorName={user?.name} createdBy={user?.id} canEdit={canEdit} />
            <ArchiveSection studentId={selected.id} createdBy={user?.id} canEdit={canEdit} />
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────── Profile ──────────────────────────
function ProfileSection({ student, onDeleted, createdBy, canEdit }: {
  student: ServiceStudent
  onDeleted: () => void
  createdBy?: string
  canEdit: boolean
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const del = useDeleteServiceStudent()

  const queryClient = useQueryClient()
  const contractQuery = useQuery({
    queryKey: ['contract-for-student', student.id],
    queryFn: async () => {
      const names = [student.name, student.koreanName].filter(Boolean)
      if (names.length === 0) return null
      const { data } = await supabase
        .from('contracts')
        .select('id, application_count, additional_services')
        .in('student_name', names)
        .limit(1)
      return data?.[0] ?? null
    },
  })
  const contractData = contractQuery.data

  const applicationCount = contractData?.application_count ?? student.applicationCount
  const additionalServices = contractData?.additional_services ?? student.additionalServices

  const [editingContract, setEditingContract] = useState(false)
  const [editAppCount, setEditAppCount] = useState('')
  const [editAddServices, setEditAddServices] = useState('')

  const openContractEdit = () => {
    if (!canEdit) return
    setEditAppCount(applicationCount ? String(applicationCount) : '')
    setEditAddServices(additionalServices || '')
    setEditingContract(true)
  }

  const saveContract = useMutation({
    mutationFn: async () => {
      const appCount = editAppCount ? Number(editAppCount) : null
      const addSvc = editAddServices.trim() || null
      if (contractData?.id) {
        await supabase.from('contracts').update({
          application_count: appCount,
          additional_services: addSvc,
        }).eq('id', contractData.id)
      } else {
        await supabase.from('service_students').update({
          application_count: appCount,
          additional_services: addSvc,
        }).eq('id', student.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-for-student', student.id] })
      queryClient.invalidateQueries({ queryKey: ['service-students'] })
      setEditingContract(false)
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="size-5 text-primary" />
          {student.name}
          {student.koreanName && <span className="text-muted-foreground font-normal">· {student.koreanName}</span>}
          {student.status && <Badge variant="outline" className={isArchivedStatus(student.status) ? (student.status === 'canceled' ? 'text-red-600 border-red-200' : 'text-gray-500 border-gray-300') : ''}>{statusLabelFor(t, student.status)}</Badge>}
        </CardTitle>
        {canEdit && (
          <div className="flex gap-2">
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
        <Field label={t('student360.consultant')} value={consultantName(student.assignedConsultant)} />
        <Field label={t('student360.essayEditor')} value={student.essayEditor} />
        <Field label={t('student360.majors')} value={student.majors} />
        <Field label={t('student360.contractType')} value={student.contractType} />
        <div className="col-span-2 rounded-md border border-dashed p-3 grid grid-cols-2 gap-x-6 gap-y-2">
          <div className="col-span-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{t('contracts.applicationCount')} / {t('contracts.additionalServices')}</p>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={openContractEdit}>
                <Pencil className="size-3 mr-1" />{t('common.edit')}
              </Button>
            )}
          </div>
          <Field label={t('contracts.applicationCount')} value={applicationCount ? `${applicationCount}개` : undefined} />
          <Field label={t('contracts.additionalServices')} value={additionalServices ?? undefined} />
        </div>
        <Dialog open={editingContract} onOpenChange={setEditingContract}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('contracts.applicationCount')} / {t('contracts.additionalServices')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('contracts.applicationCount')}</Label>
                <Input type="number" value={editAppCount} onChange={e => setEditAppCount(e.target.value)} placeholder={t('student360.placeholderAppCount')} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('contracts.additionalServices')}</Label>
                <Input value={editAddServices} onChange={e => setEditAddServices(e.target.value)} placeholder={t('student360.placeholderAddServices')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingContract(false)}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={() => { if (!canEdit) return; saveContract.mutate() }} disabled={saveContract.isPending}>
                {saveContract.isPending ? <Loader2 className="size-4 animate-spin" /> : t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      </CardContent>
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

// ────────────────────────── EC Services ──────────────────────────
function ECServicesSection({ studentId, createdBy, canEdit }: { studentId: string; createdBy?: string; canEdit: boolean }) {
  const { data: activities = [] } = useECActivities(studentId)
  const del = useDeleteECActivity()
  const t = useT()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="size-5 text-primary" />
          {t('student360.ecService')}
          <span className="text-muted-foreground font-normal">({activities.length})</span>
        </CardTitle>
        {canEdit && (
          <ECActivityDialog
            studentId={studentId}
            createdBy={createdBy}
            canEdit={canEdit}
            trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('student360.noEcServices')}</p>
        )}
        {activities.map(a => (
          <div key={a.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{a.partner || '—'}</span>
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
          </div>
        ))}
      </CardContent>
    </Card>
  )
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
  const t = useT()

  const buildForm = () => ({
    partner: activity?.partner || '',
    periodStart: activity?.periodStart || '',
    periodEnd: activity?.periodEnd || '',
    program: activity?.program || '',
    billed: activity?.billedAmount != null ? String(activity.billedAmount) : '',
    sc1Select: ecSalesSelectVal(activity?.salesContributor1),
    sc1Custom: ecSalesCustomVal(activity?.salesContributor1),
    sc2Select: ecSalesSelectVal(activity?.salesContributor2),
    sc2Custom: ecSalesCustomVal(activity?.salesContributor2),
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    if (!canEdit) return
    const payload = {
      studentId,
      partner: form.partner || undefined,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      program: form.program || undefined,
      billedAmount: form.billed ? Number(form.billed) : undefined,
      salesContributor1: ecSalesFinal(form.sc1Select, form.sc1Custom),
      salesContributor2: ecSalesFinal(form.sc2Select, form.sc2Custom),
      createdBy,
    }
    if (activity) {
      update.mutate({ id: activity.id, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
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
                {EC_PARTNERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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

// ────────────────────────── Academic Support ──────────────────────────
function AcademicSupportSection({ studentId, createdBy, canEdit }: { studentId: string; createdBy?: string; canEdit: boolean }) {
  const { data: items = [] } = useAcademicSupport(studentId)
  const del = useDeleteAcademicSupport()
  const t = useT()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="size-5 text-primary" />
          {t('student360.academicSupport')}
          <span className="text-muted-foreground font-normal">({items.length})</span>
        </CardTitle>
        {canEdit && (
          <AcademicSupportDialog
            studentId={studentId}
            createdBy={createdBy}
            canEdit={canEdit}
            trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('student360.noAcademicSupport')}</p>
        )}
        {items.map(item => (
          <div key={item.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{item.academyName || '—'}</span>
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
          </div>
        ))}
      </CardContent>
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
  const t = useT()

  const buildForm = () => ({
    academySelect: item?.academyName && (ACADEMY_PRESETS as readonly string[]).includes(item.academyName)
      ? item.academyName : item?.academyName ? '직접입력' : '',
    academyCustom: item?.academyName && !(ACADEMY_PRESETS as readonly string[]).includes(item.academyName)
      ? item.academyName : '',
    subject: item?.subject || '',
    season: item?.season || '',
    periodStart: item?.periodStart || '',
    periodEnd: item?.periodEnd || '',
    notes: item?.notes || '',
    billed: item?.billedAmount != null ? String(item.billedAmount) : '',
    salesContributor1: item?.salesContributor1 || '',
    salesContributor2: item?.salesContributor2 || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    if (!canEdit) return
    const resolvedAcademy = form.academySelect === '직접입력'
      ? (form.academyCustom.trim() || undefined)
      : (form.academySelect || undefined)
    const payload = {
      studentId,
      academyName: resolvedAcademy,
      subject: form.subject || undefined,
      season: form.season || undefined,
      periodStart: form.periodStart || undefined,
      periodEnd: form.periodEnd || undefined,
      notes: form.notes || undefined,
      billedAmount: form.billed ? Number(form.billed) : undefined,
      salesContributor1: form.salesContributor1 || undefined,
      salesContributor2: form.salesContributor2 || undefined,
      createdBy,
    }
    if (item) {
      update.mutate({ id: item.id, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
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
          {/* 시기 + 기간 */}
          <div>
            <Label className="text-xs">{t('student360.season')}</Label>
            <Select value={form.season || null} onValueChange={v => set('season', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {SEASON_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <AlertTriangle className="size-4 text-rose-500" />
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

// ────────────────────────── Meetings ──────────────────────────
function MeetingsSection({ studentId, createdBy, authorName, canEdit }: {
  studentId: string
  createdBy?: string
  authorName?: string
  canEdit: boolean
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const { data: meetings = [] } = useServiceMeetings(studentId)
  const del = useDeleteServiceMeeting()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-5 text-primary" />
          {t('student360.meetings')} <span className="text-muted-foreground font-normal">({meetings.length})</span>
        </CardTitle>
        {canEdit && (
          <MeetingDialog
            studentId={studentId} createdBy={createdBy} canEdit={canEdit}
            trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
          />
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {meetings.length === 0 && <p className="text-sm text-muted-foreground">{t('student360.noMeetings')}</p>}
        {meetings.map(m => (
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
                  <AutoDiaryButton
                    studentId={studentId}
                    meeting={m}
                    createdBy={createdBy}
                    authorName={authorName}
                    canEdit={canEdit}
                  />
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
        ))}
      </CardContent>
    </Card>
  )
}

// ─── Essay-editor meetings (simple memo, separate from consultant meetings) ───
function EditorMeetingsSection({ studentId, createdBy, defaultEditor, canEdit }: { studentId: string; createdBy?: string; defaultEditor?: string; canEdit: boolean }) {
  const { data: items = [] } = useEditorMeetings(studentId)
  const create = useCreateEditorMeeting()
  const update = useUpdateEditorMeeting()
  const del = useDeleteEditorMeeting()

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
      <CardHeader className="bg-teal-50/40 rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-5 text-teal-600" />
          에세이 에디터 미팅 <span className="text-muted-foreground font-normal">({items.length})</span>
        </CardTitle>
      </CardHeader>
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-5 text-primary" />
          {t('student360.diary')} <span className="text-muted-foreground font-normal">({entries.length})</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {visibleEntries.length > 1 && (
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
        </div>
      </CardHeader>
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
              {DIARY_FIELDS.map(f => {
                // Shown as checklists below instead of plain text
                if (f.key === 'followUpCommitments' || f.key === 'assignments') return null
                const val = d[f.key]
                if (!val) return null
                return (
                  <div key={f.key}>
                    <p className="text-xs font-medium text-muted-foreground">{t(f.labelKey)}</p>
                    <p className="text-sm whitespace-pre-wrap">{val}</p>
                  </div>
                )
              })}
              <FollowupChecklist
                studentId={studentId}
                diaryId={d.id}
                category="followup"
                labelKey="student360.followUpCommitments"
                fallbackText={d.followUpCommitments}
                createdBy={createdBy}
                canEdit={canEdit}
              />
              <FollowupChecklist
                studentId={studentId}
                diaryId={d.id}
                category="assignment"
                labelKey="student360.assignments"
                fallbackText={d.assignments}
                createdBy={createdBy}
                showToggle={false}
                canEdit={canEdit}
              />
            </div>
            </>)}
          </div>
          )
        })}
      </CardContent>
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
      followUpCommitments: form.followUpCommitments || undefined,
      assignments: form.assignments || undefined,
      criticalDates: form.criticalDates || undefined,
      criticalIssue: form.criticalIssue || undefined,
    }
    if (entry) {
      update.mutate({ id: entry.id, studentId, ...payload }, { onSuccess: () => setOpen(false), onError: reportSaveError })
    } else {
      create.mutate({ studentId, ...payload, authorId: authorName, createdBy }, { onSuccess: () => setOpen(false), onError: reportSaveError })
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
          <div>
            <Label className="text-xs">{t('student360.entryDate')}</Label>
            <Input type="date" value={form.entryDate} onChange={e => setField('entryDate', e.target.value)} />
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
              <Label className="text-xs">{t(f.labelKey)}</Label>
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
          <FileText className="size-5 text-primary" />
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
function FollowupChecklist({ studentId, diaryId, fallbackText, createdBy, category = 'followup', labelKey = 'student360.followUpCommitments', showToggle = true, canEdit }: {
  studentId: string
  diaryId: string
  fallbackText?: string
  createdBy?: string
  category?: string
  labelKey?: string
  showToggle?: boolean
  canEdit: boolean
}) {
  const t = useT()
  const { data: all = [] } = useServiceFollowups(studentId)
  const items = useMemo(
    () => all.filter(f => f.diaryId === diaryId && (f.category || 'followup') === category),
    [all, diaryId, category],
  )
  const toggle = useToggleFollowup()
  const create = useCreateFollowup()
  const update = useUpdateFollowup()
  const del = useDeleteFollowup()
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
          <p className="text-xs font-medium text-muted-foreground">{t(labelKey)}</p>
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
          {t(labelKey)}
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

      {/* If no structured items yet but there is raw text, show it (one-time fallback) */}
      {items.length === 0 && fallbackText && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground italic">{fallbackText}</p>
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
