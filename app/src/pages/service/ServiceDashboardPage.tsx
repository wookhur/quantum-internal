import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  ChevronLeft, ChevronRight, Plus, X, ExternalLink,
  Users, Calendar, AlertCircle, FileText, CheckSquare,
  Loader2, Trash2, UserSearch, BarChart3, UserPlus, CheckCircle2, XCircle, Activity, GraduationCap,
} from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  useServiceStudents, useServiceDiary,
  useUpdateServiceMeeting, useDeleteServiceMeeting,
} from '@/hooks/useServiceStudents'
import { useServiceFollowups } from '@/hooks/useServiceFollowups'
import { useECActivities } from '@/hooks/useECActivities'
import { useAcademicSupport } from '@/hooks/useAcademicSupport'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import {
  useAllServiceMeetings, useAllServiceFollowupsDue, useEmployeeBirthdays,
  useServiceMeetingCounts,
  type DashboardMeeting, type DashboardFollowup,
} from '@/hooks/useServiceDashboard'
import {
  useAllStudentMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone,
  type DashboardMilestone,
} from '@/hooks/useStudentMilestones'
import { useConsultantPool, useConsultantName } from '@/lib/consultants'
import { MAJOR_TRACKS, MAJOR_TRACK_LABEL, gradeBucket, gradesToShow } from '@/lib/majorTaxonomy'
import { studentPickerLabel, compareStudentsKo } from '@/lib/studentDisplay'
import {
  useServicePrograms, useCreateProgram, useUpdateProgram, useDeleteProgram, type ServiceProgram,
} from '@/hooks/useProgramSeats'
import type { ServiceStudent } from '@/types'
import { todayKST, daysFromTodayKST } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import { useT } from '@/i18n/LanguageContext'
import type { MilestoneType, MilestoneStatus, StudentMilestone, ServiceReportStatus, MeetingStatus, MeetingCancelledBy } from '@/types'

// ─── Constants ──────────────────────────────────────────────────────────────

const MILESTONE_TYPES: { value: MilestoneType; label: string; color: string; dot: string }[] = [
  { value: 'strategy',    label: 'Strategy',    color: 'bg-slate-100 text-slate-700 border-slate-200',      dot: 'bg-slate-500' },
  { value: 'essay',       label: 'Essay',       color: 'bg-indigo-100 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-600' },
  { value: 'application', label: 'Application', color: 'bg-red-100 text-red-700 border-red-200',            dot: 'bg-red-500' },
  { value: 'competition', label: 'Competition', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'decision',    label: 'Decision',    color: 'bg-amber-100 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
  { value: 'ec_activity', label: 'EC Activity', color: 'bg-purple-100 text-purple-700 border-purple-200',   dot: 'bg-purple-500' },
]

const MEETING_COLOR = 'bg-violet-100 text-violet-700 border-violet-200'
const GHOST_MEETING_COLOR = 'border-violet-400 text-violet-400 bg-transparent'
const FOLLOWUP_COLOR = 'bg-yellow-100 text-yellow-700 border-yellow-200'
const EMP_BDAY_COLOR = 'bg-rose-100 text-rose-700 border-rose-200'
const STU_BDAY_COLOR = 'bg-sky-100 text-sky-700 border-sky-200'

export type BirthdayEvent = { name: string; kind: 'employee' | 'student' }
export type BirthdayMap = Map<string, BirthdayEvent[]>  // keyed by 'MM-DD'

interface GhostMeeting {
  studentId: string
  studentName: string
  studentConsultant?: string
  dateStr: string
  time: string
}

const DAY_NAME_TO_NUM: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

function isScheduledMeetingDate(dateStr: string, schedule: string): boolean {
  const parts = schedule.split('|')
  if (parts.length < 2) return false
  const weekPattern = parts[0]
  const dayStr = parts[1]
  const d = new Date(dateStr + 'T00:00:00')
  const targetDay = DAY_NAME_TO_NUM[dayStr]
  if (targetDay === undefined || d.getDay() !== targetDay) return false
  const weekOfMonth = Math.ceil(d.getDate() / 7)
  if (weekPattern === '1/3') return weekOfMonth === 1 || weekOfMonth === 3
  if (weekPattern === '2/4') return weekOfMonth === 2 || weekOfMonth === 4
  return false
}

const MILESTONE_STATUS_KEYS: { value: MilestoneStatus; key: string }[] = [
  { value: 'upcoming',  key: 'serviceDash.statusUpcoming' },
  { value: 'on_track',  key: 'serviceDash.statusOnTrack' },
  { value: 'behind',    key: 'serviceDash.statusBehind' },
  { value: 'urgent',    key: 'serviceDash.statusUrgent' },
  { value: 'completed', key: 'serviceDash.statusCompleted' },
]

function milestoneConfig(type: MilestoneType) {
  return MILESTONE_TYPES.find(t => t.value === type) ?? MILESTONE_TYPES[0]
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

function getWeekStart(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(d.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(d.getMonth() + n)
  return r
}

function getWeekDays(ref: Date): Date[] {
  const start = getWeekStart(ref)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

function getMonthGrid(year: number, month: number): Array<{ dateStr: string; isCurrentMonth: boolean }[]> {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const startDow = first.getDay()
  const totalDays = last.getDate()
  const weeks: Array<{ dateStr: string; isCurrentMonth: boolean }[]> = []
  let week: { dateStr: string; isCurrentMonth: boolean }[] = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 2, new Date(year, month - 1, 0).getDate() - i)
    week.push({ dateStr: toDateStr(d), isCurrentMonth: false })
  }
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month - 1, day)
    week.push({ dateStr: toDateStr(d), isCurrentMonth: true })
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    let nextDay = 1
    while (week.length < 7) {
      const d = new Date(year, month, nextDay++)
      week.push({ dateStr: toDateStr(d), isCurrentMonth: false })
    }
    weeks.push(week)
  }
  return weeks
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
}

function formatWeekLabel(days: Date[]): string {
  const start = days[0].toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  const end   = days[6].toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  return `${start} – ${end}`
}

