import { useState, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
// Table components unused – using native <table> for tighter column control
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CalendarCheck, FileCheck, Plus, Upload, Loader2, Pencil,
  X, Phone, School, MapPin, Calendar, FileText, ArrowRight, User,
  Paperclip, Trash2, ExternalLink, LinkIcon,
} from 'lucide-react'
import { useMeetings, useCreateMeeting, useUpdateMeeting, useDeleteMeeting, useUpdateNoteDelivered, useUploadMeetingPdf, useDeleteMeetingPdf } from '@/hooks/useMeetings'
import type { Meeting, MeetingMethod } from '@/types'
import { MEETING_METHODS } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { currentMonthStrKST } from '@/lib/date'
import { extractTextFromPdf, renderPdfPagesToImages } from '@/lib/pdf-extract'
import { extractMeetingFields, extractMeetingFieldsFromImages } from '@/lib/extract-meeting-ai'
import { useT } from '@/i18n/LanguageContext'
import { useCanEdit } from '@/hooks/usePermissions'
// MeetingPdfUploadDialog no longer used — PDF upload integrated into create flow

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
  meetingMethod: '' as '' | MeetingMethod,
  parentName: '',
  studentName: '',
  phone: '',
  currentSchool: '',
  grade: '',
  region: '',
  sourceChannel: '',
  memo: '',
}

