import { useState, useMemo, useRef, useEffect } from 'react'
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
  Users, User as UserIcon, Building2, Pencil, MessageSquare,
  MoreHorizontal, Trash2, Send, ChevronRight,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTodos, useCreateTodo, useUpdateTodo, useUpdateTodoStatus } from '@/hooks/useTodos'
import { useProfiles } from '@/hooks/useProfiles'
import { useProjectComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/hooks/useProjectComments'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { daysFromTodayKST } from '@/lib/date'
import type { Todo, TodoPriority, TodoStatus, ProjectTeam, User } from '@/types'

const PRIORITY_CONFIG: Record<TodoPriority, { labelKey: string; color: string; dotColor: string }> = {
  high: { labelKey: 'todos.priorityHigh', color: 'bg-red-100 text-red-700 border-red-200', dotColor: 'bg-destructive' },
  medium: { labelKey: 'todos.priorityMedium', color: 'bg-amber-100 text-amber-700 border-amber-200', dotColor: 'bg-warning' },
  low: { labelKey: 'todos.priorityLow', color: 'bg-gray-100 text-gray-500 border-gray-200', dotColor: 'bg-muted-foreground' },
}

const STATUS_CONFIG: Record<TodoStatus, { labelKey: string; icon: typeof Circle; color: string }> = {
  todo: { labelKey: 'todos.statusTodo', icon: Circle, color: 'text-muted-foreground' },
  in_progress: { labelKey: 'todos.statusInProgress', icon: Clock, color: 'text-blue-500' },
  done: { labelKey: 'todos.statusDone', icon: CheckCircle2, color: 'text-emerald-500' },
}

const TEAM_CONFIG: Record<ProjectTeam, { labelKey: string; color: string }> = {
  management: { labelKey: 'dept.management', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  sales: { labelKey: 'dept.sales', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  marketing: { labelKey: 'dept.marketing', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  finance: { labelKey: 'dept.finance', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  service: { labelKey: 'dept.service', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

function getDaysUntilDue(dueDate?: string) {
  if (!dueDate) return null
  return daysFromTodayKST(dueDate)
}

function DueBadge({ dueDate }: { dueDate?: string }) {
  const t = useT()
  const days = getDaysUntilDue(dueDate)
  if (days === null) return null
  if (days < 0) return <Badge variant="destructive" className="text-[10px] px-1.5">D{days}</Badge>
  if (days === 0) return <Badge variant="destructive" className="text-[10px] px-1.5">{t('todos.dueTodayLabel')}</Badge>
  if (days === 1) return <Badge className="text-[10px] px-1.5 bg-warning text-foreground">{t('todos.dueTomorrowLabel')}</Badge>
  if (days <= 3) return <Badge variant="outline" className="text-[10px] px-1.5 text-warning border-warning">D-{days}</Badge>
  return <span className="text-xs text-muted-foreground">{dueDate?.slice(5)}</span>
}

function TeamBadge({ team }: { team?: ProjectTeam }) {
  const t = useT()
  if (!team) return null
  const cfg = TEAM_CONFIG[team]
  return (
    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-medium ${cfg.color}`}>
      {t(cfg.labelKey as any)}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: TodoPriority }) {
  const t = useT()
  const cfg = PRIORITY_CONFIG[priority]
  return (
    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-medium ${cfg.color}`}>
      {t(cfg.labelKey as any)}
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

// ──── Comments Section ────
function CommentsSection({ todoId }: { todoId: string }) {
  const { user } = useAuth()
  const { data: comments = [], isLoading } = useProjectComments(todoId)
  const createComment = useCreateComment()
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()
  const [newComment, setNewComment] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handleSubmit = () => {
    if (!newComment.trim() || !user) return
    createComment.mutate({ todoId, userId: user.id, content: newComment.trim() })
    setNewComment('')
  }

  const handleUpdate = (id: string) => {
    if (!editContent.trim()) return
    updateComment.mutate({ id, content: editContent.trim(), todoId })
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    deleteComment.mutate({ id, todoId })
  }

  const t = useT()

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        <MessageSquare className="size-3.5" /> {t('todos.comments')} ({comments.length})
      </Label>

      {/* Comments list */}
      <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="size-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">{t('todos.noComments')}</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="group flex gap-2 text-sm">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                {c.user?.name?.charAt(0) || '?'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{c.user?.name || t('todos.unknownUser')}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {c.userId === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted">
                        <MoreHorizontal className="size-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-24">
                        <DropdownMenuItem onClick={() => { setEditingId(c.id); setEditContent(c.content) }}>
                          <Pencil className="size-3 mr-1.5" /> {t('common.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="size-3 mr-1.5" /> {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {editingId === c.id ? (
                  <div className="flex gap-1 mt-1">
                    <Input
                      className="h-7 text-xs"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUpdate(c.id)}
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleUpdate(c.id)}>{t('common.save')}</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words">{c.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* New comment input */}
      <div className="flex gap-2">
        <Input
          className="text-sm"
          placeholder={t('todos.commentPlaceholder')}
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
        />
        <Button
          size="sm"
          className="shrink-0 gap-1"
          onClick={handleSubmit}
          disabled={!newComment.trim() || createComment.isPending}
        >
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ──── Project Form (shared for Create and Edit) ────
interface ProjectFormData {
  title: string
  description: string
  priority: TodoPriority
  dueDate: string
  team: string
  ownerId: string
  assignees: string[]
}

const EMPTY_FORM: ProjectFormData = {
  title: '', description: '', priority: 'medium', dueDate: '', team: '', ownerId: '', assignees: [],
}

function ProjectFormFields({
  form,
  setForm,
  profiles,
}: {
  form: ProjectFormData
  setForm: React.Dispatch<React.SetStateAction<ProjectFormData>>
  profiles: User[]
}) {
  const toggleAssignee = (uid: string) => {
    setForm(f => ({
      ...f,
      assignees: f.assignees.includes(uid)
        ? f.assignees.filter(a => a !== uid)
        : [...f.assignees, uid],
    }))
  }

  const t = useT()
  const ownerName = form.ownerId ? profiles.find(p => p.id === form.ownerId)?.name : null

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('todos.formTitle')}</Label>
        <Input
          placeholder={t('todos.formTitlePlaceholder')}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('todos.formDescription')}</Label>
        <Textarea
          placeholder={t('todos.formDescriptionPlaceholder')}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>{t('todos.formTeam')}</Label>
          <Select value={form.team || '_none'} onValueChange={v => setForm(f => ({ ...f, team: !v || v === '_none' ? '' : v }))}>
            <SelectTrigger>
              <SelectValue placeholder={t('todos.formTeamPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t('todos.formTeamNone')}</SelectItem>
              <SelectItem value="management">{t('dept.management')}</SelectItem>
              <SelectItem value="sales">{t('dept.sales')}</SelectItem>
              <SelectItem value="marketing">{t('dept.marketing')}</SelectItem>
              <SelectItem value="finance">{t('dept.finance')}</SelectItem>
              <SelectItem value="service">{t('dept.service')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('todos.formPriority')}</Label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as TodoPriority }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">{t('todos.priorityHigh')}</SelectItem>
              <SelectItem value="medium">{t('todos.priorityMedium')}</SelectItem>
              <SelectItem value="low">{t('todos.priorityLow')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('todos.formDueDate')}</Label>
          <Input
            type="date"
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
          />
        </div>
      </div>

      {/* Owner */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <UserIcon className="size-3.5" /> {t('todos.formOwner')}
        </Label>
        <Select value={form.ownerId || '_none'} onValueChange={v => setForm(f => ({ ...f, ownerId: !v || v === '_none' ? '' : v }))}>
          <SelectTrigger>
            {ownerName ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {ownerName.charAt(0)}
                </span>
                {ownerName}
              </span>
            ) : (
              <SelectValue placeholder={t('todos.formOwnerPlaceholder')} />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">{t('todos.formOwnerNone')}</SelectItem>
            {profiles.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.position ? `(${p.position})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assignees (multiple) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Users className="size-3.5" /> {t('todos.formAssignees')}
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
                    {TEAM_CONFIG[p.department as ProjectTeam] ? t(TEAM_CONFIG[p.department as ProjectTeam].labelKey as any) : p.department}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {form.assignees.length > 0 && (
          <p className="text-xs text-muted-foreground">{t('todos.formAssigneesCount', { n: form.assignees.length })}</p>
        )}
      </div>
    </div>
  )
}

// ──── Project Card ────
function ProjectCard({
  todo,
  profiles,
  onToggle,
  onClick,
}: {
  todo: Todo
  profiles: User[]
  onToggle: (id: string, status: TodoStatus) => void
  onClick: (todo: Todo) => void
}) {
  const t = useT()
  const isDone = todo.status === 'done'

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/30 cursor-pointer group ${isDone ? 'opacity-50' : ''}`}
      onClick={() => onClick(todo)}
    >
      {/* Status dropdown button */}
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="mt-0.5 shrink-0 focus:outline-none" title={t('common.status')}>
            {isDone ? (
              <CheckCircle2 className="size-5 text-emerald-500" />
            ) : todo.status === 'in_progress' ? (
              <Clock className="size-5 text-blue-500" />
            ) : (
              <Circle className="size-5 text-muted-foreground/40 hover:text-primary transition-colors" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            {(Object.entries(STATUS_CONFIG) as [TodoStatus, typeof STATUS_CONFIG.todo][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              const isActive = todo.status === key
              return (
                <DropdownMenuItem
                  key={key}
                  onClick={() => onToggle(todo.id, key)}
                  className={isActive ? 'bg-muted font-medium' : ''}
                >
                  <Icon className={`size-4 mr-2 ${cfg.color}`} />
                  {t(cfg.labelKey as any)}
                  {isActive && <span className="ml-auto text-[10px] text-muted-foreground">{t('todos.current')}</span>}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
            {todo.title}
          </span>
          <PriorityBadge priority={todo.priority} />
          <TeamBadge team={todo.team} />
        </div>
        {todo.description && (
          <p className="text-xs text-muted-foreground truncate">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <DueBadge dueDate={todo.dueDate} />
          {/* Owner */}
          {todo.ownerId && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserIcon className="size-3" />
              <PersonChip userId={todo.ownerId} profiles={profiles} />
            </span>
          )}
          {/* Assignees */}
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

      {/* Arrow indicator */}
      <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

// ──── Main Page ────
export function TodosPage() {
  const t = useT()
  const [tab, setTab] = useState('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [form, setForm] = useState<ProjectFormData>({ ...EMPTY_FORM })

  const { data: todos = [], isLoading } = useTodos()
  const { data: profiles = [] } = useProfiles()
  const updateStatus = useUpdateTodoStatus()
  const updateTodo = useUpdateTodo()
  const createTodo = useCreateTodo()
  const { user } = useAuth()

  const handleToggle = (id: string, status: TodoStatus) => {
    updateStatus.mutate({ id, status })
  }

  // ── Create ──
  const openCreate = () => {
    setForm({ ...EMPTY_FORM })
    setCreateOpen(true)
  }

  const handleCreate = () => {
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
      { onSuccess: () => { setCreateOpen(false); setForm({ ...EMPTY_FORM }) } },
    )
  }

  // ── Edit ──
  const openEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      description: todo.description || '',
      priority: todo.priority,
      dueDate: todo.dueDate || '',
      team: todo.team || '',
      ownerId: todo.ownerId || '',
      assignees: todo.assignees || [],
    })
    setEditingTodo(todo)
  }

  const handleEdit = () => {
    if (!editingTodo || !form.title.trim()) return
    updateTodo.mutate(
      {
        id: editingTodo.id,
        title: form.title,
        description: form.description || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        team: form.team ? (form.team as ProjectTeam) : null,
        ownerId: form.ownerId || null,
        assignees: form.assignees,
      },
      { onSuccess: () => { setEditingTodo(null); setForm({ ...EMPTY_FORM }) } },
    )
  }

  const filtered = useMemo(() => {
    let list = todos
    if (tab === 'in_progress') list = list.filter(t => t.status === 'in_progress' || t.status === 'todo')
    if (tab === 'done') list = list.filter(t => t.status === 'done')
    if (teamFilter !== 'all') list = list.filter(t => t.team === teamFilter)
    if (onlyMine && user) list = list.filter(t =>
      t.ownerId === user.id ||
      t.assignedTo === user.id ||
      (t.assignees && t.assignees.includes(user.id)) ||
      t.createdBy === user.id
    )
    return list
  }, [todos, tab, teamFilter, onlyMine, user])

  const todoCount = todos.filter(t => t.status === 'todo').length
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length
  const doneCount = todos.filter(t => t.status === 'done').length
  const overdueCount = todos.filter(t => t.status !== 'done' && getDaysUntilDue(t.dueDate) !== null && getDaysUntilDue(t.dueDate)! < 0).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('todos.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? t('common.loading') : (
              <>
                {t('todos.inProgressCount', { n: todoCount + inProgressCount })} · {t('todos.doneCount', { n: doneCount })}
                {overdueCount > 0 && <span className="text-destructive font-medium"> · {t('todos.delayedCount', { n: overdueCount })}</span>}
              </>
            )}
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" /> {t('todos.addProject')}
        </Button>
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('todos.addProjectTitle')}</DialogTitle>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} profiles={profiles} />
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={!form.title.trim() || createTodo.isPending}
          >
            {createTodo.isPending ? t('todos.adding') : t('common.add')}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editingTodo} onOpenChange={open => { if (!open) setEditingTodo(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('todos.editProjectTitle')}</DialogTitle>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} profiles={profiles} />

          {/* Status change in edit dialog */}
          {editingTodo && (
            <div className="space-y-2">
              <Label>{t('common.status')}</Label>
              <div className="flex gap-2">
                {(Object.entries(STATUS_CONFIG) as [TodoStatus, typeof STATUS_CONFIG.todo][]).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  const isActive = editingTodo.status === key
                  return (
                    <Button
                      key={key}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      className={`gap-1.5 ${isActive ? '' : 'text-muted-foreground'}`}
                      onClick={() => {
                        handleToggle(editingTodo.id, key)
                        setEditingTodo({ ...editingTodo, status: key })
                      }}
                    >
                      <Icon className={`size-3.5 ${isActive ? '' : cfg.color}`} />
                      {t(cfg.labelKey as any)}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Comments in edit dialog */}
          {editingTodo && <CommentsSection todoId={editingTodo.id} />}

          <Button
            className="w-full"
            onClick={handleEdit}
            disabled={!form.title.trim() || updateTodo.isPending}
          >
            {updateTodo.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogContent>
      </Dialog>


      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-destructive" />
            <div>
              <div className="text-lg font-bold">{todoCount}</div>
              <div className="text-xs text-muted-foreground">{t('todos.statusTodo')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{inProgressCount}</div>
              <div className="text-xs text-muted-foreground">{t('todos.statusInProgress')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-success" />
            <div>
              <div className="text-lg font-bold">{doneCount}</div>
              <div className="text-xs text-muted-foreground">{t('todos.statusDone')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertCircle className="size-5 text-warning" />
            <div>
              <div className="text-lg font-bold">{overdueCount}</div>
              <div className="text-xs text-muted-foreground">{t('todos.statusDelayed')}</div>
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
                <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
                <TabsTrigger value="in_progress">{t('todos.statusInProgress')}</TabsTrigger>
                <TabsTrigger value="done">{t('todos.statusDone')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOnlyMine(v => !v)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium transition-colors ${
                  onlyMine
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'border-input text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <UserIcon className="size-3" />
                {t('todos.onlyMine')}
              </button>
              <Select value={teamFilter} onValueChange={v => setTeamFilter(v || 'all')}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <Building2 className="size-3 mr-1" />
                  <SelectValue placeholder={t('todos.formTeam')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('todos.allTeams')}</SelectItem>
                  <SelectItem value="management">{t('dept.management')}</SelectItem>
                  <SelectItem value="sales">{t('dept.sales')}</SelectItem>
                  <SelectItem value="marketing">{t('dept.marketing')}</SelectItem>
                  <SelectItem value="finance">{t('dept.finance')}</SelectItem>
                  <SelectItem value="service">{t('dept.service')}</SelectItem>
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
              {t('todos.noProjects')}
            </div>
          ) : (
            filtered.map(todo => (
              <ProjectCard
                key={todo.id}
                todo={todo}
                profiles={profiles}
                onToggle={handleToggle}
                onClick={openEdit}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
