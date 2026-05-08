import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Todo, TodoStatus, TodoPriority } from '@/types'

function mapTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    assignedTo: row.assigned_to as string,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    dueDate: row.due_date as string,
    linkedEntityType: row.linked_entity_type as Todo['linkedEntityType'],
    linkedEntityId: row.linked_entity_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useTodos(filters?: { assignedTo?: string; status?: TodoStatus }) {
  return useQuery({
    queryKey: ['todos', filters],
    queryFn: async () => {
      let query = supabase
        .from('todos')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })

      if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
      if (filters?.status) query = query.eq('status', filters.status)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapTodo)
    },
  })
}

export function useCreateTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (todo: { title: string; description?: string; assignedTo: string; priority: TodoPriority; dueDate?: string; createdBy: string; linkedEntityType?: string; linkedEntityId?: string }) => {
      const { data, error } = await supabase.from('todos').insert({
        title: todo.title,
        description: todo.description,
        assigned_to: todo.assignedTo,
        priority: todo.priority,
        due_date: todo.dueDate,
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

export function useUpdateTodoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TodoStatus }) => {
      const { error } = await supabase.from('todos').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })
}
