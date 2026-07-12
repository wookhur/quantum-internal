import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Trash2, GraduationCap, MessageSquare, CalendarClock, Check, Loader2, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useAllServiceProgramFees, type ServiceProgramFee } from '@/hooks/useServiceProgramFees'
import { useAllPartnerStudentMeetings } from '@/hooks/usePartnerStudentMeetings'
import { useProfiles } from '@/hooks/useProfiles'
import {
  usePlannedPrograms, useCreatePlannedProgram, useUpdatePlannedProgram, useDeletePlannedProgram,
} from '@/hooks/usePlannedPrograms'

const norm = (s?: string) => (s || '').replace(/\s+/g, '')

export function ECProgramsPage() {
  const { user } = useAuth()
  const { data: programs = [], isLoading } = useAllServiceProgramFees()
  const { data: meetings = [] } = useAllPartnerStudentMeetings()
  const { data: profiles = [] } = useProfiles()
  const [tab, setTab] = useState<'active' | 'planned'>('active')
  const [search, setSearch] = useState('')

  const partnerName = (id?: string) => profiles.find(p => p.id === id)?.name

  // 학생별로 프로그램 + 파트너 미팅 코멘트 묶기
  const byStudent = useMemo(() => {
    const meetingsByStudent = new Map<string, typeof meetings>()
    for (const m of meetings) {
      const k = norm(m.studentName)
      const arr = meetingsByStudent.get(k) || []
      arr.push(m)
      meetingsByStudent.set(k, arr)
    }
    const map = new Map<string, { name: string; programs: ServiceProgramFee[]; comments: typeof meetings }>()
    for (const p of programs) {
      const k = norm(p.studentName)
      if (!map.has(k)) map.set(k, { name: p.studentName, programs: [], comments: meetingsByStudent.get(k) || [] })
      map.get(k)!.programs.push(p)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [programs, meetings])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return byStudent
    return byStudent.filter(s => s.name.toLowerCase().includes(q))
  }, [byStudent, search])

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">EC 프로그램 관리</h1>
        <p className="text-sm text-muted-foreground">Student 360의 EC·Academic 프로그램 수강생과 파트너사 미팅 코멘트를 관리합니다.</p>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'active' ? 'default' : 'outline'} size="sm" onClick={() => setTab('active')}>
          진행 프로그램 ({byStudent.length})
        </Button>
        <Button variant={tab === 'planned' ? 'default' : 'outline'} size="sm" onClick={() => setTab('planned')}>
          예정 · 준비 리스트
        </Button>
      </div>

      {tab === 'active' ? (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input placeholder="학생 이름 검색…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 max-w-xs" />
          </div>
          {filteredStudents.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>EC·Academic 프로그램 수강생이 없습니다. (Student 360에서 추가)</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map(s => (
                <Card key={s.name}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="size-4 text-indigo-500" />
                      <span className="font-semibold">{s.name}</span>
                      <Badge variant="outline" className="text-[10px]">프로그램 {s.programs.length}</Badge>
                    </div>
                    {/* Programs */}
                    <div className="flex flex-wrap gap-1.5">
                      {s.programs.map(p => (
                        <Badge key={p.id} variant="outline" className={`text-[11px] ${p.source === 'ec' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                          {p.source === 'ec' ? 'EC' : 'Academic'} · {p.label}{p.detail ? ` · ${p.detail}` : ''}
                          {p.periodStart ? ` (${p.periodStart}${p.periodEnd ? `~${p.periodEnd}` : ''})` : ''}
                        </Badge>
                      ))}
                    </div>
                    {/* Partner meeting comments (auto) */}
                    <div>
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <MessageSquare className="size-3" />파트너사 미팅 코멘트
                        {s.comments.length > 0 && <span>({s.comments.length})</span>}
                      </div>
                      {s.comments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">아직 파트너사 미팅 기록이 없습니다.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {s.comments.map(m => (
                            <div key={m.id} className="text-sm border-l-2 border-indigo-200 pl-2.5">
                              <div className="text-[11px] text-muted-foreground">
                                {m.meetingDate || '날짜 미정'}
                                {partnerName(m.partnerId) && ` · ${partnerName(m.partnerId)}`}
                                {m.program && ` · ${m.program}`}
                              </div>
                              <div className="text-gray-700 whitespace-pre-wrap">{m.content || '—'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
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
