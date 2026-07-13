import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  Plus, Search, Loader2, AlertTriangle, Clock, CheckCircle2,
  Ban, Send, Calendar, Paperclip, MessageSquare,
  ChevronDown, ChevronUp, LayoutList, Columns3,
  ListTodo, Trash2, X, CircleDot,
  FolderKanban, Users, User as UserIcon, Circle, ChevronRight,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useTasks, useTask, useCreateTask, useUpdateTask, useDeleteTask,
  useTaskComments, useAddTaskComment,
  useTaskAttachments, useAddTaskAttachment, useDeleteTaskAttachment,
  useTaskStats,
  type TaskFilters,
} from '@/hooks/useTasks'
import { useTodos, useCreateTodo, useUpdateTodo, useUpdateTodoStatus, useDeleteTodo } from '@/hooks/useTodos'
import { useProjectComments, useCreateComment, useDeleteComment } from '@/hooks/useProjectComments'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import { useT } from '@/i18n/LanguageContext'
import type { Task, TaskStatus, TaskPriority, Todo, TodoStatus, TodoPriority, ProjectTeam, User } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────

const STATUS_ORDER: TaskStatus[] = ['requested', 'in_progress', 'completed', 'cancelled']

function usePriorityConfig() {
  const t = useT()
  return {
    urgent: { label: t('tasks.urgent'), className: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
    normal: { label: t('tasks.normal'), className: 'bg-blue-100 text-blue-700 border-blue-200', icon: CircleDot },
    low: { label: t('tasks.low'), className: 'bg-gray-100 text-gray-600 border-gray-200', icon: ChevronDown },
  }
}

function useStatusConfig() {
  const t = useT()
  return {
    requested: { label: t('tasks.requested'), className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Send },
    in_progress: { label: t('tasks.inProgress'), className: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
    completed: { label: t('tasks.completed'), className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    cancelled: { label: t('tasks.cancelled'), className: 'bg-gray-100 text-gray-500 border-gray-300', icon: Ban },
  }
}

const TODO_STATUS_CONFIG: Record<TodoStatus, { labelKey: string; icon: typeof Circle; color: string }> = {
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

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString()
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false
  if (task.status === 'completed' || task.status === 'cancelled') return false
  return task.dueDate < new Date().toISOString().slice(0, 10)
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

// ─── Task Card ──────────────────────────────────────────────────────────

function TaskCard({ task, onClick, highlighted = false, dimmed = false, highlightRing }: { task: Task; onClick: () => void; highlighted?: boolean; dimmed?: boolean; highlightRing?: string }) {
  const t = useT()
  const priorityCfg = usePriorityConfig()
  const statusCfg = useStatusConfig()
  const pCfg = priorityCfg[task.priority]
  const sCfg = statusCfg[task.status]
  const PIcon = pCfg.icon
  const overdue = isOverdue(task)

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border-l-[3px] ${
        overdue ? 'border-l-red-500 bg-red-50/30' :
        task.priority === 'urgent' ? 'border-l-red-400' :
        task.status === 'completed' ? 'border-l-emerald-400 opacity-75' :
        task.status === 'in_progress' ? 'border-l-blue-400' :
        'border-l-amber-400'
      } ${highlighted ? `ring-2 ring-offset-1 ${highlightRing || 'ring-blue-400'} shadow-md !opacity-100` : ''} ${dimmed ? 'opacity-40' : ''}`}
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-[10px] h-4 ${pCfg.className}`}>
                <PIcon className="size-2.5 mr-0.5" />{pCfg.label}
              </Badge>
              <Badge variant="outline" className={`text-[10px] h-4 ${sCfg.className}`}>
                {sCfg.label}
              </Badge>
              {overdue && (
                <Badge variant="outline" className="text-[10px] h-4 bg-red-100 text-red-700 border-red-300">
                  {t('tasks.overdue')}
                </Badge>
              )}
            </div>
            <h3 className={`text-sm font-medium truncate ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </h3>
          </div>
          {task.assignee && (
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-[10px] bg-blue-50 text-blue-600">
                {task.assignee.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
          <span>{task.requester?.name} → {task.assignee?.name || t('tasks.unassigned')}</span>
          {task.dueDate && (
            <span className={`flex items-center gap-0.5 ${overdue ? 'text-red-500 font-medium' : ''}`}>
              <Calendar className="size-3" />{task.dueDate}
            </span>
          )}
          {(task.commentCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="size-3" />{task.commentCount}
            </span>
          )}
          {(task.attachmentCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="size-3" />{task.attachmentCount}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Task Detail Dialog ─────────────────────────────────────────────────

function TaskDetailDialog({
  taskId,
  open,
  onClose,
}: {
  taskId: string | null
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const statusCfg = useStatusConfig()
  const priorityLabels = { urgent: t('tasks.urgent'), normal: t('tasks.normal'), low: t('tasks.low') }
  const { data: task, isLoading } = useTask(taskId || undefined)
  const { data: comments = [] } = useTaskComments(taskId || undefined)
  const { data: attachments = [] } = useTaskAttachments(taskId || undefined)
  const { data: profiles = [] } = useProfiles()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const addComment = useAddTaskComment()
  const addAttachment = useAddTaskAttachment()
  const deleteAttachment = useDeleteTaskAttachment()
  const createSubTask = useCreateTask()

  const [commentText, setCommentText] = useState('')
  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskAssignee, setSubtaskAssignee] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleStatusChange = useCallback((newStatus: string | null) => {
    if (!taskId || !newStatus) return
    updateTask.mutate({ id: taskId, status: newStatus as TaskStatus })
  }, [taskId, updateTask])

  const handleAssigneeChange = useCallback((newAssignee: string | null) => {
    if (!taskId) return
    updateTask.mutate({ id: taskId, assigneeId: newAssignee || undefined })
  }, [taskId, updateTask])

  const handlePriorityChange = useCallback((newPriority: string | null) => {
    if (!taskId || !newPriority) return
    updateTask.mutate({ id: taskId, priority: newPriority as TaskPriority })
  }, [taskId, updateTask])

  const handleSubmitComment = useCallback(() => {
    if (!taskId || !user || !commentText.trim()) return
    addComment.mutate({ taskId, authorId: user.id, content: commentText.trim() })
    setCommentText('')
  }, [taskId, user, commentText, addComment])

  const handleAddSubtask = useCallback(() => {
    if (!taskId || !user || !subtaskTitle.trim()) return
    createSubTask.mutate({
      title: subtaskTitle.trim(),
      priority: 'normal',
      requesterId: user.id,
      assigneeId: subtaskAssignee || undefined,
      parentTaskId: taskId,
    }, {
      onSuccess: () => {
        setSubtaskTitle('')
        setSubtaskAssignee('')
        setShowSubtaskForm(false)
      },
    })
  }, [taskId, user, subtaskTitle, subtaskAssignee, createSubTask])

  const handleDelete = useCallback(() => {
    if (!taskId) return
    deleteTask.mutate(taskId, { onSuccess: () => onClose() })
  }, [taskId, deleteTask, onClose])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!taskId || !user || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const fileUrl = URL.createObjectURL(file)
    addAttachment.mutate({
      taskId,
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      uploadedBy: user.id,
    })
  }, [taskId, user, addAttachment])

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" showCloseButton={false}>
        <button
          type="button"
          className="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors z-10"
          onClick={onClose}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </button>
        {isLoading || !task ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg pr-6">{task.title}</DialogTitle>
              {task.description && (
                <DialogDescription className="whitespace-pre-wrap">{task.description}</DialogDescription>
              )}
            </DialogHeader>

            {/* Meta row */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('common.status')}</Label>
                <Select value={task.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <span className={`flex items-center gap-1.5 ${statusCfg[task.status]?.className || ''}`}>
                      {statusCfg[task.status]?.label || task.status}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(s => (
                      <SelectItem key={s} value={s}>{statusCfg[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('tasks.assignee')}</Label>
                <Select value={task.assigneeId || '_none'} onValueChange={v => handleAssigneeChange(v === '_none' ? null : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <span>{task.assignee?.name || profiles.find(p => p.id === task.assigneeId)?.name || t('tasks.unassigned')}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('tasks.unassigned')}</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('tasks.priority')}</Label>
                <Select value={task.priority} onValueChange={handlePriorityChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <span>{priorityLabels[task.priority] || task.priority}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">{t('tasks.urgent')}</SelectItem>
                    <SelectItem value="normal">{t('tasks.normal')}</SelectItem>
                    <SelectItem value="low">{t('tasks.low')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{t('tasks.requester')}: {task.requester?.name || '-'}</div>
              {task.dueDate && <div>{t('tasks.dueDate')}: {task.dueDate}</div>}
              <div>{t('tasks.createdAt')}: {formatRelativeTime(task.createdAt)}</div>
            </div>

            {/* Subtasks */}
            {(task.subtasks && task.subtasks.length > 0) && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <ListTodo className="size-3.5" /> {t('tasks.subtasks')} ({task.subtasks.length})
                </Label>
                <div className="space-y-1">
                  {task.subtasks.map(st => {
                    const isDone = st.status === 'completed'
                    return (
                      <div key={st.id} className="flex items-center gap-2 text-sm pl-2">
                        <span className={`size-4 rounded-full border flex items-center justify-center text-[9px] ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'}`}>
                          {isDone && '✓'}
                        </span>
                        <span className={isDone ? 'line-through text-muted-foreground' : ''}>{st.title}</span>
                        {st.assignee && <span className="text-xs text-muted-foreground ml-auto">{st.assignee.name}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Add subtask */}
            {showSubtaskForm ? (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input className="h-8 text-sm" placeholder={t('tasks.subtaskPlaceholder')} value={subtaskTitle}
                    onChange={e => setSubtaskTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                  />
                </div>
                <Select value={subtaskAssignee || '_none'} onValueChange={v => setSubtaskAssignee(!v || v === '_none' ? '' : v)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <span className="truncate">{subtaskAssignee ? (profiles.find(p => p.id === subtaskAssignee)?.name || t('tasks.assignee')) : t('tasks.assignee')}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('tasks.unassigned')}</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" onClick={handleAddSubtask} disabled={!subtaskTitle.trim()}>
                  <Plus className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowSubtaskForm(false)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="w-fit text-xs gap-1" onClick={() => setShowSubtaskForm(true)}>
                <Plus className="size-3" /> {t('tasks.addSubtask')}
              </Button>
            )}

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Paperclip className="size-3.5" /> {t('tasks.attachments')} ({attachments.length})
                </Label>
                <label className="cursor-pointer text-xs text-blue-600 hover:underline">
                  + {t('tasks.addAttachment')}
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                      <span className="truncate">{a.fileName}</span>
                      <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => deleteAttachment.mutate({ id: a.id, taskId: task.id })}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <MessageSquare className="size-3.5" /> {t('tasks.comments')} ({comments.length})
              </Label>
              {comments.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-blue-50 text-blue-600">
                          {c.author?.name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{c.author?.name}</span>
                          <span className="text-muted-foreground">{formatRelativeTime(c.createdAt)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap mt-0.5">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  className="flex-1 min-h-[60px] text-sm"
                  placeholder={t('tasks.commentPlaceholder')}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitComment()
                  }}
                />
                <Button
                  className="self-end"
                  size="sm"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || addComment.isPending}
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Delete */}
            <div className="flex justify-end pt-2 border-t">
              {!deleteConfirm ? (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 className="size-3" /> {t('tasks.deleteTask')}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">{t('tasks.deleteConfirm')}</span>
                  <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete}>
                    {t('common.delete')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Project Comments Section ───────────────────────────────────────────

function ProjectCommentsSection({ todoId }: { todoId: string }) {
  const { user } = useAuth()
  const t = useT()
  const { data: comments = [], isLoading } = useProjectComments(todoId)
  const createComment = useCreateComment()
  const deleteComment = useDeleteComment()
  const [newComment, setNewComment] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handleSubmit = () => {
    if (!newComment.trim() || !user) return
    createComment.mutate({ todoId, userId: user.id, content: newComment.trim() })
    setNewComment('')
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <MessageSquare className="size-3.5" /> {t('todos.comments')} ({comments.length})
      </Label>
      <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
        {isLoading ? (
          <div className="text-center py-3"><Loader2 className="size-4 animate-spin mx-auto text-muted-foreground" /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">{t('todos.noComments')}</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="group flex gap-2 text-sm">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                {c.user?.name?.charAt(0) || '?'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{c.user?.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {c.userId === user?.id && (
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteComment.mutate({ id: c.id, todoId })}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
                <p className="text-xs whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <Input
          className="text-sm h-8"
          placeholder={t('todos.commentPlaceholder')}
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
        />
        <Button size="sm" className="h-8 shrink-0" onClick={handleSubmit} disabled={!newComment.trim() || createComment.isPending}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Project Form Fields ────────────────────────────────────────────────

interface ProjectFormData {
  title: string
  description: string
  priority: TodoPriority
  dueDate: string
  team: string
  ownerId: string
  assignees: string[]
}

const EMPTY_PROJECT_FORM: ProjectFormData = {
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
  const t = useT()
  const ownerName = form.ownerId ? profiles.find(p => p.id === form.ownerId)?.name : null

  const toggleAssignee = (uid: string) => {
    setForm(f => ({
      ...f,
      assignees: f.assignees.includes(uid)
        ? f.assignees.filter(a => a !== uid)
        : [...f.assignees, uid],
    }))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('todos.formTitle')}</Label>
        <Input placeholder={t('todos.formTitlePlaceholder')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>{t('todos.formDescription')}</Label>
        <Textarea placeholder={t('todos.formDescriptionPlaceholder')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>{t('todos.formTeam')}</Label>
          <Select value={form.team || '_none'} onValueChange={v => setForm(f => ({ ...f, team: !v || v === '_none' ? '' : v }))}>
            <SelectTrigger><SelectValue placeholder={t('todos.formTeamPlaceholder')} /></SelectTrigger>
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
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">{t('todos.priorityHigh')}</SelectItem>
              <SelectItem value="medium">{t('todos.priorityMedium')}</SelectItem>
              <SelectItem value="low">{t('todos.priorityLow')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('todos.formDueDate')}</Label>
          <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </div>
      </div>

      {/* Owner (책임자) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><UserIcon className="size-3.5" /> {t('todos.formOwner')}</Label>
        <Select value={form.ownerId || '_none'} onValueChange={v => setForm(f => ({ ...f, ownerId: !v || v === '_none' ? '' : v }))}>
          <SelectTrigger>
            {ownerName ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">{ownerName.charAt(0)}</span>
                {ownerName}
              </span>
            ) : (
              <SelectValue placeholder={t('todos.formOwnerPlaceholder')} />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">{t('todos.formOwnerNone')}</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.position ? `(${p.position})` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Assignees (담당자 - 복수) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Users className="size-3.5" /> {t('todos.formAssignees')}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">{t('projects.autoTaskHint')}</span>
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

// ─── Project Section ────────────────────────────────────────────────────

function ProjectSection({ profiles }: { profiles: User[] }) {
  const t = useT()
  const { user } = useAuth()
  const { data: todos = [], isLoading: todosLoading } = useTodos()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()
  const updateStatus = useUpdateTodoStatus()
  const createTask = useCreateTask()

  const [expanded, setExpanded] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [form, setForm] = useState<ProjectFormData>({ ...EMPTY_PROJECT_FORM })

  // Active projects (not done)
  const activeProjects = useMemo(() => todos.filter(t => t.status !== 'done'), [todos])


  const openCreate = () => {
    setForm({ ...EMPTY_PROJECT_FORM })
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
      {
        onSuccess: () => {
          // Auto-create tasks for owner + assignees (deduplicated)
          const allRecipients = new Set<string>()
          if (form.ownerId) allRecipients.add(form.ownerId)
          for (const a of form.assignees) allRecipients.add(a)

          const taskPriority = form.priority === 'high' ? 'urgent' : form.priority === 'low' ? 'low' : 'normal' as TaskPriority
          for (const recipientId of allRecipients) {
            createTask.mutate({
              title: form.title,
              description: form.description || undefined,
              priority: taskPriority,
              requesterId: user.id,
              assigneeId: recipientId,
              department: form.team || undefined,
              dueDate: form.dueDate || undefined,
            }, {
              onSuccess: (created) => {
                if (recipientId !== user.id) {
                  createNotificationsForUsers([recipientId], {
                    type: 'task_assigned',
                    title: '새 프로젝트 업무 요청',
                    message: `${user.name}님이 프로젝트 "${form.title}"의 업무를 요청했습니다.`,
                    link: `/tasks?open=${created.id}`,
                    metadata: { taskId: created.id },
                  }).catch(() => {})
                }
              },
            })
          }
          setCreateOpen(false)
          setForm({ ...EMPTY_PROJECT_FORM })
        },
      },
    )
  }

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
    if (!editingTodo || !form.title.trim() || !user) return
    // Detect newly added people (owner + assignees combined)
    const prevAll = new Set<string>()
    if (editingTodo.ownerId) prevAll.add(editingTodo.ownerId)
    for (const a of (editingTodo.assignees || [])) prevAll.add(a)

    const newAll = new Set<string>()
    if (form.ownerId) newAll.add(form.ownerId)
    for (const a of form.assignees) newAll.add(a)

    const newRecipients = [...newAll].filter(id => !prevAll.has(id))

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
      {
        onSuccess: () => {
          // Auto-create tasks for NEWLY added owner/assignees
          const taskPriority = form.priority === 'high' ? 'urgent' : form.priority === 'low' ? 'low' : 'normal' as TaskPriority
          for (const recipientId of newRecipients) {
            createTask.mutate({
              title: form.title,
              description: form.description || undefined,
              priority: taskPriority,
              requesterId: user.id,
              assigneeId: recipientId,
              department: form.team || undefined,
              dueDate: form.dueDate || undefined,
            }, {
              onSuccess: (created) => {
                if (recipientId !== user.id) {
                  createNotificationsForUsers([recipientId], {
                    type: 'task_assigned',
                    title: '새 프로젝트 업무 요청',
                    message: `${user.name}님이 프로젝트 "${form.title}"의 업무를 요청했습니다.`,
                    link: `/tasks?open=${created.id}`,
                    metadata: { taskId: created.id },
                  }).catch(() => {})
                }
              },
            })
          }
          setEditingTodo(null)
          setForm({ ...EMPTY_PROJECT_FORM })
        },
      },
    )
  }

  const handleDeleteProject = () => {
    if (!editingTodo) return
    deleteTodo.mutate(editingTodo.id, {
      onSuccess: () => {
        setEditingTodo(null)
        setForm({ ...EMPTY_PROJECT_FORM })
      },
    })
  }

  const handleToggleStatus = (id: string, status: TodoStatus) => {
    updateStatus.mutate({ id, status })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-lg font-bold hover:text-primary transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <FolderKanban className="size-5 text-purple-500" />
          {t('projects.title')}
          <Badge variant="secondary" className="text-xs">{activeProjects.length}</Badge>
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreate}>
          <Plus className="size-3.5" /> {t('projects.addProject')}
        </Button>
      </div>

      {/* Project list */}
      {expanded && (
        <Card>
          <CardContent className="p-3">
            {todosLoading ? (
              <div className="py-6 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : activeProjects.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('projects.noProjects')}</div>
            ) : (
              <div className="space-y-1">
                {activeProjects.map(todo => {
                  const isDone = todo.status === 'done'
                  const statusCfg = TODO_STATUS_CONFIG[todo.status]
                  const StatusIcon = statusCfg.icon
                  return (
                    <div
                      key={todo.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors hover:bg-muted/30 cursor-pointer group ${isDone ? 'opacity-50' : ''}`}
                      onClick={() => openEdit(todo)}
                    >
                      {/* Status icon */}
                      <div onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="shrink-0 focus:outline-none">
                            <StatusIcon className={`size-5 ${statusCfg.color}`} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-32">
                            {(Object.entries(TODO_STATUS_CONFIG) as [TodoStatus, typeof TODO_STATUS_CONFIG.todo][]).map(([key, cfg]) => {
                              const Icon = cfg.icon
                              return (
                                <DropdownMenuItem key={key} onClick={() => handleToggleStatus(todo.id, key)} className={todo.status === key ? 'bg-muted font-medium' : ''}>
                                  <Icon className={`size-4 mr-2 ${cfg.color}`} />
                                  {t(cfg.labelKey as any)}
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{todo.title}</span>
                          {todo.team && TEAM_CONFIG[todo.team] && (
                            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${TEAM_CONFIG[todo.team].color}`}>
                              {t(TEAM_CONFIG[todo.team].labelKey as any)}
                            </Badge>
                          )}
                          {todo.dueDate && (
                            <span className="text-[10px] text-muted-foreground">{todo.dueDate.slice(5)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {todo.ownerId && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <UserIcon className="size-3" />
                              <PersonChip userId={todo.ownerId} profiles={profiles} />
                            </span>
                          )}
                          {todo.assignees && todo.assignees.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Users className="size-3" />
                              {todo.assignees.slice(0, 3).map(uid => (
                                <PersonChip key={uid} userId={uid} profiles={profiles} />
                              ))}
                              {todo.assignees.length > 3 && <span className="text-[10px]">+{todo.assignees.length - 3}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('projects.addProjectTitle')}</DialogTitle>
            <DialogDescription>{t('projects.addProjectDesc')}</DialogDescription>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} profiles={profiles} />
          <Button className="w-full" onClick={handleCreate} disabled={!form.title.trim() || createTodo.isPending}>
            {createTodo.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />}
            {t('projects.addProject')}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={!!editingTodo} onOpenChange={open => { if (!open) setEditingTodo(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('projects.editProjectTitle')}</DialogTitle>
          </DialogHeader>
          <ProjectFormFields form={form} setForm={setForm} profiles={profiles} />

          {/* Status change */}
          {editingTodo && (
            <div className="space-y-2">
              <Label>{t('common.status')}</Label>
              <div className="flex gap-2">
                {(Object.entries(TODO_STATUS_CONFIG) as [TodoStatus, typeof TODO_STATUS_CONFIG.todo][]).map(([key, cfg]) => {
                  const Icon = cfg.icon
                  const isActive = editingTodo.status === key
                  return (
                    <Button
                      key={key}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      className={`gap-1.5 ${isActive ? '' : 'text-muted-foreground'}`}
                      onClick={() => {
                        handleToggleStatus(editingTodo.id, key)
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

          {/* Comments */}
          {editingTodo && <ProjectCommentsSection todoId={editingTodo.id} />}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={handleDeleteProject}
              disabled={deleteTodo.isPending}
            >
              <Trash2 className="size-3.5" />
              {deleteTodo.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
            <Button className="flex-1" onClick={handleEdit} disabled={!form.title.trim() || updateTodo.isPending}>
              {updateTodo.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────

type ViewMode = 'list' | 'board'

export function TaskBoardPage() {
  const t = useT()
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const statusCfg = useStatusConfig()

  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [filters, setFilters] = useState<TaskFilters>({ status: 'all', priority: 'all', parentOnly: true })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  // 요약 카드 클릭 시 해당 업무 하이라이트
  const [highlight, setHighlight] = useState<null | 'assigned' | 'requested' | 'overdue' | 'completed'>(null)
  const toggleHighlight = (k: 'assigned' | 'requested' | 'overdue' | 'completed') => setHighlight(h => (h === k ? null : k))
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'normal' as TaskPriority,
    assigneeId: '', department: '', dueDate: '',
  })

  const { data: tasks = [], isLoading } = useTasks({ ...filters, search: searchQuery || undefined })
  const { data: stats } = useTaskStats(user?.id)
  const createTask = useCreateTask()

  // Check URL for ?open= param
  const urlParams = new URLSearchParams(window.location.search)
  const openFromUrl = urlParams.get('open')
  if (openFromUrl && !selectedTaskId) {
    setSelectedTaskId(openFromUrl)
  }

  // Board view: group by status
  const boardColumns = useMemo(() => {
    const cols: Record<TaskStatus, Task[]> = {
      requested: [], in_progress: [], completed: [], cancelled: [],
    }
    for (const task of tasks) {
      cols[task.status]?.push(task)
    }
    return cols
  }, [tasks])

  // 하이라이트 매칭 (요약 카드의 카운트 의미와 일치)
  const isHighlighted = useCallback((task: Task) => {
    switch (highlight) {
      case 'assigned': return task.assigneeId === user?.id && task.status !== 'completed' && task.status !== 'cancelled'
      case 'requested': return task.requesterId === user?.id && task.status !== 'completed' && task.status !== 'cancelled'
      case 'overdue': return isOverdue(task)
      case 'completed': return task.status === 'completed' && (task.assigneeId === user?.id || task.requesterId === user?.id)
      default: return false
    }
  }, [highlight, user?.id])
  const HIGHLIGHT_RING: Record<string, string> = { assigned: 'ring-amber-400', requested: 'ring-blue-500', overdue: 'ring-red-500', completed: 'ring-emerald-500' }
  const highlightRing = highlight ? HIGHLIGHT_RING[highlight] : undefined

  const handleCreate = useCallback(() => {
    if (!user || !newTask.title.trim()) return
    createTask.mutate({
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      priority: newTask.priority,
      requesterId: user.id,
      assigneeId: newTask.assigneeId || undefined,
      department: newTask.department || undefined,
      dueDate: newTask.dueDate || undefined,
    }, {
      onSuccess: (created) => {
        setCreateDialogOpen(false)
        setNewTask({ title: '', description: '', priority: 'normal', assigneeId: '', department: '', dueDate: '' })
        // Notify assignee
        if (created.assigneeId && created.assigneeId !== user.id) {
          createNotificationsForUsers([created.assigneeId], {
            type: 'task_assigned',
            title: '새 업무 요청',
            message: `${user.name}님이 "${created.title}" 업무를 요청했습니다.`,
            link: `/tasks?open=${created.id}`,
            metadata: { taskId: created.id },
          }).catch(() => {})
        }
      },
    })
  }, [user, newTask, createTask])

  return (
    <div className="space-y-6">
      {/* ═══ Task Section ═══ */}
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('tasks.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('tasks.description')}</p>
          </div>
          <Button className="gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" /> {t('tasks.createTask')}
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <>
          <div className="grid grid-cols-4 gap-3">
            <Card onClick={() => toggleHighlight('assigned')}
              className={`border-l-[3px] border-l-amber-400 cursor-pointer transition-all hover:shadow-md ${highlight === 'assigned' ? 'ring-2 ring-amber-400' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="text-xs text-muted-foreground">{t('tasks.myAssigned')}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold">{stats.assigned.total - stats.assigned.completed}</span>
                  <span className="text-xs text-muted-foreground">{t('tasks.pending')}</span>
                </div>
              </CardContent>
            </Card>
            <Card onClick={() => toggleHighlight('requested')}
              className={`border-l-[3px] border-l-blue-400 cursor-pointer transition-all hover:shadow-md ${highlight === 'requested' ? 'ring-2 ring-blue-500' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="text-xs text-muted-foreground">{t('tasks.myRequested')}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold">{stats.requested.total - stats.requested.completed}</span>
                  <span className="text-xs text-muted-foreground">{t('tasks.inProgressLabel')}</span>
                </div>
              </CardContent>
            </Card>
            <Card onClick={() => toggleHighlight('overdue')}
              className={`border-l-[3px] border-l-red-400 cursor-pointer transition-all hover:shadow-md ${highlight === 'overdue' ? 'ring-2 ring-red-500' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="text-xs text-muted-foreground">{t('tasks.overdueLabel')}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-red-500">{stats.overdue}</span>
                  <span className="text-xs text-muted-foreground">{t('tasks.tasks')}</span>
                </div>
              </CardContent>
            </Card>
            <Card onClick={() => toggleHighlight('completed')}
              className={`border-l-[3px] border-l-emerald-400 cursor-pointer transition-all hover:shadow-md ${highlight === 'completed' ? 'ring-2 ring-emerald-500' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="text-xs text-muted-foreground">{t('tasks.completedLabel')}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-emerald-600">{stats.assigned.completed + stats.requested.completed}</span>
                  <span className="text-xs text-muted-foreground">{t('tasks.total')}</span>
                </div>
              </CardContent>
            </Card>
          </div>
          {highlight && (
            <p className="text-xs text-muted-foreground -mt-1">
              {highlight === 'assigned' ? t('tasks.myAssigned') : highlight === 'requested' ? t('tasks.myRequested') : highlight === 'overdue' ? t('tasks.overdueLabel') : t('tasks.completedLabel')} 업무를 강조 표시 중입니다. 카드를 다시 누르면 해제됩니다.
            </p>
          )}
          </>
        )}

        {/* Filters & Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              className="pl-9 h-9"
              placeholder={t('tasks.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: (v || 'all') as TaskStatus | 'all' }))}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tasks.allStatus')}</SelectItem>
              {STATUS_ORDER.map(s => (
                <SelectItem key={s} value={s}>{statusCfg[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.priority || 'all'} onValueChange={v => setFilters(f => ({ ...f, priority: (v || 'all') as TaskPriority | 'all' }))}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tasks.allPriority')}</SelectItem>
              <SelectItem value="urgent">{t('tasks.urgent')}</SelectItem>
              <SelectItem value="normal">{t('tasks.normal')}</SelectItem>
              <SelectItem value="low">{t('tasks.low')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.assigneeId || 'all'} onValueChange={v => setFilters(f => ({ ...f, assigneeId: v === 'all' || !v ? undefined : v }))}>
            <SelectTrigger className="w-32 h-9">
              <span className="truncate">{filters.assigneeId ? (filters.assigneeId === user?.id ? t('tasks.myTasks') : profiles.find(p => p.id === filters.assigneeId)?.name || t('tasks.allMembers')) : t('tasks.allMembers')}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tasks.allMembers')}</SelectItem>
              {user && <SelectItem value={user.id}>{t('tasks.myTasks')}</SelectItem>}
              {profiles.filter(p => p.id !== user?.id).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('board')}
            >
              <Columns3 className="size-3.5 inline mr-1" />{t('tasks.boardView')}
            </button>
            <button
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setViewMode('list')}
            >
              <LayoutList className="size-3.5 inline mr-1" />{t('tasks.listView')}
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : viewMode === 'board' ? (
          /* Board View */
          <div className="grid grid-cols-4 gap-4">
            {STATUS_ORDER.filter(s => s !== 'cancelled').map(status => {
              const col = boardColumns[status]
              const scfg = statusCfg[status]
              const SIcon = scfg.icon
              return (
                <div key={status} className="space-y-2">
                  <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${scfg.className}`}>
                    <SIcon className="size-3.5" />
                    <span className="text-xs font-semibold">{scfg.label}</span>
                    <span className="text-xs opacity-70">({col.length})</span>
                  </div>
                  <div className="space-y-2 min-h-[200px]">
                    {col.map(task => (
                      <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)}
                        highlighted={isHighlighted(task)} dimmed={!!highlight && !isHighlighted(task)} highlightRing={highlightRing} />
                    ))}
                    {col.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-8">
                        {t('tasks.emptyColumn')}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  {t('tasks.noTasks')}
                </CardContent>
              </Card>
            ) : (
              tasks.map(task => (
                <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)}
                  highlighted={isHighlighted(task)} dimmed={!!highlight && !isHighlighted(task)} highlightRing={highlightRing} />
              ))
            )}
          </div>
        )}
      </div>

      {/* ═══ Project Section ═══ */}
      <ProjectSection profiles={profiles} />

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />

      {/* Create Task Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tasks.createTask')}</DialogTitle>
            <DialogDescription>{t('tasks.createDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('tasks.taskTitle')} <span className="text-destructive">*</span></Label>
              <Input
                value={newTask.title}
                onChange={e => setNewTask(f => ({ ...f, title: e.target.value }))}
                placeholder={t('tasks.titlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('tasks.taskDescription')}</Label>
              <Textarea
                value={newTask.description}
                onChange={e => setNewTask(f => ({ ...f, description: e.target.value }))}
                placeholder={t('tasks.descPlaceholder')}
                className="min-h-[80px] max-h-[200px] overflow-y-auto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('tasks.assignee')}</Label>
                <Select value={newTask.assigneeId} onValueChange={v => setNewTask(f => ({ ...f, assigneeId: v || '' }))}>
                  <SelectTrigger className="h-9">
                    <span className="truncate">{newTask.assigneeId ? (profiles.find(p => p.id === newTask.assigneeId)?.name || t('tasks.selectAssignee')) : t('tasks.selectAssignee')}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('tasks.priority')}</Label>
                <Select value={newTask.priority} onValueChange={v => setNewTask(f => ({ ...f, priority: (v || 'normal') as TaskPriority }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">🔴 {t('tasks.urgent')}</SelectItem>
                    <SelectItem value="normal">🔵 {t('tasks.normal')}</SelectItem>
                    <SelectItem value="low">⚪ {t('tasks.low')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('tasks.dueDate')}</Label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={e => setNewTask(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('tasks.department')}</Label>
                <Select value={newTask.department} onValueChange={v => setNewTask(f => ({ ...f, department: v || '' }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('tasks.selectDept')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="management">Management</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!newTask.title.trim() || createTask.isPending}>
              {createTask.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
              {t('tasks.createTask')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
