import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PersonalTodo {
  id: string
  ownerId: string
  title: string
  done: boolean
  doneAt?: string
  sourceMessageId?: string
  sourceRoomId?: string
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
    sourceRoomId: (row.source_room_id as string) || undefined,
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
    mutationFn: async (t: { ownerId: string; title: string; sourceMessageId?: string; sourceRoomId?: string }) => {
      const { data, error } = await supabase.from('personal_todos').insert({
        owner_id: t.ownerId,
        title: t.title,
        source_message_id: t.sourceMessageId || null,
        source_room_id: t.sourceRoomId || null,
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
    mutationFn: async (v: {
      id: string
      ownerId: string
      done: boolean
      // when a room-sourced todo is completed, post a "처리완료" reply to the room
      sourceRoomId?: string
      sourceMessageId?: string
      title?: string
      completerName?: string
    }) => {
      const { error } = await supabase
        .from('personal_todos')
        .update({ done: v.done, done_at: v.done ? new Date().toISOString() : null })
        .eq('id', v.id)
      if (error) throw error

      if (v.done && v.sourceRoomId) {
        const who = v.completerName || '담당자'
        const what = v.title || '해당 업무'
        await supabase.from('chat_room_messages').insert({
          room_id: v.sourceRoomId,
          sender_id: v.ownerId,
          content: `✅ ${who}님이 "${what}" 업무를 처리완료하였습니다.`,
          reply_to_message_id: v.sourceMessageId || null,
          reply_to_content: v.title || null,
        })
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['personal_todos', v.ownerId] })
      if (v.sourceRoomId) qc.invalidateQueries({ queryKey: ['chat-room-messages', v.sourceRoomId] })
    },
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
