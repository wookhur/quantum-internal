import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Circle, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useTodos, useCreateTodo, useUpdateTodoStatus } from '@/hooks/useTodos'
import { useAuth } from '@/contexts/AuthContext'
import { daysFromTodayKST } from '@/lib/date'
import type { Todo, TodoPriority, TodoStatus } from '@/types'

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; dotColor: string }> = {
  high: { label: '긴급', dotColor: 'bg-destructive' },
  medium: { label: '보통', dotColor: 'bg-warning' },
  low: { label: '낮음', dotColor: 'bg-muted-foreground' },
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

function TodoCard({ todo, onToggle }: { todo: Todo; onToggle: (id: string, status: TodoStatus) => void }) {
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
        </div>
        {todo.description && (
          <p className="text-xs text-muted-foreground truncate">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <DueBadge dueDate={todo.dueDate} />
          {todo.linkedEntityType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {todo.linkedEntityType === 'lead' ? '리드' : todo.linkedEntityType === 'contract' ? '계약' : '이벤트'}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

export function TodosPage() {
  const [tab, setTab] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' as TodoPriority, dueDate: '' })
  const { data: todos = [], isLoading } = useTodos()
  const updateStatus = useUpdateTodoStatus()
  const createTodo = useCreateTodo()
  const { user } = useAuth()

  const handleToggle = (id: string, status: TodoStatus) => {
    updateStatus.mutate({ id, status })
  }

  const handleCreateTodo = () => {
    if (!form.title.trim() || !user) return
    createTodo.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        assignedTo: user.id,
        createdBy: user.id,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm({ title: '', description: '', priority: 'medium', dueDate: '' })
        },
      },
    )
  }

  const filtered = todos.filter(t => {
    if (tab === 'todo') return t.status !== 'done'
    if (tab === 'done') return t.status === 'done'
    return true
  })

  const todoCount = todos.filter(t => t.status === 'todo').length
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length
  const doneCount = todos.filter(t => t.status === 'done').length
  const overdueCount = todos.filter(t => t.status !== 'done' && getDaysUntilDue(t.dueDate) !== null && getDaysUntilDue(t.dueDate)! < 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">할일 목록</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : (
              <>
                {todoCount + inProgressCount}개 진행 중 · {doneCount}개 완료
                {overdueCount > 0 && <span className="text-destructive font-medium"> · {overdueCount}개 지연</span>}
              </>
            )}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> 할일 추가
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>할일 추가</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>제목</Label>
                <Input
                  placeholder="할일 제목"
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
              <div className="grid grid-cols-2 gap-4">
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
              <Button
                className="w-full"
                onClick={handleCreateTodo}
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

      {/* Todo List */}
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
            <Select>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="담당자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="me">나</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              할일이 없습니다.
            </div>
          ) : (
            filtered.map(todo => (
              <TodoCard key={todo.id} todo={todo} onToggle={handleToggle} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
