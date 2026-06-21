import { useState, useMemo, useEffect } from 'react'
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
  Loader2, Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useServiceStudents, useServiceDiary } from '@/hooks/useServiceStudents'
import { useServiceFollowups } from '@/hooks/useServiceFollowups'
import {
  useAllServiceMeetings, useAllServiceFollowupsDue,
  type DashboardMeeting, type DashboardFollowup,
} from '@/hooks/useServiceDashboard'
import {
  useAllStudentMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone,
  type DashboardMilestone,
} from '@/hooks/useStudentMilestones'
import { CONSULTANTS, consultantName } from '@/lib/consultants'
import { todayKST, daysFromTodayKST } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import type { MilestoneType, MilestoneStatus, StudentMilestone } from '@/types'

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

const MILESTONE_STATUSES: { value: MilestoneStatus; label: string }[] = [
  { value: 'upcoming',  label: '예정' },
  { value: 'on_track',  label: '정상' },
  { value: 'behind',    label: '지연' },
  { value: 'urgent',    label: '긴급' },
  { value: 'completed', label: '완료' },
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
    : daysAgo === 0 ? '오늘'
    : daysAgo > 0 ? `${daysAgo}일 후`
    : `${Math.abs(daysAgo)}일 전`

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
                {meeting.meetingType || '미팅'} · {consultantName(meeting.consultantId)}
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">최근 미팅</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">{lastMetLabel}</p>
        </div>
        <div className="py-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">미완료 과제</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">
            {openFollowups.length} / {followups.length}
          </p>
        </div>
        <div className="py-3 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">다이어리</p>
          <p className="text-sm font-semibold text-gray-800 mt-0.5">{diaryEntries.length}건</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* From last session */}
        {lastDiary && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {isThisMeetingDiary ? '이 미팅 일지' : '지난 세션에서'}
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
              <p className="text-sm text-gray-400 italic">요약 내용이 없습니다.</p>
            )}
            <Link
              to={`/service/student-360?student=${meeting.studentId}`}
              className="text-xs text-blue-500 hover:underline mt-1.5 flex items-center gap-1"
            >
              전체 노트 보기 <ExternalLink size={11} />
            </Link>
          </section>
        )}

        {/* Open action items */}
        {followups.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              미완료 액션 아이템
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
                <p className="text-xs text-emerald-600">모든 과제 완료 ✓</p>
              )}
            </ul>
          </section>
        )}

        {/* Suggested agenda */}
        {lastDiary?.nextMeetingAgenda && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">추천 아젠다</h3>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {lastDiary.nextMeetingAgenda}
            </div>
          </section>
        )}

        {/* Recent diary entries (up to this meeting's date, so reviewing a past
            meeting doesn't surface diaries from later sessions) */}
        {recentDiaries.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">최근 다이어리</h3>
            <ul className="space-y-2">
              {recentDiaries.slice(0, 4).map(d => (
                <li key={d.id} className="flex gap-2.5 text-sm">
                  {d.entryDate && (
                    <span className="text-[11px] text-gray-400 shrink-0 w-12">
                      {new Date(d.entryDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <span className="text-gray-600 line-clamp-1">
                    {d.meetingSummary || d.agendaItems || '(내용 없음)'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Meeting report */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">미팅 리포트</h3>
          <div className="flex items-center gap-2">
            <Badge className={`text-[11px] ${
              meeting.reportStatus === 'submitted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              meeting.reportStatus === 'pending'   ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-gray-50 text-gray-500 border-gray-200'
            }`}>
              {meeting.reportStatus === 'submitted' ? '제출 완료' :
               meeting.reportStatus === 'pending'   ? '리포트 대기' : '리포트 없음'}
            </Badge>
            {meeting.reportUrl && (
              <a href={meeting.reportUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                보기 <ExternalLink size={11} />
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
              준비 자료
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
}: {
  open: boolean
  onClose: () => void
  students: { id: string; name: string }[]
  editing: StudentMilestone | null
  defaultStudentId?: string
  defaultDate?: string
}) {
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

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setStudentId(editing?.studentId ?? defaultStudentId ?? '')
      setType(editing?.type ?? 'application')
      setTitle(editing?.title ?? '')
      setDate(editing?.date ?? defaultDate ?? todayKST())
      setStatus(editing?.status ?? 'upcoming')
      setNotes(editing?.notes ?? '')
    }
  }, [open])

  const saving = createMilestone.isPending || updateMilestone.isPending
  const deleting = deleteMilestone.isPending

  async function handleSave() {
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
      alert(`저장 실패: ${msg}`)
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!window.confirm('이 일정을 삭제할까요? 되돌릴 수 없습니다.')) return
    try {
      await deleteMilestone.mutateAsync({ id: editing.id, studentId: editing.studentId })
      onClose()
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e)
      alert(`삭제 실패: ${msg}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '마일스톤 수정' : '마일스톤 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label>학생</Label>
            <Select value={studentId} onValueChange={v => setStudentId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="학생 선택" /></SelectTrigger>
              <SelectContent>
                {students.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>유형</Label>
              <Select value={type} onValueChange={v => setType(v as MilestoneType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>상태</Label>
              <Select value={status} onValueChange={v => setStatus(v as MilestoneStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>제목</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: Stanford REA 제출" />
          </div>
          <div className="space-y-1">
            <Label>날짜</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>메모 (선택)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="추가 내용..." />
          </div>
        </div>
        <DialogFooter className={editing ? 'sm:justify-between' : undefined}>
          {editing && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              {deleting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trash2 size={14} className="mr-1" />}
              삭제
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={deleting}>취소</Button>
            <Button onClick={handleSave} disabled={saving || deleting || !studentId || !title || !date}>
              {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              {editing ? '저장' : '추가'}
            </Button>
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
  onSelectMeeting,
  onAddMilestone,
  onEditMilestone,
}: {
  days: Date[]
  meetings: DashboardMeeting[]
  milestones: DashboardMilestone[]
  followups: DashboardFollowup[]
  ghostMeetings: GhostMeeting[]
  consultantFilter: string
  onSelectMeeting: (m: DashboardMeeting) => void
  onAddMilestone: (dateStr: string) => void
  onEditMilestone: (m: DashboardMilestone) => void
}) {
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
              {dm.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectMeeting(m)}
                  className={`w-full text-left text-[11px] px-1.5 py-1 rounded border font-medium truncate hover:opacity-80 transition-opacity ${MEETING_COLOR}`}
                >
                  {m.studentName}
                  {m.meetingType && <span className="opacity-70"> · {m.meetingType}</span>}
                </button>
              ))}
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
                    title={`${m.studentName}: ${m.title} (클릭하여 수정)`}
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
              {dm.length === 0 && gm.length === 0 && mm.length === 0 && ff.length === 0 && (
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
  onSelectMeeting: (m: DashboardMeeting) => void
  onEditMilestone: (m: DashboardMilestone) => void
}) {
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
                  {dm.slice(0, 2).map(m => (
                    <button key={m.id} onClick={() => onSelectMeeting(m)}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate font-medium ${MEETING_COLOR}`}>
                      {m.studentName}
                    </button>
                  ))}
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
                        title={`${m.studentName}: ${m.title} (클릭하여 수정)`}
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
                  {(dm.length + gm.length + mm.length + ff.length) > 3 && (
                    <p className="text-[10px] text-gray-400 pl-1">+{dm.length + gm.length + mm.length + ff.length - 3}개</p>
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
}: {
  students: { id: string; name: string; assignedConsultant?: string; status?: string }[]
  milestones: DashboardMilestone[]
  consultantFilter: string
  cycleFilter: 'all' | 'at_risk'
  onAddMilestone: (studentId: string) => void
  onEditMilestone: (m: DashboardMilestone) => void
}) {
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
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase">학생</div>
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
          <div className="py-12 text-center text-sm text-gray-400">표시할 학생이 없습니다.</div>
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
                          <button
                            onClick={() => onAddMilestone(student.id)}
                            className="w-5 h-5 rounded-full border-2 border-dashed border-gray-200 hover:border-gray-400 transition-colors"
                            title="마일스톤 추가"
                          />
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
                                title={`${m.title} · ${MILESTONE_STATUSES.find(s => s.value === m.status)?.label} (클릭하여 수정)`}
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
          {MILESTONE_TYPES.map(t => (
            <div key={t.value} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${t.dot}`} />
              <span className="text-[11px] text-gray-500">{t.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[12px] shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-gray-600">{statusCounts.onTrack} 정상</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-600">{statusCounts.behind} 지연</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-gray-600">{statusCounts.urgent} 긴급</span></span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ServiceDashboardPage() {
  const today = todayKST()
  const todayDate = new Date(today + 'T00:00:00')

  const [view,             setView]             = useState<'calendar' | 'cycle'>('calendar')
  const [calMode,          setCalMode]          = useState<'week' | 'month'>('week')
  const [refDate,          setRefDate]          = useState<Date>(todayDate)
  const [consultantFilter, setConsultantFilter] = useState('all')
  const [cycleFilter,      setCycleFilter]      = useState<'all' | 'at_risk'>('all')
  const [selectedMeeting,  setSelectedMeeting]  = useState<DashboardMeeting | null>(null)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [defaultMilestoneStudentId, setDefaultMilestoneStudentId] = useState<string | undefined>()
  const [defaultMilestoneDate, setDefaultMilestoneDate] = useState<string | undefined>()
  const [editingMilestone, setEditingMilestone] = useState<StudentMilestone | null>(null)

  // Open the milestone dialog in edit mode for an existing milestone
  const openEditMilestone = (m: StudentMilestone) => {
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

  // Ghost meetings from regular schedule (future dates only, no existing meeting on that day)
  const ghostMeetings = useMemo<GhostMeeting[]>(() => {
    const result: GhostMeeting[] = []
    const existingKey = new Set(meetings.map(m => `${m.studentId}|${m.meetingDate}`))
    const dates: string[] = []
    let d = new Date(viewStartDate + 'T00:00:00')
    const endD = new Date(viewEndDate + 'T00:00:00')
    while (d <= endD) { dates.push(toDateStr(d)); d = addDays(d, 1) }
    students.forEach(s => {
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
  }, [students, meetings, viewStartDate, viewEndDate, today])

  // Stats (filtered by consultant)
  const filteredMeetings   = consultantFilter === 'all' ? meetings   : meetings.filter(m   => m.studentConsultant  === consultantFilter)
  const filteredMilestones = consultantFilter === 'all' ? milestones : milestones.filter(m  => m.studentConsultant === consultantFilter)
  const filteredFollowups  = consultantFilter === 'all' ? followupsDue : followupsDue.filter(f => f.studentConsultant === consultantFilter)

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
                <SelectItem value="all">전체 컨설턴트</SelectItem>
                {CONSULTANTS.map(c => (
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
                <Calendar size={14} className="inline mr-1.5" />캘린더
              </button>
              <button
                onClick={() => setView('cycle')}
                className={`px-3 h-8 text-sm font-medium border-l ${view === 'cycle' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users size={14} className="inline mr-1.5" />사이클
              </button>
            </div>

            {/* Add milestone */}
            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingMilestone(null); setDefaultMilestoneStudentId(undefined); setDefaultMilestoneDate(undefined); setShowAddMilestone(true) }}>
              <Plus size={14} />마일스톤
            </Button>
          </div>
        </div>

        {/* Calendar nav (only in calendar view) */}
        {view === 'calendar' && (
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-1 rounded hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              <button onClick={goToday} className="px-2 py-0.5 text-sm border rounded hover:bg-gray-50">오늘</button>
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
              >주간</button>
              <button
                onClick={() => setCalMode('month')}
                className={`px-3 h-7 text-xs font-medium border-l ${calMode === 'month' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
              >월간</button>
            </div>
          </div>
        )}

        {/* Cycle filter */}
        {view === 'cycle' && (
          <div className="flex items-center gap-2 mt-3">
            <p className="text-xs text-gray-500">
              {consultantFilter === 'all' ? '전체 컨설턴트' : consultantName(consultantFilter)}
              {' · '}활성 학생 {students.filter(s => s.status === 'active' || !s.status).length}명
            </p>
            <div className="flex rounded-md border overflow-hidden ml-auto">
              <button onClick={() => setCycleFilter('all')}
                className={`px-3 h-7 text-xs font-medium ${cycleFilter === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                전체
              </button>
              <button onClick={() => setCycleFilter('at_risk')}
                className={`px-3 h-7 text-xs font-medium border-l ${cycleFilter === 'at_risk' ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                <AlertCircle size={11} className="inline mr-1" />위험
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">학생 세션</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.sessions}</p>
                <p className="text-xs text-gray-400 mt-0.5">{calMode === 'week' ? '이번 주' : '이번 달'}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">원서 마감</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{stats.deadlines}</p>
                <p className="text-xs text-gray-400 mt-0.5">원서 + 대회</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">EC 마일스톤</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">{stats.ecMilestones}</p>
                <p className="text-xs text-gray-400 mt-0.5">{calMode === 'week' ? '이번 주' : '이번 달'}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gray-50">
              <CardContent className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">노트 대기</p>
                <p className="text-2xl font-bold text-amber-500 mt-1">{stats.notesPending}</p>
                <p className="text-xs text-gray-400 mt-0.5">리포트 미제출</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Color legend (calendar view) */}
        {view === 'calendar' && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-200 border border-violet-300" />
              <span className="text-[11px] text-gray-500">학생 미팅</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border border-dashed border-violet-400" />
              <span className="text-[11px] text-gray-500">정기 미팅 예정</span>
            </div>
            {MILESTONE_TYPES.map(t => (
              <div key={t.value} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded ${t.dot}`} />
                <span className="text-[11px] text-gray-500">{t.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" />
              <span className="text-[11px] text-gray-500">과제 마감</span>
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
            onSelectMeeting={setSelectedMeeting}
            onAddMilestone={dateStr => {
              setDefaultMilestoneStudentId(undefined)
              setDefaultMilestoneDate(dateStr)
              setEditingMilestone(null)
              setShowAddMilestone(true)
            }}
            onEditMilestone={openEditMilestone}
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
            onSelectMeeting={setSelectedMeeting}
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
                    다가오는 마감 (14일)
                  </h3>
                </div>
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-gray-400">예정된 마감이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingDeadlines.map(m => {
                      const days = daysFromTodayKST(m.date)
                      const cfg = milestoneConfig(m.type)
                      return (
                        <li key={m.id} className="flex items-center gap-2.5">
                          <span className={`text-[11px] font-semibold w-14 shrink-0 ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {days === 0 ? '오늘' : days === 1 ? '내일' : `${days}일 후`}
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
                    노트 대기 ({notesPendingList.length})
                  </h3>
                </div>
                {notesPendingList.length === 0 ? (
                  <p className="text-sm text-gray-400">대기 중인 노트가 없습니다.</p>
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
                          보기
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
            students={students.map(s => ({ id: s.id, name: s.name, assignedConsultant: s.assignedConsultant, status: s.status }))}
            milestones={filteredMilestones}
            consultantFilter={consultantFilter}
            cycleFilter={cycleFilter}
            onAddMilestone={studentId => { setDefaultMilestoneStudentId(studentId); setDefaultMilestoneDate(undefined); setEditingMilestone(null); setShowAddMilestone(true) }}
            onEditMilestone={openEditMilestone}
          />
        )}
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
        students={students.map(s => ({ id: s.id, name: s.name }))}
        editing={editingMilestone}
        defaultStudentId={defaultMilestoneStudentId}
        defaultDate={defaultMilestoneDate}
      />
    </div>
  )
}
