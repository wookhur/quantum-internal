import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, GraduationCap, MessageSquare, CalendarClock, Check, Loader2, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAllServiceProgramFees, type ServiceProgramFee } from '@/hooks/useServiceProgramFees'
import { useAllPartnerStudentMeetings } from '@/hooks/usePartnerStudentMeetings'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useProfiles } from '@/hooks/useProfiles'
import {
  usePlannedPrograms, useCreatePlannedProgram, useUpdatePlannedProgram, useDeletePlannedProgram,
} from '@/hooks/usePlannedPrograms'

const norm = (s?: string) => (s || '').replace(/\s+/g, '')

export function ECProgramsPage() {
  const { user } = useAuth()
  const { data: programs = [], isLoading } = useAllServiceProgramFees()
  const { data: meetings = [] } = useAllPartnerStudentMeetings()
  const { data: serviceStudents = [] } = useServiceStudents()
  const { data: profiles = [] } = useProfiles()

  const studentInfo = useMemo(() => {
    const m = new Map<string, { koreanName?: string; school?: string }>()
    for (const s of serviceStudents) m.set(norm(s.name), { koreanName: s.koreanName, school: s.school })
    return m
  }, [serviceStudents])
  const [tab, setTab] = useState<'active' | 'planned'>('active')
  const [search, setSearch] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)

  const partnerName = (id?: string) => profiles.find(p => p.id === id)?.name

  const meetingsByStudent = useMemo(() => {
    const m = new Map<string, typeof meetings>()
    for (const mt of meetings) {
      const k = norm(mt.studentName)
      const arr = m.get(k) || []
      arr.push(mt)
      m.set(k, arr)
    }
    return m
  }, [meetings])

  // 학생 목록 (EC/Academic 프로그램이 있는 학생)
  const allStudents = useMemo(() => {
    const map = new Map<string, { name: string; programs: ServiceProgramFee[] }>()
    for (const p of programs) {
      const k = norm(p.studentName)
      if (!map.has(k)) map.set(k, { name: p.studentName, programs: [] })
      map.get(k)!.programs.push(p)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [programs])

  // 프로그램(파트너사) 드롭다운
  const partnerOptions = useMemo(() => {
    const counts = new Map<string, Set<string>>()
    for (const p of programs) {
      const partner = p.label || '(파트너 미지정)'
      if (!counts.has(partner)) counts.set(partner, new Set())
      counts.get(partner)!.add(norm(p.studentName))
    }
    return [...counts.entries()].map(([key, s]) => ({ key, count: s.size })).sort((a, b) => a.key.localeCompare(b.key, 'ko'))
  }, [programs])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allStudents.filter(s => {
      if (programFilter !== 'all' && !s.programs.some(p => (p.label || '(파트너 미지정)') === programFilter)) return false
      if (q && !s.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [allStudents, programFilter, search])

  const selectedStudent = filteredStudents.find(s => s.name === selected) || filteredStudents[0] || null

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">EC 프로그램 관리</h1>
        <p className="text-sm text-muted-foreground">Student 360의 EC·Academic 프로그램 수강생과 파트너사 미팅 코멘트를 관리합니다.</p>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'active' ? 'default' : 'outline'} size="sm" onClick={() => setTab('active')}>
          진행 프로그램 ({allStudents.length})
        </Button>
        <Button variant={tab === 'planned' ? 'default' : 'outline'} size="sm" onClick={() => setTab('planned')}>
          예정 · 준비 리스트
        </Button>
      </div>

      {tab === 'active' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={programFilter} onValueChange={v => { if (v) { setProgramFilter(v); setSelected(null) } }}>
              <SelectTrigger className="h-9 w-72"><SelectValue placeholder="프로그램(파트너사) 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 프로그램</SelectItem>
                {partnerOptions.map(o => (
                  <SelectItem key={o.key} value={o.key}>{o.key} ({o.count}명)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="학생 이름 검색…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 w-56" />
            </div>
            {programFilter !== 'all' && (
              <span className="text-xs text-muted-foreground">“{programFilter}” 신청 {filteredStudents.length}명</span>
            )}
          </div>

          {filteredStudents.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>{programFilter === 'all' ? 'EC·Academic 프로그램 수강생이 없습니다. (Student 360에서 추가)' : '해당 프로그램 신청 학생이 없습니다.'}</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
              {/* 학생 목록 */}
              <Card className="h-fit max-h-[72vh] overflow-y-auto">
                <CardContent className="p-2 space-y-1">
                  {filteredStudents.map(s => {
                    const partners = [...new Set(s.programs.map(p => p.label).filter(Boolean))].join(', ')
                    const info = studentInfo.get(norm(s.name))
                    const active = selectedStudent?.name === s.name
                    return (
                      <button
                        key={s.name}
                        onClick={() => setSelected(s.name)}
                        className={`w-full text-left rounded-lg border p-2.5 transition-colors ${active ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-muted/50'}`}
                      >
                        <div className="font-medium text-sm">{s.name}{info?.koreanName ? ` · ${info.koreanName}` : ''}</div>
                        {info?.school && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <GraduationCap className="size-3" />{info.school}
                          </div>
                        )}
                        {partners && <div className="text-[11px] text-indigo-600/80 mt-0.5 truncate">🤝 {partners}</div>}
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

              {/* 선택 학생 상세 */}
              <Card className="h-fit">
                {selectedStudent ? (
                  <CardContent className="p-4 space-y-3">
                    {(() => {
                      const allComments = meetingsByStudent.get(norm(selectedStudent.name)) || []
                      // 파트너 필터가 걸려 있으면, 그 파트너가 올린 코멘트만 표시
                      const comments = programFilter === 'all'
                        ? allComments
                        : allComments.filter(m => {
                            // 파트너 매칭: 작성자의 소속학원(partner_academy)을 우선으로,
                            // 계정 이름·코멘트의 프로그램 라벨도 함께 대소문자 무시 비교.
                            // (KYN 강사는 개인 이름으로 로그인해 이름만으로는 매칭 실패했음)
                            const author = profiles.find(p => p.id === m.partnerId)
                            const fb = norm(programFilter).toLowerCase()
                            const cands = [author?.partnerAcademy, author?.name, m.program]
                              .map(x => norm(x || '').toLowerCase())
                              .filter(Boolean)
                            return cands.some(c => c.includes(fb) || fb.includes(c))
                          })
                      return (
                        <>
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <GraduationCap className="size-5 text-indigo-500" />
                            <span className="font-bold text-base">{selectedStudent.name}</span>
                            <Badge variant="outline" className="text-[10px]">프로그램 {selectedStudent.programs.length}</Badge>
                          </div>
                          {/* 프로그램 목록 */}
                          <div className="space-y-1.5">
                            {selectedStudent.programs.map(p => (
                              <div key={p.id} className="flex items-center gap-2 text-sm">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.source === 'academic' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                  {p.source === 'academic' ? 'Academic' : 'EC'}
                                </span>
                                <span className="font-medium">{p.label}</span>
                                {p.detail && <span className="text-gray-600">· {p.detail}</span>}
                                {p.periodStart && <span className="text-[11px] text-muted-foreground">({p.periodStart}{p.periodEnd ? `~${p.periodEnd}` : ''})</span>}
                              </div>
                            ))}
                          </div>
                          {/* 파트너사 미팅 코멘트 (자동) */}
                          <div className="pt-2 border-t">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                              <MessageSquare className="size-3.5" />
                              {programFilter === 'all' ? '파트너사 미팅 코멘트' : `“${programFilter}” 미팅 코멘트`}
                              {comments.length > 0 && ` (${comments.length})`}
                            </div>
                            {comments.length === 0 ? (
                              <p className="text-sm text-muted-foreground">{programFilter === 'all' ? '아직 파트너사 미팅 기록이 없습니다.' : '이 파트너사가 올린 미팅 코멘트가 없습니다.'}</p>
                            ) : (
                              <div className="space-y-2">
                                {comments.map(m => (
                                  <div key={m.id} className="text-sm border-l-2 border-indigo-200 pl-2.5">
                                    <div className="text-[11px] text-muted-foreground">
                                      {m.meetingDate || '날짜 미정'}
                                      {(m.authorName || partnerName(m.partnerId)) && ` · ${m.authorName || partnerName(m.partnerId)}`}
                                      {m.program && ` · ${m.program}`}
                                    </div>
                                    <div className="text-gray-700 whitespace-pre-wrap">{m.content || '—'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )
                    })()}
                  </CardContent>
                ) : (
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">학생을 선택하세요.</CardContent>
                )}
              </Card>
            </div>
          )}
        </>
      ) : (
        <PlannedSection createdBy={user?.id} />
      )}
    </div>
  )
}

function PlannedSection({ createdBy }: { createdBy?: string }) {
  const { data: planned = [] } = usePlannedPrograms()
  const create = useCreatePlannedProgram()
  const update = useUpdatePlannedProgram()
  const del = useDeletePlannedProgram()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ studentName: '', partner: '', program: '', plannedDate: '', notes: '' })

  const submit = async () => {
    if (!form.studentName.trim()) return
    await create.mutateAsync({
      studentName: form.studentName.trim(),
      partner: form.partner.trim() || undefined,
      program: form.program.trim() || undefined,
      plannedDate: form.plannedDate || undefined,
      notes: form.notes.trim() || undefined,
      createdBy,
    })
    setForm({ studentName: '', partner: '', program: '', plannedDate: '', notes: '' })
    setShowForm(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">예정된 프로그램을 미리 등록해 준비 상태를 관리합니다.</p>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />직접 추가</Button>
      </div>
      {planned.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>예정된 프로그램이 없습니다. “직접 추가”로 준비 리스트를 만드세요.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {planned.map(p => (
            <Card key={p.id} className={p.status === 'done' ? 'opacity-60' : ''}>
              <CardContent className="p-3 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => update.mutate({ id: p.id, status: p.status === 'done' ? 'planned' : 'done' })}
                  className={`size-5 rounded border flex items-center justify-center shrink-0 mt-0.5 ${p.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-gray-400'}`}
                >
                  {p.status === 'done' && <Check className="size-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${p.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                    {p.studentName}
                    {p.program && <span className="text-gray-500 font-normal"> · {p.program}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.plannedDate || '날짜 미정'}{p.partner && ` · ${p.partner}`}
                  </div>
                  {p.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{p.notes}</div>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => del.mutate(p.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Dialog open onOpenChange={o => { if (!o) setShowForm(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>예정 프로그램 추가</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">학생 이름 *</Label>
                <Input value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">파트너사</Label>
                  <Input value={form.partner} onChange={e => setForm(f => ({ ...f, partner: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">예정일</Label>
                  <Input type="date" value={form.plannedDate} onChange={e => setForm(f => ({ ...f, plannedDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">프로그램</Label>
                <Input value={form.program} onChange={e => setForm(f => ({ ...f, program: e.target.value }))} placeholder="예: EC 인터뷰 준비" />
              </div>
              <div>
                <Label className="text-xs">준비 메모</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>취소</Button>
              <Button disabled={!form.studentName.trim() || create.isPending} onClick={submit}>추가</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
