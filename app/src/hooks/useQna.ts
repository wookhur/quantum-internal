import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/**
 * 홈페이지 Q&A (Ask Quantum)
 *
 * 방문자가 홈페이지에서 남긴 질문. 접수는 intake-qna 엣지 함수가 하고,
 * 여기서는 답변을 쓰고 공개 여부를 정한다.
 * 답변을 달아 '공개'로 바꾼 것만 홈페이지에 나간다(qna_public 뷰).
 */
export type QnaStatus = 'pending' | 'published' | 'hidden'

export interface QnaQuestion {
  id: string
  createdAt: string
  askerName: string
  askerPhone: string | null
  askerEmail: string | null
  grade: string | null
  category: string
  title: string
  body: string
  studentName: string | null
  school: string | null
  residence: 'domestic' | 'overseas'
  country: string | null
  region: string | null
  interestArea: string | null
  sourcePath: string | null
  isLocked: boolean
  status: QnaStatus
  answer: string | null
  answeredAt: string | null
  answeredBy: string | null
  slug: string | null
  viewCount: number
  leadId: string | null
}

export const QNA_CATEGORIES = ['원서·지원', '에세이', '활동·EC', '시험·성적', '유학 준비', '기타'] as const

type Row = Record<string, unknown>

function toQuestion(r: Row): QnaQuestion {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    askerName: (r.asker_name as string) ?? '',
    askerPhone: (r.asker_phone as string) ?? null,
    askerEmail: (r.asker_email as string) ?? null,
    grade: (r.grade as string) ?? null,
    category: (r.category as string) ?? '기타',
    title: (r.title as string) ?? '',
    body: (r.body as string) ?? '',
    studentName: (r.student_name as string) ?? null,
    school: (r.school as string) ?? null,
    residence: (r.residence as 'domestic' | 'overseas') ?? 'domestic',
    country: (r.country as string) ?? null,
    region: (r.region as string) ?? null,
    interestArea: (r.interest_area as string) ?? null,
    sourcePath: (r.source_path as string) ?? null,
    isLocked: !!r.is_locked,
    status: (r.status as QnaStatus) ?? 'pending',
    answer: (r.answer as string) ?? null,
    answeredAt: (r.answered_at as string) ?? null,
    answeredBy: (r.answered_by as string) ?? null,
    slug: (r.slug as string) ?? null,
    viewCount: (r.view_count as number) ?? 0,
    leadId: (r.lead_id as string) ?? null,
  }
}

export function useQnaQuestions() {
  return useQuery({
    queryKey: ['qna-questions'],
    queryFn: async (): Promise<QnaQuestion[]> => {
      const { data, error } = await supabase
        .from('qna_questions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(toQuestion)
    },
  })
}

/** 답변 대기 건수 — 사이드바·대시보드 배지용 */
export function useQnaPendingCount() {
  return useQuery({
    queryKey: ['qna-pending-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('qna_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
    staleTime: 60_000,
  })
}

export function useAnswerQna() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: {
      id: string
      answer?: string
      status?: QnaStatus
      isLocked?: boolean
      category?: string
      /** 공개 전 다듬기 — 원문의 실명·학교명이 그대로 노출되지 않도록 */
      title?: string
      body?: string
    }) => {
      const updates: Record<string, unknown> = {}
      if (params.answer !== undefined) {
        updates.answer = params.answer
        updates.answered_by = user?.id ?? null
      }
      if (params.status !== undefined) updates.status = params.status
      if (params.isLocked !== undefined) updates.is_locked = params.isLocked
      if (params.category !== undefined) updates.category = params.category
      if (params.title !== undefined) updates.title = params.title
      if (params.body !== undefined) updates.body = params.body

      const { data, error } = await supabase
        .from('qna_questions')
        .update(updates)
        .eq('id', params.id)
        .select()
        .single()
      if (error) throw error
      return toQuestion(data as Row)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qna-questions'] })
      qc.invalidateQueries({ queryKey: ['qna-pending-count'] })
    },
  })
}

export function useDeleteQna() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('qna_questions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qna-questions'] })
      qc.invalidateQueries({ queryKey: ['qna-pending-count'] })
    },
  })
}