function getCycleMonths(ref: Date, before = 2, after = 6) {
  return Array.from({ length: before + 1 + after }, (_, i) => {
    const d = addMonths(ref, i - before)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

// ─── Session Prep Panel ───────────────────────────────────────────────────────

function SessionPrepPanel({
  meeting,
  onClose,
}: {
  meeting: DashboardMeeting
  onClose: () => void
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const { data: followups = [] } = useServiceFollowups(meeting.studentId)
  const { data: diaryEntries = [] } = useServiceDiary(meeting.studentId)
  const today = todayKST()

  const openFollowups = followups.filter(f => !f.done)
  const doneFollowups = followups.filter(f => f.done)

  // Pick the diary belonging to the clicked meeting's session — not just the
  // newest one. The diary is often logged a few days after the meeting, so we
  // look in a window around the meeting date, then fall back to the previous
  // session. diaryEntries are sorted by entry_date descending.
  const { lastDiary, isThisMeetingDiary } = useMemo(() => {
    if (!diaryEntries.length) return { lastDiary: undefined, isThisMeetingDiary: false }
    const md = meeting.meetingDate
    if (!md) return { lastDiary: diaryEntries[0], isThisMeetingDiary: false }
    // Diary written for this exact meeting day
    const exact = diaryEntries.find(d => d.entryDate === md)
    if (exact) return { lastDiary: exact, isThisMeetingDiary: true }
    // The session's diary may be logged a couple days before to a few days
    // after the meeting — pick the closest entry within that window.
    const DAY = 86400000
    const mdTime = new Date(md + 'T00:00:00').getTime()
    const near = diaryEntries
      .filter(d => d.entryDate)
      .map(d => ({ d, diff: (new Date(d.entryDate! + 'T00:00:00').getTime() - mdTime) / DAY }))
      .filter(x => x.diff >= -2 && x.diff <= 5)
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
    if (near.length) return { lastDiary: near[0].d, isThisMeetingDiary: true }
    // Otherwise the most recent diary on or before this meeting (prior session)
    const prior = diaryEntries.find(d => d.entryDate && d.entryDate <= md)
    return { lastDiary: prior, isThisMeetingDiary: false }
  }, [diaryEntries, meeting.meetingDate])

  // Recent diaries up to (and including) this meeting's date
  const recentDiaries = useMemo(() => {
    const md = meeting.meetingDate
    if (!md) return diaryEntries
    return diaryEntries.filter(d => !d.entryDate || d.entryDate <= md)
  }, [diaryEntries, meeting.meetingDate])

  const daysAgo = meeting.meetingDate ? daysFromTodayKST(meeting.meetingDate) : null
  const lastMetLabel = daysAgo === null
    ? '—'
    : daysAgo === 0 ? t('serviceDash.today')
    : daysAgo > 0 ? t('serviceDash.daysLater').replace('{n}', String(daysAgo))
    : t('serviceDash.daysAgo').replace('{n}', String(Math.abs(daysAgo)))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <SheetHeader className="px-5 pt-5 pb-3 border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
              {meeting.studentName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">{meeting.studentName}</SheetTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {meeting.meetingType || t('serviceDash.meeting')} · {consultantName(meeting.consultantId)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        {meeting.meetingDate && (
          <p className="text-xs text-gray-400 mt-1">
            {formatDateLabel(meeting.meetingDate)}
          </p>
        )}
      </SheetHeader>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x border-b text-center">
        <div className="py-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.recentMeeting')}</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">{lastMetLabel}</p>
        </div>
        <div className="py-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.openTasks')}</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {openFollowups.length} / {followups.length}
          </p>
        </div>
        <div className="py-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.diary')}</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">{t('serviceDash.diaryCount').replace('{count}', String(diaryEntries.length))}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* From last session */}
        {lastDiary && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {isThisMeetingDiary ? t('serviceDash.thisMeetingDiary') : t('serviceDash.fromLastSession')}
              </h3>
              {lastDiary.entryDate && (
                <span className="text-[11px] text-gray-400">{formatDateLabel(lastDiary.entryDate)}</span>
              )}
            </div>
            {lastDiary.meetingSummary ? (
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{lastDiary.meetingSummary}</p>
            ) : lastDiary.agendaItems ? (
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{lastDiary.agendaItems}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">{t('serviceDash.noSummary')}</p>
            )}
            <Link
              to={`/service/student-360?student=${meeting.studentId}`}
              className="text-xs text-blue-500 hover:underline mt-1.5 flex items-center gap-1"
            >
              {t('serviceDash.viewAllNotes')} <ExternalLink size={11} />
            </Link>
          </section>
        )}

        {/* Open action items */}
        {followups.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {t('serviceDash.openActionItems')}
            </h3>
            <ul className="space-y-1.5">
              {followups.slice(0, 6).map(f => {
                const isOverdue = f.dueDate && f.dueDate < today && !f.done
                return (
                  <li key={f.id} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${f.done ? 'text-emerald-500' : 'text-gray-300'}`}>
                      <CheckSquare size={15} />
                    </span>
                    <span className={`text-sm flex-1 leading-snug ${f.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {f.text}
                    </span>
                    {isOverdue && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-red-50 text-red-600 border-red-200 shrink-0">
                        overdue
                      </Badge>
                    )}
                    {f.dueDate && !isOverdue && !f.done && (
                      <span className="text-[11px] text-gray-400 shrink-0">{formatDateLabel(f.dueDate)}</span>
                    )}
                  </li>
                )
              })}
              {doneFollowups.length > 0 && openFollowups.length === 0 && (
                <p className="text-xs text-emerald-600">{t('serviceDash.allTasksDone')}</p>
              )}
            </ul>
          </section>
        )}

        {/* Suggested agenda */}
        {lastDiary?.nextMeetingAgenda && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{t('serviceDash.suggestedAgenda')}</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {lastDiary.nextMeetingAgenda}
            </div>
          </section>
        )}

        {/* Recent diary entries (up to this meeting's date, so reviewing a past
            meeting doesn't surface diaries from later sessions) */}
        {recentDiaries.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{t('serviceDash.recentDiaries')}</h3>
            <ul className="space-y-2">
              {recentDiaries.slice(0, 4).map(d => (
                <li key={d.id} className="flex gap-2.5 text-sm">
                  {d.entryDate && (
                    <span className="text-[11px] text-gray-400 shrink-0 w-12">
                      {new Date(d.entryDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <span className="text-gray-600 line-clamp-1">
                    {d.meetingSummary || d.agendaItems || t('serviceDash.noContent')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Meeting report */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{t('serviceDash.meetingReport')}</h3>
          <div className="flex items-center gap-2">
            <Badge className={`text-[11px] ${
              meeting.reportStatus === 'submitted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              meeting.reportStatus === 'pending'   ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
              {meeting.reportStatus === 'submitted' ? t('serviceDash.reportSubmitted') :
               meeting.reportStatus === 'pending'   ? t('serviceDash.reportPending') : t('serviceDash.reportNone')}
            </Badge>
            {meeting.reportUrl && (
              <a href={meeting.reportUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                {t('serviceDash.view')} <ExternalLink size={11} />
              </a>
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-3 flex gap-2">
        <Link
          to={`/service/student-360?student=${meeting.studentId}`}
          className="flex-1"
        >
          <Button variant="outline" size="sm" className="w-full text-xs">
            <Users size={13} className="mr-1.5" />
            Student 360
          </Button>
        </Link>
        {meeting.prepUrl && (
          <a href={meeting.prepUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs">
              <FileText size={13} className="mr-1.5" />
              {t('serviceDash.prepMaterials')}
            </Button>
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Milestone Dialog ─────────────────────────────────────────────────────────

function MilestoneDialog({
  open,
  onClose,
  students,
  editing,
  defaultStudentId,
  defaultDate,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  students: { id: string; name: string; koreanName?: string }[]
  editing: StudentMilestone | null
  defaultStudentId?: string
  defaultDate?: string
  canEdit: boolean
}) {
  const t = useT()
  const { user } = useAuth()
  const createMilestone = useCreateMilestone()
  const updateMilestone = useUpdateMilestone()
  const deleteMilestone = useDeleteMilestone()

  const [studentId, setStudentId] = useState(editing?.studentId ?? defaultStudentId ?? '')
  const [type,      setType]      = useState<MilestoneType>(editing?.type ?? 'application')
  const [title,     setTitle]     = useState(editing?.title ?? '')
  const [date,      setDate]      = useState(editing?.date ?? defaultDate ?? todayKST())
  const [status,    setStatus]    = useState<MilestoneStatus>(editing?.status ?? 'upcoming')
  const [notes,     setNotes]     = useState(editing?.notes ?? '')
  const [program,   setProgram]   = useState('')

  // Program options come from the selected student's Student 360 EC/Academic records.
  const { data: ecList = [] } = useECActivities(studentId || undefined)
  const { data: acList = [] } = useAcademicSupport(studentId || undefined)
  const programOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    ecList.forEach(e => opts.push({ value: `ec-${e.id}`, label: `EC · ${e.program || e.partner || '프로그램'}` }))
    acList.forEach(a => opts.push({ value: `ac-${a.id}`, label: `Academic · ${a.subject || '과목'}` }))
    return opts
  }, [ecList, acList])

  const onPickProgram = (v: string) => {
    setProgram(v)
    const opt = programOptions.find(o => o.value === v)
    if (opt) { setType('ec_activity'); setTitle(opt.label) }
  }

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setStudentId(editing?.studentId ?? defaultStudentId ?? '')
      setType(editing?.type ?? 'application')
      setTitle(editing?.title ?? '')
      setDate(editing?.date ?? defaultDate ?? todayKST())
      setStatus(editing?.status ?? 'upcoming')
      setNotes(editing?.notes ?? '')
      setProgram('')
    }
  }, [open])

  const saving = createMilestone.isPending || updateMilestone.isPending
  const deleting = deleteMilestone.isPending

  async function handleSave() {
    if (!canEdit) return
    if (!studentId || !title || !date) return
    try {
      if (editing) {
        await updateMilestone.mutateAsync({ id: editing.id, studentId, type, title, date, status, notes: notes || undefined })
      } else {
        await createMilestone.mutateAsync({ studentId, type, title, date, status, notes: notes || undefined, createdBy: user?.id })
      }
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`${t('serviceDash.saveFailed')} ${msg}`)
    }
  }

  async function handleDelete() {
    if (!canEdit) return
    if (!editing) return
    if (!window.confirm(t('serviceDash.confirmDeleteMilestone'))) return
    try {
      await deleteMilestone.mutateAsync({ id: editing.id, studentId: editing.studentId })
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`${t('serviceDash.deleteFailed')} ${msg}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('serviceDash.editMilestone') : t('serviceDash.addMilestone')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>{t('serviceDash.student')}</Label>
            <Select value={studentId} onValueChange={v => setStudentId(v ?? '')}>
              <SelectTrigger>
                {studentId
                  ? (() => { const s = students.find(x => x.id === studentId); return <span className="truncate">{s ? studentDisplayName(s.name, s.koreanName) : '(삭제된 학생)'}</span> })()
                  : <SelectValue placeholder={t('serviceDash.selectStudent')} />}
              </SelectTrigger>
              <SelectContent>
                {studentId && !students.some(s => s.id === studentId) && (
                  <SelectItem value={studentId}>(삭제된 학생)</SelectItem>
                )}
                {students.map(s => (
                  <SelectItem key={s.id} value={s.id}>{studentDisplayName(s.name, s.koreanName)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {studentId && programOptions.length > 0 && (
            <div className="space-y-1">
              <Label>프로그램 (선택)</Label>
              <Select value={program} onValueChange={v => v && onPickProgram(v)}>
                <SelectTrigger><SelectValue placeholder="EC/Academic 프로그램 선택" /></SelectTrigger>
                <SelectContent>
                  {programOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400">프로그램을 고르면 제목·유형이 자동 채워집니다. 대회·리서치 기한·프로젝트 등 상세는 아래 메모에 입력하세요.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('serviceDash.type')}</Label>
              <Select value={type} onValueChange={v => setType(v as MilestoneType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_TYPES.map(mt => (
                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t('serviceDash.status')}</Label>
              <Select value={status} onValueChange={v => setStatus(v as MilestoneStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUS_KEYS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{t(s.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.title')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('serviceDash.titlePlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.date')}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.notesOptional')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={t('serviceDash.notesPlaceholder')} />
          </div>
        </div>
        <DialogFooter className={editing && canEdit ? 'sm:justify-between' : undefined}>
          {editing && canEdit && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
              {t('serviceDash.delete')}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>{t('serviceDash.cancel')}</Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving || deleting || !studentId || !title || !date}>
                {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {editing ? t('serviceDash.save') : t('serviceDash.add')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Meeting Dialog ───────────────────────────────────────────────────────────

const REPORT_STATUS_KEYS: { value: ServiceReportStatus; key: string }[] = [
  { value: 'none',      key: 'serviceDash.reportStatusNone' },
  { value: 'pending',   key: 'serviceDash.reportStatusPending' },
  { value: 'submitted', key: 'serviceDash.reportStatusSubmitted' },
]

const MEETING_STATUS_KEYS: { value: MeetingStatus; key: string }[] = [
  { value: 'held',        key: 'serviceDash.meetingStatusHeld' },
  { value: 'scheduled',   key: 'serviceDash.meetingStatusScheduled' },
  { value: 'cancelled',   key: 'serviceDash.meetingStatusCancelled' },
  { value: 'no_show',     key: 'serviceDash.meetingStatusNoShow' },
  { value: 'rescheduled', key: 'serviceDash.meetingStatusRescheduled' },
]

const CANCELLED_BY_KEYS: { value: MeetingCancelledBy; key: string }[] = [
  { value: 'client',     key: 'serviceDash.cancelledByClient' },
  { value: 'consultant', key: 'serviceDash.cancelledByConsultant' },
  { value: 'other',      key: 'serviceDash.cancelledByOther' },
]

function MeetingDialog({
  open,
  onClose,
  meeting,
  canEdit,
}: {
  open: boolean
  onClose: () => void
  meeting: DashboardMeeting | null
  canEdit: boolean
}) {
  const t = useT()
  const consultantPool = useConsultantPool()
  const qc = useQueryClient()
  const updateMeeting = useUpdateServiceMeeting()
  const deleteMeeting = useDeleteServiceMeeting()

  const [meetingType,  setMeetingType]  = useState(meeting?.meetingType ?? '')
  const [date,         setDate]         = useState(meeting?.meetingDate ?? todayKST())
  const [consultantId, setConsultantId] = useState(meeting?.consultantId ?? '')
  const [reportStatus, setReportStatus] = useState<ServiceReportStatus>(meeting?.reportStatus ?? 'none')
  const [reportUrl,    setReportUrl]    = useState(meeting?.reportUrl ?? '')
  const [prepUrl,      setPrepUrl]      = useState(meeting?.prepUrl ?? '')
  const [status,       setStatus]       = useState<MeetingStatus>(meeting?.status ?? 'held')
  const [cancelledBy,  setCancelledBy]  = useState<MeetingCancelledBy | ''>(meeting?.cancelledBy ?? '')
  const [cancelReason, setCancelReason] = useState(meeting?.cancellationReason ?? '')

  const isCancelled = status === 'cancelled' || status === 'no_show'

  // Repopulate fields each time the dialog opens for a meeting
  useEffect(() => {
    if (open && meeting) {
      setMeetingType(meeting.meetingType ?? '')
      setDate(meeting.meetingDate ?? todayKST())
      setConsultantId(meeting.consultantId ?? '')
      setReportStatus(meeting.reportStatus ?? 'none')
      setReportUrl(meeting.reportUrl ?? '')
      setPrepUrl(meeting.prepUrl ?? '')
      setStatus(meeting.status ?? 'held')
      setCancelledBy(meeting.cancelledBy ?? '')
      setCancelReason(meeting.cancellationReason ?? '')
    }
  }, [open, meeting])

  const saving = updateMeeting.isPending
  const deleting = deleteMeeting.isPending

  async function handleSave() {
    if (!canEdit) return
    if (!meeting || !date) return
    try {
      await updateMeeting.mutateAsync({
        id: meeting.id,
        studentId: meeting.studentId,
        meetingDate: date || null,
        meetingType,
        consultantId: consultantId || null,
        // A report link implies the report is submitted — auto-promote from 'none'.
        reportStatus: (reportUrl && reportStatus === 'none') ? 'submitted' : reportStatus,
        reportUrl,
        prepUrl,
        status,
        // Cancellation details only apply to cancelled / no-show meetings
        cancellationReason: isCancelled ? (cancelReason || null) : null,
        cancelledBy: isCancelled ? (cancelledBy || null) : null,
      })
      qc.invalidateQueries({ queryKey: ['dashboard_meetings'] })
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`${t('serviceDash.saveFailed')} ${msg}`)
    }
  }

  async function handleDelete() {
    if (!canEdit) return
    if (!meeting) return
    if (!window.confirm(t('serviceDash.confirmDeleteMeeting'))) return
    try {
      await deleteMeeting.mutateAsync({ id: meeting.id, studentId: meeting.studentId })
      qc.invalidateQueries({ queryKey: ['dashboard_meetings'] })
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`${t('serviceDash.deleteFailed')} ${msg}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('serviceDash.editMeeting')}{meeting ? ` · ${meeting.studentName}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('serviceDash.type')}</Label>
              <Input value={meetingType} onChange={e => setMeetingType(e.target.value)} placeholder={t('serviceDash.meetingTypePlaceholder')} />
            </div>
            <div className="space-y-1">
              <Label>{t('serviceDash.date')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.consultant')}</Label>
            <Select value={consultantId} onValueChange={v => setConsultantId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder={t('serviceDash.selectConsultant')} /></SelectTrigger>
              <SelectContent>
                {consultantPool.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.meetingStatus')}</Label>
            <Select value={status} onValueChange={v => setStatus(v as MeetingStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_STATUS_KEYS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{t(s.key)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isCancelled && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-red-200 bg-red-50/50 p-3">
              <div className="space-y-1">
                <Label>{t('serviceDash.cancelledByLabel')}</Label>
                <Select value={cancelledBy} onValueChange={v => setCancelledBy(v as MeetingCancelledBy)}>
                  <SelectTrigger><SelectValue placeholder={t('serviceDash.selectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {CANCELLED_BY_KEYS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{t(c.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('serviceDash.cancelReason')}</Label>
                <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder={t('serviceDash.cancelReasonPlaceholder')} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>{t('serviceDash.reportStatus')}</Label>
            <Select value={reportStatus} onValueChange={v => setReportStatus(v as ServiceReportStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_STATUS_KEYS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{t(s.key)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.reportLinkOptional')}</Label>
            <Input value={reportUrl} onChange={e => setReportUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>{t('serviceDash.prepLinkOptional')}</Label>
            <Input value={prepUrl} onChange={e => setPrepUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter className={canEdit ? 'sm:justify-between' : undefined}>
          {canEdit && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
              {t('serviceDash.delete')}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>{t('serviceDash.cancel')}</Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving || deleting || !date}>
                {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {t('serviceDash.save')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Week Calendar ────────────────────────────────────────────────────────────

function WeekCalendar({
  days,
  meetings,
  milestones,
  followups,
  ghostMeetings,
  consultantFilter,
  birthdaysByMmdd,
  onEditMeeting,
  onAddMilestone,
  onEditMilestone,
  canEdit,
}: {
  days: Date[]
  meetings: DashboardMeeting[]
  milestones: DashboardMilestone[]
  followups: DashboardFollowup[]
  ghostMeetings: GhostMeeting[]
  consultantFilter: string
  birthdaysByMmdd: BirthdayMap
  onEditMeeting: (m: DashboardMeeting) => void
  onAddMilestone: (dateStr: string) => void
  onEditMilestone: (m: DashboardMilestone) => void
  canEdit: boolean
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const today = todayKST()
  const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

  const filtered = {
    meetings:  meetings.filter(m => consultantFilter === 'all' || m.studentConsultant === consultantFilter),
    milestones: milestones.filter(m => consultantFilter === 'all' || m.studentConsultant === consultantFilter),
    followups: followups.filter(f => consultantFilter === 'all' || f.studentConsultant === consultantFilter),
  }

  function eventsForDay(dateStr: string) {
    return {
      meetings:   filtered.meetings.filter(m => m.meetingDate === dateStr),
      milestones: filtered.milestones.filter(m => m.date === dateStr),
      followups:  filtered.followups.filter(f => f.dueDate === dateStr),
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {days.map((day, i) => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === today
          return (
            <div key={dateStr} className={`px-2 py-2 text-center border-r last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}>
              <p className="text-[11px] text-gray-400 font-medium">{WEEKDAYS[i]}</p>
              <p className={`text-sm font-semibold mt-0.5 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                {day.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-7 divide-x min-h-64">
        {days.map(day => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === today
          const { meetings: dm, milestones: mm, followups: ff } = eventsForDay(dateStr)
          const gm = ghostMeetings.filter(g => g.dateStr === dateStr && (consultantFilter === 'all' || g.studentConsultant === consultantFilter))

          return (
            <div key={dateStr} className={`p-1.5 space-y-1 min-h-64 ${isToday ? 'bg-blue-50/30' : ''}`}>
              {dm.map(m => {
                const cName = consultantName(m.consultantId || m.studentConsultant)
                return (
                <button
                  key={m.id}
                  onClick={() => onEditMeeting(m)}
                  className={`w-full text-left text-[11px] px-1.5 py-1 rounded border font-medium truncate hover:opacity-80 transition-opacity ${MEETING_COLOR}`}
                  title={`${m.studentName}${m.meetingType ? ` · ${m.meetingType}` : ''}${cName ? ` · ${cName}` : ''} (미팅노트 보기)`}
                >
                  {m.studentName}
                  {m.meetingType && <span className="opacity-70"> · {m.meetingType}</span>}
                  {cName && <span className="opacity-60"> · {cName}</span>}
                </button>
                )
              })}
              {gm.map(g => (
                <div
                  key={`ghost-${g.studentId}-${g.dateStr}`}
                  className={`w-full text-[11px] px-1.5 py-1 rounded border border-dashed font-medium truncate ${GHOST_MEETING_COLOR}`}
                >
                  {g.studentName}
                  {g.time && <span className="opacity-60"> · {g.time}</span>}
                </div>
              ))}
              {mm.map(m => {
                const cfg = milestoneConfig(m.type)
                return (
                  <button
                    key={m.id}
                    onClick={() => onEditMilestone(m)}
                    className={`w-full text-left text-[11px] px-1.5 py-1 rounded border font-medium truncate hover:opacity-80 transition-opacity ${cfg.color}`}
                    title={`${m.studentName}: ${m.title} (${t('serviceDash.clickToEdit')})`}
                  >
                    {m.studentName} · {m.title}
                  </button>
                )
              })}
              {ff.map(f => (
                <div
                  key={f.id}
                  className={`w-full text-[11px] px-1.5 py-1 rounded border truncate ${FOLLOWUP_COLOR}`}
                  title={`${f.studentName}: ${f.text}`}
                >
                  {f.studentName} · {f.text}
                </div>
              ))}
              {(birthdaysByMmdd.get(dateStr.slice(5)) || []).map((b, i) => (
                <div
                  key={`bd-${i}`}
                  className={`w-full text-[11px] px-1.5 py-1 rounded border font-medium truncate ${b.kind === 'employee' ? EMP_BDAY_COLOR : STU_BDAY_COLOR}`}
                  title={`${b.name} 생일 (${b.kind === 'employee' ? '직원' : '학생'})`}
                >
                  🎂 {b.name}
                </div>
              ))}
              {canEdit && dm.length === 0 && gm.length === 0 && mm.length === 0 && ff.length === 0 && (birthdaysByMmdd.get(dateStr.slice(5))?.length ?? 0) === 0 && (
                <button
                  onClick={() => onAddMilestone(dateStr)}
                  className="w-full h-8 flex items-center justify-center text-gray-200 hover:text-gray-400 hover:bg-gray-50 rounded transition-colors"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month Calendar ───────────────────────────────────────────────────────────

function MonthCalendar({
  year,
  month,
  meetings,
  milestones,
  followups,
  ghostMeetings,
  consultantFilter,
  birthdaysByMmdd,
  onSelectMeeting,
  onEditMilestone,
}: {
  year: number
  month: number
  meetings: DashboardMeeting[]
  milestones: DashboardMilestone[]
  followups: DashboardFollowup[]
  ghostMeetings: GhostMeeting[]
  consultantFilter: string
  birthdaysByMmdd: BirthdayMap
  onSelectMeeting: (m: DashboardMeeting) => void
  onEditMilestone: (m: DashboardMilestone) => void
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const today = todayKST()
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
  const grid = getMonthGrid(year, month)

  const filteredMeetings   = meetings.filter(m  => consultantFilter === 'all' || m.studentConsultant  === consultantFilter)
  const filteredMilestones = milestones.filter(m => consultantFilter === 'all' || m.studentConsultant === consultantFilter)
  const filteredFollowups  = followups.filter(f  => consultantFilter === 'all' || f.studentConsultant  === consultantFilter)

  const meetingsByDate   = new Map<string, DashboardMeeting[]>()
  const milestonesByDate = new Map<string, DashboardMilestone[]>()
  const followupsByDate  = new Map<string, DashboardFollowup[]>()
  const ghostsByDate     = new Map<string, GhostMeeting[]>()

  filteredMeetings.forEach(m   => { const d = m.meetingDate; if (d) meetingsByDate.set(d, [...(meetingsByDate.get(d) || []), m]) })
  filteredMilestones.forEach(m => { milestonesByDate.set(m.date, [...(milestonesByDate.get(m.date) || []), m]) })
  filteredFollowups.forEach(f  => { const d = f.dueDate; if (d) followupsByDate.set(d, [...(followupsByDate.get(d) || []), f]) })
  ghostMeetings
    .filter(g => consultantFilter === 'all' || g.studentConsultant === consultantFilter)
    .forEach(g => { ghostsByDate.set(g.dateStr, [...(ghostsByDate.get(g.dateStr) || []), g]) })

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-gray-50">
        {WEEKDAYS.map(w => (
          <div key={w} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase">{w}</div>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map(({ dateStr, isCurrentMonth }) => {
            const isToday = dateStr === today
            const dm = meetingsByDate.get(dateStr) || []
            const mm = milestonesByDate.get(dateStr) || []
            const ff = followupsByDate.get(dateStr) || []
            const gm = ghostsByDate.get(dateStr) || []
            const dayNum = parseInt(dateStr.slice(8))

            return (
              <div key={dateStr} className={`
                min-h-[5.5rem] p-1.5 border-r last:border-r-0
                ${!isCurrentMonth ? 'bg-gray-50/50' : ''}
                ${isToday ? 'bg-blue-50/40' : ''}
              `}>
                <span className={`
                  inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1
                  ${isToday ? 'bg-blue-600 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}
                `}>
                  {dayNum}
                </span>
                <div className="space-y-0.5">
                  {dm.slice(0, 2).map(m => {
                    const cName = consultantName(m.consultantId || m.studentConsultant)
                    return (
                    <button key={m.id} onClick={() => onSelectMeeting(m)}
                      title={`${m.studentName}${m.meetingType ? ` · ${m.meetingType}` : ''}${cName ? ` · ${cName}` : ''} (미팅노트 보기)`}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate font-medium ${MEETING_COLOR}`}>
                      {m.studentName}{m.meetingType ? ` · ${m.meetingType}` : ''}{cName ? ` · ${cName}` : ''}
                    </button>
                    )
                  })}
                  {gm.slice(0, Math.max(0, 2 - Math.min(dm.length, 2))).map(g => (
                    <div key={`ghost-${g.studentId}-${g.dateStr}`}
                      className={`text-[10px] px-1 py-0.5 rounded border border-dashed truncate font-medium ${GHOST_MEETING_COLOR}`}>
                      {g.studentName}
                    </div>
                  ))}
                  {mm.slice(0, 2).map(m => {
                    const cfg = milestoneConfig(m.type)
                    return (
                      <button
                        key={m.id}
                        onClick={() => onEditMilestone(m)}
                        className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate hover:opacity-80 transition-opacity ${cfg.color}`}
                        title={`${m.studentName}: ${m.title} (${t('serviceDash.clickToEdit')})`}
                      >
                        {m.studentName}
                      </button>
                    )
                  })}
                  {ff.slice(0, 1).map(f => (
                    <div key={f.id} className={`text-[10px] px-1 py-0.5 rounded truncate ${FOLLOWUP_COLOR}`}>
                      {f.studentName}
                    </div>
                  ))}
                  {(birthdaysByMmdd.get(dateStr.slice(5)) || []).map((b, i) => (
                    <div
                      key={`bd-${i}`}
                      className={`text-[10px] px-1 py-0.5 rounded border truncate font-medium ${b.kind === 'employee' ? EMP_BDAY_COLOR : STU_BDAY_COLOR}`}
                      title={`${b.name} 생일 (${b.kind === 'employee' ? '직원' : '학생'})`}
                    >
                      🎂 {b.name}
                    </div>
                  ))}
                  {(dm.length + gm.length + mm.length + ff.length) > 3 && (
                    <p className="text-[10px] text-gray-400 pl-1">{t('serviceDash.moreItems').replace('{n}', String(dm.length + gm.length + mm.length + ff.length - 3))}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Cycle Overview ───────────────────────────────────────────────────────────

function CycleOverview({
  students,
  milestones,
  consultantFilter,
  cycleFilter,
  onAddMilestone,
  onEditMilestone,
  canEdit,
}: {
  students: { id: string; name: string; assignedConsultant?: string; status?: string }[]
  milestones: DashboardMilestone[]
  consultantFilter: string
  cycleFilter: 'all' | 'at_risk'
  onAddMilestone: (studentId: string) => void
  onEditMilestone: (m: DashboardMilestone) => void
  canEdit: boolean
}) {
  const t = useT()
  const today = todayKST()
  const ref = new Date(today + 'T00:00:00')
  const months = getCycleMonths(ref, 2, 6)
  const currentMonthKey = today.slice(0, 7)

  const filteredStudents = useMemo(() => {
    let list = students.filter(s => s.status === 'active' || !s.status)
    if (consultantFilter !== 'all') list = list.filter(s => s.assignedConsultant === consultantFilter)

    if (cycleFilter === 'at_risk') {
      const riskIds = new Set<string>()
      milestones.forEach(m => {
        if ((m.status === 'urgent' || m.status === 'behind') && m.date < today) {
          riskIds.add(m.studentId)
        }
      })
      list = list.filter(s => riskIds.has(s.id))
    }
    return list
  }, [students, consultantFilter, cycleFilter, milestones, today])

  const milestonesMap = useMemo(() => {
    const map = new Map<string, Map<string, DashboardMilestone[]>>()
    milestones.forEach(m => {
      const monthKey = m.date.slice(0, 7)
      if (!map.has(m.studentId)) map.set(m.studentId, new Map())
      const sm = map.get(m.studentId)!
      if (!sm.has(monthKey)) sm.set(monthKey, [])
      sm.get(monthKey)!.push(m)
    })
    return map
  }, [milestones])

  function studentStatus(studentId: string): 'urgent' | 'behind' | 'on_track' {
    const sm = milestonesMap.get(studentId)
    if (!sm) return 'on_track'
    for (const [, list] of sm) {
      for (const m of list) {
        if (m.status === 'urgent') return 'urgent'
      }
    }
    for (const [, list] of sm) {
      for (const m of list) {
        if (m.status === 'behind') return 'behind'
      }
    }
    return 'on_track'
  }

  const statusCounts = useMemo(() => {
    let onTrack = 0, behind = 0, urgent = 0
    filteredStudents.forEach(s => {
      const st = studentStatus(s.id)
      if (st === 'urgent') urgent++
      else if (st === 'behind') behind++
      else onTrack++
    })
    return { onTrack, behind, urgent }
  }, [filteredStudents, milestonesMap])

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: '11rem repeat(' + months.length + ', 1fr)' }}>
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase">{t('serviceDash.student')}</div>
          {months.map(({ year, month }) => {
            const key = `${year}-${String(month).padStart(2, '0')}`
            const isCurrentMonth = key === currentMonthKey
            return (
              <div key={key} className={`px-1 py-2 text-center text-[11px] font-semibold uppercase ${isCurrentMonth ? 'text-blue-600' : 'text-gray-400'}`}>
                {new Date(year, month - 1, 1).toLocaleDateString('ko-KR', { month: 'short' })}
                {isCurrentMonth && <span className="ml-1 text-[9px]">▼</span>}
              </div>
            )
          })}
        </div>

        {/* Student rows */}
        {filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">{t('serviceDash.noStudents')}</div>
        ) : (
          filteredStudents.map(student => {
            const sm = milestonesMap.get(student.id)
            const st = studentStatus(student.id)

            return (
              <div key={student.id} className="grid border-b last:border-b-0 hover:bg-gray-50/50"
                style={{ gridTemplateColumns: '11rem repeat(' + months.length + ', 1fr)' }}>
                {/* Student name */}
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    st === 'urgent' ? 'bg-red-500' : st === 'behind' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`} />
                  <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {student.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 truncate">{student.name}</span>
                </div>

                {/* Month cells */}
                {months.map(({ year, month }) => {
                  const key = `${year}-${String(month).padStart(2, '0')}`
                  const monthMilestones = sm?.get(key) || []
                  const isCurrentMonth = key === currentMonthKey

                  return (
                    <div key={key} className={`flex items-center justify-center py-2 px-1 ${isCurrentMonth ? 'bg-blue-50/30' : ''}`}>
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {monthMilestones.length === 0 ? (
                          canEdit ? (
                            <button
                              onClick={() => onAddMilestone(student.id)}
                              className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 hover:border-gray-400 transition-colors"
                              title={t('serviceDash.addMilestoneTooltip')}
                            />
                          ) : null
                        ) : (
                          monthMilestones.map(m => {
                            const cfg = milestoneConfig(m.type)
                            const isPast = m.date < today
                            return (
                              <button
                                key={m.id}
                                onClick={() => onEditMilestone(m)}
                                className={`group relative w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 ${cfg.dot} ${
                                  m.status === 'completed' ? 'opacity-40' : isPast ? 'opacity-70' : ''
                                } ${isCurrentMonth ? 'ring-2 ring-offset-1 ring-blue-300' : ''}`}
                                title={`${m.title} · ${t(MILESTONE_STATUS_KEYS.find(s => s.value === m.status)?.key ?? 'serviceDash.statusUpcoming')} (${t('serviceDash.clickToEdit')})`}
                              >
                                {m.status === 'urgent' && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Legend + status summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {MILESTONE_TYPES.map(mt => (
            <div key={mt.value} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${mt.dot}`} />
              <span className="text-[11px] text-gray-500">{mt.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[12px] shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-gray-600">{statusCounts.onTrack} {t('serviceDash.onTrackCount')}</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-600">{statusCounts.behind} {t('serviceDash.behindCount')}</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-gray-600">{statusCounts.urgent} {t('serviceDash.urgentCount')}</span></span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── By-student schedule view (item 2) ──────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 학생 표시 이름. name/koreanName이 비었거나 UUID면 절대 UUID를 노출하지 않는다. */
function studentDisplayName(name?: string, koreanName?: string): string {
  const clean = (v?: string) => { const s = (v || '').trim(); return s && !UUID_RE.test(s) ? s : '' }
  const ko = clean(koreanName)
  const en = clean(name)
  if (ko && en && ko !== en) return `${ko} (${en})`
  return ko || en || '(이름 없음)'
}

/** Priority escalates as the deadline approaches (overdue/≤3d = P0). */
function priorityBadge(days: number): { label: string; cls: string } {
  if (days <= 3) return { label: 'P0', cls: 'bg-red-600 text-white' }
  if (days <= 7) return { label: 'P1', cls: 'bg-orange-500 text-white' }
  if (days <= 14) return { label: 'P2', cls: 'bg-amber-400 text-gray-900' }
  if (days <= 30) return { label: 'P3', cls: 'bg-sky-500 text-white' }
  return { label: 'P4', cls: 'bg-gray-200 text-gray-600' }
}

function dayLabel(days: number): string {
  if (days === 0) return '오늘'
  if (days > 0) return `D-${days}`
  return `${-days}일 지남`
}

const KIND_META: Record<'meeting' | 'milestone' | 'followup', { label: string; cls: string }> = {
  meeting:   { label: '미팅',       cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  milestone: { label: '마일스톤',   cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  followup:  { label: 'Follow-up',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

interface ScheduleItem {
  key: string
  date: string
  days: number
  kind: 'meeting' | 'milestone' | 'followup'
  title: string
  ownerId?: string
  meeting?: DashboardMeeting
  milestone?: DashboardMilestone
  done?: boolean
  cancelled?: boolean
}

function StudentScheduleView({
  students, milestones, onSelectMeeting, onEditMilestone,
}: {
  students: { id: string; name: string; koreanName?: string; assignedConsultant?: string }[]
  milestones: DashboardMilestone[]
  onSelectMeeting: (m: DashboardMeeting) => void
  onEditMilestone: (m: DashboardMilestone) => void
}) {
  const t = useT()
  const consultantName = useConsultantName()
  const today = todayKST()
  const [studentId, setStudentId] = useState('')

  // Pull the student's meetings over a broad window (−1mo .. +6mo).
  const todayDate = new Date(today + 'T00:00:00')
  const rangeStart = toDateStr(addMonths(todayDate, -1))
  const rangeEnd = toDateStr(addMonths(todayDate, 6))
  const { data: allMeetings = [] } = useAllServiceMeetings(rangeStart, rangeEnd)
  const { data: followups = [] } = useServiceFollowups(studentId || undefined)

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) =>
      studentDisplayName(a.name, a.koreanName).localeCompare(studentDisplayName(b.name, b.koreanName), 'ko')),
    [students],
  )

  // 선택된 학생의 표시 이름을 직접 계산(트리거에 렌더). 목록에 없으면 마일스톤/미팅 조인명으로,
  // 그래도 없으면 '(삭제된 학생)' — Radix가 미매칭 값에서 raw UUID를 노출하는 문제 방지.
  const selectedLabel = useMemo(() => {
    if (!studentId) return ''
    const s = sortedStudents.find(x => x.id === studentId)
    if (s) return studentDisplayName(s.name, s.koreanName)
    const nm = milestones.find(x => x.studentId === studentId)?.studentName
      || allMeetings.find(x => x.studentId === studentId)?.studentName
    return nm && !UUID_RE.test(nm) ? nm : '(삭제된 학생)'
  }, [studentId, sortedStudents, milestones, allMeetings])

  const items = useMemo<ScheduleItem[]>(() => {
    if (!studentId) return []
    const out: ScheduleItem[] = []
    milestones.filter(m => m.studentId === studentId && m.date).forEach(m => {
      out.push({
        key: `ms-${m.id}`, date: m.date, days: daysFromTodayKST(m.date),
        kind: 'milestone', title: m.title || milestoneConfig(m.type).label,
        ownerId: m.studentConsultant, milestone: m,
      })
    })
    allMeetings.filter(m => m.studentId === studentId && m.meetingDate).forEach(m => {
      const date = m.meetingDate as string
      const cancelled = m.status === 'cancelled' || m.status === 'no_show'
      // A meeting record means it happened: held / has report / already in the past.
      const done = !cancelled && (m.status === 'held' || m.reportStatus === 'submitted' || !!m.reportUrl || date < today)
      out.push({
        key: `mt-${m.id}`, date, days: daysFromTodayKST(date),
        kind: 'meeting', title: m.meetingType || t('serviceDash.studentMeeting'),
        ownerId: m.consultantId || m.studentConsultant, meeting: m, done, cancelled,
      })
    })
    followups.filter(f => !f.done && f.dueDate).forEach(f => {
      out.push({
        key: `fu-${f.id}`, date: f.dueDate as string, days: daysFromTodayKST(f.dueDate as string),
        kind: 'followup', title: f.text,
      })
    })
    return out
      .filter(i => i.days >= -30)
      .sort((a, b) => {
        const aResolved = (a.done || a.cancelled) ? 1 : 0
        const bResolved = (b.done || b.cancelled) ? 1 : 0
        if (aResolved !== bResolved) return aResolved - bResolved      // pending first
        return aResolved ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
      })
  }, [studentId, milestones, allMeetings, followups, today, t])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={studentId} onValueChange={v => setStudentId(v ?? '')}>
          <SelectTrigger className="h-9 w-72">
            {/* 트리거 라벨을 직접 렌더 — Radix가 미매칭 값에서 raw UUID를 보이는 문제 회피 */}
            {studentId
              ? <span className="truncate">{selectedLabel}</span>
              : <SelectValue placeholder="학생 선택 (이름)" />}
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {studentId && !sortedStudents.some(s => s.id === studentId) && (
              <SelectItem value={studentId}>{selectedLabel}</SelectItem>
            )}
            {sortedStudents.map(s => (
              <SelectItem key={s.id} value={s.id}>{studentDisplayName(s.name, s.koreanName)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {studentId && <span className="text-sm text-gray-500">{items.length}개 일정 · 마감 임박순</span>}
      </div>

      {!studentId ? (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">
          학생을 선택하면 일정이 <b>마감 임박순(P0→P4)</b>으로 표시됩니다. 일정에 마우스를 올리면 담당자, 클릭하면 상세가 열립니다.
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">표시할 일정이 없습니다.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {items.map(it => {
            const p = priorityBadge(it.days)
            const owner = it.ownerId ? consultantName(it.ownerId) : ''
            const km = KIND_META[it.kind]
            const clickable = it.kind !== 'followup'
            // A meeting record reflects whether it actually happened — don't show
            // conducted/past meetings as a pending P0.
            const mCancelled = !!it.cancelled
            const mDone = !!it.done
            const muted = mCancelled || mDone
            return (
              <div
                key={it.key}
                title={owner ? `담당: ${owner}` : ''}
                onClick={() => {
                  if (it.kind === 'meeting' && it.meeting) onSelectMeeting(it.meeting)
                  else if (it.kind === 'milestone' && it.milestone) onEditMilestone(it.milestone)
                }}
                className={`flex items-center gap-3 px-4 py-2.5 ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''} ${muted ? 'opacity-70' : ''}`}
              >
                {mCancelled ? (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded w-10 text-center shrink-0 bg-gray-200 text-gray-500">취소</span>
                ) : mDone ? (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded w-10 text-center shrink-0 bg-emerald-100 text-emerald-700">완료</span>
                ) : (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded w-10 text-center shrink-0 ${p.cls}`}>{p.label}</span>
                )}
                <div className="w-24 shrink-0 text-xs">
                  <div className="font-medium text-gray-700">{formatDateLabel(it.date)}</div>
                  <div className={muted ? 'text-gray-400' : days0Class(it.days)}>{dayLabel(it.days)}</div>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${km.cls}`}>{km.label}</Badge>
                <span className="text-sm text-gray-800 flex-1 truncate">{it.title}</span>
                {owner && <span className="text-[11px] text-gray-400 shrink-0 max-w-[100px] truncate">{owner}</span>}
              </div>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}

function days0Class(days: number): string {
  if (days < 0) return 'text-red-500'
  if (days <= 3) return 'text-orange-500'
  return 'text-gray-400'
}

// ───────────────── 전공 계열 × 학년 현황판 (①) ─────────────────
function MajorGradeMatrixSection({ students }: { students: ServiceStudent[] }) {
  const t = useT()
  // 현재 서비스 중(활성) 학생만 — 완료/취소 제외
  const active = useMemo(
    () => students.filter(s => !(s.status === 'finished' || s.status === 'canceled')),
    [students],
  )
  const [cell, setCell] = useState<{ track: string; grade: string } | null>(null)

  const rowKeys = useMemo(() => {
    const hasUnassigned = active.some(s => !s.majorTrack)
    return [...MAJOR_TRACKS.map(tr => tr.key), ...(hasUnassigned ? ['unassigned'] : [])]
  }, [active])

  const { counts, colTotals, rowTotals, grand } = useMemo(() => {
    const counts: Record<string, Record<string, ServiceStudent[]>> = {}
    const colTotals: Record<string, number> = {}
    const rowTotals: Record<string, number> = {}
    let grand = 0
    for (const s of active) {
      const rk = s.majorTrack || 'unassigned'
      const gb = gradeBucket(s.grade)
      counts[rk] = counts[rk] || {}
      counts[rk][gb] = counts[rk][gb] || []
      counts[rk][gb].push(s)
      colTotals[gb] = (colTotals[gb] || 0) + 1
      rowTotals[rk] = (rowTotals[rk] || 0) + 1
      grand++
    }
    return { counts, colTotals, rowTotals, grand }
  }, [active])

  const gradeCols = useMemo(() => gradesToShow(active.map(s => gradeBucket(s.grade))), [active])
  const rowLabel = (rk: string) => rk === 'unassigned' ? t('serviceDash.majorUnassigned') : MAJOR_TRACK_LABEL[rk]
  const cellStudents = cell ? (counts[cell.track]?.[cell.grade] || []) : []

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('serviceDash.majorsTitle')}</h3>
          <span className="text-xs text-muted-foreground">{t('serviceDash.activeStudents')} {grand}{t('serviceDash.studentsUnit')}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium py-2 pr-3">{t('student360.majorTrack')}</th>
                {gradeCols.map(g => <th key={g} className="text-center font-medium py-2 px-2 w-16">{g}</th>)}
                <th className="text-center font-semibold py-2 px-2 w-16">{t('serviceDash.majorTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {rowKeys.map(rk => (
                <tr key={rk} className="border-b hover:bg-muted/20">
                  <td className={`py-2 pr-3 ${rk === 'unassigned' ? 'text-amber-600 font-medium' : ''}`}>{rowLabel(rk)}</td>
                  {gradeCols.map(g => {
                    const n = counts[rk]?.[g]?.length || 0
                    const isSel = cell?.track === rk && cell?.grade === g
                    return (
                      <td key={g} className="text-center px-2 py-1">
                        {n > 0 ? (
                          <button
                            onClick={() => setCell(isSel ? null : { track: rk, grade: g })}
                            className={`inline-flex min-w-7 justify-center rounded px-1.5 py-0.5 tabular-nums ${isSel ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'}`}
                          >{n}</button>
                        ) : <span className="text-muted-foreground/40">·</span>}
                      </td>
                    )
                  })}
                  <td className="text-center font-semibold tabular-nums">{rowTotals[rk] || 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-3">{t('serviceDash.majorTotal')}</td>
                {gradeCols.map(g => <td key={g} className="text-center tabular-nums">{colTotals[g] || 0}</td>)}
                <td className="text-center tabular-nums">{grand}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {cell && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground mb-2">
              {rowLabel(cell.track)} · {cell.grade} — {cellStudents.length}{t('serviceDash.studentsUnit')}
            </div>
            <div className="flex flex-wrap gap-2">
              {cellStudents.map(s => (
                <Link key={s.id} to={`/service/student-360?student=${s.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-emerald-400">
                  <span className="font-medium">{s.name}</span>
                  {s.majorDetail && <span className="text-muted-foreground">{s.majorDetail}</span>}
                  {s.school && <span className="text-muted-foreground/70">· {s.school}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}

        {active.some(s => !s.majorTrack) && (
          <p className="text-xs text-amber-600">{t('serviceDash.majorUnassignedHint')}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────── 외부서비스 좌석 배정판 (②) ───────────────────
// 상위 묶음(그룹)은 주변보다 '약간만' 더 진한 그레이톤으로만 구분
const GROUP_COLORS = [
  { band: 'bg-slate-300 text-slate-700', head: 'bg-slate-100 text-slate-600', col: 'bg-slate-50' },
  { band: 'bg-slate-200 text-slate-700', head: 'bg-slate-50 text-slate-600',  col: 'bg-slate-50/60' },
  { band: 'bg-slate-400 text-white',     head: 'bg-slate-100 text-slate-600', col: 'bg-slate-100/50' },
  { band: 'bg-slate-300 text-slate-700', head: 'bg-slate-50 text-slate-600',  col: 'bg-slate-50' },
] as const
type GroupColor = (typeof GROUP_COLORS)[number]

function ProgramSeatBoard({ students, canEdit }: { students: ServiceStudent[]; canEdit: boolean }) {
  const t = useT()
  const { data: programs = [] } = useServicePrograms()
  const { data: fees = [] } = useAllServiceProgramFees()
  const [manageOpen, setManageOpen] = useState(false)

  const active = useMemo(
    () => students.filter(s => !(s.status === 'finished' || s.status === 'canceled')),
    [students],
  )
  const studentById = useMemo(() => new Map(active.map(s => [s.id, s])), [active])

  // Student360(외부서비스 EC·학업지원) 입력을 좌석에 자동 연동:
  // 각 프로그램의 이름/부제를 파트너(label)·프로그램(detail) 값과 매칭해 학생을 자동 배치.
  const grid = useMemo(() => {
    const norm = (v?: string) => (v || '').replace(/\s+/g, '').toLowerCase()
    const keysOf = new Map<string, string[]>()
    for (const p of programs) keysOf.set(p.id, [p.name, p.subtitle].filter(Boolean).map(v => norm(v as string)))
    const m = new Map<string, Map<string, ServiceStudent[]>>()
    const seen = new Map<string, Set<string>>() // programId → studentIds (중복 제거)
    for (const f of fees) {
      const st = studentById.get(f.studentId)
      if (!st) continue
      const vals = [f.label, f.detail].filter(Boolean).map(v => norm(v as string))
      for (const p of programs) {
        if (!keysOf.get(p.id)!.some(k => vals.includes(k))) continue
        if (!seen.has(p.id)) seen.set(p.id, new Set())
        if (seen.get(p.id)!.has(st.id)) continue
        seen.get(p.id)!.add(st.id)
        const g = gradeBucket(st.grade)
        if (!m.has(p.id)) m.set(p.id, new Map())
        const gm = m.get(p.id)!
        if (!gm.has(g)) gm.set(g, [])
        gm.get(g)!.push(st)
      }
    }
    for (const gm of m.values()) for (const arr of gm.values()) arr.sort(compareStudentsKo)
    return m
  }, [fees, programs, studentById])

  // 연속된 같은 묶음(group_name) 프로그램을 헤더에서 하나로 병합하기 위한 세그먼트
  const programGroups = useMemo(() => {
    const gs: { name?: string; programs: ServiceProgram[] }[] = []
    for (const p of programs) {
      const last = gs[gs.length - 1]
      if (p.groupName && last && last.name === p.groupName) last.programs.push(p)
      else gs.push({ name: p.groupName, programs: [p] })
    }
    return gs
  }, [programs])

  // 프로그램별 그룹 색상
  const colOf = useMemo(() => {
    const colorByName = new Map<string, GroupColor>()
    let ci = 0
    for (const g of programGroups) if (g.name && !colorByName.has(g.name)) colorByName.set(g.name, GROUP_COLORS[ci++ % GROUP_COLORS.length])
    const m = new Map<string, GroupColor | null>()
    for (const p of programs) m.set(p.id, p.groupName ? (colorByName.get(p.groupName) || null) : null)
    return m
  }, [programs, programGroups])

  const countPill = (filled: number, cap: number) =>
    `mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${filled > cap ? 'bg-red-100 text-red-700' : filled >= cap ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`

  // 기본 학년(G9~G12) + 실제 배정된 학년(G8 등)만 섹션으로 표시
  const boardGrades = useMemo(() => {
    const present = new Set<string>()
    for (const gm of grid.values()) for (const g of gm.keys()) present.add(g)
    return gradesToShow(present)
  }, [grid])

  return (
    <Card>
      <CardContent className="p-4 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{t('serviceDash.programsTitle')}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{t('serviceDash.programsAutoHint')}</p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={() => setManageOpen(true)}>
              <Plus size={13} /> {t('serviceDash.managePrograms')}
            </Button>
          )}
        </div>

        {programs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t('serviceDash.noPrograms')}</p>
        ) : boardGrades.map(grade => {
          const maxCap = Math.max(0, ...programs.map(p => p.capacity))
          const rowCount = Math.max(maxCap, ...programs.map(p => grid.get(p.id)?.get(grade)?.length || 0))
          const colIndex = new Map(programs.map((p, i) => [p.id, i + 2])) // grid 열(1열=좌석번호)
          return (
            <div key={grade} className="rounded-xl border overflow-hidden">
              <div className="bg-slate-50 border-b px-3 py-1.5 text-sm font-bold text-slate-700">{grade}</div>
              <div className="overflow-x-auto p-2">
                <div
                  className="grid gap-px bg-slate-200 rounded-lg overflow-hidden border border-slate-200 w-max"
                  style={{ gridTemplateColumns: `36px repeat(${programs.length}, 148px)` }}
                >
                  {/* 좌상단 빈 코너 (헤더 2줄) */}
                  <div style={{ gridColumn: 1, gridRow: '1 / span 2' }} className="bg-slate-50" />

                  {/* 상위 카테고리 밴드 + 단독 프로그램(2줄 병합) */}
                  {programGroups.map((g, i) => {
                    const startCol = colIndex.get(g.programs[0].id)!
                    const span = g.programs.length
                    if (!g.name) {
                      const p = g.programs[0]
                      const filled = grid.get(p.id)?.get(grade)?.length || 0
                      return (
                        <div key={i} style={{ gridColumn: `${startCol}`, gridRow: '1 / span 2' }}
                          className="bg-white flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-center">
                          <div className="font-semibold text-slate-800 leading-tight">{p.name}</div>
                          {p.subtitle && <div className="text-[9px] text-slate-400 leading-tight">{p.subtitle}</div>}
                          <div className={countPill(filled, p.capacity)}>{filled}/{p.capacity}</div>
                        </div>
                      )
                    }
                    const c = colOf.get(g.programs[0].id)!
                    return (
                      <div key={i} style={{ gridColumn: `${startCol} / span ${span}`, gridRow: 1 }}
                        className="bg-white flex items-center px-1 pt-1">
                        <div className={`${c.band} w-full rounded-full flex flex-col items-center justify-center py-1 leading-tight`}>
                          <span className="font-bold text-[11px]">{g.name}</span>
                          {g.programs[0].subtitle && <span className="text-[9px] font-normal opacity-70">{g.programs[0].subtitle}</span>}
                        </div>
                      </div>
                    )
                  })}

                  {/* 하위 프로그램 헤더 (묶음 소속만; 단독은 위에서 병합됨) */}
                  {programs.map(p => {
                    const c = colOf.get(p.id)
                    if (!c) return null
                    const filled = grid.get(p.id)?.get(grade)?.length || 0
                    return (
                      <div key={p.id} style={{ gridColumn: colIndex.get(p.id), gridRow: 2 }}
                        className={`${c.head} flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center`}>
                        <div className="font-semibold leading-tight">{p.name}</div>
                        <div className={countPill(filled, p.capacity)}>{filled}/{p.capacity}</div>
                      </div>
                    )
                  })}

                  {/* 좌석 행들 — Student360(외부서비스) 입력에서 자동 채움 */}
                  {Array.from({ length: rowCount }).flatMap((_, ri) => {
                    const row = 3 + ri
                    return [
                      <div key={`n${ri}`} style={{ gridColumn: 1, gridRow: row }}
                        className="bg-slate-50 text-[10px] text-slate-400 flex items-center justify-end pr-1.5 tabular-nums">{ri + 1}</div>,
                      ...programs.map(p => {
                        const c = colOf.get(p.id)
                        const col = colIndex.get(p.id)
                        const arr = grid.get(p.id)?.get(grade) || []
                        const student = arr[ri]
                        const overCap = ri >= p.capacity
                        if (!student && overCap) return <div key={`${ri}-${p.id}`} style={{ gridColumn: col, gridRow: row }} className="bg-slate-50/70" />
                        return (
                          <div key={`${ri}-${p.id}`} style={{ gridColumn: col, gridRow: row }} className={`${c ? c.col : 'bg-white'} p-1 flex items-center`}>
                            {student ? (
                              <Link to={`/service/student-360?student=${student.id}`}
                                title={overCap ? '정원 초과' : undefined}
                                className={`flex items-center rounded-md pl-2 pr-1 h-7 w-full leading-none truncate shadow-sm hover:brightness-95 ${overCap ? 'bg-red-50 border border-red-300 text-red-800' : 'bg-white border border-emerald-300 text-emerald-900'}`}>
                                <span className="truncate">{studentPickerLabel(student)}</span>
                              </Link>
                            ) : (
                              <div className="w-full h-7 rounded-md border border-dashed border-slate-200 bg-white/40" />
                            )}
                          </div>
                        )
                      }),
                    ]
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>

      <ProgramManageDialog open={manageOpen} onOpenChange={setManageOpen} programs={programs} />
    </Card>
  )
}

function ProgramManageDialog({ open, onOpenChange, programs }: {
  open: boolean; onOpenChange: (o: boolean) => void; programs: ServiceProgram[]
}) {
  const t = useT()
  const create = useCreateProgram()
  const update = useUpdateProgram()
  const del = useDeleteProgram()
  const [newP, setNewP] = useState({ name: '', subtitle: '', groupName: '', capacity: '5' })
  const cols = 'grid grid-cols-[1fr_1fr_1fr_64px_auto] gap-2'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('serviceDash.manageProgramsTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className={`${cols} text-[11px] text-muted-foreground px-1`}>
            <span>{t('serviceDash.progName')}</span>
            <span>{t('serviceDash.progSubtitle')}</span>
            <span>{t('serviceDash.progGroup')}</span>
            <span>{t('serviceDash.progCapacity')}</span>
            <span></span>
          </div>
          {programs.map(p => (
            <div key={p.id} className={`${cols} items-center`}>
              <Input defaultValue={p.name} className="h-8"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) update.mutate({ id: p.id, name: v }) }} />
              <Input defaultValue={p.subtitle || ''} className="h-8" placeholder="—"
                onBlur={e => { const v = e.target.value.trim(); if (v !== (p.subtitle || '')) update.mutate({ id: p.id, subtitle: v }) }} />
              <Input defaultValue={p.groupName || ''} className="h-8" placeholder="—"
                onBlur={e => { const v = e.target.value.trim(); if (v !== (p.groupName || '')) update.mutate({ id: p.id, groupName: v }) }} />
              <Input type="number" min={1} defaultValue={String(p.capacity)} className="h-8"
                onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== p.capacity) update.mutate({ id: p.id, capacity: v }) }} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                onClick={() => { if (confirm(t('serviceDash.confirmDeleteProgram'))) del.mutate(p.id) }}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          {/* Add new */}
          <div className={`${cols} items-center border-t pt-2 mt-2`}>
            <Input value={newP.name} onChange={e => setNewP(f => ({ ...f, name: e.target.value }))} className="h-8" placeholder={t('serviceDash.progName')} />
            <Input value={newP.subtitle} onChange={e => setNewP(f => ({ ...f, subtitle: e.target.value }))} className="h-8" placeholder={t('serviceDash.progSubtitle')} />
            <Input value={newP.groupName} onChange={e => setNewP(f => ({ ...f, groupName: e.target.value }))} className="h-8" placeholder={t('serviceDash.progGroup')} />
            <Input type="number" min={1} value={newP.capacity} onChange={e => setNewP(f => ({ ...f, capacity: e.target.value }))} className="h-8" />
            <Button size="sm" className="h-8"
              disabled={!newP.name.trim() || create.isPending}
              onClick={() => create.mutate(
                { name: newP.name.trim(), subtitle: newP.subtitle.trim() || undefined, groupName: newP.groupName.trim() || undefined, capacity: Number(newP.capacity) || 5, sortOrder: (programs[programs.length - 1]?.sortOrder ?? 0) + 1 },
                { onSuccess: () => setNewP({ name: '', subtitle: '', groupName: '', capacity: '5' }) },
              )}>
              <Plus size={14} />
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('serviceDash.manageProgramsHint2')}</p>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────── Metrics (지표) ───────────────────────
/** True if the service student's status is one of the "archived" outcomes. */
function isFinished(status?: string) { return status === 'finished' }
function isCanceled(status?: string) { return status === 'canceled' }

type MetricKind = 'meetings' | 'newEnrolled' | 'active' | 'finished' | 'canceled'

function ServiceMetricsSection() {
  const t = useT()
  const nav = useNavigate()
  const { data: students = [], isLoading: ls } = useServiceStudents()
  const { data: meetingRows = [], isLoading: lm } = useServiceMeetingCounts()
  const [gran, setGran] = useState<'month' | 'year'>('month')
  const today = todayKST()
  const [period, setPeriod] = useState<string>(today.slice(0, 7)) // 'YYYY-MM'
  const [detail, setDetail] = useState<MetricKind | null>(null)

  const cutLen = gran === 'month' ? 7 : 4
  const cur = today.slice(0, cutLen)
  const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students])
  // Outcome date for finished/canceled = when the status was set (updated_at),
  // which is more reliable than end_date (which may hold a future contract end).
  const outcomeDate = (s: { endDate?: string; updatedAt?: string }) => (s.updatedAt || s.endDate || '').slice(0, 10)

  // A fixed recent window (last 12 months / 5 years) — avoids future-dated junk.
  const recentPeriods = useMemo(() => {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
    const out: string[] = []
    if (gran === 'month') {
      for (let i = 0; i < 12; i++) { let mm = m - i, yy = y; while (mm <= 0) { mm += 12; yy-- }; out.push(`${yy}-${String(mm).padStart(2, '0')}`) }
    } else {
      for (let i = 0; i < 5; i++) out.push(String(y - i))
    }
    return out
  }, [gran, today])

  // Options: recent window + any past period that has data (future excluded)
  const periodOptions = useMemo(() => {
    const set = new Set<string>(recentPeriods)
    const add = (d?: string | null) => { if (d && d.length >= cutLen) { const k = d.slice(0, cutLen); if (k <= cur) set.add(k) } }
    students.forEach(s => { add(s.startDate); add(outcomeDate(s)) })
    meetingRows.forEach(m => add(m.meetingDate))
    return Array.from(set).filter(Boolean).sort().reverse()
  }, [students, meetingRows, cutLen, cur, recentPeriods])

  const activePeriod = period.length === cutLen ? period : cur
  const inPeriod = (d?: string | null) => !!d && d.slice(0, cutLen) === activePeriod

  // Student lists per metric (for the selected period)
  const newEnrolledList = useMemo(() => students.filter(s => inPeriod(s.startDate)), [students, activePeriod, cutLen])
  const finishedList = useMemo(() => students.filter(s => isFinished(s.status) && inPeriod(outcomeDate(s))), [students, activePeriod, cutLen])
  const canceledList = useMemo(() => students.filter(s => isCanceled(s.status) && inPeriod(outcomeDate(s))), [students, activePeriod, cutLen])
  // Active = not archived (finished/canceled) — matches Student 360's active count.
  const activeList = useMemo(() => students.filter(s => !isFinished(s.status) && !isCanceled(s.status)), [students])
  // Meetings held in period, grouped by student → count
  const meetingByStudent = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of meetingRows) {
      if (r.status === 'cancelled' || !inPeriod(r.meetingDate) || !r.studentId) continue
      m.set(r.studentId, (m.get(r.studentId) || 0) + 1)
    }
    return Array.from(m.entries())
      .map(([id, count]) => ({ student: studentById.get(id), count }))
      .filter(x => x.student)
      .sort((a, b) => b.count - a.count)
  }, [meetingRows, activePeriod, cutLen, studentById])

  const meetingsHeld = meetingByStudent.reduce((s, x) => s + x.count, 0)
  const newEnrolled = newEnrolledList.length
  const finished = finishedList.length
  const canceled = canceledList.length
  const activeNow = activeList.length

  // Trend: the fixed recent window
  const trend = useMemo(() => recentPeriods.map(k => ({
    period: k,
    meetings: meetingRows.filter(m => m.status !== 'cancelled' && m.meetingDate?.slice(0, cutLen) === k).length,
    newEnrolled: students.filter(s => s.startDate?.slice(0, cutLen) === k).length,
    finished: students.filter(s => isFinished(s.status) && outcomeDate(s).slice(0, cutLen) === k).length,
    canceled: students.filter(s => isCanceled(s.status) && outcomeDate(s).slice(0, cutLen) === k).length,
  })), [students, meetingRows, cutLen, recentPeriods])

  if (ls || lm) return <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>

  const stat = (kind: MetricKind, icon: ReactNode, value: number, label: string, color: string) => (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setDetail(kind)}>
      <CardContent className="py-4 flex items-center gap-3">
        <div className={color}>{icon}</div>
        <div>
          <div className="text-2xl font-bold">{value.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )

  const goStudent = (id: string) => { setDetail(null); nav(`/service/student-360?student=${id}`) }
  const detailTitle: Record<MetricKind, string> = {
    meetings: t('serviceDash.mMeetings'), newEnrolled: t('serviceDash.mNewEnrolled'),
    active: t('serviceDash.mActive'), finished: t('serviceDash.mFinished'), canceled: t('serviceDash.mCanceled'),
  }
  const nameOf = (s?: { name: string; koreanName?: string }) => s ? studentDisplayName(s.name, s.koreanName) : '—'

  return (
    <div className="space-y-4">
      {/* Period controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden">
          <button onClick={() => { setGran('month'); setPeriod(today.slice(0, 7)) }}
            className={`px-3 h-8 text-sm font-medium ${gran === 'month' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{t('serviceDash.byMonth')}</button>
          <button onClick={() => { setGran('year'); setPeriod(today.slice(0, 4)) }}
            className={`px-3 h-8 text-sm font-medium border-l ${gran === 'year' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{t('serviceDash.byYear')}</button>
        </div>
        <Select value={activePeriod} onValueChange={(v) => v && setPeriod(v)}>
          <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periodOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{t('serviceDash.metricsPeriodHint')}</span>
      </div>

      {/* Metric cards (click to see the list) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stat('meetings', <Calendar className="size-6" />, meetingsHeld, t('serviceDash.mMeetings'), 'text-blue-500')}
        {stat('newEnrolled', <UserPlus className="size-6" />, newEnrolled, t('serviceDash.mNewEnrolled'), 'text-indigo-500')}
        {stat('active', <Activity className="size-6" />, activeNow, t('serviceDash.mActive'), 'text-emerald-600')}
        {stat('finished', <CheckCircle2 className="size-6" />, finished, t('serviceDash.mFinished'), 'text-gray-500')}
        {stat('canceled', <XCircle className="size-6" />, canceled, t('serviceDash.mCanceled'), 'text-red-500')}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail ? detailTitle[detail] : ''}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{activePeriod}</span>
            </DialogTitle>
          </DialogHeader>
          {detail === 'meetings' ? (
            meetingByStudent.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{t('serviceDash.metricsEmpty')}</p> : (
              <div className="divide-y">
                {meetingByStudent.map(({ student, count }) => (
                  <button key={student!.id} onClick={() => goStudent(student!.id)}
                    className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded text-left">
                    <span className="text-sm font-medium">{nameOf(student)}</span>
                    <Badge variant="outline">{t('serviceDash.timesUnit').replace('{n}', String(count))}</Badge>
                  </button>
                ))}
              </div>
            )
          ) : detail ? (
            (() => {
              const list = detail === 'newEnrolled' ? newEnrolledList : detail === 'active' ? activeList : detail === 'finished' ? finishedList : canceledList
              return list.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{t('serviceDash.metricsEmpty')}</p> : (
                <div className="divide-y">
                  {list.map(s => (
                    <button key={s.id} onClick={() => goStudent(s.id)}
                      className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded text-left">
                      <span className="text-sm font-medium">{nameOf(s)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )
            })()
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Trend table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-4 py-2">{gran === 'month' ? t('serviceDash.month') : t('serviceDash.year')}</th>
                <th className="text-right px-4 py-2">{t('serviceDash.mMeetings')}</th>
                <th className="text-right px-4 py-2">{t('serviceDash.mNewEnrolled')}</th>
                <th className="text-right px-4 py-2">{t('serviceDash.mFinished')}</th>
                <th className="text-right px-4 py-2">{t('serviceDash.mCanceled')}</th>
              </tr>
            </thead>
            <tbody>
              {trend.map(r => (
                <tr key={r.period} className={`border-b last:border-0 ${r.period === activePeriod ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-2 font-medium">{r.period}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.meetings}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.newEnrolled}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.finished}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.canceled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">{t('serviceDash.metricsNote')}</p>
    </div>
  )
}

export function ServiceDashboardPage() {
  const t = useT()
  const canEdit = useCanEdit(useLocation().pathname)
  const routerNav = useNavigate()
  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  const today = todayKST()
  const todayDate = new Date(today + 'T00:00:00')
  // 캘린더의 학생 미팅을 클릭하면 해당 학생의 Student 360(미팅노트) 화면으로 이동
  const openMeetingNote = (m: DashboardMeeting) => routerNav(`/service/student-360?student=${m.studentId}`)

  const [view,             setView]             = useState<'calendar' | 'cycle' | 'student' | 'majors' | 'programs' | 'metrics'>('calendar')
  const [calMode,          setCalMode]          = useState<'week' | 'month'>('week')
  const [refDate,          setRefDate]          = useState<Date>(todayDate)
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [cycleFilter,      setCycleFilter]      = useState<'all' | 'at_risk'>('all')
  const [selectedMeeting,  setSelectedMeeting]  = useState<DashboardMeeting | null>(null)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [defaultMilestoneStudentId, setDefaultMilestoneStudentId] = useState<string | undefined>()
  const [defaultMilestoneDate, setDefaultMilestoneDate] = useState<string | undefined>()
  const [editingMilestone, setEditingMilestone] = useState<StudentMilestone | null>(null)
  const [editingMeeting,   setEditingMeeting]   = useState<DashboardMeeting | null>(null)
  const [showEditMeeting,  setShowEditMeeting]  = useState(false)

  // Open the milestone dialog in edit mode for an existing milestone
  const openEditMilestone = (m: StudentMilestone) => {
    if (!canEdit) return
    setDefaultMilestoneStudentId(undefined)
    setDefaultMilestoneDate(undefined)
    setEditingMilestone(m)
    setShowAddMilestone(true)
  }

  // Compute date ranges
  const weekDays = useMemo(() => getWeekDays(refDate), [refDate])
  const year  = refDate.getFullYear()
  const month = refDate.getMonth() + 1

  const viewStartDate = calMode === 'week'
    ? toDateStr(weekDays[0])
    : `${year}-${String(month).padStart(2, '0')}-01`
  const viewEndDate = calMode === 'week'
    ? toDateStr(weekDays[6])
    : toDateStr(new Date(year, month, 0))

  // Cycle range: always 9 months
  const cycleStart = toDateStr(addMonths(todayDate, -2))
  const cycleEnd   = toDateStr(addMonths(todayDate,  6))

  // Data
  const { data: students = [],    isLoading: loadingStudents } = useServiceStudents()
  const { data: meetings = [],    isLoading: loadingMeetings } = useAllServiceMeetings(viewStartDate, viewEndDate)
  const { data: followupsDue = [], isLoading: loadingFollowups } = useAllServiceFollowupsDue(viewStartDate, viewEndDate)
  const { data: milestones = [],  isLoading: loadingMilestones } = useAllStudentMilestones(cycleStart, cycleEnd)

  const loading = loadingStudents || loadingMeetings || loadingFollowups || loadingMilestones

  // Partner (freelancer/external) users only see students they're linked to via the
  // student's "partners" field, so they can view/input schedules only for those.
  const { user } = useAuth()
  const isPartner = user?.role === 'freelancer' || user?.role === 'external'
  const partnerKey = (user?.name || '').trim().toLowerCase()
  const { data: programFees = [] } = useAllServiceProgramFees()
  const visibleStudentIds = useMemo<Set<string> | null>(() => {
    if (!isPartner) return null
    const set = new Set<string>()
    if (partnerKey) {
      // Linked via the student's "partners" field …
      students.forEach(s => { if ((s.partners || '').toLowerCase().includes(partnerKey)) set.add(s.id) })
      // … or via being the partner/contributor on the student's EC/Academic program.
      programFees.forEach(f => {
        const hit = [f.label, f.contributor1, f.contributor2].some(x => (x || '').toLowerCase().includes(partnerKey))
        if (hit) set.add(f.studentId)
      })
    }
    return set
  }, [isPartner, partnerKey, students, programFees])
  const vStudents   = visibleStudentIds ? students.filter(s => visibleStudentIds.has(s.id)) : students
  const vMeetings   = visibleStudentIds ? meetings.filter(m => visibleStudentIds.has(m.studentId)) : meetings
  const vMilestones = visibleStudentIds ? milestones.filter(m => visibleStudentIds.has(m.studentId)) : milestones
  const vFollowups  = visibleStudentIds ? followupsDue.filter(f => visibleStudentIds.has(f.studentId)) : followupsDue

  // Birthdays (employees + students) keyed by MM-DD for the calendar.
  const { data: employeeBirthdays = [] } = useEmployeeBirthdays()
  const birthdaysByMmdd = useMemo<BirthdayMap>(() => {
    const map: BirthdayMap = new Map()
    const add = (mmdd: string, name: string, kind: 'employee' | 'student') => {
      if (!mmdd) return
      const a = map.get(mmdd) || []
      a.push({ name, kind })
      map.set(mmdd, a)
    }
    if (!isPartner) employeeBirthdays.forEach(e => add(e.mmdd, e.name, 'employee'))
    vStudents.forEach(s => { if (s.birthDate && s.birthDate.length >= 10) add(s.birthDate.slice(5, 10), s.name, 'student') })
    return map
  }, [employeeBirthdays, isPartner, vStudents])

  // Ghost meetings from regular schedule (future dates only, no existing meeting on that day)
  const ghostMeetings = useMemo<GhostMeeting[]>(() => {
    const result: GhostMeeting[] = []
    const existingKey = new Set(vMeetings.map(m => `${m.studentId}|${m.meetingDate}`))
    const dates: string[] = []
    let d = new Date(viewStartDate + 'T00:00:00')
    const endD = new Date(viewEndDate + 'T00:00:00')
    while (d <= endD) { dates.push(toDateStr(d)); d = addDays(d, 1) }
    vStudents.forEach(s => {
      if (!s.regularMeetingSchedule) return
      const time = s.regularMeetingSchedule.split('|')[2] || ''
      dates.forEach(dateStr => {
        if (dateStr <= today) return
        if (existingKey.has(`${s.id}|${dateStr}`)) return
        if (isScheduledMeetingDate(dateStr, s.regularMeetingSchedule!)) {
          result.push({ studentId: s.id, studentName: s.name, studentConsultant: s.assignedConsultant, dateStr, time })
        }
      })
    })
    return result
  }, [vStudents, vMeetings, viewStartDate, viewEndDate, today])

  // Stats (filtered by consultant)
  const filteredMeetings   = consultantFilter === 'all' ? vMeetings   : vMeetings.filter(m   => m.studentConsultant  === consultantFilter)
  const filteredMilestones = consultantFilter === 'all' ? vMilestones : vMilestones.filter(m  => m.studentConsultant === consultantFilter)
  const filteredFollowups  = consultantFilter === 'all' ? vFollowups : vFollowups.filter(f => f.studentConsultant === consultantFilter)

  const viewMilestones = filteredMilestones.filter(m => m.date >= viewStartDate && m.date <= viewEndDate)

  const stats = {
    sessions:   filteredMeetings.length,
    deadlines:  viewMilestones.filter(m => m.type === 'application' || m.type === 'competition').length,
    ecMilestones: viewMilestones.filter(m => m.type === 'ec_activity').length,
    notesPending: filteredMeetings.filter(m => m.reportStatus === 'pending').length,
  }

  // Navigation
  function navigate(dir: 1 | -1) {
    if (calMode === 'week') setRefDate(d => addDays(d, dir * 7))
    else setRefDate(d => addMonths(d, dir))
  }

  function goToday() { setRefDate(todayDate) }

  const navLabel = calMode === 'week'
    ? formatWeekLabel(weekDays)
    : refDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

  // Upcoming deadlines (next 14 days)
  const upcomingDeadlines = useMemo(() => {
    const twoWeeksLater = toDateStr(addDays(todayDate, 14))
    return filteredMilestones
      .filter(m => m.date >= today && m.date <= twoWeeksLater &&
        (m.type === 'application' || m.type === 'competition' || m.type === 'essay'))
      .slice(0, 6)
  }, [filteredMilestones, today])

  // Notes pending list
  const notesPendingList = useMemo(() =>
    filteredMeetings.filter(m => m.reportStatus === 'pending').slice(0, 6),
    [filteredMeetings]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b bg-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Service · Consultant View</p>
            <h1 className="text-xl font-semibold text-gray-900">
              {view === 'calendar' ? 'Service Calendar' : 'Application Cycle Overview'}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Consultant filter */}
            <Select value={consultantFilter} onValueChange={v => setConsultantFilter(v ?? 'all')}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('serviceDash.allConsultants')}</SelectItem>
                {consultantPool.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Tab toggle */}
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setView('calendar')}
                className={`px-3 h-8 text-sm font-medium ${view === 'calendar' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Calendar size={14} className="inline mr-1.5" />{t('serviceDash.calendar')}
              </button>
              <button
                onClick={() => setView('cycle')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'cycle' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users size={14} className="inline mr-1.5" />{t('serviceDash.cycle')}
              </button>
              <button
                onClick={() => setView('student')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'student' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <UserSearch size={14} className="inline mr-1.5" />학생별
              </button>
              <button
                onClick={() => setView('majors')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'majors' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <GraduationCap size={14} className="inline mr-1.5" />{t('serviceDash.majorsTab')}
              </button>
              <button
                onClick={() => setView('programs')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'programs' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users size={14} className="inline mr-1.5" />{t('serviceDash.programsTab')}
              </button>
              <button
                onClick={() => setView('metrics')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'metrics' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <BarChart3 size={14} className="inline mr-1.5" />{t('serviceDash.metrics')}
              </button>
            </div>

            {/* Add milestone */}
            {canEdit && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingMilestone(null); setDefaultMilestoneStudentId(undefined); setDefaultMilestoneDate(undefined); setShowAddMilestone(true) }}>
                <Plus size={14} />{t('serviceDash.milestone')}
              </Button>
            )}
          </div>
        </div>

        {/* Calendar nav (only in calendar view) */}
        {view === 'calendar' && (
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              <button onClick={goToday} className="px-2 py-0.5 text-sm border rounded hover:bg-gray-50">{t('serviceDash.today')}</button>
              <button onClick={() => navigate(1)} className="p-1 rounded hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
              <span className="text-sm font-medium text-gray-700 ml-2">{navLabel}</span>
              {loading && <Loader2 size={14} className="animate-spin text-gray-400 ml-2" />}
            </div>

            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setCalMode('week')}
                className={`px-3 h-7 text-xs font-medium ${calMode === 'week' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
              >{t('serviceDash.weekly')}</button>
              <button
                onClick={() => setCalMode('month')}
                className={`px-3 h-7 text-xs font-medium border-l ${calMode === 'month' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
              >{t('serviceDash.monthly')}</button>
            </div>
          </div>
        )}

        {/* Cycle filter */}
        {view === 'cycle' && (
          <div className="flex items-center gap-2 mt-3">
            <p className="text-xs text-gray-500">
              {consultantFilter === 'all' ? t('serviceDash.allConsultants') : consultantName(consultantFilter)}
              {' · '}{t('serviceDash.activeStudents')} {vStudents.filter(s => s.status === 'active' || !s.status).length}{t('serviceDash.studentsUnit')}
            </p>
            <div className="flex rounded-md border overflow-hidden ml-auto">
              <button onClick={() => setCycleFilter('all')}
                className={`px-3 h-7 text-xs font-medium ${cycleFilter === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t('serviceDash.all')}
              </button>
              <button onClick={() => setCycleFilter('at_risk')}
                className={`px-3 h-7 text-xs font-medium border-l ${cycleFilter === 'at_risk' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                <AlertCircle size={11} className="inline mr-1" />{t('serviceDash.atRisk')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-4">

        {/* Stats cards (calendar view only) */}
        {view === 'calendar' && (
          <div className="grid grid-cols-4 gap-3">
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.studentSessions')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.sessions}</p>
                <p className="text-xs text-gray-400 mt-0.5">{calMode === 'week' ? t('serviceDash.thisWeek') : t('serviceDash.thisMonth')}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.appDeadlines')}</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{stats.deadlines}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('serviceDash.appAndComp')}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.ecMilestones')}</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">{stats.ecMilestones}</p>
                <p className="text-xs text-gray-400 mt-0.5">{calMode === 'week' ? t('serviceDash.thisWeek') : t('serviceDash.thisMonth')}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('serviceDash.notesPending')}</p>
                <p className="text-2xl font-bold text-amber-500 mt-1">{stats.notesPending}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('serviceDash.reportNotSubmitted')}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Color legend (calendar view) */}
        {view === 'calendar' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-200 border border-violet-300" />
              <span className="text-[11px] text-gray-500">{t('serviceDash.studentMeeting')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-dashed border-violet-400" />
              <span className="text-[11px] text-gray-500">{t('serviceDash.regularMeetingScheduled')}</span>
            </div>
            {MILESTONE_TYPES.map(mt => (
              <div key={mt.value} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${mt.dot}`} />
                <span className="text-[11px] text-gray-500">{mt.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" />
              <span className="text-[11px] text-gray-500">{t('serviceDash.taskDeadline')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-200 border border-rose-300" />
              <span className="text-[11px] text-gray-500">🎂 직원 생일</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-sky-200 border border-sky-300" />
              <span className="text-[11px] text-gray-500">🎂 학생 생일</span>
            </div>
          </div>
        )}

        {/* Calendar content */}
        {view === 'calendar' && calMode === 'week' && (
          <WeekCalendar
            days={weekDays}
            meetings={filteredMeetings}
            milestones={viewMilestones}
            followups={filteredFollowups}
            ghostMeetings={ghostMeetings}
            consultantFilter={consultantFilter}
            birthdaysByMmdd={birthdaysByMmdd}
            onEditMeeting={openMeetingNote}
            onAddMilestone={dateStr => {
              if (!canEdit) return
              setDefaultMilestoneStudentId(undefined)
              setDefaultMilestoneDate(dateStr)
              setEditingMilestone(null)
              setShowAddMilestone(true)
            }}
            onEditMilestone={openEditMilestone}
            canEdit={canEdit}
          />
        )}

        {view === 'calendar' && calMode === 'month' && (
          <MonthCalendar
            year={year}
            month={month}
            meetings={filteredMeetings}
            milestones={viewMilestones}
            followups={filteredFollowups}
            ghostMeetings={ghostMeetings}
            consultantFilter={consultantFilter}
            birthdaysByMmdd={birthdaysByMmdd}
            onSelectMeeting={openMeetingNote}
            onEditMilestone={openEditMilestone}
          />
        )}

        {/* Calendar bottom panels */}
        {view === 'calendar' && (
          <div className="grid grid-cols-2 gap-4">
            {/* Upcoming deadlines */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-orange-500" />
                    {t('serviceDash.upcomingDeadlines14')}
                  </h3>
                </div>
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('serviceDash.noUpcomingDeadlines')}</p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingDeadlines.map(m => {
                      const days = daysFromTodayKST(m.date)
                      const cfg = milestoneConfig(m.type)
                      return (
                        <li key={m.id} className="flex items-center gap-2.5">
                          <span className={`text-[11px] font-semibold w-14 shrink-0 ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {days === 0 ? t('serviceDash.today') : days === 1 ? t('serviceDash.tomorrow') : t('serviceDash.daysLater').replace('{n}', String(days))}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-sm text-gray-700 flex-1 truncate">{m.studentName} — {m.title}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Notes pending */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-500" />
                    {t('serviceDash.notesPending')} ({notesPendingList.length})
                  </h3>
                </div>
                {notesPendingList.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('serviceDash.noNotesPending')}</p>
                ) : (
                  <ul className="space-y-2">
                    {notesPendingList.map(m => (
                      <li key={m.id} className="flex items-center gap-2.5">
                        <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                          {m.studentName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{m.studentName}</p>
                          {m.meetingDate && (
                            <p className="text-[11px] text-gray-400">{formatDateLabel(m.meetingDate)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setSelectedMeeting(m)}
                          className="text-xs text-blue-500 hover:underline shrink-0"
                        >
                          {t('serviceDash.view')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cycle overview */}
        {view === 'cycle' && (
          <CycleOverview
            students={vStudents.map(s => ({ id: s.id, name: s.name, assignedConsultant: s.assignedConsultant, status: s.status }))}
            milestones={filteredMilestones}
            consultantFilter={consultantFilter}
            cycleFilter={cycleFilter}
            onAddMilestone={studentId => { if (!canEdit) return; setDefaultMilestoneStudentId(studentId); setDefaultMilestoneDate(undefined); setEditingMilestone(null); setShowAddMilestone(true) }}
            onEditMilestone={openEditMilestone}
            canEdit={canEdit}
          />
        )}

        {/* By-student schedule (item 2) */}
        {view === 'student' && (
          <StudentScheduleView
            students={vStudents.map(s => ({ id: s.id, name: s.name, koreanName: s.koreanName, assignedConsultant: s.assignedConsultant }))}
            milestones={vMilestones}
            onSelectMeeting={setSelectedMeeting}
            onEditMilestone={openEditMilestone}
          />
        )}

        {view === 'majors' && <MajorGradeMatrixSection students={vStudents} />}

        {view === 'programs' && <ProgramSeatBoard students={vStudents} canEdit={canEdit} />}

        {view === 'metrics' && <ServiceMetricsSection />}
      </div>

      {/* Session Prep Sheet */}
      <Sheet open={!!selectedMeeting} onOpenChange={open => { if (!open) setSelectedMeeting(null) }}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          {selectedMeeting && (
            <SessionPrepPanel
              meeting={selectedMeeting}
              onClose={() => setSelectedMeeting(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Milestone Dialog */}
      <MilestoneDialog
        open={showAddMilestone}
        onClose={() => { setShowAddMilestone(false); setEditingMilestone(null) }}
        students={vStudents.map(s => ({ id: s.id, name: s.name, koreanName: s.koreanName }))}
        editing={editingMilestone}
        defaultStudentId={defaultMilestoneStudentId}
        defaultDate={defaultMilestoneDate}
        canEdit={canEdit}
      />

      {/* Edit Meeting Dialog (week view) */}
      <MeetingDialog
        open={showEditMeeting}
        onClose={() => { setShowEditMeeting(false); setEditingMeeting(null) }}
        meeting={editingMeeting}
        canEdit={canEdit}
      />
    </div>
  )
}
