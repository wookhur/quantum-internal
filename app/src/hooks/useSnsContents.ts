import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'

/** SNS 콘텐츠 한 건의 성과. 마케팅 주간보고서의 원천 데이터. */
export interface SnsContent {
  id: string
  channel: string
  postedAt: string      // YYYY-MM-DD
  title: string
  category?: string
  url?: string
  views: number
  likes: number
  comments: number
  saves: number
  shares: number
  follows: number
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

function mapRow(r: Record<string, unknown>): SnsContent {
  return {
    id: r.id as string,
    channel: (r.channel as string) || 'instagram',
    postedAt: ((r.posted_at as string) || '').slice(0, 10),
    title: (r.title as string) || '',
    category: (r.category as string) || undefined,
    url: (r.url as string) || undefined,
    views: num(r.views),
    likes: num(r.likes),
    comments: num(r.comments),
    saves: num(r.saves),
    shares: num(r.shares),
    follows: num(r.follows),
    notes: (r.notes as string) || undefined,
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export interface SnsContentInput {
  channel?: string
  postedAt: string
  title: string
  category?: string
  url?: string
  views?: number
  likes?: number
  comments?: number
  saves?: number
  shares?: number
  follows?: number
  notes?: string
}

function toRow(i: SnsContentInput): Record<string, unknown> {
  return {
    channel: i.channel || 'instagram',
    posted_at: i.postedAt,
    title: i.title,
    category: i.category || null,
    url: i.url || null,
    views: i.views ?? 0,
    likes: i.likes ?? 0,
    comments: i.comments ?? 0,
    saves: i.saves ?? 0,
    shares: i.shares ?? 0,
    follows: i.follows ?? 0,
    notes: i.notes || null,
  }
}

/** 전체 콘텐츠(게시일 내림차순). 기간 필터는 화면에서 한다 — 기간을 바꿔도 다시 받지 않게. */
export function useSnsContents() {
  return useQuery({
    queryKey: ['sns_contents'],
    queryFn: async () => {
      // 콘텐츠는 해마다 쌓인다. 1000건에서 잘리면 보고서 숫자가 조용히 줄어든다.
      const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
        supabase
          .from('sns_contents')
          .select('*')
          .order('posted_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      )
      return rows.map(mapRow)
    },
  })
}

export function useCreateSnsContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SnsContentInput & { createdBy?: string }) => {
      const { data, error } = await supabase
        .from('sns_contents')
        .insert({ ...toRow(input), created_by: input.createdBy || null })
        .select()
        .single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sns_contents'] }),
  })
}

export function useUpdateSnsContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: SnsContentInput & { id: string }) => {
      const { data, error } = await supabase
        .from('sns_contents')
        .update({ ...toRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) throw error
      // RLS 로 막히면 에러 없이 0행이 바뀐다 — 저장된 것처럼 보이지 않게 끊는다.
      if (!data || data.length === 0) {
        throw new Error('이 콘텐츠를 수정할 권한이 없습니다. (저장된 내용 없음)')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sns_contents'] }),
  })
}

export function useDeleteSnsContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sns_contents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sns_contents'] }),
  })
}
