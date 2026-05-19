import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface NotificationPreferences {
  id: string
  userId: string
  disabledTypes: string[]
}

export function useNotificationPreferences() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['notification-preferences', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) {
        console.warn('notification_preferences not available:', error.message)
        return null
      }
      if (!data) return null
      return {
        id: data.id,
        userId: data.user_id,
        disabledTypes: (data.disabled_types as string[]) || [],
      } as NotificationPreferences
    },
  })
}

export function useUpdateNotificationPreferences() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (disabledTypes: string[]) => {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user!.id,
            disabled_types: disabledTypes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-preferences', user?.id] })
    },
  })
}
