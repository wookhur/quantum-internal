import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { User } from '@/types'

export interface ProjectComment {
  id: string
  todoId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>
}

function mapComment(row: Record<string, unknown>): ProjectComment {
  const profile = row.profiles as Record<string, unknown> | null
  return {
    id: row.id as string,
    todoId: row.todo_id as string,
    userId: row.user_id as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    user: profile
      ? {
          id: profile.id as string,
          name: profile.name as string,
          avatarUrl: profile.avatar_url as string | undefined,
        }
      : undefined,
  }
}

/** Fetch comments for a project */
export function useProjectComments(todoId: string | undefined) {
  return useQuery({
    queryKey: ['project-comments', todoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_comments')
        .select('*, profiles(id, name, avatar_url)')
        .eq('todo_id', todoId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapComment(r as Record<string, unknown>))
    },
    enabled: !!todoId,
  })
}

/** Add a comment */
export function useCreateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ todoId, userId, content }: { todoId: string; userId: string; content: string }) => {
      const { data, error } = await supabase
        .from('project_comments')
        .insert({ todo_id: todoId, user_id: userId, content })
        .select('*, profiles(id, name, avatar_url)')
        .single()
      if (error) throw error
      return mapComment(data as Record<string, unknown>)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-comments', vars.todoId] })
    },
  })
}

/** Update a comment */
export function useUpdateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, content, todoId }: { id: string; content: string; todoId: string }) => {
      const { error } = await supabase
        .from('project_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { todoId }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['project-comments', result.todoId] })
    },
  })
}

/** Delete a comment */
export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, todoId }: { id: string; todoId: string }) => {
      const { error } = await supabase
        .from('project_comments')
        .delete()
        .eq('id', id)
      if (error) throw error
      return { todoId }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['project-comments', result.todoId] })
    },
  })
}
