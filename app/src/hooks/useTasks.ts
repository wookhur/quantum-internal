import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Task, TaskComment, TaskAttachment, TaskStatus, TaskPriority, TodoStatus, TodoPriority } from '@/types'
import { createNotificationsForUsers } from './useUserNotifications'

// ─── Task ↔ Todo Sync ──────────────────────────────────────────────────

const TASK_TO_TODO_STATUS: Record<TaskStatus, TodoStatus> = {
  requested: 'todo',
  in_progress: 'in_progress',
  on_hold: 'todo',
  completed: 'done',
  cancelled: 'done',
}

const TASK_TO_TODO_PRIORITY: Record<TaskPriority, TodoPriority> = {
  urgent: 'high',
  normal: 'medium',
  low: 'low',
}

/** Create a linked todo when a task is created */
async function syncTaskToTodo(task: Task) {
  if (!task.assigneeId) return
  await supabase.from('todos').insert({
    title: `[요청] ${task.title}`,
    description: task.description || null,
    assigned_to: task.assigneeId,
    owner_id: task.assigneeId,
    assignees: [task.assigneeId],
    priority: TASK_TO_TODO_PRIORITY[task.priority],
    due_date: task.dueDate || null,
    status: 'todo',
    team: (task.department as 'management' | 'sales' | 'marketing' | 'finance' | 'service') || null,
    created_by: task.requesterId,
    linked_task_id: task.id,
  })
}

/** Sync task status change to linked todo */
async function syncTaskStatusToTodo(taskId: string, newStatus: TaskStatus) {
  const todoStatus = TASK_TO_TODO_STATUS[newStatus]
  await supabase
    .from('todos')
    .update({ status: todoStatus, updated_at: new Date().toISOString() })
    .eq('linked_task_id', taskId)
}

/** Sync task assignee change to linked todo */
async function syncTaskAssigneeToTodo(taskId: string, assigneeId: string | undefined) {
  if (!assigneeId) return
  await supabase
    .from('todos')
    .update({ assigned_to: assigneeId, owner_id: assigneeId, assignees: [assigneeId] })
    .eq('linked_task_id', taskId)
}

function mapTask(row: Record<string, unknown>): Task {
  const requester = row.requester as Record<string, unknown> | null
  const assignee = row.assignee as Record<string, unknown> | null
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    requesterId: row.requester_id as string,
    assigneeId: row.assignee_id as string | undefined,
    department: row.department as string | undefined,
    dueDate: row.due_date as string | undefined,
    completedAt: row.completed_at as string | undefined,
    parentTaskId: row.parent_task_id as string | undefined,
    isRecurring: (row.is_recurring as boolean) || false,
    recurrenceRule: row.recurrence_rule as string | undefined,
    tags: row.tags as string[] | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    requester: requester ? { id: requester.id as string, name: requester.name as string } : undefined,
    assignee: assignee ? { id: assignee.id as string, name: assignee.name as string } : undefined,
    commentCount: row.comment_count as number | undefined,
    attachmentCount: row.attachment_count as number | undefined,
  }
}

function mapComment(row: Record<string, unknown>): TaskComment {
  const author = row.author as Record<string, unknown> | null
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    authorId: row.author_id as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    author: author ? { id: author.id as string, name: author.name as string } : undefined,
  }
}

function mapAttachment(row: Record<string, unknown>): TaskAttachment {
  const uploader = row.uploader as Record<string, unknown> | null
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    fileSize: row.file_size as number | undefined,
    uploadedBy: row.uploaded_by as string,
    createdAt: row.created_at as string,
    uploader: uploader ? { id: uploader.id as string, name: uploader.name as string } : undefined,
  }
}

// ─── Queries ────────────────────────────────────────────────────────────

