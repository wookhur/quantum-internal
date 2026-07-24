import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, Users, Link2, CalendarDays } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useTasks } from '@/hooks/useTasks'
import {
  useDailyTaskMembers, useAddDailyTaskMembers, useRemoveDailyTaskMember,
  useDailyTasks, useCreateDailyTask, useUpdateDailyTask, useDeleteDailyTask,
  type DailyTask,
} from '@/hooks/useDailyTasks'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()]
  return `${y}. ${m}. ${d} (${wd})`
}

export function DailyTasksPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'
  const [date, setDate] = useState(todayISO())
  const [membersOpen, setMembersOpen] = useState(false)

  const { data: members = [] } = useDailyTaskMembers()
  const { data: tasks = [] } = useDailyTasks(date)
  const create = useCreateDailyTask()
  const update = useUpdateDailyTask()
  const del = useDeleteDailyTask()

  // 현재 사용자에게 배정된 미완료 업무요청 (드롭다운 연동용) — 페이지에서 한 번만 조회
  const { data: myTasks = [] } = useTasks(user?.id ? { assigneeId: user.id } : undefined)
  const assignable = useMemo(
    () => (myTasks as { id: string; title: string; status: string }[])
      .filter((t) => t.status === 'requested' || t.status === 'in_progress' || t.status === 'on_hold')
      .map((t) => ({ id: t.id, title: t.title })),
    [myTasks],
  )

  const tasksByUser = useMemo(() => {
    const m = new Map<string, DailyTask[]>()
    for (const t of tasks) { const a = m.get(t.userId) || []; a.push(t); m.set(t.userId, a) }
    return m
  }, [tasks])

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
    [members],
  )
  const isMember = (id?: string) => !!id && members.some((m) => m.profileId === id)

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="size-5 text-primary" />일일 업무</h1>
          <p className="text-sm text-muted-foreground">담당자별로 그날 진행한/진행 중인 업무를 기록하고 공유합니다.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMembersOpen(true)}>
            <Users className="size-4" />대상자 설정 ({members.length})
          </Button>
        )}
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-8" onClick={() => setDate((d) => addDays(d, -1))}><ChevronLeft className="size-4" /></Button>
        <div className="font-semibold min-w-[130px] text-center">{fmtDate(date)}</div>
        <Button variant="outline" size="icon" className="size-8" onClick={() => setDate((d) => addDays(d, 1))}><ChevronRight className="size-4" /></Button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-md border px-2 text-sm bg-background" />
        {date !== todayISO() && <Button variant="ghost" size="sm" onClick={() => setDate(todayISO())}>오늘</Button>}
      </div>

      {sortedMembers.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          아직 작성 대상자가 없습니다. {isAdmin ? '"대상자 설정"에서 직원을 추가하세요.' : '관리자에게 대상자 등록을 요청하세요.'}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedMembers.map((mem) => (
            <MemberCard
              key={mem.profileId}
              name={mem.name || '(이름 없음)'}
              tasks={tasksByUser.get(mem.profileId) || []}
              date={date}
              isSelf={mem.profileId === user?.id}
              canModify={mem.profileId === user?.id || isAdmin}
              userId={mem.profileId}
              createdBy={user?.id}
              assignable={mem.profileId === user?.id ? assignable : []}
              onCreate={create.mutate}
              onToggle={(t) => update.mutate({ id: t.id, status: t.status === 'done' ? 'in_progress' : 'done' })}
              onDelete={(id) => { if (confirm('이 업무를 삭제할까요?')) del.mutate(id) }}
            />
          ))}
        </div>
      )}

      {isAdmin && (
        <MembersDialog open={membersOpen} onClose={() => setMembersOpen(false)} memberIds={new Set(members.map((m) => m.profileId))} createdBy={user?.id} />
      )}

      {/* 대상자에 없는 사용자에게 안내 */}
      {user && !isMember(user.id) && sortedMembers.length > 0 && (
        <p className="text-xs text-muted-foreground">※ 본인이 대상자로 등록되어 있지 않아 직접 작성은 불가합니다. (열람만 가능)</p>
      )}
    </div>
  )
}

function MemberCard({ name, tasks, date, isSelf, canModify, userId, createdBy, assignable, onCreate, onToggle, onDelete }: {
  name: string
  tasks: DailyTask[]
  date: string
  isSelf: boolean
  canModify: boolean
  userId: string
  createdBy?: string
  assignable: { id: string; title: string }[]
  onCreate: (t: { userId: string; taskDate: string; title: string; sourceType?: 'manual' | 'task_request'; sourceTaskId?: string; createdBy?: string }) => void
  onToggle: (t: DailyTask) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [fromRequest, setFromRequest] = useState('')

  const doneCount = tasks.filter((t) => t.status === 'done').length

  const submit = () => {
    const v = title.trim()
    if (!v) return
    onCreate({ userId, taskDate: date, title: v, sourceType: fromRequest ? 'task_request' : 'manual', sourceTaskId: fromRequest || undefined, createdBy })
    setTitle(''); setFromRequest('')
  }
  const pickRequest = (id: string) => {
    setFromRequest(id)
    const r = assignable.find((t) => t.id === id)
    if (r) setTitle(r.title)
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{name}</span>
          <span className="text-xs font-normal text-muted-foreground">{tasks.length}건 · 완료 {doneCount}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">기록 없음</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-sm">
                <button
                  disabled={!canModify}
                  onClick={() => onToggle(t)}
                  className={`mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'} ${canModify ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {t.status === 'done' && <Check className="size-3" />}
                </button>
                <span className={`flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                {t.sourceType === 'task_request' && <Link2 className="size-3.5 text-blue-400 shrink-0 mt-0.5" aria-label="업무요청 연동" />}
                {canModify && (
                  <button onClick={() => onDelete(t.id)} className="text-red-400 hover:text-red-600 shrink-0 mt-0.5"><Trash2 className="size-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        )}

        {isSelf && (
          <div className="pt-2 border-t space-y-1.5">
            {assignable.length > 0 && (
              <Select value={fromRequest || '_none'} onValueChange={(v) => v && v !== '_none' && pickRequest(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="내 업무요청에서 가져오기…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">직접 입력</SelectItem>
                  {assignable.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-1.5">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} placeholder="업무 내용 입력 후 Enter" className="h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={submit} disabled={!title.trim()}><Plus className="size-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MembersDialog({ open, onClose, memberIds, createdBy }: {
  open: boolean; onClose: () => void; memberIds: Set<string>; createdBy?: string
}) {
  const { data: profiles = [] } = useProfiles()
  const add = useAddDailyTaskMembers()
  const remove = useRemoveDailyTaskMember()
  const [q, setQ] = useState('')

  const eligible = useMemo(
    () => profiles
      .filter((p) => !p.isExternal)
      .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [profiles, q],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>일일 업무 대상자 설정</DialogTitle></DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="h-9" />
        <div className="divide-y max-h-[55vh] overflow-y-auto">
          {eligible.map((p) => {
            const on = memberIds.has(p.id)
            return (
              <label key={p.id} className="flex items-center justify-between py-2 cursor-pointer">
                <span className="text-sm">{p.name}<span className="text-xs text-muted-foreground ml-1">{p.department || ''}</span></span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => { if (on) remove.mutate(p.id); else add.mutate({ profileIds: [p.id], createdBy }) }}
                  className="size-4 accent-primary"
                />
              </label>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
