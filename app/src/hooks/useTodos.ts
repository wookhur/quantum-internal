import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Todo, TodoStatus, TodoPriority, ProjectTeam, TaskStatus } from '@/types'

const TODO_TO_TASK_STATUS: Record<TodoStatus, TaskStatus> = {
  todo: 'requested',
  in_progress: 'in_progress',
  done: 'completed',
}

/** Reverse sync: when todo status changes, update linked task */
async function syncTodoStatusToTask(todoId: string, newStatus: TodoStatus) {
  // Find linked task
  const { data: todo } = await supabase
    .from('todos')
    .select('linked_task_id')
    .eq('id', todoId)
    .single()
  if (!todo?.linked_task_id) return

  const taskStatus = TODO_TO_TASK_STATUS[newStatus]
  const update: Record<string, unknown> = { status: taskStatus, updated_at: new Date().toISOString() }
  if (taskStatus === 'completed') update.completed_at = new Date().toISOString()
  if (taskStatus !== 'completed') update.completed_at = null

  await supabase.from('tasks').update(update).eq('id', todo.linked_task_id)
}

function mapTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    team: row.team as ProjectTeam | undefined,
    ownerId: row.owner_id as string | undefined,
    assignees: (row.assignees as string[]) || [],
    assignedTo: row.assigned_to as string,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    dueDate: row.due_date as string,
    linkedEntityType: row.linked_entity_type as Todo['linkedEntityType'],
    linkedEntityId: row.linked_entity_id as string,
    linkedTaskId: row.linked_task_id as string | undefined,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Fetch all projects (visible to everyone) */
export function useTodos(filters?: { status?: TodoStatus; team?: ProjectTeam }) {
  return useQuery({
    queryKey: ['todos', filters],
    queryFn: async () => {
      let query = supabase
        .from('todos')
        .select('*')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.team) query = query.eq('team', filters.team)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapTodo)
    },
  })
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (todo: {
      title: string
      description?: string
      priority: TodoPriority
      dueDate?: string
      team?: ProjectTeam
      ownerId?: string
      assignees?: string[]
      assignedTo: string
      createdBy: string
      linkedEntityType?: string
      linkedEntityId?: string
    }) => {
      const { data, error } = await supabase.from('todos').insert({
        title: todo.title,
        description: todo.description,
        assigned_to: todo.assignedTo,
        priority: todo.priority,
        due_date: todo.dueDate,
        team: todo.team,
        owner_id: todo.ownerId,
        assignees: todo.assignees || [],
        created_by: todo.createdBy,
        linked_entity_type: todo.linkedEntityType,
        linked_entity_id: todo.linkedEntityId,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })
}

export function useUpdateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      title?: string
      description?: string
      status?: TodoStatus
      priority?: TodoPriority
      dueDate?: string
      team?: ProjectTeam | null
      ownerId?: string | null
      assignees?: string[]
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.title !== undefined) update.title = rest.title
      if (rest.description !== undefined) update.description = rest.description
      if (rest.status !== undefined) update.status = rest.status
      if (rest.priority !== undefined) update.priority = rest.priority
      if (rest.dueDate !== undefined) update.due_date = rest.dueDate
      if (rest.team !== undefined) update.team = rest.team
      if (rest.ownerId !== undefined) update.owner_id = rest.ownerId
      if (rest.assignees !== undefined) update.assignees = rest.assignees

      const { error } = await supabase.from('todos').update(update).eq('id', id)
      if (error) throw error
      // Reverse sync status to linked task
      if (rest.status) syncTodoStatusToTask(id, rest.status).catch(() => {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-stats'] })
    },
  })
}

/** Legacy: quick status toggle */
export function useUpdateTodoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TodoStatus }) => {
      const { error } = await supabase.from('todos').update({ status }).eq('id', id)
      if (error) throw error
      // Reverse sync status to linked task
      syncTodoStatusToTask(id, status).catch(() => {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['todos'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-stats'] })
    },
  })
}