export interface TaskFilters {
  status?: TaskStatus | 'all'
  priority?: TaskPriority | 'all'
  assigneeId?: string
  requesterId?: string
  department?: string
  search?: string
  parentOnly?: boolean // exclude subtasks from main list
}

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, requester:profiles!tasks_requester_id_fkey(id, name), assignee:profiles!tasks_assignee_id_fkey(id, name)')
        .order('created_at', { ascending: false })

      // Only show top-level tasks by default
      if (filters?.parentOnly !== false) {
        query = query.is('parent_task_id', null)
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters?.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority)
      }
      if (filters?.assigneeId) {
        query = query.eq('assignee_id', filters.assigneeId)
      }
      if (filters?.requesterId) {
        query = query.eq('requester_id', filters.requesterId)
      }
      if (filters?.department) {
        query = query.eq('department', filters.department)
      }
      if (filters?.search) {
        query = query.ilike('title', `%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(r => mapTask(r as Record<string, unknown>))
    },
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, requester:profiles!tasks_requester_id_fkey(id, name), assignee:profiles!tasks_assignee_id_fkey(id, name)')
        .eq('id', id!)
        .single()
      if (error) throw error

      const task = mapTask(data as Record<string, unknown>)

      // Fetch subtasks
      const { data: subtaskRows } = await supabase
        .from('tasks')
        .select('*, requester:profiles!tasks_requester_id_fkey(id, name), assignee:profiles!tasks_assignee_id_fkey(id, name)')
        .eq('parent_task_id', id!)
        .order('created_at', { ascending: true })
      task.subtasks = (subtaskRows || []).map(r => mapTask(r as Record<string, unknown>))

      // Comment count
      const { count: commentCount } = await supabase
        .from('task_comments')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', id!)
      task.commentCount = commentCount || 0

      // Attachment count
      const { count: attachmentCount } = await supabase
        .from('task_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', id!)
      task.attachmentCount = attachmentCount || 0

      return task
    },
  })
}

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*, author:profiles!task_comments_author_id_fkey(id, name)')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapComment(r as Record<string, unknown>))
    },
  })
}

export function useTaskAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-attachments', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*, uploader:profiles!task_attachments_uploaded_by_fkey(id, name)')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapAttachment(r as Record<string, unknown>))
    },
  })
}

/** Dashboard stats */
export function useTaskStats(userId?: string) {
  return useQuery({
    queryKey: ['task-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      // My assigned tasks by status
      const { data: assigned } = await supabase
        .from('tasks')
        .select('status')
        .eq('assignee_id', userId!)
        .is('parent_task_id', null)

      // My requested tasks by status
      const { data: requested } = await supabase
        .from('tasks')
        .select('status')
        .eq('requester_id', userId!)
        .is('parent_task_id', null)

      // Overdue tasks assigned to me
      const today = new Date().toISOString().slice(0, 10)
      const { count: overdueCount } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', userId!)
        .lt('due_date', today)
        .in('status', ['requested', 'in_progress'])

      const assignedTasks = assigned || []
      const requestedTasks = requested || []

      return {
        assigned: {
          total: assignedTasks.length,
          requested: assignedTasks.filter(t => t.status === 'requested').length,
          inProgress: assignedTasks.filter(t => t.status === 'in_progress').length,
          completed: assignedTasks.filter(t => t.status === 'completed').length,
        },
        requested: {
          total: requestedTasks.length,
          requested: requestedTasks.filter(t => t.status === 'requested').length,
          inProgress: requestedTasks.filter(t => t.status === 'in_progress').length,
          completed: requestedTasks.filter(t => t.status === 'completed').length,
        },
        overdue: overdueCount || 0,
      }
    },
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      title: string
      description?: string
      priority?: TaskPriority
      requesterId: string
      assigneeId?: string
      department?: string
      dueDate?: string
      parentTaskId?: string
      isRecurring?: boolean
      recurrenceRule?: string
      tags?: string[]
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: params.title,
          description: params.description || null,
          priority: params.priority || 'normal',
          requester_id: params.requesterId,
          assignee_id: params.assigneeId || null,
          department: params.department || null,
          due_date: params.dueDate || null,
          parent_task_id: params.parentTaskId || null,
          is_recurring: params.isRecurring || false,
          recurrence_rule: params.recurrenceRule || null,
          tags: params.tags || null,
          status: 'requested',
        })
        .select('*, requester:profiles!tasks_requester_id_fkey(id, name), assignee:profiles!tasks_assignee_id_fkey(id, name)')
        .single()
      if (error) throw error
      const task = mapTask(data as Record<string, unknown>)
      // Sync: create linked todo for assignee
      syncTaskToTodo(task).catch(() => {})
      // Notify assignee
      if (task.assigneeId && task.assigneeId !== params.requesterId) {
        const requesterName = task.requester?.name || '누군가'
        createNotificationsForUsers([task.assigneeId], {
          type: 'task_assigned',
          title: '새 업무 배정',
          message: `${requesterName}님이 "${task.title}" 업무를 배정했습니다.`,
          link: `/tasks?task=${task.id}`,
          metadata: { taskId: task.id },
        }).catch(() => {})
      }
      return task
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-stats'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      title?: string
      description?: string
      status?: TaskStatus
      priority?: TaskPriority
      assigneeId?: string
      department?: string
      dueDate?: string
      isRecurring?: boolean
      recurrenceRule?: string
      tags?: string[]
    }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.title !== undefined) row.title = updates.title
      if (updates.description !== undefined) row.description = updates.description || null
      if (updates.status !== undefined) {
        row.status = updates.status
        if (updates.status === 'completed') row.completed_at = new Date().toISOString()
        if (updates.status === 'requested' || updates.status === 'in_progress') row.completed_at = null
      }
      if (updates.priority !== undefined) row.priority = updates.priority
      if (updates.assigneeId !== undefined) row.assignee_id = updates.assigneeId || null
      if (updates.department !== undefined) row.department = updates.department || null
      if (updates.dueDate !== undefined) row.due_date = updates.dueDate || null
      if (updates.isRecurring !== undefined) row.is_recurring = updates.isRecurring
      if (updates.recurrenceRule !== undefined) row.recurrence_rule = updates.recurrenceRule || null
      if (updates.tags !== undefined) row.tags = updates.tags

      const { data, error } = await supabase
        .from('tasks')
        .update(row)
        .eq('id', id)
        .select('*, requester:profiles!tasks_requester_id_fkey(id, name), assignee:profiles!tasks_assignee_id_fkey(id, name)')
        .single()
      if (error) throw error

      // Sync status/assignee to linked todo
      if (updates.status) syncTaskStatusToTodo(id, updates.status).catch(() => {})
      if (updates.assigneeId !== undefined) syncTaskAssigneeToTodo(id, updates.assigneeId).catch(() => {})

      const task = mapTask(data as Record<string, unknown>)

      // Notify new assignee when task is reassigned
      if (updates.assigneeId && updates.assigneeId !== task.requesterId) {
        const requesterName = task.requester?.name || '누군가'
        createNotificationsForUsers([updates.assigneeId], {
          type: 'task_assigned',
          title: '업무 배정',
          message: `${requesterName}님이 "${task.title}" 업무를 배정했습니다.`,
          link: `/tasks?task=${task.id}`,
          metadata: { taskId: task.id },
        }).catch(() => {})
      }

      // Notify requester when task status changes (completed/in_progress)
      if (updates.status && task.requesterId && task.assigneeId && task.requesterId !== task.assigneeId) {
        const statusLabels: Record<string, string> = {
          in_progress: '진행 중',
          on_hold: '보류',
          completed: '완료',
          cancelled: '취소',
        }
        const label = statusLabels[updates.status]
        if (label) {
          const assigneeName = task.assignee?.name || '담당자'
          createNotificationsForUsers([task.requesterId], {
            type: 'task_status_changed',
            title: '업무 상태 변경',
            message: `${assigneeName}님이 "${task.title}" 업무를 ${label}(으)로 변경했습니다.`,
            link: `/tasks?task=${task.id}`,
            metadata: { taskId: task.id, status: updates.status },
          }).catch(() => {})
        }
      }

      return task
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task', vars.id] })
      qc.invalidateQueries({ queryKey: ['task-stats'] })
      qc.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-stats'] })
    },
  })
}

export function useAddTaskComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { taskId: string; authorId: string; content: string }) => {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({
          task_id: params.taskId,
          author_id: params.authorId,
          content: params.content,
        })
        .select('*, author:profiles!task_comments_author_id_fkey(id, name)')
        .single()
      if (error) throw error

      // Notify the task's other participants (requester + assignee), not the author.
      try {
        const { data: taskRow } = await supabase
          .from('tasks')
          .select('title, requester_id, assignee_id')
          .eq('id', params.taskId)
          .single()
        if (taskRow) {
          const recipients = Array.from(new Set(
            [taskRow.requester_id as string | null, taskRow.assignee_id as string | null]
              .filter((uid): uid is string => !!uid && uid !== params.authorId),
          ))
          if (recipients.length) {
            const authorName = ((data as Record<string, unknown>).author as Record<string, unknown> | null)?.name as string || '누군가'
            await createNotificationsForUsers(recipients, {
              type: 'task_comment',
              title: '업무 댓글',
              message: `${authorName}님이 "${taskRow.title}" 업무에 댓글을 남겼습니다.`,
              link: `/tasks?task=${params.taskId}`,
              metadata: { taskId: params.taskId },
            }).catch(() => {})
          }
        }
      } catch { /* notification failure shouldn't block commenting */ }

      return mapComment(data as Record<string, unknown>)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['task-comments', vars.taskId] })
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] })
    },
  })
}

export function useAddTaskAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { taskId: string; fileName: string; fileUrl: string; fileSize?: number; uploadedBy: string }) => {
      const { data, error } = await supabase
        .from('task_attachments')
        .insert({
          task_id: params.taskId,
          file_name: params.fileName,
          file_url: params.fileUrl,
          file_size: params.fileSize || null,
          uploaded_by: params.uploadedBy,
        })
        .select()
        .single()
      if (error) throw error
      return mapAttachment(data as Record<string, unknown>)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', vars.taskId] })
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] })
    },
  })
}

export function useDeleteTaskAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const { error } = await supabase.from('task_attachments').delete().eq('id', id)
      if (error) throw error
      return taskId
    },
    onSuccess: (_taskId, vars) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', vars.taskId] })
      qc.invalidateQueries({ queryKey: ['task', vars.taskId] })
    },
  })
}
