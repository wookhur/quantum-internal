import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const QUERY_KEY = ['app-settings', 'kiosk_excluded_ids']

export function useKioskExcludedIds() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'kiosk_excluded_ids')
        .single()
      if (error) return [] as string[]
      return (data?.value || []) as string[]
    },
  })
}

export function useUpdateKioskExcludedIds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'kiosk_excluded_ids', value: ids, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
