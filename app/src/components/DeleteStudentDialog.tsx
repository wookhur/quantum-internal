import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, ArchiveRestore, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCreateLead } from '@/hooks/useLeads'
import { useDeleteServiceStudent, useServiceMeetings, useServiceDiary } from '@/hooks/useServiceStudents'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { buildStudentArchiveTexts, splitParentContact, archiveDisplayName } from '@/lib/studentArchive'
import { PIPELINE_STAGES, type PipelineStage, type ServiceStudent } from '@/types'

/** 보관 시 기본 파이프라인 단계 — 과거에 진행했으나 지금은 멈춘 관계.
 *  '비활성' 그룹이라 활성 파이프라인·콜드콜 목록을 어지럽히지 않는다. */
const DEFAULT_ARCHIVE_STAGE: PipelineStage = 'lost'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: ServiceStudent
  /** 담당 컨설턴트 이름(해석된 값) */
  consultantName?: string
  onDeleted?: () => void
}

type Mode = 'lead' | 'purge'

export function DeleteStudentDialog({ open, onOpenChange, student, consultantName, onDeleted }: Props) {
  const navigate = useNavigate()
  const t = useT()
  const { user } = useAuth()
  const createLead = useCreateLead()
  const del = useDeleteServiceStudent()
  // 보관 요약에 쓸 이력. 다이얼로그가 열려 있을 때만 필요하다.
  const { data: meetings = [] } = useServiceMeetings(open ? student.id : undefined)
  const { data: diary = [] } = useServiceDiary(open ? student.id : undefined)

  const [mode, setMode] = useState<Mode>('lead')
  const [memo, setMemo] = useState('')
  const [reminder, setReminder] = useState('')
  const [stage, setStage] = useState<PipelineStage>(DEFAULT_ARCHIVE_STAGE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const texts = useMemo(
    () => buildStudentArchiveTexts({ student, consultantName, meetings, diaryCount: diary.length, today }),
    [student, consultantName, meetings, diary.length, today],
  )
  const displayName = archiveDisplayName(student)

  // 열릴 때마다 최신 이력으로 문구를 다시 채운다(사용자가 고친 값은 닫을 때까지 유지).
  useEffect(() => {
    if (!open) return
    setMode('lead'); setStage(DEFAULT_ARCHIVE_STAGE); setError(''); setBusy(false)
    setMemo(texts.memo); setReminder(texts.requiredAction)
    // texts 는 이력 로딩이 끝나면 한 번 더 바뀌므로 의존성에 둔다.
  }, [open, texts])

  const run = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (mode === 'purge') {
        await del.mutateAsync(student.id)
        onOpenChange(false)
        onDeleted?.()
        return
      }

      // 보관: 리드를 먼저 만든다. 삭제가 실패해도 기록은 남아야 한다.
      const parent = splitParentContact(student.parentName)
      const ko = (student.koreanName || '').trim()
      const en = (student.name || '').trim()
      const lead = await createLead.mutateAsync({
        leadDate: today,
        // 리드는 한글명을 주로 쓰므로 한글명 우선, 남은 표기는 별칭으로 넣어 검색되게 한다.
        studentName: ko || en,
        nameAliases: ko && en ? en : undefined,
        parentName: parent.name || `${ko || en} 학부모`,
        phone: parent.phone || student.contact || '',
        email: student.parentEmail || student.email || undefined,
        currentSchool: student.school || '',
        grade: student.grade || '',
        region: student.region || '',
        interestArea: [student.majorTrack, student.majorDetail].filter(Boolean).join(' · '),
        // SOURCE_CHANNELS 에 있는 값이어야 리드 수정 시 드롭다운에서 값이 유지된다.
        sourceChannel: '기존 서비스 학생',
        memo,
        requiredAction: reminder || undefined,
        pipelineStage: stage,
      })

      // 다시 만났을 때 바로 읽을 수 있도록 활동 기록으로도 남긴다.
      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        activity_type: 'system',
        title: `Student360 서비스 이력 보관 (${today})`,
        content: texts.activityContent,
        created_by: user?.id ?? null,
      })

      await del.mutateAsync(student.id)
      onOpenChange(false)
      onDeleted?.()
      navigate(`/sales/leads/${lead.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const optionClass = (active: boolean) =>
    `w-full text-left rounded-lg border p-3 transition-colors ${
      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
    }`

  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('deleteStudent.title', { name: displayName })}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {t('deleteStudent.desc')}
        </p>

        <div className="space-y-2">
          <button type="button" className={optionClass(mode === 'lead')} onClick={() => setMode('lead')}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArchiveRestore className="size-4 text-primary" />
              {t('deleteStudent.optionLead')}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{t('deleteStudent.recommended')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {t('deleteStudent.optionLeadDesc')}
            </p>
          </button>

          <button type="button" className={optionClass(mode === 'purge')} onClick={() => setMode('purge')}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Trash2 className="size-4 text-red-600" />
              {t('deleteStudent.optionPurge')}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              {t('deleteStudent.optionPurgeDesc')}
            </p>
          </button>
        </div>

        {mode === 'lead' && (
          <div className="space-y-3 rounded-lg border border-input p-3">
            <div>
              <Label className="text-xs">{t('deleteStudent.reminderLabel')}</Label>
              <Input className="h-9 mt-1" value={reminder} onChange={e => setReminder(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">{t('deleteStudent.reminderHint')}</p>
            </div>
            <div>
              <Label className="text-xs">{t('deleteStudent.stageLabel')}</Label>
              <select value={stage} onChange={e => setStage(e.target.value as PipelineStage)}
                className="h-9 w-full mt-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">{t('deleteStudent.memoLabel')}</Label>
              <Textarea className="mt-1 text-xs font-mono" rows={12} value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            variant={mode === 'purge' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={run}
          >
            {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
            {mode === 'purge' ? t('deleteStudent.confirmPurge') : t('deleteStudent.confirmLead')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
