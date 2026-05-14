import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus, Circle, Clock, CheckCircle2, AlertCircle, Loader2,
  Users, User as UserIcon, Building2,
} from 'lucide-react'
import { useTodos, useCreateTodo, useUpdateTodoStatus } from '@/hooks/useTodos'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuth } from '@/contexts/AuthContext'
import { daysFromTodayKST } from '@/lib/date'
import type { Todo, TodoPriority, TodoStatus, ProjectTeam, User } from '@/types'

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; dotColor: string }> = {
  high: { label: '긴급', dotColor: 'bg-destructive' },
  medium: { label: '보통', dotColor: 'bg-warning' },
  low: { label: '낮음', dotColor: 'bg-muted-foreground' },
}

const TEAM_CONFIG: Record<ProjectTeam, { label: string; color: string }> = {
  management: { label: '경영', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  sales: { label: '세일즈', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  marketing: { label: '마케팅', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  finance: { label: '재무', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  service: { label: '서비스', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

function getDaysUntilDue(dueDate?: string) {
  if (!dueDate) return null
  return daysFromTodayKST(dueDate)
}

function DueBadge({ dueDate }: { dueDate?: string }) {
  const days = getDaysUntilDue(dueDate)
  if (days === null) return null
  if (days < 0) return <Badge variant="destructive" className="text-[10px] px-1.5">D{days}</Badge>
  if (days === 0) return <Badge variant="destructive" className="text-[10px] px-1.5">오늘</Badge>
  if (days === 1) return <Badge className="text-[10px] px-1.5 bg-warning text-foreground">내일</Badge>
  if (days <= 3) return <Badge variant="outline" className="text-[10px] px-1.5 text-warning border-warning">D-{days}</Badge>
  return <span className="text-xs text-muted-foreground">{dueDate?.slice(5)}</span>
}

function TeamBadge({ team }: { team?: ProjectTeam }) {
  if (!team) return null
  const cfg = TEAM_CONFIG[team]
  return (
    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-medium ${cfg.color}`}>
      {cfg.label}
    </Badge>
  )
}

function PersonChip({ userId, profiles }: { userId: string; profiles: User[] }) {
  const user = profiles.find(p => p.id === userId)
  if (!user) return <span className="text-xs text-muted-foreground">?</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-0.5">
      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold shrink-0">
        {user.name.charAt(0)}
      </span>
      {user.name}
    </span>
  )
}

function ProjectCard({
  todo,
  profiles,
  onToggle,
}: {
  todo: Todo
  profiles: User[]
  onToggle: (id: string, status: TodoStatus) => void
}) {
  const p = PRIORITY_CONFIG[todo.priority]
  const isDone = todo.status === 'done'

  const nextStatus: TodoStatus = todo.status === 'done' ? 'todo' : todo.status === 'todo' ? 'in_progress' : 'done'

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/30 ${isDone ? 'opacity-50' : ''}`}>
      <button onClick={() => onToggle(todo.id, nextStatus)} className="mt-0.5 shrink-0">
        {isDone ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : todo.status === 'in_progress' ? (
          <Clock className="size-5 text-primary" />
        ) : (
          <Circle className="size-5 text-muted-foreground/40 hover:text-primary transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
            {todo.title}
          </span>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.dotColor}`} />
          <TeamBadge team={todo.team} />
        </div>
        {todo.description && (
          <p className="text-xs text-muted-foreground truncate">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <DueBadge dueDate={todo.dueDate} />
          {/* 책임자 */}
          {todo.ownerId && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserIcon className="size-3" />
              <PersonChip userId={todo.ownerId} profiles={profiles} />
            </span>
          )}
          {/* 담당자 */}
          {todo.assignees && todo.assignees.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3" />
              {todo.assignees.slice(0, 3).map(uid => (
                <PersonChip key={uid} userId={uid} profiles={profiles} />
              ))}
              {todo.assignees.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{todo.assignees.length - 3}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function TodosPage() {
  const [tab, setTab] = useState('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as TodoPriority,
    dueDate: '',
    team: '' as string,
    ownerId: '' as string,
    assignees: [] as string[],
  })

  const { data: todos = [], isLoading } = useTodos()
  const { data: profiles = [] } = useProfiles()
  const updateStatus = useUpdateTodoStatus()
  const createTodo = useCreateTodo()
  const { user } = useAuth()

  const handleToggle = (id: string, status: TodoStatus) => {
    updateStatus.mutate({ id, status })
  }

  const handleCreateProject = () => {
    if (!form.title.trim() || !user) return
    createTodo.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        team: (form.team || undefined) as ProjectTeam | undefined,
        ownerId: form.ownerId || undefined,
        assignees: form.assignees.length > 0 ? form.assignees : undefined,
        assignedTo: form.ownerId || user.id,
        createdBy: user.id,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm({ title: '', description: '', priority: 'medium', dueDate: '', team: '', ownerId: '', assignees: [] })
        },
      },
    )
  }

  const toggleAssignee = (uid: string) => {
    setForm(f => ({
      ...f,
      assignees: f.assignees.includes(uid)
        ? f.assignees.filter(a => a !== uid)
        : [...f.assignees, uid],
    }))
  }

  const filtered = useMemo(() => {
    let list = todos
    if (tab === 'todo') list = list.filter(t => t.status !== 'done')
    if (tab === 'done') list = list.filter(t => t.status === 'done')
    if (teamFilter !== 'all') list = list.filter(t => t.team === teamFilter)
    return list
  }, [todos, tab, teamFilter])

  const todoCount = todos.filter(t => t.status === 'todo').length
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length
  const doneCount = todos.filter(t => t.status === 'done').length
  const overdueCount = todos.filter(t => t.status !== 'done' && getDaysUntilDue(t.dueDate) !== null && getDaysUntilDue(t.dueDate)! < 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">프로젝트</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? '로딩 중...' : (
              <>
                {todoCount + inProgressCount}개 진행 중 · {doneCount}개 완료
                {overdueCount > 0 && <span className="text-destructive font-medium"> · {overdueCount}개 지연</span>}
              </>
            )}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> 프로젝트 추가
        </Button>

        {/* Create Project Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>프로젝트 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>제목</Label>
                <Input
                  placeholder="프로젝트 제목"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>설명</Label>
                <Textarea
                  placeholder="상세 설명 (선택)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>담당 팀</Label>
                  <Select value={form.team || '_none'} onValueChange={v => setForm(f => ({ ...f, team: !v || v === '_none' ? '' : v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="팀 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">미정</SelectItem>
                      <SelectItem value="management">경영</SelectItem>
                      <SelectItem value="sales">세일즈</SelectItem>
                      <SelectItem value="marketing">마케팅</SelectItem>
                      <SelectItem value="finance">재무</SelectItem>
                      <SelectItem value="service">서비스</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>우선순위</Label>
                  <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as TodoPriority }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">긴급</SelectItem>
                      <SelectItem value="medium">보통</SelectItem>
                      <SelectItem value="low">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>마감일</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* 책임자 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <UserIcon className="size-3.5" /> 책임자 (1명)
                </Label>
                <Select value={form.ownerId || '_none'} onValueChange={v => setForm(f => ({ ...f, ownerId: !v || v === '_none' ? '' : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="책임자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">미정</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} {p.position ? `(${p.position})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 담당자 (다중 선택) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> 담당자 (복수 선택)
                </Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {profiles.map(p => {
                    const selected = form.assignees.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleAssignee(p.id)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                          selected ? 'bg-blue-50 text-blue-700' : 'hover:bg-muted/50'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                          selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'
                        }`}>
                          {selected && '✓'}
                        </span>
                        <span>{p.name}</span>
                        {p.department && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {TEAM_CONFIG[p.department]?.label || p.department}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {form.assignees.length > 0 && (
                  <p className="text-xs text-muted-foreground">{form.assignees.length}명 선택됨</p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleCreateProject}
                disabled={!form.title.trim() || createTodo.isPending}
              >
                {createTodo.isPending ? '추가 중...' : '추가'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive" />
            <div>
              <div className="text-lg font-bold">{todoCount}</div>
              <div className="text-xs text-muted-foreground">대기</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{inProgressCount}</div>
              <div className="text-xs text-muted-foreground">진행 중</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-success" />
            <div>
              <div className="text-lg font-bold">{doneCount}</div>
              <div className="text-xs text-muted-foreground">완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-warning" />
            <div>
              <div className="text-lg font-bold">{overdueCount}</div>
              <div className="text-xs text-muted-foreground">지연</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">전체</TabsTrigger>
                <TabsTrigger value="todo">진행 중</TabsTrigger>
                <TabsTrigger value="done">완료</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Select value={teamFilter} onValueChange={v => setTeamFilter(v || 'all')}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <Building2 className="size-3 mr-1" />
                  <SelectValue placeholder="팀" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 팀</SelectItem>
                  <SelectItem value="management">경영</SelectItem>
                  <SelectItem value="sales">세일즈</SelectItem>
                  <SelectItem value="marketing">마케팅</SelectItem>
                  <SelectItem value="finance">재무</SelectItem>
                  <SelectItem value="service">서비스</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              프로젝트가 없습니다.
            </div>
          ) : (
            filtered.map(todo => (
              <ProjectCard key={todo.id} todo={todo} profiles={profiles} onToggle={handleToggle} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
