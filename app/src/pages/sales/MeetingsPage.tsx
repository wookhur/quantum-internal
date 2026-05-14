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
import { CalendarCheck, FileCheck, Plus, Loader2 } from 'lucide-react'
import { useMeetings, useCreateMeeting, useUpdateNoteDelivered } from '@/hooks/useMeetings'
import { useAuth } from '@/contexts/AuthContext'
import { currentMonthStrKST } from '@/lib/date'
import { useT } from '@/i18n/LanguageContext'

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

export function MeetingsPage() {
  const t = useT()
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_MEETING_FORM)

  const { user } = useAuth()
  const createMeeting = useCreateMeeting()

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

  const { data: meetings = [], isLoading, error } = useMeetings({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const updateNoteDelivered = useUpdateNoteDelivered()

  const handleNoteToggle = (id: string, current: boolean) => {
    updateNoteDelivered.mutate({ id, noteDelivered: !current })
  }

  // Summary: meetings this month
  const currentMonth = currentMonthStrKST()

  const thisMonthMeetings = useMemo(() => {
    return meetings.filter(m => m.meetingDate?.startsWith(currentMonth))
  }, [meetings, currentMonth])

  const noteDeliveryRate = useMemo(() => {
    if (thisMonthMeetings.length === 0) return 0
    const delivered = thisMonthMeetings.filter(m => m.noteDelivered).length
    return (delivered / thisMonthMeetings.length) * 100
  }, [thisMonthMeetings])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('meetings.title')}</h1>
          <p className="text-muted-foreground">
            {isLoading ? t('common.loading') : t('meetings.totalMeetings').replace('{n}', String(meetings.length))}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> {t('meetings.addMeeting')}
        </Button>
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{t('meetings.period')}</span>
              <Input
                type="date"
                className="w-[160px] h-9"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">~</span>
              <Input
                type="date"
                className="w-[160px] h-9"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">{t('meetings.col.meetingDate')}</TableHead>
                    <TableHead className="w-[60px]">{t('meetings.col.meetingNumber')}</TableHead>
                    <TableHead>{t('meetings.col.parent')}</TableHead>
                    <TableHead>{t('meetings.col.student')}</TableHead>
                    <TableHead>{t('common.phone')}</TableHead>
                    <TableHead>{t('common.school')}</TableHead>
                    <TableHead className="w-[50px]">{t('common.grade')}</TableHead>
                    <TableHead>{t('common.region')}</TableHead>
                    <TableHead>{t('meetings.col.interestArea')}</TableHead>
                    <TableHead>{t('meetings.col.sourceChannel')}</TableHead>
                    <TableHead className="max-w-[150px]">{t('common.memo')}</TableHead>
                    <TableHead className="w-[60px] text-center">{t('meetings.col.note')}</TableHead>
                    <TableHead className="w-[90px]">{t('meetings.col.nextMeeting')}</TableHead>
                    <TableHead className="max-w-[120px]">{t('meetings.col.requiredAction')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.map((meeting) => {
                    const badge = getMeetingBadge(meeting.meetingNumber, t)
                    return (
                      <TableRow key={meeting.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {meeting.meetingDate?.replace('2026-', '').replace('2025-', '')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{meeting.parentName}</TableCell>
                        <TableCell className="text-sm">{meeting.studentName || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{meeting.phone || '-'}</TableCell>
                        <TableCell className="text-sm">{meeting.currentSchool || '-'}</TableCell>
                        <TableCell className="text-sm">{meeting.grade || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{meeting.region || '-'}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate">{meeting.interestArea || '-'}</TableCell>
                        <TableCell>
                          {meeting.sourceChannel ? (
                            <Badge variant="outline" className="text-xs font-normal">{meeting.sourceChannel}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate text-muted-foreground">
                          {meeting.memo || '-'}
                        </TableCell>
                        <TableCell className="text-center">
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
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {meeting.nextMeetingDate?.replace('2026-', '').replace('2025-', '') || '-'}
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate">
                          {meeting.requiredAction ? (
                            <span className="text-warning font-medium">{meeting.requiredAction}</span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
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
            <div className="grid grid-cols-3 gap-3">
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
    </div>
  )
}
