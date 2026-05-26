import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CalendarCheck, FileCheck, Plus, Upload, Loader2, Pencil,
  X, Phone, School, MapPin, Calendar, FileText, ArrowRight, User,
} from 'lucide-react'
import { useMeetings, useCreateMeeting, useUpdateMeeting, useUpdateNoteDelivered } from '@/hooks/useMeetings'
import type { Meeting } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { currentMonthStrKST } from '@/lib/date'
import { useT } from '@/i18n/LanguageContext'
import { MeetingPdfUploadDialog } from '@/components/MeetingPdfUploadDialog'

function getMeetingBadge(num: number, t: (key: string, params?: Record<string, string | number>) => string) {
  const classNames: Record<number, string> = {
    1: 'bg-blue-100 text-blue-700 border-blue-200',
    2: 'bg-violet-100 text-violet-700 border-violet-200',
    3: 'bg-amber-100 text-amber-700 border-amber-200',
  }
  return {
    label: t('meetings.nthMeeting').replace('{n}', String(num)),
    className: classNames[num] || 'bg-gray-100 text-gray-700 border-gray-200',
  }
}

const INITIAL_MEETING_FORM = {
  meetingDate: '',
  meetingNumber: '1',
  parentName: '',
  studentName: '',
  phone: '',
  currentSchool: '',
  grade: '',
  region: '',
  sourceChannel: '',
  memo: '',
}

