import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ChatRoom {
  id: string
  name: string
  createdBy: string | null
  createdAt: string
  memberIds: string[]
}

export interface ChatRoomMessage {
  id: string
  roomId: string
  senderId: string | null
  content: string
  replyToMessageId: string | null
  replyToContent: string | null
  createdAt: string
}

function mapMessage(r: Record<string, unknown>): ChatRoomMessage {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    senderId: (r.sender_id as string) || null,
    content: r.content as string,
    replyToMessageId: (r.reply_to_message_id as string) || null,
    replyToContent: (r.reply_to_content as string) || null,
    createdAt: r.created_at as string,
  }
}

/** Rooms the user belongs to (admin sees all). */
export function useChatRooms(userId?: string, isAdmin = false) {
  return useQuery({
    queryKey: ['chat-rooms', userId, isAdmin],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rooms, error } = await supabase
        .from('chat_rooms')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const { data: members, error: mErr } = await supabase
        .from('chat_room_members')
        .select('room_id, member_id')
      if (mErr) throw mErr
      const byRoom = new Map<string, string[]>()
      ;(members || []).forEach((m: Record<string, unknown>) => {
        const rid = m.room_id as string
        const arr = byRoom.get(rid) || []
        arr.push(m.member_id as string)
        byRoom.set(rid, arr)
      })
      return (rooms || [])
        .map((r: Record<string, unknown>): ChatRoom => ({
          id: r.id as string,
          name: r.name as string,
          createdBy: (r.created_by as string) || null,
          createdAt: r.created_at as string,
          memberIds: byRoom.get(r.id as string) || [],
        }))
        .filter(r => isAdmin || r.memberIds.includes(userId as string))
    },
  })
}

export function useCreateChatRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; createdBy: string; memberIds: string[] }) => {
      const { data: room, error } = await supabase
        .from('chat_rooms')
        .insert({ name: input.name, created_by: input.createdBy })
        .select()
        .single()
      if (error) throw error
      // creator is always a member
      const ids = Array.from(new Set([input.createdBy, ...input.memberIds]))
      const rows = ids.map(id => ({ room_id: room.id, member_id: id }))
      const { error: mErr } = await supabase.from('chat_room_members').insert(rows)
      if (mErr) throw mErr
      return room
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-rooms'] }),
  })
}

export function useUpdateChatRoomMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { roomId: string; memberIds: string[] }) => {
      await supabase.from('chat_room_members').delete().eq('room_id', input.roomId)
      const rows = input.memberIds.map(id => ({ room_id: input.roomId, member_id: id }))
      if (rows.length > 0) {
        const { error } = await supabase.from('chat_room_members').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-rooms'] }),
  })
}

export function useDeleteChatRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from('chat_rooms').delete().eq('id', roomId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-rooms'] }),
  })
}

export function useRoomMessages(roomId?: string) {
  return useQuery({
    queryKey: ['chat-room-messages', roomId],
    enabled: !!roomId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_room_messages')
        .select('*')
        .eq('room_id', roomId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapMessage(r as Record<string, unknown>))
    },
  })
}

export function useSendRoomMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      roomId: string
      senderId: string
      content: string
      replyToMessageId?: string | null
      replyToContent?: string | null
    }) => {
      const { error } = await supabase.from('chat_room_messages').insert({
        room_id: input.roomId,
        sender_id: input.senderId,
        content: input.content,
        reply_to_message_id: input.replyToMessageId || null,
        reply_to_content: input.replyToContent || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['chat-room-messages', v.roomId] }),
  })
}
