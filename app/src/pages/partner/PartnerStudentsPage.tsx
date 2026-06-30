import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, NotebookPen, GraduationCap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import {
  usePartnerStudentMeetings, useCreatePartnerStudentMeeting,
  useUpdatePartnerStudentMeeting, useDeletePartnerStudentMeeting,
  type PartnerStudentMeeting,
} from '@/hooks/usePartnerStudentMeetings'

export function PartnerStudentsPage() {
  const t = useT()
  const { user } = useAuth()
  const partnerId = user?.id
  const { data: allStudents = [], isLoading } = useServiceStudents()
  const { data: meetings = [] } = usePartnerStudentMeetings(partnerId)
  const create = useCreatePartnerStudentMeeting()
  const update = useUpdatePartnerStudentMeeting()
  const del = useDeletePartnerStudentMeeting()

  // A partner's students are the Student 360 students whose "partners" field
  // (set from the Student 360 partner dropdown) names this partner.
  const partnerKey = (user?.name || '').trim().toLowerCase()
  const students = useMemo(() => {
    if (!partnerKey) return []
    return allStudents
      .filter(s => (s.partners || '').toLowerCase().includes(partnerKey))
      .map(s => ({ name: s.name, koreanName: s.koreanName, school: s.school }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [allStudents, partnerKey])

  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (students.length && !students.some(s => s.name === selected)) setSelected(students[0].name)
  }, [students]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSchool = students.find(s => s.name === selected)?.school
  const studentMeetings = useMemo(
    () => meetings.filter(m => m.studentName === selected),
    [meetings, selected],
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ meetingDate: '', program: '', content: '' })
  const reset = () => { setEditingId(null); setForm({ meetingDate: '', program: '', content: '' }) }
  const startEdit = (m: PartnerStudentMeeting) => {
    setEditingId(m.id)
    setForm({ meetingDate: m.meetingDate || '', program: m.program || '', content: m.content || '' })
  }
  const save = () => {
    if (!selected || (!form.content.trim() && !form.meetingDate)) return
    if (editingId) {
      update.mutate(
        { id: editingId, partnerId, meetingDate: form.meetingDate || undefined, program: form.program || undefined, content: form.content || undefined },
        { onSuccess: reset },
      )
    } else {
      create.mutate(
        { partnerId, studentName: selected, schoolName: selectedSchool, meetingDate: form.meetingDate || undefined, program: form.program || undefined, content: form.content || undefined, createdBy: partnerId },
        { onSuccess: reset },
      )
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Partner</p>
        <h1 className="text-xl font-bold">{t('nav.partnerStudents')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">담당 학생을 선택해 미팅 일정과 내용을 기록하세요.</p>
      </div>

      {students.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : 'Student 360에서 partners(파트너)로 지정된 학생이 여기에 표시됩니다.'}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-4">
          {/* Student list */}
          <Card className="h-fit">
            <CardContent className="p-2 space-y-1">
              {students.map(s => (
                <button
                  key={s.name}
                  onClick={() => { setSelected(s.name); reset() }}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${s.name === selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <div className="font-medium text-sm">{s.name}{s.koreanName ? ` · ${s.koreanName}` : ''}</div>
                  {s.school && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <GraduationCap className="size-3" />{s.school}
                    </div>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Meeting log */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <NotebookPen className="size-5 text-primary" />
                {selected} · 미팅 기록 <span className="text-muted-foreground font-normal">({studentMeetings.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {studentMeetings.length === 0 && <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
              {studentMeetings.map(m => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{m.meetingDate || '—'}</span>
                      {m.program && <Badge variant="outline">{m.program}</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Pencil className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('삭제하시겠습니까?')) del.mutate({ id: m.id, partnerId }) }}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                  {m.content && <p className="text-sm mt-2 whitespace-pre-wrap">{m.content}</p>}
                </div>
              ))}

              {/* Add / edit form */}
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{editingId ? '미팅 수정' : '미팅 추가'}</div>
                <div className="flex gap-2 flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-xs">미팅 일정</Label>
                    <Input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="h-9 w-44" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[160px]">
                    <Label className="text-xs">프로그램 (선택)</Label>
                    <Input value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} placeholder="예: USACO 대회, 리서치 …" className="h-9" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">미팅 내용</Label>
                  <Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={3} placeholder="대회 · 리서치 기한 · 프로젝트 등 상세 내용" />
                </div>
                <div className="flex justify-end gap-2">
                  {editingId && <Button size="sm" variant="outline" onClick={reset}>취소</Button>}
                  <Button size="sm" onClick={save} disabled={create.isPending || update.isPending || (!form.content.trim() && !form.meetingDate)}>
                    <Plus className="size-3.5 mr-1" />{editingId ? '저장' : '추가'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