function MeetingDetail({ meeting, onEdit, onClose, onNoteToggle, t }: {
  meeting: Meeting
  onEdit: (m: Meeting) => void
  onClose: () => void
  onNoteToggle: (id: string, current: boolean) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const badge = getMeetingBadge(meeting.meetingNumber, t)

  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <CardContent className="py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`text-xs ${badge.className}`}>
              {badge.label}
            </Badge>
            <h3 className="font-semibold text-base">{meeting.parentName}</h3>
            {meeting.studentName && (
              <span className="text-sm text-muted-foreground">/ {meeting.studentName}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(meeting)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('meetings.col.meetingDate')}</span>
            <span className="font-mono font-medium">{meeting.meetingDate || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('common.phone')}</span>
            <span className="font-mono">{meeting.phone || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <School className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('common.school')}</span>
            <span>{meeting.currentSchool || '-'} {meeting.grade || ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('common.region')}</span>
            <span>{meeting.region || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('leads.sourceChannel')}</span>
            <span>{meeting.sourceChannel || '-'}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">{t('meetings.col.interestArea')}</span>
            <span>{meeting.interestArea || '-'}</span>
          </div>
        </div>

        {/* Memo */}
        {meeting.memo && (
          <div className="p-3 bg-white rounded-lg border text-sm">
            <span className="text-xs text-muted-foreground block mb-1">{t('common.memo')}</span>
            <p className="whitespace-pre-wrap">{meeting.memo}</p>
          </div>
        )}

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('meetings.col.note')}</span>
              <button
                onClick={() => onNoteToggle(meeting.id, meeting.noteDelivered)}
                className={`inline-flex items-center justify-center size-5 rounded border transition-colors ${
                  meeting.noteDelivered
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input hover:border-primary'
                }`}
              >
                {meeting.noteDelivered && (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
            {meeting.nextMeetingDate && (
              <div className="flex items-center gap-2">
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t('meetings.col.nextMeeting')}</span>
                <span className="font-mono">{meeting.nextMeetingDate}</span>
              </div>
            )}
          </div>
          {meeting.requiredAction && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
              {meeting.requiredAction}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function MeetingsPage() {
  const t = useT()
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [form, setForm] = useState(INITIAL_MEETING_FORM)
  const [editForm, setEditForm] = useState({ ...INITIAL_MEETING_FORM, id: '', interestArea: '', nextMeetingDate: '', requiredAction: '' })

  const { user } = useAuth()
  const createMeeting = useCreateMeeting()
  const updateMeeting = useUpdateMeeting()

  const handleCreateMeeting = () => {
    createMeeting.mutate(
      {
        meetingDate: form.meetingDate,
        meetingNumber: parseInt(form.meetingNumber),
        parentName: form.parentName,
        studentName: form.studentName,
        phone: form.phone,
        currentSchool: form.currentSchool,
        grade: form.grade,
        region: form.region,
        sourceChannel: form.sourceChannel,
        memo: form.memo,
        createdBy: user?.id,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_MEETING_FORM)
        },
      },
    )
  }

  const openEditDialog = (m: Meeting) => {
    setEditForm({
      id: m.id,
      meetingDate: m.meetingDate || '',
      meetingNumber: String(m.meetingNumber),
      parentName: m.parentName || '',
      studentName: m.studentName || '',
      phone: m.phone || '',
      currentSchool: m.currentSchool || '',
      grade: m.grade || '',
      region: m.region || '',
      sourceChannel: m.sourceChannel || '',
      memo: m.memo || '',
      interestArea: m.interestArea || '',
      nextMeetingDate: m.nextMeetingDate || '',
      requiredAction: m.requiredAction || '',
    })
    setEditDialogOpen(true)
  }

  const handleEditMeeting = () => {
    if (!editForm.id || !editForm.parentName || !editForm.meetingDate) return
    updateMeeting.mutate({
      id: editForm.id,
      meetingDate: editForm.meetingDate,
      meetingNumber: parseInt(editForm.meetingNumber),
      parentName: editForm.parentName,
      studentName: editForm.studentName,
      phone: editForm.phone,
      currentSchool: editForm.currentSchool,
      grade: editForm.grade,
      region: editForm.region,
      interestArea: editForm.interestArea,
      sourceChannel: editForm.sourceChannel,
      memo: editForm.memo,
      nextMeetingDate: editForm.nextMeetingDate,
      requiredAction: editForm.requiredAction,
    }, {
      onSuccess: () => setEditDialogOpen(false),
    })
  }

  const { data: meetings = [], isLoading, error } = useMeetings({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const updateNoteDelivered = useUpdateNoteDelivered()

  const handleNoteToggle = (id: string, current: boolean) => {
    updateNoteDelivered.mutate({ id, noteDelivered: !current })
  }

  const currentMonth = currentMonthStrKST()

  const thisMonthMeetings = useMemo(() => {
    return meetings.filter(m => m.meetingDate?.startsWith(currentMonth))
  }, [meetings, currentMonth])

  const noteDeliveryRate = useMemo(() => {
    if (thisMonthMeetings.length === 0) return 0
    const delivered = thisMonthMeetings.filter(m => m.noteDelivered).length
    return (delivered / thisMonthMeetings.length) * 100
  }, [thisMonthMeetings])

  const selectedMeeting = meetings.find(m => m.id === selectedMeetingId)

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t('meetings.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? t('common.loading') : t('meetings.totalMeetings').replace('{n}', String(meetings.length))}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="gap-2" size="sm" onClick={() => setPdfDialogOpen(true)}>
            <Upload className="size-4" /> <span className="hidden sm:inline">{t('meetings.uploadPdf')}</span>
          </Button>
          <Button className="gap-2" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> <span className="hidden sm:inline">{t('meetings.addMeeting')}</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CalendarCheck className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{thisMonthMeetings.length}</div>
              <div className="text-xs text-muted-foreground">{t('meetings.thisMonthMeetings')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <FileCheck className="size-5 text-success" />
            <div>
              <div className="text-lg font-bold">{noteDeliveryRate.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">{t('meetings.noteDeliveryRate')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground whitespace-nowrap">{t('meetings.period')}</span>
            <Input
              type="date"
              className="w-[150px] h-8"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">~</span>
            <Input
              type="date"
              className="w-[150px] h-8"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Selected Meeting Detail */}
      {selectedMeeting && (
        <MeetingDetail
          meeting={selectedMeeting}
          onEdit={openEditDialog}
          onClose={() => setSelectedMeetingId(null)}
          onNoteToggle={handleNoteToggle}
          t={t}
        />
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">
              {t('common.error')}
            </div>
          ) : meetings.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('meetings.noMeetings')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">{t('meetings.col.meetingDate')}</TableHead>
                  <TableHead className="w-[70px]">{t('meetings.col.meetingNumber')}</TableHead>
                  <TableHead>{t('meetings.col.parent')}</TableHead>
                  <TableHead>{t('meetings.col.student')}</TableHead>
                  <TableHead>{t('common.school')}</TableHead>
                  <TableHead>{t('common.region')}</TableHead>
                  <TableHead className="max-w-[180px]">{t('common.memo')}</TableHead>
                  <TableHead className="w-[50px] text-center">{t('meetings.col.note')}</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {meetings.map((meeting) => {
                  const badge = getMeetingBadge(meeting.meetingNumber, t)
                  const isSelected = meeting.id === selectedMeetingId
                  return (
                    <TableRow
                      key={meeting.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedMeetingId(isSelected ? null : meeting.id)}
                    >
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {meeting.meetingDate}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{meeting.parentName}</TableCell>
                      <TableCell className="text-sm">{meeting.studentName || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{meeting.currentSchool || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{meeting.region || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {meeting.memo || '-'}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleNoteToggle(meeting.id, meeting.noteDelivered)}
                          className={`inline-flex items-center justify-center size-5 rounded border transition-colors ${
                            meeting.noteDelivered
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-input hover:border-primary'
                          }`}
                        >
                          {meeting.noteDelivered && (
                            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditDialog(meeting)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Meeting Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('meetings.addMeetingTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('meetings.col.meetingDate')} *</Label>
                <Input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('meetings.col.meetingNumber')} *</Label>
                <Select value={form.meetingNumber} onValueChange={v => v && setForm(f => ({ ...f, meetingNumber: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('meetings.nthMeeting').replace('{n}', '1')}</SelectItem>
                    <SelectItem value="2">{t('meetings.nthMeeting').replace('{n}', '2')}</SelectItem>
                    <SelectItem value="3">{t('meetings.nthMeeting').replace('{n}', '3')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('leads.parentName')} *</Label>
                <Input value={form.parentName} onChange={e => setForm(f => ({ ...f, parentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('leads.studentName')}</Label>
                <Input value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('common.phone')}</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.school')}</Label>
                <Input value={form.currentSchool} onChange={e => setForm(f => ({ ...f, currentSchool: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t('common.grade')}</Label>
                <Input value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.region')}</Label>
                <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('leads.sourceChannel')}</Label>
                <Input value={form.sourceChannel} onChange={e => setForm(f => ({ ...f, sourceChannel: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.memo')}</Label>
              <Textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleCreateMeeting} disabled={!form.parentName || !form.meetingDate || createMeeting.isPending}>
                {createMeeting.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                {t('common.add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('meetings.editMeeting')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('meetings.col.meetingDate')} *</Label>
                <Input type="date" value={editForm.meetingDate} onChange={e => setEditForm(f => ({ ...f, meetingDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('meetings.col.meetingNumber')} *</Label>
                <Select value={editForm.meetingNumber} onValueChange={v => v && setEditForm(f => ({ ...f, meetingNumber: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('meetings.nthMeeting').replace('{n}', '1')}</SelectItem>
                    <SelectItem value="2">{t('meetings.nthMeeting').replace('{n}', '2')}</SelectItem>
                    <SelectItem value="3">{t('meetings.nthMeeting').replace('{n}', '3')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('leads.parentName')} *</Label>
                <Input value={editForm.parentName} onChange={e => setEditForm(f => ({ ...f, parentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('leads.studentName')}</Label>
                <Input value={editForm.studentName} onChange={e => setEditForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('common.phone')}</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.school')}</Label>
                <Input value={editForm.currentSchool} onChange={e => setEditForm(f => ({ ...f, currentSchool: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t('common.grade')}</Label>
                <Input value={editForm.grade} onChange={e => setEditForm(f => ({ ...f, grade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.region')}</Label>
                <Input value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('leads.sourceChannel')}</Label>
                <Input value={editForm.sourceChannel} onChange={e => setEditForm(f => ({ ...f, sourceChannel: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('meetings.col.interestArea')}</Label>
              <Input value={editForm.interestArea} onChange={e => setEditForm(f => ({ ...f, interestArea: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.memo')}</Label>
              <Textarea value={editForm.memo} onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('meetings.col.nextMeeting')}</Label>
                <Input type="date" value={editForm.nextMeetingDate} onChange={e => setEditForm(f => ({ ...f, nextMeetingDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('meetings.col.requiredAction')}</Label>
                <Input value={editForm.requiredAction} onChange={e => setEditForm(f => ({ ...f, requiredAction: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleEditMeeting} disabled={!editForm.parentName || !editForm.meetingDate || updateMeeting.isPending}>
                {updateMeeting.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Upload Dialog */}
      <MeetingPdfUploadDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} />
    </div>
  )
}
