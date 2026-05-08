import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface LeaderboardEntry {
  rank: number
  name: string
  userId: string
  score: number
  date: string
}

export function useGameLeaderboard(game = 'trex') {
  return useQuery({
    queryKey: ['leaderboard', game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_leaderboard')
        .select('id, user_id, score, played_at, profiles(name)')
        .eq('game', game)
        .order('score', { ascending: false })
        .limit(10)

      if (error) throw error

      return (data || []).map((row: Record<string, unknown>, i: number) => ({
        rank: i + 1,
        name: (row.profiles as { name: string } | null)?.name || 'Unknown',
        userId: row.user_id as string,
        score: row.score as number,
        date: new Date(row.played_at as string).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
      })) as LeaderboardEntry[]
    },
  })
}

export function useSubmitScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, score, game = 'trex' }: { userId: string; score: number; game?: string }) => {
      const { error } = await supabase.from('game_leaderboard').insert({
        user_id: userId,
        game,
        score,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaderboard'] }),
  })
}
