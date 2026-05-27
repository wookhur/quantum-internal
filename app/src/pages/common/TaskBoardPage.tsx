import { useState, useCallback, useMemo } from 'react'
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
  ChevronDown, LayoutList, Columns3,
  ListTodo, Trash2, X, CircleDot,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useTasks, useTask, useCreateTask, useUpdateTask, useDeleteTask,
  useTaskComments, useAddTaskComment,
  useTaskAttachments, useAddTaskAttachment, useDeleteTaskAttachment,
  useTaskStats,
  type TaskFilters,
} from '@/hooks/useTasks'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import { useT } from '@/i18n/LanguageContext'
import type { Task, TaskStatus, TaskPriority } from '@/types'

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

// ─── Task Card ──────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
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
      }`}
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
  const priorityCfg = usePriorityConfig()
  const statusCfg = useStatusConfig()
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
    // Notify requester when task is completed
    if (newStatus === 'completed' && task && user) {
      createNotificationsForUsers([task.requesterId], {
        type: 'task_completed',
        title: '업무 완료',
        message: `"${task.title}" 업무가 완료되었습니다.`,
        link: `/tasks?open=${taskId}`,
        metadata: { taskId },
      }).catch(() => {})
    }
  }, [taskId, task, user, updateTask])

  const handleSubmitComment = useCallback(() => {
    if (!taskId || !user || !commentText.trim()) return
    addComment.mutate({
      taskId,
      authorId: user.id,
      content: commentText.trim(),
    }, {
      onSuccess: () => {
        setCommentText('')
        // Notify relevant parties
        if (task) {
          const recipients = [task.requesterId, task.assigneeId].filter(Boolean).filter(id => id !== user.id) as string[]
          if (recipients.length > 0) {
            createNotificationsForUsers(recipients, {
              type: 'task_comment',
              title: '업무 댓글',
              message: `${user.name}: "${commentText.trim().slice(0, 60)}"`,
              link: `/tasks?open=${taskId}`,
              metadata: { taskId },
            }).catch(() => {})
          }
        }
      },
    })
  }, [taskId, user, commentText, task, addComment])

  const handleAddSubtask = useCallback(() => {
    if (!taskId || !user || !subtaskTitle.trim()) return
    createSubTask.mutate({
      title: subtaskTitle.trim(),
      requesterId: user.id,
      assigneeId: subtaskAssignee || undefined,
      parentTaskId: taskId,
      priority: 'normal',
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
    deleteTask.mutate(taskId, { onSuccess: () => { setDeleteConfirm(false); onClose() } })
  }, [taskId, deleteTask, onClose])

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !task ? (
          <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={`text-[10px] h-4 ${priorityCfg[task.priority].className}`}>
                  {priorityCfg[task.priority].label}
                </Badge>
                {isOverdue(task) && (
                  <Badge variant="outline" className="text-[10px] h-4 bg-red-100 text-red-700 border-red-300">
                    {t('tasks.overdue')}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg">{task.title}</DialogTitle>
              {task.description && (
                <DialogDescription className="text-sm whitespace-pre-wrap mt-1">
                  {task.description}
                </DialogDescription>
              )}
            </DialogHeader>

            {/* Meta Grid */}
            <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.status')}</span>
                <Select value={task.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(s => (
                      <SelectItem key={s} value={s}>
                        <span className="flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${
                            s === 'requested' ? 'bg-amber-500' :
                            s === 'in_progress' ? 'bg-blue-500' :
                            s === 'completed' ? 'bg-emerald-500' : 'bg-gray-400'
                          }`} />
                          {statusCfg[s].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.priority')}</span>
                <Select value={task.priority} onValueChange={v => v && updateTask.mutate({ id: task.id, priority: v as TaskPriority })}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">{t('tasks.urgent')}</SelectItem>
                    <SelectItem value="normal">{t('tasks.normal')}</SelectItem>
                    <SelectItem value="low">{t('tasks.low')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.requester')}</span>
                <p className="mt-1 font-medium">{task.requester?.name || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.assignee')}</span>
                <Select
                  value={task.assigneeId || '__none__'}
                  onValueChange={v => updateTask.mutate({ id: task.id, assigneeId: v === '__none__' ? '' : (v || '') })}
                >
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('tasks.unassigned')}</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.dueDate')}</span>
                <Input
                  type="date"
                  className="h-8 mt-1"
                  value={task.dueDate || ''}
                  onChange={e => updateTask.mutate({ id: task.id, dueDate: e.target.value })}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('tasks.createdAt')}</span>
                <p className="mt-1 text-muted-foreground text-xs">{formatRelativeTime(task.createdAt)}</p>
              </div>
            </div>

            {/* Subtasks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <ListTodo className="size-4" /> {t('tasks.subtasks')} ({task.subtasks?.length || 0})
                </h4>
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  onClick={() => setShowSubtaskForm(!showSubtaskForm)}
                >
                  + {t('tasks.addSubtask')}
                </button>
              </div>
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="space-y-1">
                  {task.subtasks.map(sub => {
                    const done = sub.status === 'completed'
                    return (
                      <div key={sub.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/50">
                        <button
                          className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                            done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'
                          }`}
                          onClick={() => updateTask.mutate({ id: sub.id, status: done ? 'requested' : 'completed' })}
                        >
                          {done && <CheckCircle2 className="size-3" />}
                        </button>
                        <span className={`flex-1 ${done ? 'line-through text-muted-foreground' : ''}`}>{sub.title}</span>
                        <span className="text-[10px] text-muted-foreground">{sub.assignee?.name}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {showSubtaskForm && (
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-8"
                    placeholder={t('tasks.subtaskPlaceholder')}
                    value={subtaskTitle}
                    onChange={e => setSubtaskTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                  />
                  <Select value={subtaskAssignee} onValueChange={v => setSubtaskAssignee(v || '')}>
                    <SelectTrigger className="w-32 h-8"><SelectValue placeholder={t('tasks.assignee')} /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" onClick={handleAddSubtask} disabled={!subtaskTitle.trim()}>
                    {t('common.add')}
                  </Button>
                </div>
              )}
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Paperclip className="size-4" /> {t('tasks.attachments')} ({attachments.length})
              </h4>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/30">
                      <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                        <Paperclip className="size-3" />{att.fileName}
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{att.uploader?.name}</span>
                        <button className="text-gray-400 hover:text-red-500" onClick={() => deleteAttachment.mutate({ id: att.id, taskId: att.taskId })}>
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => {
                    const url = prompt(t('tasks.attachUrlPrompt'))
                    if (url && user) {
                      const name = prompt(t('tasks.attachNamePrompt')) || url.split('/').pop() || 'file'
                      addAttachment.mutate({ taskId: task.id, fileName: name, fileUrl: url, uploadedBy: user.id })
                    }
                  }}
                >
                  <Paperclip className="size-3" />{t('tasks.addAttachment')}
                </Button>
              </div>
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <MessageSquare className="size-4" /> {t('tasks.comments')} ({comments.length})
              </h4>
              {comments.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
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
        <div className="grid grid-cols-4 gap-3">
          <Card className="border-l-[3px] border-l-amber-400">
            <CardContent className="py-3 px-4">
              <div className="text-xs text-muted-foreground">{t('tasks.myAssigned')}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold">{stats.assigned.total - stats.assigned.completed}</span>
                <span className="text-xs text-muted-foreground">{t('tasks.pending')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-blue-400">
            <CardContent className="py-3 px-4">
              <div className="text-xs text-muted-foreground">{t('tasks.myRequested')}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold">{stats.requested.total - stats.requested.completed}</span>
                <span className="text-xs text-muted-foreground">{t('tasks.inProgressLabel')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-red-400">
            <CardContent className="py-3 px-4">
              <div className="text-xs text-muted-foreground">{t('tasks.overdueLabel')}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-red-500">{stats.overdue}</span>
                <span className="text-xs text-muted-foreground">{t('tasks.tasks')}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-[3px] border-l-emerald-400">
            <CardContent className="py-3 px-4">
              <div className="text-xs text-muted-foreground">{t('tasks.completedLabel')}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-emerald-600">{stats.assigned.completed + stats.requested.completed}</span>
                <span className="text-xs text-muted-foreground">{t('tasks.total')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
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
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder={t('tasks.assignee')} /></SelectTrigger>
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
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
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
              <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
            ))
          )}
        </div>
      )}

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
                  <SelectTrigger className="h-9"><SelectValue placeholder={t('tasks.selectAssignee')} /></SelectTrigger>
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
