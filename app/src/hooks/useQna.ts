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

/**
 * 답변 평가 집계.
 * 글을 읽은 누구나 누를 수 있게 열어 두었다 — 그래야 표본이 쌓인다.
 * 다만 비밀번호로 열고 누른 질문자(asker)와 그냥 읽고 누른 사람(reader)은
 * 재는 것이 다르므로 나눠서 본다.
 *   asker  → 상담 품질 (내 질문에 대한 답이 좋았나)
 *   전체   → 콘텐츠 품질 (이 글이 도움이 되었나)
 */
export interface QnaFeedback {
  questionId: string
  total: number
  helpful: number
  askerTotal: number
  askerHelpful: number
}

export function useQnaFeedback() {
  return useQuery({
    queryKey: ['qna-feedback'],
    queryFn: async (): Promise<Map<string, QnaFeedback>> => {
      const { data, error } = await supabase
        .from('qna_feedback_summary')
        .select('question_id, total, helpful, asker_total, asker_helpful')
      if (error) {
        console.warn('qna_feedback_summary not available:', error.message)
        return new Map()
      }
      const m = new Map<string, QnaFeedback>()
      for (const r of (data || []) as Row[]) {
        m.set(r.question_id as string, {
          questionId: r.question_id as string,
          total: Number(r.total) || 0,
          helpful: Number(r.helpful) || 0,
          askerTotal: Number(r.asker_total) || 0,
          askerHelpful: Number(r.asker_helpful) || 0,
        })
      }
      return m
    },
    staleTime: 60_000,
  })
}

/**
 * 질문 직접 추가 — 상담에서 실제로 받은 질문을 담당자가 올린다.
 *
 * 방문자가 남기기를 기다리면 게시판이 비어 있고, 비어 있으면 아무도 남기지
 * 않는다. 상담에서 이미 여러 번 받은 질문을 먼저 채워 두면 검색으로 들어온
 * 사람이 답을 찾고, 그 자리에서 다음 질문이 붙는다.
 *
 * 지어낸 질문이 아니라 실제로 받은 질문이어야 한다. 없는 사람을 만들어
 * 묻게 하는 것은 다른 일이다.
 */
export function useCreateQna() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      title: string
      body: string
      answer: string
      category: string
      /** 비워 두면 홈페이지에 '익명'으로 나간다 */
      askerName?: string
      grade?: string
      residence?: 'domestic' | 'overseas'
      country?: string
    }) => {
      const { data, error } = await supabase
        .from('qna_questions')
        .insert({
          asker_name: input.askerName?.trim() || '',
          category: input.category,
          title: input.title.trim(),
          body: input.body.trim(),
          answer: input.answer.trim(),
          answered_by: user?.id ?? null,
          grade: input.grade?.trim() || null,
          residence: input.residence || 'domestic',
          country: input.country?.trim() || null,
          source_path: '내부 등록',
          status: 'published',
          is_locked: false,
        })
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

/**
 * 잠금 비밀번호 재설정.
 * 비밀번호는 해시로만 저장돼 우리도 볼 수 없다. 질문자가 잊었다고 연락해 오면
 * 새 번호를 정해 알려주는 방식으로 푼다.
 */
export function useResetQnaPin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; pin: string }) => {
      const { error } = await supabase.rpc('qna_set_lock_pin', { p_id: params.id, p_pin: params.pin })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qna-questions'] }),
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
