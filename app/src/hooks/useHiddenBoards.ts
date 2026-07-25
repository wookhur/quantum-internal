import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 전사(글로벌) 숨김 게시판 라우트 집합. 여기 포함된 route는 모든 사용자 사이드바에서 숨김. */
export function useHiddenBoards() {
  const { data } = useQuery({
    queryKey: ['hidden_boards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hidden_boards').select('route')
      if (error) throw error
      return (data || []).map((r: Record<string, unknown>) => r.route as string)
    },
    staleTime: 60_000,
  })
  return new Set(data || [])
}

export function useSetBoardHidden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ route, hidden }: { route: string; hidden: boolean }) => {
      if (hidden) {
        const { error } = await supabase.from('hidden_boards').upsert({ route, updated_at: new Date().toISOString() }, { onConflict: 'route' })
        if (error) throw error
      } else {
        const { error } = await supabase.from('hidden_boards').delete().eq('route', route)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hidden_boards'] }),
  })
}
