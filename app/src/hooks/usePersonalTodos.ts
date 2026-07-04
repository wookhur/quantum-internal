import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PersonalTodo {
  id: string
  ownerId: string
  title: string
  done: boolean
  doneAt?: string
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): PersonalTodo {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    title: row.title as string,
    done: !!row.done,
    doneAt: (row.done_at as string) || undefined,
    sourceMessageId: (row.source_message_id as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function usePersonalTodos(ownerId?: string) {
  return useQuery({
    queryKey: ['personal_todos', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personal_todos')
        .select('*')
        .eq('owner_id', ownerId as string)
        .order('done', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreatePersonalTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: { ownerId: string; title: string; sourceMessageId?: string }) => {
      const { data, error } = await supabase.from('personal_todos').insert({
        owner_id: t.ownerId,
        title: t.title,
        source_message_id: t.sourceMessageId || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['personal_todos', v.ownerId] }),
  })
}

export function useTogglePersonalTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; ownerId: string; done: boolean }) => {
      const { error } = await supabase
        .from('personal_todos')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['personal_todos', v.ownerId] }),
  })
}

export function useDeletePersonalTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; ownerId: string }) => {
      const { error } = await supabase.from('personal_todos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['personal_todos', v.ownerId] }),
  })
}