function MeetingDetail({ meeting, onEdit, onClose, onDelete, onNoteToggle, onPdfUpload, onPdfDelete, pdfUploading, deleting, canEdit, t }: {
  meeting: Meeting
  onEdit: (m: Meeting) => void
  onClose: () => void
  onDelete: (id: string) => void
  onNoteToggle: (id: string, current: boolean) => void
  onPdfUpload: (meetingId: string, file: File) => void
  onPdfDelete: (meetingId: string, pdfUrl: string) => void
  pdfUploading: boolean
  deleting: boolean
  canEdit: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const badge = getMeetingBadge(meeting.meetingNumber, t)

  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <CardContent className="py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={`text-xs ${badge.className}`}>
              {badge.label}
            </Badge>
            <h3 className="font-semibold text-base">{meeting.parentName}</h3>
            {meeting.studentName && (
              <span className="text-sm text-muted-foreground">/ {meeting.studentName}</span>
            )}
            {meeting.leadId && (
              <Link to={`/sales/leads?id=${meeting.leadId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <LinkIcon className="size-3" />
                {t('meetings.linkedLead')}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(meeting)}>
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => { if (confirm(t('meetings.deleteConfirm'))) onDelete(meeting.id) }}
                disabled={deleting}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
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
            {meeting.meetingMethod && (
              <Badge variant="outline" className="text-[10px]">
                {MEETING_METHODS.find(m => m.value === meeting.meetingMethod)?.label ?? meeting.meetingMethod}
              </Badge>
            )}
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

        {/* PDF attachment */}
        <div className="flex items-center gap-2 text-sm">
          <Paperclip className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{t('meetings.notePdf')}</span>
          {meeting.notePdfUrl ? (
            <div className="flex items-center gap-1.5">
              <a
                href={meeting.notePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 text-xs"
              >
                <ExternalLink className="size-3" />
                {t('meetings.viewPdf')}
              </a>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={() => onPdfDelete(meeting.id, meeting.notePdfUrl!)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          ) : canEdit ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfUploading}
              >
                {pdfUploading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Upload className="size-3 mr-1" />}
                {t('meetings.uploadNotePdf')}
              </Button>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPdfUpload(meeting.id, file)
                  e.target.value = ''
                }}
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('meetings.col.note')}</span>
              <button
                onClick={() => { if (canEdit) onNoteToggle(meeting.id, meeting.noteDelivered) }}
                disabled={!canEdit}
                className={`inline-flex items-center justify-center size-5 rounded border transition-colors disabled:cursor-default ${
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
  const canEdit = useCanEdit(useLocation().pathname)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createStep, setCreateStep] = useState<'upload' | 'extracting' | 'form'>('upload')
  const [extractStatus, setExtractStatus] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [form, setForm] = useState(INITIAL_MEETING_FORM)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [editPdfFile, setEditPdfFile] = useState<File | null>(null)
  const [editForm, setEditForm] = useState({ ...INITIAL_MEETING_FORM, id: '', interestArea: '', nextMeetingDate: '', requiredAction: '' })
  const createPdfInputRef = useRef<HTMLInputElement>(null)
  const editPdfInputRef = useRef<HTMLInputElement>(null)

  const { user } = useAuth()
  const createMeeting = useCreateMeeting()
  const updateMeeting = useUpdateMeeting()
  const deleteMeeting = useDeleteMeeting()
  const uploadPdf = useUploadMeetingPdf()
  const deletePdf = useDeleteMeetingPdf()

  const handlePdfSelected = async (file: File) => {
    if (!canEdit) return
    setPdfFile(file)
    setCreateStep('extracting')
    try {
      setExtractStatus(t('meetings.pdfUpload.extracting'))
      const text = await extractTextFromPdf(file)

      let extracted
      if (text.trim().length >= 20) {
        setExtractStatus(t('meetings.extractAnalyzing'))
        extracted = await extractMeetingFields(text)
      } else {
        setExtractStatus(t('meetings.extractScanned'))
        const images = await renderPdfPagesToImages(file, 5, 1.5)
        setExtractStatus(t('meetings.extractVision'))
        extracted = await extractMeetingFieldsFromImages(images)
      }

      // Fill form with extracted data
      setForm({
        meetingDate: extracted.meetingDate || '',
        meetingNumber: extracted.meetingNumber ? String(extracted.meetingNumber) : '1',
        meetingMethod: '',
        parentName: extracted.parentName || '',
        studentName: extracted.studentName || '',
        phone: extracted.phone || '',
        currentSchool: extracted.currentSchool || '',
        grade: extracted.grade || '',
        region: extracted.region || '',
        sourceChannel: extracted.sourceChannel || '',
        memo: extracted.memo || '',
      })
      setCreateStep('form')
    } catch (err) {
      console.error(err)
      // On error, just go to empty form with PDF attached
      setCreateStep('form')
    }
  }

  const resetCreateDialog = () => {
    setCreateStep('upload')
    setForm(INITIAL_MEETING_FORM)
    setPdfFile(null)
    setExtractStatus('')
  }

  const handleCreateMeeting = () => {
    if (!canEdit) return
    const pendingPdf = pdfFile
    createMeeting.mutate(
      {
        meetingDate: form.meetingDate,
        meetingNumber: parseInt(form.meetingNumber),
        meetingMethod: form.meetingMethod || undefined,
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
        onSuccess: (data) => {
          if (pendingPdf && data?.id) {
            uploadPdf.mutate({ meetingId: data.id, file: pendingPdf })
          }
          setDialogOpen(false)
          resetCreateDialog()
        },
        onError: (err) => {
          console.error('Meeting create failed:', err)
          alert(t('meetings.createError') || '미팅 기록 저장에 실패했습니다. 다시 시도해주세요.')
        },
      },
    )
  }

  const openEditDialog = (m: Meeting) => {
    if (!canEdit) return
    setEditForm({
      id: m.id,
      meetingDate: m.meetingDate || '',
      meetingNumber: String(m.meetingNumber),
      meetingMethod: m.meetingMethod || '',
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
    if (!canEdit) return
    if (!editForm.id || !editForm.parentName || !editForm.meetingDate) return
    updateMeeting.mutate({
      id: editForm.id,
      meetingDate: editForm.meetingDate,
      meetingNumber: parseInt(editForm.meetingNumber),
      meetingMethod: (editForm.meetingMethod || undefined) as MeetingMethod | undefined,
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
      onError: (err) => {
        console.error('Meeting update failed:', err)
        alert(t('meetings.updateError') || '미팅 기록 수정에 실패했습니다.')
      },
    })
  }

  const { data: meetings = [], isLoading, error } = useMeetings({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const updateNoteDelivered = useUpdateNoteDelivered()

  const handleNoteToggle = (id: string, current: boolean) => {
    if (!canEdit) return
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
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t('meetings.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? t('common.loading') : t('meetings.totalMeetings').replace('{n}', String(meetings.length))}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {canEdit && (
            <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> {t('meetings.addMeeting')}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="flex gap-3">
        <Card className="flex-1 min-w-0">
          <CardContent className="py-2 px-3 flex items-center gap-2">
            <CalendarCheck className="size-4 text-primary shrink-0" />
            <span className="text-lg font-bold">{thisMonthMeetings.length}</span>
            <span className="text-xs text-muted-foreground truncate">{t('meetings.thisMonthMeetings')}</span>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-0">
          <CardContent className="py-2 px-3 flex items-center gap-2">
            <FileCheck className="size-4 text-success shrink-0" />
            <span className="text-lg font-bold">{noteDeliveryRate.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground truncate">{t('meetings.noteDeliveryRate')}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-2 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground whitespace-nowrap">{t('meetings.period')}</span>
            <Input
              type="date"
              className="w-[140px] h-8"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">~</span>
            <Input
              type="date"
              className="w-[140px] h-8"
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
          onDelete={(id) => deleteMeeting.mutate(id, { onSuccess: () => setSelectedMeetingId(null) })}
          onNoteToggle={handleNoteToggle}
          onPdfUpload={(meetingId, file) => uploadPdf.mutate({ meetingId, file })}
          onPdfDelete={(meetingId, pdfUrl) => deletePdf.mutate({ meetingId, pdfUrl })}
          pdfUploading={uploadPdf.isPending}
          deleting={deleteMeeting.isPending}
          canEdit={canEdit}
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
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[86px]" />   {/* 미팅일 */}
                  <col className="w-[42px]" />   {/* 회차 */}
                  <col className="w-[60px]" />   {/* 학부모 */}
                  <col className="w-[60px]" />   {/* 학생 */}
                  <col className="w-[120px]" />  {/* 학교 */}
                  <col className="w-[44px]" />   {/* 지역 */}
                  <col />                        {/* 메모 - 나머지 */}
                  <col className="w-[32px]" />   {/* 노트 */}
                  <col className="w-[32px]" />   {/* 편집 */}
                </colgroup>
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="py-2 px-1 text-left font-medium">{t('meetings.col.meetingDate')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('meetings.col.meetingNumber')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('meetings.col.parent')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('meetings.col.student')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('common.school')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('common.region')}</th>
                    <th className="py-2 px-1 text-left font-medium">{t('common.memo')}</th>
                    <th className="py-2 px-0 text-center font-medium">{t('meetings.col.note')}</th>
                    <th className="py-2 px-0" />
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => {
                    const badge = getMeetingBadge(meeting.meetingNumber, t)
                    const isSelected = meeting.id === selectedMeetingId
                    return (
                      <tr
                        key={meeting.id}
                        className={`border-b cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-muted/50'}`}
                        onClick={() => setSelectedMeetingId(isSelected ? null : meeting.id)}
                      >
                        <td className="py-2 px-1 text-xs text-muted-foreground font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                          {meeting.meetingDate}
                        </td>
                        <td className="py-2 px-1">
                          <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="py-2 px-1 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {meeting.parentName}
                            {meeting.leadId && <LinkIcon className="size-3 text-primary shrink-0" />}
                          </span>
                        </td>
                        <td className="py-2 px-1 overflow-hidden text-ellipsis whitespace-nowrap">{meeting.studentName || '-'}</td>
                        <td className="py-2 px-1 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">{meeting.currentSchool || '-'}</td>
                        <td className="py-2 px-1 text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">{meeting.region || '-'}</td>
                        <td className="py-2 px-1 text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                          {meeting.memo || '-'}
                        </td>
                        <td className="py-2 px-0 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => { if (canEdit) handleNoteToggle(meeting.id, meeting.noteDelivered) }}
                              disabled={!canEdit}
                              className={`inline-flex items-center justify-center size-5 rounded border transition-colors disabled:cursor-default ${
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
                            {meeting.notePdfUrl && (
                              <Paperclip className="size-3 text-primary" />
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-0 text-center" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => openEditDialog(meeting)}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Meeting Dialog — Step-based: upload → extracting → form */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetCreateDialog() }} disablePointerDismissal>
        <DialogContent className="max-w-md !grid-rows-[auto_1fr] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('meetings.addMeetingTitle')}</DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload PDF */}
          {createStep === 'upload' && (
            <div key="step-upload" className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                onClick={() => createPdfInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file && file.name.toLowerCase().endsWith('.pdf')) handlePdfSelected(file)
                }}
              >
                <Upload className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium mb-1">{t('meetings.pdfUpload.dropHint')}</p>
                <p className="text-xs text-muted-foreground">{t('meetings.extractAutoFill')}</p>
                <input
                  ref={createPdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePdfSelected(file)
                    e.target.value = ''
                  }}
                />
              </div>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setCreateStep('form')}
              >
                {t('meetings.skipPdf')}
              </Button>
            </div>
          )}

          {/* Step 2: Extracting */}
          {createStep === 'extracting' && (
            <div key="step-extracting" className="flex flex-col items-center py-8 gap-4">
              <Loader2 className="size-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">{extractStatus}</p>
                {pdfFile && <p className="text-xs text-muted-foreground mt-1">{pdfFile.name}</p>}
              </div>
            </div>
          )}

          {/* Step 3: Form */}
          {createStep === 'form' && (
            <div key="step-form" className="space-y-4 overflow-y-auto pr-1 -mr-1">
              {/* Attached PDF indicator */}
              {pdfFile && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20 text-sm">
                  <FileText className="size-4 text-primary shrink-0" />
                  <span className="truncate flex-1 text-xs">{pdfFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setPdfFile(null)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-1.5">
                  <Label>{t('meetings.col.method')} *</Label>
                  <Select value={form.meetingMethod} onValueChange={v => setForm(f => ({ ...f, meetingMethod: (v || '') as '' | MeetingMethod }))}>
                    <SelectTrigger><SelectValue placeholder={t('meetings.methodPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {MEETING_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('meetings.form.parentName')} *</Label>
                  <Input value={form.parentName} onChange={e => setForm(f => ({ ...f, parentName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('meetings.form.studentName')}</Label>
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

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetCreateDialog() }}>{t('common.cancel')}</Button>
                <Button onClick={handleCreateMeeting} disabled={!form.parentName || !form.meetingDate || createMeeting.isPending}>
                  {createMeeting.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {t('common.add')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditPdfFile(null) }} disablePointerDismissal>
        <DialogContent className="max-w-lg !grid-rows-[auto_1fr] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('meetings.editMeeting')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1 -mr-1">
            <div className="grid grid-cols-3 gap-3">
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
              <div className="space-y-1.5">
                <Label>{t('meetings.col.method')}</Label>
                <Select value={editForm.meetingMethod} onValueChange={v => setEditForm(f => ({ ...f, meetingMethod: (v || '') as '' | MeetingMethod }))}>
                  <SelectTrigger><SelectValue placeholder={t('meetings.methodPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {MEETING_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('meetings.form.parentName')} *</Label>
                <Input value={editForm.parentName} onChange={e => setEditForm(f => ({ ...f, parentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('meetings.form.studentName')}</Label>
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

            {/* PDF upload in edit */}
            <div className="space-y-1.5">
              <Label>{t('meetings.notePdf')}</Label>
              {(() => {
                const editingMeeting = meetings.find(m => m.id === editForm.id)
                const existingPdf = editingMeeting?.notePdfUrl
                if (existingPdf && !editPdfFile) {
                  return (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                      <FileText className="size-4 text-primary shrink-0" />
                      <a href={existingPdf} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs truncate flex-1">
                        <ExternalLink className="size-3 shrink-0" />
                        {t('meetings.viewPdf')}
                      </a>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive" onClick={() => deletePdf.mutate({ meetingId: editForm.id, pdfUrl: existingPdf })}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )
                }
                if (editPdfFile) {
                  return (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                      <FileText className="size-4 text-primary shrink-0" />
                      <span className="truncate flex-1">{editPdfFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditPdfFile(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  )
                }
                return (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-muted-foreground"
                      onClick={() => editPdfInputRef.current?.click()}
                    >
                      <Paperclip className="size-3.5" />
                      {t('meetings.uploadNotePdf')}
                    </Button>
                    <input
                      ref={editPdfInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setEditPdfFile(file)
                        e.target.value = ''
                      }}
                    />
                  </>
                )
              })()}
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
            <div className="flex justify-between pt-3 border-t">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(t('meetings.deleteConfirm'))) {
                    deleteMeeting.mutate(editForm.id, {
                      onSuccess: () => { setEditDialogOpen(false); setSelectedMeetingId(null) },
                    })
                  }
                }}
                disabled={deleteMeeting.isPending}
              >
                {deleteMeeting.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Trash2 className="size-4 mr-1" />}
                {t('common.delete')}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={() => {
                  handleEditMeeting()
                  if (editPdfFile) {
                    uploadPdf.mutate({ meetingId: editForm.id, file: editPdfFile })
                    setEditPdfFile(null)
                  }
                }} disabled={!editForm.parentName || !editForm.meetingDate || updateMeeting.isPending}>
                  {updateMeeting.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
