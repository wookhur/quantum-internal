import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, X, Pencil, Trash2, GraduationCap, Loader2 } from 'lucide-react'
import { useCanEdit } from '@/hooks/usePermissions'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAuth } from '@/contexts/AuthContext'

type ServiceStudent = { id: string; name?: string; koreanName?: string; grade?: string; school?: string }
import {
  useAllTutoring, useCreateTutoring, useSetTutoringStatus, useUpdateTutoring, useDeleteTutoring,
  tutoringLessonTitle, type TutoringReg, type TutoringStatus,
} from '@/hooks/useTutoring'

const STATUS_META: Record<TutoringStatus, { label: string; cls: string }> = {
  applied:   { label: '신청',     cls: 'text-amber-700 border-amber-200 bg-amber-50' },
  completed: { label: '신청완료', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
}

function studentLabel(s?: Pick<ServiceStudent, 'name' | 'koreanName'>): string {
  if (!s) return ''
  return [s.koreanName, s.name].filter(Boolean).join(' ') || s.name || '—'
}

export function TutorsPage() {
  const { pathname } = useLocation()
  const canEdit = useCanEdit(pathname)
  const { user } = useAuth()
  const { data: regs = [], isLoading } = useAllTutoring()
  const { data: students = [] } = useServiceStudents()
  const setStatus = useSetTutoringStatus()
  const del = useDeleteTutoring()

  // 과외선생님별 그룹 (프로그램 관리처럼 카드로)
  const byTutor = useMemo(() => {
    const m = new Map<string, TutoringReg[]>()
    for (const r of regs) {
      const key = r.tutorName || '미지정'
      const arr = m.get(key) || []
      arr.push(r)
      m.set(key, arr)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [regs])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold">과외강사관리</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          과외 신청을 등록하고, <b>신청완료</b> 시 학생 Student360의 <b>Academic Support</b>에 자동 연동됩니다
          (수업제목 = 과외선생님 이름 + 1:1, 시작일 포함).
        </p>
      </div>

      {canEdit && <AddTutoringBox students={students} createdBy={user?.id} />}

      {isLoading ? (
        <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : byTutor.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">등록된 과외 신청이 없습니다.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {byTutor.map(([tutor, list]) => (
            <Card key={tutor}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="size-4 text-primary" />
                  <span className="font-semibold text-sm">{tutor}</span>
                  <Badge variant="outline" className="text-xs">{list.length}명</Badge>
                  <span className="text-xs text-muted-foreground">· 수업제목: {tutoringLessonTitle(tutor)}</span>
                </div>
                <div className="divide-y">
                  {list.map(r => {
                    const st = students.find(s => s.id === r.studentId)
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 py-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{studentLabel(st) || r.studentKoreanName || r.studentName || '학생'}</div>
                          <div className="text-xs text-muted-foreground">
                            {[r.subject, r.startDate ? `시작 ${r.startDate}` : null].filter(Boolean).join(' · ') || '—'}
                            {r.status === 'completed' && <span className="text-emerald-600"> · Academic Support 연동됨</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${STATUS_META[r.status].cls}`}>{STATUS_META[r.status].label}</Badge>
                          {canEdit && (
                            <select
                              value={r.status}
                              disabled={setStatus.isPending}
                              onChange={e => setStatus.mutate({ reg: r, status: e.target.value as TutoringStatus })}
                              className="h-8 w-[104px] rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <option value="applied">신청</option>
                              <option value="completed">신청완료</option>
                            </select>
                          )}
                          {canEdit && (
                            <>
                              <EditTutoringDialog reg={r} trigger={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
                              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => { if (confirm('이 과외 신청을 삭제할까요?' + (r.academicSupportId ? '\n연동된 Academic Support 기록도 함께 삭제됩니다.' : ''))) del.mutate({ id: r.id, studentId: r.studentId, academicSupportId: r.academicSupportId }) }}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 과외 신청 추가 (학생 검색 → 등록) ─────────────────────────────
function AddTutoringBox({ students, createdBy }: { students: ServiceStudent[]; createdBy?: string }) {
  const create = useCreateTutoring()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState<ServiceStudent | null>(null)
  const [tutor, setTutor] = useState('')
  const [subject, setSubject] = useState('')
  const [startDate, setStartDate] = useState('')

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return [] as ServiceStudent[]
    return students.filter(st =>
      (st.name || '').toLowerCase().includes(s) || (st.koreanName || '').toLowerCase().includes(s) || (st.school || '').toLowerCase().includes(s),
    ).slice(0, 8)
  }, [q, students])

  const submit = () => {
    if (!student || !tutor.trim()) return
    create.mutate(
      { studentId: student.id, tutorName: tutor.trim(), subject: subject.trim() || undefined, startDate: startDate || undefined, status: 'applied', createdBy },
      { onSuccess: () => { setStudent(null); setQ(''); setTutor(''); setSubject(''); setStartDate('') } },
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">과외 신청 추가</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 학생 검색/선택 */}
          <div className="relative">
            <div className="text-xs text-muted-foreground mb-1">학생 (Student360)</div>
            {student ? (
              <div className="flex items-center justify-between gap-2 h-9 px-3 rounded-md border bg-muted/30 text-sm">
                <span className="font-medium">{studentLabel(student)}</span>
                <button onClick={() => setStudent(null)}><X className="size-4 text-muted-foreground" /></button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Search className="size-4 text-muted-foreground shrink-0" />
                  <Input value={q} onChange={e => setQ(e.target.value)} placeholder="학생 이름·학교 검색..." className="h-9 text-sm" />
                </div>
                {matches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-64 overflow-y-auto">
                    {matches.map(st => (
                      <button key={st.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0"
                        onClick={() => { setStudent(st); setQ('') }}>
                        <div className="text-sm font-medium">{studentLabel(st)}</div>
                        <div className="text-xs text-muted-foreground">{[st.school, st.grade].filter(Boolean).join(' · ')}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">과외선생님 이름</div>
            <Input value={tutor} onChange={e => setTutor(e.target.value)} placeholder="예: John" className="h-9 text-sm" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">과목 (선택)</div>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="예: 수학" className="h-9 text-sm" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">시작일</div>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        {tutor.trim() && <p className="text-[11px] text-muted-foreground">수업제목: <b>{tutoringLessonTitle(tutor)}</b> — 신청완료 시 학생 Academic Support에 이 제목·시작일로 연동됩니다.</p>}
        <div className="flex justify-end">
          <Button size="sm" className="gap-1" disabled={!student || !tutor.trim() || create.isPending} onClick={submit}>
            {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 추가
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 과외 신청 수정 ─────────────────────────────
function EditTutoringDialog({ reg, trigger }: { reg: TutoringReg; trigger: React.ReactNode }) {
  const update = useUpdateTutoring()
  const [open, setOpen] = useState(false)
  const [tutor, setTutor] = useState(reg.tutorName)
  const [subject, setSubject] = useState(reg.subject || '')
  const [startDate, setStartDate] = useState(reg.startDate || '')

  const save = () => {
    if (!tutor.trim()) return
    update.mutate(
      { id: reg.id, studentId: reg.studentId, academicSupportId: reg.academicSupportId, tutorName: tutor.trim(), subject: subject.trim() || undefined, startDate: startDate || undefined },
      { onSuccess: () => setOpen(false) },
    )
  }

  if (!open) return <span onClick={() => setOpen(true)}>{trigger}</span>
  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
        <div className="w-full max-w-sm rounded-xl bg-white p-4 space-y-3" onClick={e => e.stopPropagation()}>
          <div className="font-semibold">과외 신청 수정</div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">과외선생님 이름</div>
            <Input value={tutor} onChange={e => setTutor(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">과목 (선택)</div>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">시작일</div>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
          </div>
          {reg.academicSupportId && <p className="text-[11px] text-emerald-600">연동된 Academic Support(수업제목·시작일)도 함께 갱신됩니다.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
            <Button size="sm" disabled={!tutor.trim() || update.isPending} onClick={save}>
              {update.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}저장
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
