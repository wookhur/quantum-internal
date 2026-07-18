import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus, Loader2, Trash2, Upload, Download, Sparkles, Search, X,
  MessageSquare, Image as ImageIcon, Save, ChevronRight, Pencil,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useLanguage } from '@/i18n/LanguageContext'
import { useLeads, useCreateLead, useUpdateLead } from '@/hooks/useLeads'
import { leadLevelConfig } from '@/lib/leadLevels'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { EC_PARTNERS } from '@/lib/ecPartners'
import {
  usePartnerPrograms, useCreateProgram, useUpdateProgram, useDeleteProgram,
  useUploadBrochure, useProgramEntries, useAddProgramEntry, useUpdateProgramEntry,
  useRemoveProgramEntry, useProgramComments, useAddProgramComment, useDeleteProgramComment,
  PROGRAM_STAGES, PROGRAM_COMMENT_METHODS,
  type PartnerProgram, type ProgramEntry, type ProgramStage, type ProgramCommentMethod,
} from '@/hooks/usePartnerPrograms'
import { extractProgramGuideFromImage, imageToDownscaledBase64 } from '@/lib/extract-program-ai'
import type { Lead } from '@/types'

/** Partner (소속학원) options — same source as Student 360 / 파트너 학생관리. */
function usePartnerOptions(): string[] {
  const { data: fees = [] } = useAllServiceProgramFees()
  return useMemo(() => {
    const s = new Set<string>()
    for (const p of EC_PARTNERS) s.add(p)
    for (const f of fees) if (f.label?.trim()) s.add(f.label.trim())
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [fees])
}

/** Force-download an image URL (works cross-origin via blob). */
async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}

