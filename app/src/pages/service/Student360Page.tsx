import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Search, Plus, Pencil, Trash2, GraduationCap, Phone, User as UserIcon,
  CalendarDays, FileText, NotebookPen, Link2, Copy, Check, ExternalLink, Power,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import {
  useServiceStudents, useCreateServiceStudent, useUpdateServiceStudent, useDeleteServiceStudent,
  useServiceMeetings, useCreateServiceMeeting, useUpdateServiceMeeting, useDeleteServiceMeeting,
  useServiceDiary, useCreateServiceDiary, useUpdateServiceDiary, useDeleteServiceDiary,
} from '@/hooks/useServiceStudents'
import {
  usePortalTokens, useCreatePortalToken, useTogglePortalToken, useDeletePortalToken,
} from '@/hooks/usePortalTokens'
import type {
  ServiceStudent, ServiceMeeting, ServiceReportStatus, ServiceDiaryEntry,
} from '@/types'

// Shared consultant pool
const CONSULTANTS = [
  { id: 'sangbum', name: '한상범' },
  { id: 'jihyun', name: '김지현' },
  { id: 'eunyoung', name: '양은영' },
  { id: 'yeonse', name: '남연서' },
  { id: 'danny', name: 'Danny' },
  { id: 'liz', name: '유리즈' },
] as const

function consultantName(id?: string) {
  return CONSULTANTS.find(c => c.id === id)?.name || id || '—'
}

const COMM_PLATFORMS = ['KakaoTalk', 'WhatsApp', 'WeChat', 'Email', 'Etc'] as const

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
] as const satisfies ReadonlyArray<{ key: keyof ServiceDiaryEntry; labelKey: string }>

