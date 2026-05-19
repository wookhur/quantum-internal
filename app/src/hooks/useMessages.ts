import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect } from 'react'

export interface Message {
  id: string
  senderId: string
  receiverId: string
  content: string
  read: boolean
  createdAt: string
  senderName?: string
  senderAvatarUrl?: string
  receiverName?: string
  receiverAvatarUrl?: string
  attachmentUrl?: string
  attachmentName?: string
  attachmentType?: string
  attachmentSize?: number
}

function mapMessage(row: Record<string, unknown>): Message {
  const sender = row.sender as Record<string, unknown> | null
  const receiver = row.receiver as Record<string, unknown> | null
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    receiverId: row.receiver_id as string,
    content: row.content as string,
    read: row.read as boolean,
    createdAt: row.created_at as string,
    senderName: sender?.name as string | undefined,
    senderAvatarUrl: sender?.avatar_url as string | undefined,
    receiverName: receiver?.name as string | undefined,
    receiverAvatarUrl: receiver?.avatar_url as string | undefined,
    attachmentUrl: row.attachment_url as string | undefined,
    attachmentName: row.attachment_name as string | undefined,
    attachmentType: row.attachment_type as string | undefined,
    attachmentSize: row.attachment_size as number | undefined,
  }
}

/** Fetch conversations list (latest message per conversation partner) */
export function useConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['conversations', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(name, avatar_url), receiver:profiles!messages_receiver_id_fkey(name, avatar_url)')
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      // Group by conversation partner
      const convMap = new Map<string, Message>()
      for (const row of data || []) {
        const msg = mapMessage(row as Record<string, unknown>)
        const partnerId = msg.senderId === user!.id ? msg.receiverId : msg.senderId
        if (!convMap.has(partnerId)) convMap.set(partnerId, msg)
      }
      return Array.from(convMap.values())
    },
  })
}

/** Fetch messages with a specific user */
export function useMessageThread(partnerId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['messages', user?.id, partnerId],
    enabled: !!user?.id && !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(name, avatar_url), receiver:profiles!messages_receiver_id_fkey(name, avatar_url)')
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user!.id})`,
        )
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data || []).map((r) => mapMessage(r as Record<string, unknown>))
    },
  })
}

/** Send a message (optionally with file attachment) */
export function useSendMessage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      receiverId,
      content,
      file,
    }: {
      receiverId: string
      content: string
      file?: File
    }) => {
      let attachmentUrl: string | undefined
      let attachmentName: string | undefined
      let attachmentType: string | undefined
      let attachmentSize: number | undefined

      // Upload file to Supabase Storage if provided
      if (file) {
        const MAX_SIZE = 10 * 1024 * 1024 // 10MB
        if (file.size > MAX_SIZE) throw new Error('파일 크기는 10MB 이하만 가능합니다.')

        const ext = file.name.split('.').pop() || 'bin'
        const path = `${user!.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(path, file)
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('message-attachments')
          .getPublicUrl(path)

        attachmentUrl = urlData.publicUrl
        attachmentName = file.name
        attachmentType = file.type
        attachmentSize = file.size
      }

      const { error } = await supabase.from('messages').insert({
        sender_id: user!.id,
        receiver_id: receiverId,
        content,
        ...(attachmentUrl && {
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_type: attachmentType,
          attachment_size: attachmentSize,
        }),
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', user?.id, vars.receiverId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })
}

/** Mark messages as read */
export function useMarkRead() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (senderId: string) => {
      const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('sender_id', senderId)
        .eq('receiver_id', user!.id)
        .eq('read', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['unread-count'] })
    },
  })
}

/** Unread message count */
export function useUnreadCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['unread-count', user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000, // every 30s
    queryFn: async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user!.id)
        .eq('read', false)
      if (error) return 0
      return count || 0
    },
  })
}

/** Subscribe to new messages in real-time */
export function useMessageSubscription() {
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['conversations'] })
          qc.invalidateQueries({ queryKey: ['unread-count'] })
          qc.invalidateQueries({ queryKey: ['messages'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, qc])
}
