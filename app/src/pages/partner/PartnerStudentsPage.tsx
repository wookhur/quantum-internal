import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, NotebookPen, GraduationCap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { useProfiles } from '@/hooks/useProfiles'
import { useMyPartnerInstructor } from '@/hooks/usePartnerInstructors'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import { canonicalConsultantName } from '@/lib/consultants'
import { useCanEdit } from '@/hooks/usePermissions'
import {
  usePartnerStudentMeetingsForAcademy, useAllPartnerStudentMeetings, useCreatePartnerStudentMeeting,
  useUpdatePartnerStudentMeeting, useDeletePartnerStudentMeeting,
  type PartnerStudentMeeting,
} from '@/hooks/usePartnerStudentMeetings'

export function PartnerStudentsPage() {
  const t = useT()
  const canEdit = useCanEdit(useLocation().pathname)
  const { user } = useAuth()
  const partnerId = user?.id
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'
  const partnerKey = (user?.name || '').trim().toLowerCase()

  const { data: allStudents = [], isLoading } = useServiceStudents()
  const { data: programFees = [] } = useAllServiceProgramFees()
  const { data: profiles = [] } = useProfiles()
  const { data: myInstructor } = useMyPartnerInstructor()
  // 파트너사(외부 강사) 로그인: 학생의 다른 수업/프로그램 정보는 감추고 이름·학교만 노출
  const isPartnerViewer = !isAdmin && (!!myInstructor || !!user?.isPartner)
  // 소속학원명 — 같은 학원 강사끼리 코멘트를 공유하는 기준
  const myAcademy = myInstructor?.academy || user?.partnerAcademy
  // 관리자는 전체, 파트너 강사는 '같은 학원(academy) + 본인 작성' 코멘트를 조회
  const { data: academyMeetings = [] } = usePartnerStudentMeetingsForAcademy(
    isAdmin ? undefined : myAcademy,
    isAdmin ? undefined : partnerId,
  )
  const { data: allMeetings = [] } = useAllPartnerStudentMeetings(isAdmin)
  const meetings = isAdmin ? allMeetings : academyMeetings

  const [partnerFilter, setPartnerFilter] = useState('all')
  const partnerOptions = useMemo(() => {
    const s = new Set<string>()
    programFees.forEach(f => { if (f.label) s.add(f.label) })
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [programFees])
  const nrm = (v?: string) => (v || '').replace(/\s+/g, '').toLowerCase()

  // 학생별 프로그램(파트너사) 라벨 — 미팅 추가 시 프로그램 선택 & 필터 매칭용
  const labelsByStudentName = useMemo(() => {
    const m = new Map<string, Set<string>>()
    programFees.forEach(f => {
      if (!f.label) return
      const arr = m.get(f.studentName) || new Set<string>()
      arr.add(f.label)
      m.set(f.studentName, arr)
    })
    return m
  }, [programFees])
  const create = useCreatePartnerStudentMeeting()
  const update = useUpdatePartnerStudentMeeting()
  const del = useDeletePartnerStudentMeeting()

  // A partner services a student when one of that student's Extra Curricular /
  // Academic programs names the partner. Only the partner/academy label counts —
  // sales contributors (담당자 이름) must NOT appear as partner chips.
  const studentPartners = useMemo(() => {
    const map = new Map<string, { names: Set<string>; display: Set<string> }>()
    programFees.forEach(f => {
      const raw = [f.label].filter(Boolean) as string[]
      if (!raw.length) return
      const entry = map.get(f.studentId) || { names: new Set<string>(), display: new Set<string>() }
      raw.forEach(n => { entry.names.add(n.toLowerCase()); entry.display.add(n) })
      map.set(f.studentId, entry)
    })
    return map
  }, [programFees])

  // Admins/관리자 see every student with a partner program for oversight.
  // 파트너 강사(비관리자)는 자기 소속학원 학생 + 담당학생으로 지정된 학생만 봅니다.
  const students = useMemo(() => {
    const myAcademyKey = nrm(myInstructor?.academy)
    const myStudentIds = new Set(myInstructor?.studentIds || [])
    // 우리 학원(또는 본인)이 코멘트를 남긴 학생 — EC 라벨/담당지정이 없어도 목록에 보이도록.
    const meetingStudentNames = new Set(meetings.map(m => m.studentName))
    return allStudents
      .filter(s => {
        const entry = studentPartners.get(s.id)
        const assigned = myStudentIds.has(s.id)
        const hasMeeting = meetingStudentNames.has(s.name)
        if (!entry && !assigned && !hasMeeting) return false
        if (!isAdmin) {
          if (myInstructor) {
            // 소속학원 라벨 매칭 · 담당학생 지정 · 우리 학원 코멘트가 있는 학생
            const byAcademy = !!myAcademyKey && !!entry && Array.from(entry.display).some(d => nrm(d) === myAcademyKey || nrm(d).includes(myAcademyKey))
            if (!byAcademy && !assigned && !hasMeeting) return false
          } else {
            // 강사 레지스트리가 없으면 기존 이름 기반 폴백 + 본인 코멘트가 있는 학생
            if (!(entry && !!partnerKey && Array.from(entry.names).some(n => n.includes(partnerKey))) && !hasMeeting) return false
          }
        }
        // 파트너 필터: 그 파트너가 지정된 학생만
        if (partnerFilter !== 'all' && !(entry && Array.from(entry.display).some(d => nrm(d) === nrm(partnerFilter)))) return false
        return true
      })
      .map(s => ({
        name: s.name, koreanName: s.koreanName, school: s.school,
        partners: Array.from(studentPartners.get(s.id)?.display || []).join(', '),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [allStudents, studentPartners, partnerKey, isAdmin, partnerFilter, myInstructor, meetings])

  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (students.length && !students.some(s => s.name === selected)) setSelected(students[0].name)
  }, [students]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSchool = students.find(s => s.name === selected)?.school
  const selectedLabels = useMemo(() => [...(labelsByStudentName.get(selected) || [])].sort(), [labelsByStudentName, selected])

  const studentMeetings = useMemo(
    () => meetings.filter(m => {
      if (m.studentName !== selected) return false
      if (partnerFilter === 'all') return true
      const fb = nrm(partnerFilter)
      // 파트너 매칭: 1) 코멘트의 프로그램 라벨, 2) 작성자 소속학원(partner_academy), 3) 작성 계정 이름
      // (KYN 강사는 개인 이름으로 로그인 → 이름만으로는 매칭 실패)
      if (nrm(m.program) === fb) return true
      const author = profiles.find(p => p.id === m.partnerId)
      const cands = [author?.partnerAcademy, author?.name].map(nrm).filter(Boolean)
      return cands.some(c => c.includes(fb) || fb.includes(c))
    }),
    [meetings, selected, partnerFilter, profiles], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ meetingDate: '', program: '', content: '' })
  const reset = () => { setEditingId(null); setForm({ meetingDate: '', program: '', content: '' }) }
  const startEdit = (m: PartnerStudentMeeting) => {
    if (!canEdit) return
    setEditingId(m.id)
    setForm({ meetingDate: m.meetingDate || '', program: m.program || '', content: m.content || '' })
  }
  const save = () => {
    if (!canEdit) return
    if (!selected || (!form.content.trim() && !form.meetingDate)) return
    if (editingId) {
      update.mutate(
        { id: editingId, partnerId, meetingDate: form.meetingDate || undefined, program: form.program || undefined, content: form.content || undefined },
        { onSuccess: reset },
      )
    } else {
      create.mutate(
        { partnerId, partnerAcademy: myAcademy, authorName: myInstructor?.name || user?.name, studentName: selected, schoolName: selectedSchool, meetingDate: form.meetingDate || undefined, program: form.program || undefined, content: form.content || undefined, createdBy: partnerId },
        { onSuccess: () => { notifyAssignedConsultant(); reset() } },
      )
    }
  }

  // 미팅 코멘트 입력 시 그 학생의 담당 컨설턴트에게 알림
  const notifyAssignedConsultant = () => {
    const stu = allStudents.find(s => s.name === selected)
    const cName = stu?.assignedConsultant
    if (!cName) return
    const canon = canonicalConsultantName(cName)
    const prof = profiles.find(p => canonicalConsultantName(p.name) === canon)
    if (!prof || prof.id === user?.id) return
    const from = myInstructor?.academy || user?.name || '파트너사'
    createNotificationsForUsers([prof.id], {
      type: 'partner_comment',
      title: '파트너 학생 코멘트 등록',
      message: `${from}에서 ${selected} 학생 미팅 코멘트를 남겼습니다.`,
      link: '/partner/students',
      metadata: { from, student: selected },
    }).catch(() => {})
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Partner</p>
        <h1 className="text-xl font-bold">{t('nav.partnerStudents')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">담당 학생을 선택해 미팅 일정과 내용을 기록하세요.</p>
      </div>

      {!isPartnerViewer && partnerOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={partnerFilter} onValueChange={v => { if (v) { setPartnerFilter(v); setSelected('') } }}>
            <SelectTrigger className="h-9 w-72"><SelectValue placeholder="프로그램(파트너사) 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 파트너사</SelectItem>
              {partnerOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {partnerFilter !== 'all' && <span className="text-xs text-muted-foreground">“{partnerFilter}” 학생 {students.length}명 · 코멘트도 이 파트너사 것만 표시</span>}
        </div>
      )}

      {students.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {isLoading
            ? '불러오는 중…'
            : isAdmin
              ? 'Extra Curricular / Academic 프로그램에 파트너가 지정된 학생이 아직 없습니다.'
              : '배정된 학생이 없습니다. (Student 360의 EC/Academic 프로그램 파트너·기여자에 내 계정 이름이 지정돼야 표시됩니다)'}
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
                  {!isPartnerViewer && s.partners && (
                    <div className="text-[11px] text-primary/80 mt-0.5 truncate">🤝 {s.partners}</div>
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
                    <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                      <span>{m.meetingDate || '—'}</span>
                      {m.authorName && <span className="text-muted-foreground font-normal">· {m.authorName}</span>}
                      {m.program && <Badge variant="outline">{m.program}</Badge>}
                    </div>
                    {/* 같은 학원 동료 코멘트는 조회만 가능 — 수정·삭제는 작성자 본인 또는 관리자만 */}
                    {canEdit && (isAdmin || m.partnerId === partnerId) && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Pencil className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm('삭제하시겠습니까?')) del.mutate({ id: m.id, partnerId }) }}><Trash2 className="size-3.5" /></Button>
                    </div>
                    )}
                  </div>
                  {m.content && <p className="text-sm mt-2 whitespace-pre-wrap">{m.content}</p>}
                </div>
              ))}

              {/* Add / edit form */}
              {canEdit && (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{editingId ? '미팅 수정' : '미팅 추가'}</div>
                <div className="flex gap-2 flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-xs">미팅 일정</Label>
                    <Input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="h-9 w-44" />
                  </div>
                  {!isPartnerViewer && (
                  <div className="space-y-1 flex-1 min-w-[160px]">
                    <Label className="text-xs">프로그램 (파트너사)</Label>
                    {selectedLabels.length > 0 ? (
                      <Select value={form.program || '_none'} onValueChange={v => setForm(f => ({ ...f, program: !v || v === '_none' ? '' : v }))}>
                        <SelectTrigger className="h-9"><span className="truncate">{form.program || '프로그램 선택'}</span></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {selectedLabels.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} placeholder="예: USACO 대회, 리서치 …" className="h-9" />
                    )}
                  </div>
                  )}
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