export function Student360Page() {
  const t = useT()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: students = [], isLoading } = useServiceStudents()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.koreanName || '').toLowerCase().includes(q) ||
      (s.school || '').toLowerCase().includes(q) ||
      (s.parentName || '').toLowerCase().includes(q)
    )
  }, [students, search])

  const selected = students.find(s => s.id === selectedId) || null

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-3.5rem)] -m-3 md:-m-6 p-3 md:p-6">
      {/* ── Student list ── */}
      <div className="lg:w-80 shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">{t('nav.student360')}</h1>
          <StudentDialog
            trigger={<Button size="sm"><Plus className="size-4 mr-1" />{t('student360.newStudent')}</Button>}
            onSaved={(s) => setSelectedId(s.id)}
            createdBy={user?.id}
          />
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('student360.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                <span className="font-medium text-sm truncate">
                  {s.name}{s.koreanName ? ` · ${s.koreanName}` : ''}
                </span>
                {s.status && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{s.status}</Badge>
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
            <ProfileSection student={selected} onDeleted={() => setSelectedId(null)} createdBy={user?.id} />
            <PortalLinksSection studentId={selected.id} studentName={selected.name} createdBy={user?.id} />
            <MeetingsSection studentId={selected.id} createdBy={user?.id} />
            <DiarySection studentId={selected.id} authorName={user?.name} createdBy={user?.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────── Profile ──────────────────────────
function ProfileSection({ student, onDeleted, createdBy }: {
  student: ServiceStudent
  onDeleted: () => void
  createdBy?: string
}) {
  const t = useT()
  const del = useDeleteServiceStudent()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="size-5 text-primary" />
          {student.name}
          {student.koreanName && <span className="text-muted-foreground font-normal">· {student.koreanName}</span>}
          {student.status && <Badge variant="outline">{student.status}</Badge>}
        </CardTitle>
        <div className="flex gap-2">
          <StudentDialog
            student={student}
            createdBy={createdBy}
            trigger={<Button variant="outline" size="sm"><Pencil className="size-4 mr-1" />{t('common.edit')}</Button>}
          />
          <Button
            variant="outline" size="sm"
            onClick={() => {
              if (confirm(t('student360.confirmDeleteStudent'))) {
                del.mutate(student.id, { onSuccess: onDeleted })
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
        <Field label={t('student360.nationality')} value={student.nationality} />
        <Field icon={<UserIcon className="size-4" />} label={t('student360.parentName')} value={student.parentName} />
        <Field icon={<Phone className="size-4" />} label={t('student360.contact')} value={student.contact} />
        <Field label={t('student360.region')} value={student.region} />
        <Field label={t('student360.grade')} value={student.grade} />
        <Field icon={<GraduationCap className="size-4" />} label={t('student360.school')} value={student.school} />
        <Field label={t('student360.consultant')} value={consultantName(student.assignedConsultant)} />
        <Field label={t('student360.essayEditor')} value={student.essayEditor} />
        <Field label={t('student360.partners')} value={student.partners} />
        <Field label={t('student360.majors')} value={student.majors} />
        <Field label={t('student360.contractType')} value={student.contractType} />
        <Field label={t('student360.commPlatform')} value={student.communicationPlatform} />
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{t('student360.chatLink')}</p>
          {student.chatLink ? (
            <a
              href={student.chatLink}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline break-all"
            >
              {t('student360.openChat')}
            </a>
          ) : (
            <p>—</p>
          )}
        </div>
        <Field label={t('student360.startDate')} value={student.startDate} />
        <Field label={t('student360.endDate')} value={student.endDate} />
        <Field label={t('student360.acceptedUni')} value={student.acceptedUni} />
        <Field label={t('student360.address')} value={student.address} />
        {student.notes && (
          <div className="col-span-2 md:col-span-3">
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

// ────────────────────────── Portal Links ──────────────────────────
function PortalLinksSection({ studentId, studentName, createdBy }: {
  studentId: string
  studentName: string
  createdBy?: string
}) {
  const t = useT()
  const { data: tokens = [], isLoading } = usePortalTokens(studentId)
  const createToken = useCreatePortalToken()
  const toggleToken = useTogglePortalToken()
  const deleteToken = useDeletePortalToken()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const baseUrl = window.location.origin

  const handleCreate = () => {
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
        <Button
          size="sm" variant="outline"
          onClick={handleCreate}
          disabled={createToken.isPending}
        >
          <Plus className="size-4 mr-1" />
          {t('portal.generateLink')}
        </Button>
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
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => toggleToken.mutate({ id: tk.id, studentId, isActive: !tk.isActive })}
                    title={tk.isActive ? t('portal.deactivate') : t('portal.activate')}
                  >
                    <Power className={`size-4 ${tk.isActive ? 'text-emerald-500' : 'text-gray-400'}`} />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      if (confirm(t('portal.confirmDelete'))) {
                        deleteToken.mutate({ id: tk.id, studentId })
                      }
                    }}
                  >
                    <Trash2 className="size-4 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ────────────────────────── Student create/edit dialog ──────────────────────────
function StudentDialog({ student, trigger, onSaved, createdBy }: {
  student?: ServiceStudent
  trigger: ReactNode
  onSaved?: (s: ServiceStudent) => void
  createdBy?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceStudent()
  const update = useUpdateServiceStudent()
  const buildForm = () => ({
    name: student?.name || '',
    koreanName: student?.koreanName || '',
    nationality: student?.nationality || '',
    parentName: student?.parentName || '',
    contact: student?.contact || '',
    region: student?.region || '',
    grade: student?.grade || '',
    school: student?.school || '',
    assignedConsultant: student?.assignedConsultant || '',
    essayEditor: student?.essayEditor || '',
    partners: student?.partners || '',
    majors: student?.majors || '',
    contractType: student?.contractType || '',
    communicationPlatform: student?.communicationPlatform || '',
    chatLink: student?.chatLink || '',
    startDate: student?.startDate || '',
    endDate: student?.endDate || '',
    status: student?.status || '',
    notes: student?.notes || '',
    acceptedUni: student?.acceptedUni || '',
    address: student?.address || '',
  })
  const [form, setForm] = useState(buildForm)

  // Reset to a clean form (or the student's values) every time the dialog opens
  useEffect(() => { if (open) setForm(buildForm()) }, [open])

  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    if (!form.name.trim()) return
    const payload = {
      name: form.name.trim(),
      koreanName: form.koreanName || undefined,
      nationality: form.nationality || undefined,
      parentName: form.parentName || undefined,
      contact: form.contact || undefined,
      region: form.region || undefined,
      grade: form.grade || undefined,
      school: form.school || undefined,
      assignedConsultant: form.assignedConsultant || undefined,
      essayEditor: form.essayEditor || undefined,
      partners: form.partners || undefined,
      majors: form.majors || undefined,
      contractType: form.contractType || undefined,
      communicationPlatform: form.communicationPlatform || undefined,
      chatLink: form.chatLink || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      status: form.status || undefined,
      notes: form.notes || undefined,
      acceptedUni: form.acceptedUni || undefined,
      address: form.address || undefined,
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
          <LabeledInput label={t('student360.nationality')} value={form.nationality} onChange={v => set('nationality', v)} />
          <LabeledInput label={t('student360.parentName')} value={form.parentName} onChange={v => set('parentName', v)} />
          <LabeledInput label={t('student360.contact')} value={form.contact} onChange={v => set('contact', v)} />
          <LabeledInput label={t('student360.region')} value={form.region} onChange={v => set('region', v)} />
          <LabeledInput label={t('student360.grade')} value={form.grade} onChange={v => set('grade', v)} />
          <LabeledInput label={t('student360.school')} value={form.school} onChange={v => set('school', v)} />
          <div>
            <Label className="text-xs">{t('student360.consultant')}</Label>
            <Select value={form.assignedConsultant} onValueChange={v => set('assignedConsultant', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {CONSULTANTS.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <LabeledInput label={t('student360.essayEditor')} value={form.essayEditor} onChange={v => set('essayEditor', v)} />
          <LabeledInput label={t('student360.partners')} value={form.partners} onChange={v => set('partners', v)} />
          <LabeledInput label={t('student360.majors')} value={form.majors} onChange={v => set('majors', v)} />
          <LabeledInput label={t('student360.contractType')} value={form.contractType} onChange={v => set('contractType', v)} />
          <div>
            <Label className="text-xs">{t('student360.commPlatform')}</Label>
            <Select value={form.communicationPlatform} onValueChange={v => set('communicationPlatform', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {COMM_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <LabeledInput label={t('student360.chatLink')} value={form.chatLink} onChange={v => set('chatLink', v)} />
          <div>
            <Label className="text-xs">{t('student360.startDate')}</Label>
            <Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t('student360.endDate')}</Label>
            <Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
          <LabeledInput label={t('student360.status')} value={form.status} onChange={v => set('status', v)} />
          <LabeledInput label={t('student360.acceptedUni')} value={form.acceptedUni} onChange={v => set('acceptedUni', v)} />
          <div className="col-span-2">
            <Label className="text-xs">{t('student360.address')}</Label>
            <Input value={form.address} onChange={e => set('address', e.target.value)} />
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

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

// ────────────────────────── Meetings ──────────────────────────
function MeetingsSection({ studentId, createdBy }: { studentId: string; createdBy?: string }) {
  const t = useT()
  const { data: meetings = [] } = useServiceMeetings(studentId)
  const del = useDeleteServiceMeeting()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-5 text-primary" />
          {t('student360.meetings')} <span className="text-muted-foreground font-normal">({meetings.length})</span>
        </CardTitle>
        <MeetingDialog
          studentId={studentId} createdBy={createdBy}
          trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {meetings.length === 0 && <p className="text-sm text-muted-foreground">{t('student360.noMeetings')}</p>}
        {meetings.map(m => (
          <div key={m.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{m.meetingDate || '—'}</span>
                {m.meetingType && <Badge variant="outline">{m.meetingType}</Badge>}
                <span className="text-muted-foreground font-normal">{consultantName(m.consultantId)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={REPORT_META[m.reportStatus].className}>
                  <FileText className="size-3 mr-1" />{t(REPORT_META[m.reportStatus].labelKey)}
                </Badge>
                <MeetingDialog
                  studentId={studentId} meeting={m} createdBy={createdBy}
                  trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
                />
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { if (confirm(t('student360.confirmDelete'))) del.mutate({ id: m.id, studentId }) }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            {m.summary && <p className="text-sm mt-2 whitespace-pre-wrap">{m.summary}</p>}
            {m.reportUrl && (
              <a href={m.reportUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 inline-block">
                {t('student360.reportLink')}{m.reportDate ? ` · ${m.reportDate}` : ''}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MeetingDialog({ studentId, meeting, trigger, createdBy }: {
  studentId: string
  meeting?: ServiceMeeting
  trigger: ReactNode
  createdBy?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceMeeting()
  const update = useUpdateServiceMeeting()
  const buildForm = () => ({
    meetingDate: meeting?.meetingDate || '',
    meetingType: meeting?.meetingType || '',
    consultantId: meeting?.consultantId || '',
    summary: meeting?.summary || '',
    reportStatus: (meeting?.reportStatus || 'none') as string,
    reportUrl: meeting?.reportUrl || '',
    reportDate: meeting?.reportDate || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const set = (k: keyof typeof form, v: string | null) => setForm(f => ({ ...f, [k]: v ?? '' }))

  const submit = () => {
    const payload = {
      meetingDate: form.meetingDate || undefined,
      meetingType: form.meetingType || undefined,
      consultantId: form.consultantId || undefined,
      summary: form.summary || undefined,
      reportStatus: form.reportStatus as ServiceReportStatus,
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
          <div>
            <Label className="text-xs">{t('student360.meetingDate')}</Label>
            <Input type="date" value={form.meetingDate} onChange={e => set('meetingDate', e.target.value)} />
          </div>
          <LabeledInput label={t('student360.meetingType')} value={form.meetingType} onChange={v => set('meetingType', v)} />
          <div>
            <Label className="text-xs">{t('student360.consultant')}</Label>
            <Select value={form.consultantId} onValueChange={v => set('consultantId', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {CONSULTANTS.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          <LabeledInput label={t('student360.reportUrl')} value={form.reportUrl} onChange={v => set('reportUrl', v)} />
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
function DiarySection({ studentId, authorName, createdBy }: {
  studentId: string
  authorName?: string
  createdBy?: string
}) {
  const t = useT()
  const { data: entries = [] } = useServiceDiary(studentId)
  const del = useDeleteServiceDiary()
  const [diarySearch, setDiarySearch] = useState('')

  const visibleEntries = useMemo(() => {
    const q = diarySearch.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(d =>
      (d.entryDate || '').toLowerCase().includes(q) ||
      DIARY_FIELDS.some(f => (d[f.key] || '').toLowerCase().includes(q))
    )
  }, [entries, diarySearch])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-5 text-primary" />
          {t('student360.diary')} <span className="text-muted-foreground font-normal">({entries.length})</span>
        </CardTitle>
        <DiaryDialog
          studentId={studentId} authorName={authorName} createdBy={createdBy}
          trigger={<Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('common.add')}</Button>}
        />
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
        {visibleEntries.map(d => (
          <div key={d.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{d.entryDate || '—'}</span>
                {d.authorId && <span className="text-muted-foreground font-normal">{d.authorId}</span>}
              </div>
              <div className="flex items-center gap-2">
                <DiaryDialog
                  studentId={studentId} entry={d} authorName={authorName} createdBy={createdBy}
                  trigger={<Button size="sm" variant="ghost"><Pencil className="size-3.5" /></Button>}
                />
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { if (confirm(t('student360.confirmDelete'))) del.mutate({ id: d.id, studentId }) }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {DIARY_FIELDS.map(f => {
                const val = d[f.key]
                if (!val) return null
                return (
                  <div key={f.key}>
                    <p className="text-xs font-medium text-muted-foreground">{t(f.labelKey)}</p>
                    <p className="text-sm whitespace-pre-wrap">{val}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DiaryDialog({ studentId, entry, trigger, authorName, createdBy }: {
  studentId: string
  entry?: ServiceDiaryEntry
  trigger: ReactNode
  authorName?: string
  createdBy?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const create = useCreateServiceDiary()
  const update = useUpdateServiceDiary()
  const buildForm = () => ({
    entryDate: entry?.entryDate || new Date().toISOString().slice(0, 10),
    agendaItems: entry?.agendaItems || '',
    meetingSummary: entry?.meetingSummary || '',
    extracurricularNotes: entry?.extracurricularNotes || '',
    identityNarrativeNotes: entry?.identityNarrativeNotes || '',
    questionsConcerns: entry?.questionsConcerns || '',
    nextMeetingAgenda: entry?.nextMeetingAgenda || '',
    followUpCommitments: entry?.followUpCommitments || '',
    assignments: entry?.assignments || '',
    criticalDates: entry?.criticalDates || '',
  })
  const [form, setForm] = useState(buildForm)
  useEffect(() => { if (open) setForm(buildForm()) }, [open])
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    const payload = {
      entryDate: form.entryDate || undefined,
      agendaItems: form.agendaItems || undefined,
      meetingSummary: form.meetingSummary || undefined,
      extracurricularNotes: form.extracurricularNotes || undefined,
      identityNarrativeNotes: form.identityNarrativeNotes || undefined,
      questionsConcerns: form.questionsConcerns || undefined,
      nextMeetingAgenda: form.nextMeetingAgenda || undefined,
      followUpCommitments: form.followUpCommitments || undefined,
      assignments: form.assignments || undefined,
      criticalDates: form.criticalDates || undefined,
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