// ── Communication log per entry ─────────────────────────────────
function EntryComments({ entry }: { entry: ProgramEntry }) {
  const { language: lang } = useLanguage()
  const { data: comments = [], isLoading } = useProgramComments(entry.id)
  const addComment = useAddProgramComment()
  const delComment = useDeleteProgramComment()
  const [method, setMethod] = useState<ProgramCommentMethod>('call')
  const [content, setContent] = useState('')

  const submit = () => {
    if (!content.trim()) return
    addComment.mutate(
      { entryId: entry.id, method, content: content.trim() },
      { onSuccess: () => setContent('') },
    )
  }

  return (
    <div className="mt-2 rounded-lg bg-muted/40 p-3 space-y-2">
      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod((e.target.value as ProgramCommentMethod) || 'call')}
          className="h-8 w-[90px] rounded-lg border border-input bg-white px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {PROGRAM_COMMENT_METHODS.map((m) => (
            <option key={m.key} value={m.key}>{lang === 'en' ? m.en : m.ko}</option>
          ))}
        </select>
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={lang === 'en' ? 'Record call / chat notes...' : '통화·카톡 등 소통 내용을 기록하세요...'}
          className="h-8 text-xs bg-white"
        />
        <Button size="sm" className="h-8 text-xs shrink-0" onClick={submit} disabled={addComment.isPending || !content.trim()}>
          {addComment.isPending ? <Loader2 className="size-3.5 animate-spin" /> : (lang === 'en' ? 'Add' : '기록')}
        </Button>
      </div>
      {isLoading ? (
        <Loader2 className="size-4 animate-spin mx-auto my-2 text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-1">
          {lang === 'en' ? 'No communication logs yet.' : '아직 소통 기록이 없습니다.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {comments.map((c) => {
            const m = PROGRAM_COMMENT_METHODS.find((x) => x.key === c.method)
            return (
              <div key={c.id} className="group flex items-start gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{m ? (lang === 'en' ? m.en : m.ko) : c.method}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="whitespace-pre-wrap">{c.content}</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(c.createdAt).toLocaleString('ko-KR')}
                    {c.createdByName && ` · ${c.createdByName}`}
                  </p>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => delComment.mutate({ id: c.id, entryId: entry.id })}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── One linked-lead row ─────────────────────────────────────────
function EntryRow({ entry }: { entry: ProgramEntry }) {
  const { language: lang } = useLanguage()
  const updateEntry = useUpdateProgramEntry()
  const removeEntry = useRemoveProgramEntry()
  const updateLead = useUpdateLead()
  const qc = useQueryClient()
  const [showComments, setShowComments] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    studentName: entry.studentName || '', parentName: entry.parentName || '',
    currentSchool: entry.currentSchool || '', grade: entry.grade || '',
    phone: entry.phone || '', sourceChannel: entry.sourceChannel || '',
  })
  const level = leadLevelConfig(entry.leadLevel)

  const startEdit = () => {
    setForm({
      studentName: entry.studentName || '', parentName: entry.parentName || '',
      currentSchool: entry.currentSchool || '', grade: entry.grade || '',
      phone: entry.phone || '', sourceChannel: entry.sourceChannel || '',
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    await updateLead.mutateAsync({
      id: entry.leadId,
      data: {
        studentName: form.studentName.trim(),
        parentName: form.parentName.trim(),
        currentSchool: form.currentSchool.trim(),
        grade: form.grade.trim(),
        phone: form.phone.trim(),
        sourceChannel: form.sourceChannel.trim(),
      },
    })
    // Refresh the joined lead data shown in this program's entry list
    qc.invalidateQueries({ queryKey: ['partner-program-entries', entry.programId] })
    setEditing(false)
  }

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{entry.studentName || entry.parentName || '-'}</span>
            {(() => {
              const st = PROGRAM_STAGES.find((s) => s.key === entry.stage)
              return st ? (
                <span className={`inline-flex items-center rounded-full border px-2 h-[18px] text-[10px] font-medium leading-none ${st.badge}`}>
                  {lang === 'en' ? st.en : st.ko}
                </span>
              ) : null
            })()}
            {level && (
              <span className={`inline-flex items-center rounded-full border px-2 h-[18px] text-[10px] font-medium leading-none ${level.badge}`}>
                {level.emoji} {level.labelEn}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {entry.parentName && entry.studentName && <span>{lang === 'en' ? 'Parent' : '학부모'}: {entry.parentName}</span>}
            {entry.currentSchool && <span>{entry.currentSchool}</span>}
            {entry.grade && <span>{entry.grade}</span>}
            {entry.phone && <span>{entry.phone}</span>}
            {entry.sourceChannel && <span>· {entry.sourceChannel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={entry.stage}
            onChange={(e) => updateEntry.mutate({ id: entry.id, programId: entry.programId, stage: e.target.value as ProgramStage })}
            className="h-7 w-[110px] rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {PROGRAM_STAGES.map((s) => (
              <option key={s.key} value={s.key}>{lang === 'en' ? s.en : s.ko}</option>
            ))}
          </select>
          <Button variant="ghost" size="icon" className="size-7" onClick={startEdit} title={lang === 'en' ? 'Edit' : '수정'}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setShowComments((v) => !v)} title={lang === 'en' ? 'Logs' : '소통 기록'}>
            <MessageSquare className="size-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive"
            onClick={() => removeEntry.mutate({ id: entry.id, programId: entry.programId })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Edit student info */}
      {editing && (
        <div className="mt-2 rounded-lg bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input value={form.studentName} onChange={(e) => setForm((m) => ({ ...m, studentName: e.target.value }))} placeholder={lang === 'en' ? 'Student name' : '학생 이름'} className="h-8 text-sm bg-white" />
            <Input value={form.parentName} onChange={(e) => setForm((m) => ({ ...m, parentName: e.target.value }))} placeholder={lang === 'en' ? 'Parent name' : '학부모 이름'} className="h-8 text-sm bg-white" />
            <Input value={form.currentSchool} onChange={(e) => setForm((m) => ({ ...m, currentSchool: e.target.value }))} placeholder={lang === 'en' ? 'School' : '학교 이름'} className="h-8 text-sm bg-white" />
            <Input value={form.grade} onChange={(e) => setForm((m) => ({ ...m, grade: e.target.value }))} placeholder={lang === 'en' ? 'Grade' : '학년'} className="h-8 text-sm bg-white" />
            <Input value={form.phone} onChange={(e) => setForm((m) => ({ ...m, phone: e.target.value }))} placeholder={lang === 'en' ? 'Parent phone' : '학부모 전화번호'} className="h-8 text-sm bg-white" />
            <Input value={form.sourceChannel} onChange={(e) => setForm((m) => ({ ...m, sourceChannel: e.target.value }))} placeholder={lang === 'en' ? 'Source / memo' : '상담 유입경로 메모'} className="h-8 text-sm bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditing(false)}>{lang === 'en' ? 'Cancel' : '취소'}</Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={saveEdit} disabled={updateLead.isPending}>
              {updateLead.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {lang === 'en' ? 'Save' : '저장'}
            </Button>
          </div>
        </div>
      )}

      {showComments && <EntryComments entry={entry} />}
    </div>
  )
}

// ── Lead search-to-add ──────────────────────────────────────────
const EMPTY_MANUAL = { studentName: '', parentName: '', currentSchool: '', grade: '', phone: '', sourceChannel: '' }

function AddLeadBox({ programId, existingLeadIds }: { programId: string; existingLeadIds: Set<string> }) {
  const { language: lang } = useLanguage()
  const { data: allLeads = [] } = useLeads()
  const addEntry = useAddProgramEntry()
  const createLead = useCreateLead()
  const [q, setQ] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [manualErr, setManualErr] = useState<string | null>(null)

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return [] as Lead[]
    return allLeads
      .filter((l) => !existingLeadIds.has(l.id))
      .filter((l) =>
        l.parentName?.toLowerCase().includes(s) ||
        l.studentName?.toLowerCase().includes(s) ||
        l.phone?.includes(s) ||
        l.currentSchool?.toLowerCase().includes(s),
      )
      .slice(0, 8)
  }, [q, allLeads, existingLeadIds])

  const canSubmitManual = manual.studentName.trim() || manual.parentName.trim()

  const submitManual = async () => {
    if (!canSubmitManual) return
    setManualErr(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const created = await createLead.mutateAsync({
        studentName: manual.studentName.trim(),
        parentName: manual.parentName.trim(),
        currentSchool: manual.currentSchool.trim(),
        grade: manual.grade.trim(),
        phone: manual.phone.trim(),
        sourceChannel: manual.sourceChannel.trim() || '프로그램 직접 추가',
        pipelineStage: 'new_lead',
        leadDate: today,
      })
      await addEntry.mutateAsync({ programId, leadId: created.id })
      setManual(EMPTY_MANUAL)
      setShowManual(false)
    } catch (e) {
      setManualErr((e as Error).message || (lang === 'en' ? 'Failed to add' : '추가 실패'))
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'en' ? 'Search leads by name / phone to add...' : '이름·전화번호로 리드 검색해서 추가...'}
            className="h-9 text-sm"
          />
          {q && (
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setQ('')}>
              <X className="size-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 text-xs gap-1 shrink-0" onClick={() => setShowManual((v) => !v)}>
            <Plus className="size-3.5" /> {lang === 'en' ? 'Add manually' : '직접 추가'}
          </Button>
        </div>
        {matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-72 overflow-y-auto">
            {matches.map((l) => {
              const level = leadLevelConfig(l.leadLevel)
              return (
                <button
                  key={l.id}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0 flex items-center justify-between gap-2"
                  onClick={() => addEntry.mutate({ programId, leadId: l.id }, { onSuccess: () => setQ('') })}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{l.studentName || l.parentName}</span>
                      {level && <Badge variant="outline" className={`${level.badge} text-[10px] px-1.5 py-0 h-4`}>{level.emoji}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[l.currentSchool, l.grade, l.phone].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Plus className="size-4 text-primary shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Manual entry — student not in leads */}
      {showManual && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {lang === 'en' ? 'Add a student not in leads' : '리드에 없는 학생 직접 추가'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={manual.studentName} onChange={(e) => setManual((m) => ({ ...m, studentName: e.target.value }))} placeholder={lang === 'en' ? 'Student name' : '학생 이름'} className="h-8 text-sm bg-white" />
            <Input value={manual.parentName} onChange={(e) => setManual((m) => ({ ...m, parentName: e.target.value }))} placeholder={lang === 'en' ? 'Parent name' : '학부모 이름'} className="h-8 text-sm bg-white" />
            <Input value={manual.currentSchool} onChange={(e) => setManual((m) => ({ ...m, currentSchool: e.target.value }))} placeholder={lang === 'en' ? 'School' : '학교 이름'} className="h-8 text-sm bg-white" />
            <Input value={manual.grade} onChange={(e) => setManual((m) => ({ ...m, grade: e.target.value }))} placeholder={lang === 'en' ? 'Grade' : '학년'} className="h-8 text-sm bg-white" />
            <Input value={manual.phone} onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))} placeholder={lang === 'en' ? 'Parent phone' : '학부모 전화번호'} className="h-8 text-sm bg-white" />
            <Input value={manual.sourceChannel} onChange={(e) => setManual((m) => ({ ...m, sourceChannel: e.target.value }))} placeholder={lang === 'en' ? 'Source / memo' : '상담 유입경로 메모'} className="h-8 text-sm bg-white" />
          </div>
          {manualErr && <p className="text-xs text-destructive">{manualErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setShowManual(false); setManual(EMPTY_MANUAL); setManualErr(null) }}>
              {lang === 'en' ? 'Cancel' : '취소'}
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={submitManual} disabled={!canSubmitManual || createLead.isPending || addEntry.isPending}>
              {(createLead.isPending || addEntry.isPending) ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {lang === 'en' ? 'Add to program' : '프로그램에 추가'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Program detail ──────────────────────────────────────────────
function ProgramDetail({ program }: { program: PartnerProgram }) {
  const { language: lang } = useLanguage()
  const { data: entries = [], isLoading } = useProgramEntries(program.id)
  const partnerOptions = usePartnerOptions()
  const updateProgram = useUpdateProgram()
  const uploadBrochure = useUploadBrochure()
  const fileRef = useRef<HTMLInputElement>(null)
  const [guide, setGuide] = useState(program.guide || '')
  const [guideDirty, setGuideDirty] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [extractErr, setExtractErr] = useState<string | null>(null)

  const existingLeadIds = useMemo(() => new Set(entries.map((e) => e.leadId)), [entries])
  const byStage = useMemo(() => {
    const m = new Map<ProgramStage, ProgramEntry[]>()
    for (const s of PROGRAM_STAGES) m.set(s.key, [])
    for (const e of entries) m.get(e.stage)?.push(e)
    return m
  }, [entries])

  // Run the AI vision summary on a base64 brochure image → fill the guide.
  const runExtract = async (b64: string, showError: boolean) => {
    setExtractErr(null)
    setExtracting(true)
    try {
      const { guide: extracted } = await extractProgramGuideFromImage(b64)
      if (extracted) {
        setGuide(extracted)
        setGuideDirty(false)
        await updateProgram.mutateAsync({ id: program.id, guide: extracted })
      } else if (showError) {
        setExtractErr(lang === 'en' ? 'Could not read the brochure.' : '브로셔에서 내용을 읽지 못했습니다.')
      }
    } catch (e) {
      if (showError) setExtractErr((e as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  // Upload a brochure, then try AI auto-summary into the guide (best-effort).
  const handleFile = async (file: File) => {
    setUploadErr(null)
    try {
      await uploadBrochure.mutateAsync({ programId: program.id, file })
      const b64 = await imageToDownscaledBase64(file)
      await runExtract(b64, false)
    } catch (e) {
      setUploadErr((e as Error).message || (lang === 'en' ? 'Upload failed' : '업로드 실패'))
    }
  }

  // Explicit "generate from brochure" — re-reads the already-uploaded image.
  const generateFromBrochure = async () => {
    if (!program.brochureUrl) return
    setExtractErr(null)
    setExtracting(true)
    try {
      const res = await fetch(program.brochureUrl)
      const blob = await res.blob()
      const b64 = await imageToDownscaledBase64(blob)
      await runExtract(b64, true)
    } catch (e) {
      setExtractErr((e as Error).message)
      setExtracting(false)
    }
  }

  const saveGuide = () => {
    updateProgram.mutate({ id: program.id, guide }, { onSuccess: () => setGuideDirty(false) })
  }

  return (
    <div className="space-y-4">
      {/* Partner assignment */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground shrink-0">{lang === 'en' ? 'Partner' : '파트너사'}</Label>
        <select
          value={program.partnerName || ''}
          onChange={(e) => updateProgram.mutate({ id: program.id, partnerName: e.target.value || null })}
          className="h-8 w-[240px] rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{lang === 'en' ? 'No partner' : '파트너사 미지정'}</option>
          {partnerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Brochure + guide */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="size-4" /> {lang === 'en' ? 'Brochure' : '브로셔'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {program.brochureUrl ? (
              <img src={program.brochureUrl} alt="brochure" className="w-full rounded-lg border max-h-[420px] object-contain bg-muted/20" />
            ) : (
              <div className="rounded-lg border border-dashed h-40 flex items-center justify-center text-sm text-muted-foreground">
                {lang === 'en' ? 'No brochure uploaded' : '업로드된 브로셔가 없습니다'}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            />
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploadBrochure.isPending || extracting}>
                {uploadBrochure.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {lang === 'en' ? 'Upload' : '업로드'}
              </Button>
              {program.brochureUrl && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => downloadImage(program.brochureUrl!, `${program.name}.png`)}>
                  <Download className="size-3.5" /> {lang === 'en' ? 'Download' : '다운로드'}
                </Button>
              )}
            </div>
            {extracting && (
              <p className="text-xs text-primary flex items-center gap-1.5">
                <Sparkles className="size-3.5 animate-pulse" /> {lang === 'en' ? 'Reading brochure...' : '브로셔에서 내용 자동 정리 중...'}
              </p>
            )}
            {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span>{lang === 'en' ? 'Program Guide' : '프로그램 안내'}</span>
              <div className="flex items-center gap-1.5">
                {program.brochureUrl && (
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={generateFromBrochure} disabled={extracting}
                  >
                    {extracting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    {lang === 'en' ? 'Generate from brochure' : '브로셔에서 자동 생성'}
                  </Button>
                )}
                {guideDirty && (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveGuide} disabled={updateProgram.isPending}>
                    <Save className="size-3" /> {lang === 'en' ? 'Save' : '저장'}
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {extractErr && (
              <p className="text-xs text-destructive">
                {lang === 'en' ? 'Auto-generate failed: ' : '자동 생성 실패: '}{extractErr}
              </p>
            )}
            <Textarea
              value={guide}
              onChange={(e) => { setGuide(e.target.value); setGuideDirty(true) }}
              rows={16}
              className="text-sm resize-none"
              placeholder={lang === 'en'
                ? 'Upload a brochure to auto-fill, or write the program details here...'
                : '브로셔를 업로드하면 자동으로 정리되거나, 여기에 직접 프로그램 내용을 작성하세요...'}
            />
          </CardContent>
        </Card>
      </div>

      {/* Linked leads */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{lang === 'en' ? 'Leads' : '리드 관리'} ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AddLeadBox programId={program.id} existingLeadIds={existingLeadIds} />
          {isLoading ? (
            <Loader2 className="size-5 animate-spin mx-auto my-6 text-muted-foreground" />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {lang === 'en' ? 'Search above to add leads to this program.' : '위에서 검색해 이 프로그램에 리드를 추가하세요.'}
            </p>
          ) : (
            <div className="space-y-4">
              {PROGRAM_STAGES.map((s) => {
                const list = byStage.get(s.key) || []
                if (list.length === 0) return null
                return (
                  <div key={s.key}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={`${s.badge} text-xs`}>{lang === 'en' ? s.en : s.ko}</Badge>
                      <span className="text-xs text-muted-foreground">{list.length}</span>
                    </div>
                    <div className="space-y-2">
                      {list.map((e) => <EntryRow key={e.id} entry={e} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────
export function ProgramsPage() {
  const { language: lang } = useLanguage()
  const { data: programs = [], isLoading } = usePartnerPrograms()
  const partnerOptions = usePartnerOptions()
  const createProgram = useCreateProgram()
  const deleteProgram = useDeleteProgram()

  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<{ name: string; partnerName: string }>({ name: '', partnerName: '' })

  const filtered = useMemo(
    () => programs.filter((p) => companyFilter === 'all' || p.partnerName === companyFilter),
    [programs, companyFilter],
  )
  const selected = programs.find((p) => p.id === selectedId) || filtered[0] || null

  const handleCreate = async () => {
    if (!form.name.trim()) return
    const created = await createProgram.mutateAsync({
      name: form.name.trim(),
      partnerName: form.partnerName || null,
    })
    setForm({ name: '', partnerName: '' })
    setShowCreate(false)
    setSelectedId(created.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lang === 'en' ? 'Program Management' : '프로그램 관리'}</h1>
          <p className="text-muted-foreground text-sm">
            {lang === 'en'
              ? 'Manage partner programs through Inquiry → Interested → Signed-up → Participated.'
              : '파트너사 프로그램을 문의 → 관심 → 신청 → 참여완료 단계로 관리합니다.'}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> {lang === 'en' ? 'New Program' : '새 프로그램'}
        </Button>
      </div>

      {/* Company filter */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">{lang === 'en' ? 'Partner' : '파트너사'}</Label>
            <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v || 'all')}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'en' ? 'All partners' : '전체 파트너사'}</SelectItem>
                {partnerOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-7 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          {/* Program list */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                {lang === 'en' ? 'No programs yet.' : '등록된 프로그램이 없습니다.'}
              </CardContent></Card>
            ) : filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${selected?.id === p.id ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.partnerName || (lang === 'en' ? 'No partner' : '파트너사 미지정')}</p>
                  </div>
                  <ChevronRight className={`size-4 shrink-0 ${selected?.id === p.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div>
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">{selected.partnerName || (lang === 'en' ? 'No partner assigned' : '파트너사 미지정')}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5"
                    onClick={() => {
                      if (confirm(lang === 'en' ? 'Delete this program?' : '이 프로그램을 삭제하시겠습니까?')) {
                        deleteProgram.mutate(selected.id)
                        setSelectedId(null)
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" /> {lang === 'en' ? 'Delete' : '삭제'}
                  </Button>
                </div>
                <ProgramDetail program={selected} />
              </div>
            ) : (
              <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
                {lang === 'en' ? 'Select or create a program.' : '프로그램을 선택하거나 새로 만드세요.'}
              </CardContent></Card>
            )}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === 'en' ? 'New Program' : '새 프로그램'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{lang === 'en' ? 'Partner' : '파트너사'}</Label>
              <select
                value={form.partnerName}
                onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">{lang === 'en' ? 'Select partner (optional)' : '파트너사 선택 (선택사항)'}</option>
                {partnerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label>{lang === 'en' ? 'Program name' : '프로그램명'} *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={lang === 'en' ? 'e.g. Summer Boarding Prep' : '예: 여름 보딩 준비 캠프'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{lang === 'en' ? 'Cancel' : '취소'}</Button>
            <Button onClick={handleCreate} disabled={createProgram.isPending || !form.name.trim()}>
              {createProgram.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              {lang === 'en' ? 'Create' : '만들기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
