import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface UserNotification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, unknown>
  isRead: boolean
  readAt?: string
  createdAt: string
}

function mapNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as string,
    title: row.title as string,
    message: row.message as string,
    link: (row.link as string) || undefined,
    metadata: (row.metadata as Record<string, unknown>) || undefined,
    isRead: (row.is_read as boolean) || false,
    readAt: (row.read_at as string) || undefined,
    createdAt: row.created_at as string,
  }
}

/** Fetch unread notifications for current user */
export function useUserNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['user-notifications', user?.id],
    enabled: !!user?.id,
    refetchInterval: 30 * 1000, // poll every 30s
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', user!.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('Failed to fetch user notifications:', error.message)
        return []
      }
      return (data || []).map((r) => mapNotification(r as Record<string, unknown>))
    },
  })
}

/** Mark a single notification as read */
export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
  })
}

/** Mark all notifications as read for current user */
export function useMarkAllNotificationsRead() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
  })
}

/**
 * Create notifications for multiple users.
 * Used when a contract is created or consultant is assigned.
 */
export async function createNotificationsForUsers(
  userIds: string[],
  notification: {
    type: string
    title: string
    message: string
    link?: string
    metadata?: Record<string, unknown>
  }
) {
  if (userIds.length === 0) return

  const rows = userIds.map((userId) => ({
    user_id: userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link || null,
    metadata: notification.metadata || {},
    is_read: false,
  }))

  const { error } = await supabase.from('user_notifications').insert(rows)
  if (error) {
    console.error('Failed to create notifications:', error.message)
  }
}

/**
 * Fetch profile IDs for users who should receive contract notifications.
 * Returns IDs for: sales managers, CEO (대표이사), service managers
 */
export async function getContractNotificationRecipients(): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, department, position')

  if (error || !data) return []

  const recipients = new Set<string>()

  for (const profile of data as Record<string, unknown>[]) {
    const role = profile.role as string
    const department = profile.department as string
    const position = profile.position as string

    // CEO (대표이사)
    if (position === '대표이사') {
      recipients.add(profile.id as string)
      continue
    }

    // Sales managers (department=sales, role=admin or manager)
    if (department === 'sales' && (role === 'admin' || role === 'manager')) {
      recipients.add(profile.id as string)
      continue
    }

    // Service managers (department=service, role=admin or manager)
    if (department === 'service' && (role === 'admin' || role === 'manager')) {
      recipients.add(profile.id as string)
      continue
    }

    // Management department (includes CEO, COO, etc.)
    if (department === 'management' && (role === 'admin' || role === 'manager')) {
      recipients.add(profile.id as string)
    }
  }

  return Array.from(recipients)
}
