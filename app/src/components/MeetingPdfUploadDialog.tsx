import { useState, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { extractTextFromPdf, renderPdfPagesToImages } from '@/lib/pdf-extract'
import { extractMeetingFields, extractMeetingFieldsFromImages, type ExtractedMeetingData } from '@/lib/extract-meeting-ai'
import { useCreateMeeting } from '@/hooks/useMeetings'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'

type Step = 'upload' | 'extracting' | 'review' | 'saving' | 'done' | 'error'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MeetingPdfUploadDialog({ open, onOpenChange }: Props) {
  const t = useT()
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [extractStatus, setExtractStatus] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState<ExtractedMeetingData>({
    parentName: null,
    studentName: null,
    meetingDate: null,
    meetingNumber: null,
    phone: null,
    currentSchool: null,
    grade: null,
    region: null,
    interestArea: null,
    sourceChannel: null,
    memo: null,
    nextMeetingDate: null,
    requiredAction: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createMeeting = useCreateMeeting()

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setExtractStatus('')
    setErrorMessage('')
    setForm({
      parentName: null, studentName: null, meetingDate: null,
      meetingNumber: null, phone: null, currentSchool: null,
      grade: null, region: null, interestArea: null,
      sourceChannel: null, memo: null, nextMeetingDate: null,
      requiredAction: null,
    })
  }, [])

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) reset()
    onOpenChange(isOpen)
  }, [onOpenChange, reset])

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('PDF 파일만 업로드할 수 있습니다.')
      setStep('error')
      return
    }

    setFileName(file.name)
    setStep('extracting')

    try {
      setExtractStatus('PDF에서 텍스트 추출 중...')
      const text = await extractTextFromPdf(file)

      let extracted: ExtractedMeetingData

      if (text.trim().length >= 20) {
        setExtractStatus('AI로 미팅 노트 분석 중...')
        extracted = await extractMeetingFields(text)
      } else {
        setExtractStatus('스캔된 PDF 감지 — 이미지 변환 중...')
        const images = await renderPdfPagesToImages(file, 5, 1.5)
        setExtractStatus('AI Vision으로 미팅 노트 분석 중...')
        extracted = await extractMeetingFieldsFromImages(images)
      }

      setForm(extracted)
      setStep('review')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setStep('error')
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleSave = useCallback(() => {
    if (!form.parentName || !form.meetingDate) return

    setStep('saving')
    createMeeting.mutate(
      {
        meetingDate: form.meetingDate,
        meetingNumber: form.meetingNumber || 1,
        parentName: form.parentName,
        studentName: form.studentName || undefined,
        phone: form.phone || undefined,
        currentSchool: form.currentSchool || undefined,
        grade: form.grade || undefined,
        region: form.region || undefined,
        interestArea: form.interestArea || undefined,
        sourceChannel: form.sourceChannel || undefined,
        memo: form.memo || undefined,
        createdBy: user?.id,
      },
      {
        onSuccess: () => {
          setStep('done')
          setTimeout(() => handleClose(false), 1500)
        },
        onError: (err) => {
          setErrorMessage(err instanceof Error ? err.message : '저장 실패')
          setStep('error')
        },
      },
    )
  }, [form, createMeeting, user, handleClose])

  const updateField = <K extends keyof ExtractedMeetingData>(
    key: K,
    value: ExtractedMeetingData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isRequiredMissing = !form.parentName || !form.meetingDate

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === 'review' ? 'max-w-xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && t('meetings.pdfUpload.title')}
            {step === 'extracting' && t('meetings.pdfUpload.extracting')}
            {step === 'review' && t('meetings.pdfUpload.review')}
            {step === 'saving' && t('common.saving')}
            {step === 'done' && t('meetings.pdfUpload.done')}
            {step === 'error' && t('meetings.pdfUpload.error')}
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">
              {t('meetings.pdfUpload.dropHint')}
            </p>
            <p className="text-xs text-muted-foreground">
              PDF 파일만 지원됩니다
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Step: Extracting */}
        {step === 'extracting' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">{extractStatus}</p>
              <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <FileText className="size-4 shrink-0" />
              <span>{fileName} — {t('meetings.pdfUpload.reviewHint')}</span>
            </div>

            {/* Required fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t('leads.parentName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.parentName || ''}
                  onChange={(e) => updateField('parentName', e.target.value || null)}
                  className={!form.parentName ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('leads.studentName')}</Label>
                <Input
                  value={form.studentName || ''}
                  onChange={(e) => updateField('studentName', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t('meetings.col.meetingDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.meetingDate || ''}
                  onChange={(e) => updateField('meetingDate', e.target.value || null)}
                  className={!form.meetingDate ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('meetings.col.meetingNumber')}</Label>
                <Select
                  value={form.meetingNumber ? String(form.meetingNumber) : ''}
                  onValueChange={(v) => updateField('meetingNumber', v ? parseInt(v) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('meetings.nthMeeting').replace('{n}', '1')}</SelectItem>
                    <SelectItem value="2">{t('meetings.nthMeeting').replace('{n}', '2')}</SelectItem>
                    <SelectItem value="3">{t('meetings.nthMeeting').replace('{n}', '3')}</SelectItem>
                    <SelectItem value="4">{t('meetings.nthMeeting').replace('{n}', '4')}</SelectItem>
                    <SelectItem value="5">{t('meetings.nthMeeting').replace('{n}', '5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.phone')}</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value || null)}
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.school')}</Label>
                <Input
                  value={form.currentSchool || ''}
                  onChange={(e) => updateField('currentSchool', e.target.value || null)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.grade')}</Label>
                <Input
                  value={form.grade || ''}
                  onChange={(e) => updateField('grade', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('common.region')}</Label>
                <Input
                  value={form.region || ''}
                  onChange={(e) => updateField('region', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('leads.sourceChannel')}</Label>
                <Input
                  value={form.sourceChannel || ''}
                  onChange={(e) => updateField('sourceChannel', e.target.value || null)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('meetings.col.interestArea')}</Label>
              <Input
                value={form.interestArea || ''}
                onChange={(e) => updateField('interestArea', e.target.value || null)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('meetings.pdfUpload.memoLabel')}</Label>
              <Textarea
                value={form.memo || ''}
                onChange={(e) => updateField('memo', e.target.value || null)}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('meetings.col.nextMeeting')}</Label>
                <Input
                  type="date"
                  value={form.nextMeetingDate || ''}
                  onChange={(e) => updateField('nextMeetingDate', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('meetings.col.requiredAction')}</Label>
                <Input
                  value={form.requiredAction || ''}
                  onChange={(e) => updateField('requiredAction', e.target.value || null)}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isRequiredMissing}
              >
                {t('meetings.pdfUpload.save')}
              </Button>
            </div>
          </div>
        )}

        {/* Step: Saving */}
        {step === 'saving' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">{t('meetings.pdfUpload.saving')}</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex flex-col items-center py-10 gap-3">
            <CheckCircle2 className="size-10 text-emerald-500" />
            <p className="text-sm font-medium">{t('meetings.pdfUpload.success')}</p>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="flex flex-col items-center py-8 gap-4">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-center text-destructive">{errorMessage}</p>
            <Button variant="outline" onClick={reset}>
              {t('meetings.pdfUpload.retry')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
