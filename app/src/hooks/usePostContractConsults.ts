import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import { TRANSCRIPT_MAX_CHARS, type ConsultSummary } from '@/lib/transcriptText'

/** 계약 후 상담 기록 — 처리 상태는 둘뿐이다. */
export type ConsultStatus = 'open' | 'done'

export const CONSULT_STATUS_LABEL: Record<ConsultStatus, string> = {
  open: '미처리',
  done: '처리완료',
}

export interface PostContractConsult {
  id: string
  studentId: string
  consultDate: string
  content: string
  /** follow-up commitments — 학부모에게 약속한 것 */
  followUp?: string
  /** 올려 둔 전사본 파일 (요약의 근거). 요약이 이상할 때 원문을 열어 본다. */
  transcriptUrl?: string
  transcriptName?: string
  status: ConsultStatus
  /** 상담자 (profiles.id) */
  consultantId?: string
  /** 공유 대상자 — 알림을 보낸 직원들 */
  sharedWith: string[]
  createdBy?: string
  authorName?: string
  createdAt: string
  updatedAt: string
}

/** 계약 전 콜드콜 메모 (읽기 전용) */
export interface PreContractNote {
  id: string
  activityType: string
  title: string
  content: string
  authorName?: string
  createdAt: string
}

function mapConsult(r: Record<string, unknown>): PostContractConsult {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    consultDate: r.consult_date as string,
    content: (r.content as string) || '',
    followUp: (r.follow_up as string) || undefined,
    transcriptUrl: (r.transcript_url as string) || undefined,
    transcriptName: (r.transcript_name as string) || undefined,
    status: ((r.status as string) || 'open') as ConsultStatus,
    consultantId: (r.consultant_id as string) || undefined,
    sharedWith: (r.shared_with as string[]) || [],
    createdBy: (r.created_by as string) || undefined,
    authorName: (r.author_name as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) || (r.created_at as string),
  }
}

/**
 * 계약 전 콜드콜 기록을 읽어 온다 — 복사하지 않고 원본(lead_activities)을 그대로 보여준다.
 * 복사하면 콜드콜 원본과 갈라져 어느 쪽이 맞는지 알 수 없게 된다.
 * 단계 변경·담당자 변경·시스템 로그는 상담 내용이 아니므로 제외한다.
 */
const PRE_CONTRACT_TYPES = ['call', 'sms', 'katalk', 'email', 'note', 'meeting', 'consultation']

export function usePreContractNotes(leadId?: string) {
  return useQuery({
    queryKey: ['pre-contract-notes', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<PreContractNote[]> => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*, profiles!lead_activities_created_by_fkey(id, name)')
        .eq('lead_id', leadId!)
        .in('activity_type', PRE_CONTRACT_TYPES)
        .order('created_at', { ascending: false })
      if (error) {
        console.warn('Failed to fetch pre-contract notes:', error.message)
        return []
      }
      return (data || [])
        .map((row) => {
          const r = row as Record<string, unknown>
          const prof = r.profiles as { name?: string } | null
          return {
            id: r.id as string,
            activityType: (r.activity_type as string) || '',
            title: (r.title as string) || '',
            content: ((r.content as string) || '').trim(),
            authorName: prof?.name || undefined,
            createdAt: r.created_at as string,
          }
        })
        // 메모가 비어 있는 줄은 "통화함"만 남은 기록이라 서비스팀에게 쓸모가 없다.
        .filter((n) => n.content !== '')
    },
  })
}

export function usePostContractConsults(studentId?: string) {
  return useQuery({
    queryKey: ['post-contract-consults', studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<PostContractConsult[]> => {
      const { data, error } = await supabase
        .from('post_contract_consults')
        .select('*')
        .eq('student_id', studentId!)
        .order('consult_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) {
        // 마이그레이션 전이면 테이블이 없다. 화면 전체를 깨뜨리지 않고 빈 목록으로 둔다.
        console.warn('Failed to fetch post-contract consults:', error.message)
        return []
      }
      return (data || []).map((r) => mapConsult(r as Record<string, unknown>))
    },
  })
}

/** 공유 대상자에게 알림을 보낸다. 알림은 부가 기능이라 실패해도 기록은 남는다. */
async function notifyShared(
  userIds: string[],
  opts: { studentId: string; studentName: string; consultDate: string; content: string; authorName?: string },
) {
  const targets = userIds.filter(Boolean)
  if (!targets.length) return
  const brief = opts.content.length > 80 ? opts.content.slice(0, 80) + '…' : opts.content
  await createNotificationsForUsers(targets, {
    type: 'post_contract_consult',
    title: `${opts.studentName || '학생'} 상담 기록 공유`,
    message: `${opts.consultDate}${opts.authorName ? ` · ${opts.authorName}` : ''} — ${brief}`,
    link: `/service/student-360?student=${opts.studentId}`,
    metadata: { studentId: opts.studentId, studentName: opts.studentName || '' },
  })
}

export function useCreatePostContractConsult() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      studentId: string
      studentName?: string
      consultDate: string
      content: string
      followUp?: string
      transcriptUrl?: string
      transcriptName?: string
      status: ConsultStatus
      consultantId?: string
      sharedWith: string[]
      createdBy?: string
      authorName?: string
    }) => {
      const { data, error } = await supabase
        .from('post_contract_consults')
        .insert({
          student_id: input.studentId,
          consult_date: input.consultDate,
          content: input.content,
          follow_up: input.followUp || null,
          transcript_url: input.transcriptUrl || null,
          transcript_name: input.transcriptName || null,
          status: input.status,
          consultant_id: input.consultantId || null,
          shared_with: input.sharedWith,
          created_by: input.createdBy || null,
          author_name: input.authorName || null,
        })
        .select()
        .single()
      if (error) throw error
      try {
        await notifyShared(input.sharedWith, {
          studentId: input.studentId,
          studentName: input.studentName || '',
          consultDate: input.consultDate,
          content: input.content,
          authorName: input.authorName,
        })
      } catch {
        // 알림은 부가 기능 — 실패해도 상담 기록은 저장된다.
      }
      return data
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['post-contract-consults', v.studentId] }),
  })
}

export function useUpdatePostContractConsult() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      studentId: string
      studentName?: string
      consultDate?: string
      content?: string
      followUp?: string
      transcriptUrl?: string | null
      transcriptName?: string | null
      status?: ConsultStatus
      consultantId?: string
      /** 넘기면 전체를 이 목록으로 바꾼다. 새로 추가된 사람에게만 알림이 간다. */
      sharedWith?: string[]
      /** 알림 중복 방지를 위해 수정 전 공유 대상자를 함께 넘긴다. */
      previousSharedWith?: string[]
      authorName?: string
    }) => {
      const row: Record<string, unknown> = {}
      if (input.consultDate !== undefined) row.consult_date = input.consultDate
      if (input.content !== undefined) row.content = input.content
      if (input.followUp !== undefined) row.follow_up = input.followUp || null
      if (input.transcriptUrl !== undefined) row.transcript_url = input.transcriptUrl || null
      if (input.transcriptName !== undefined) row.transcript_name = input.transcriptName || null
      if (input.status !== undefined) row.status = input.status
      if (input.consultantId !== undefined) row.consultant_id = input.consultantId || null
      if (input.sharedWith !== undefined) row.shared_with = input.sharedWith
      const { error } = await supabase.from('post_contract_consults').update(row).eq('id', input.id)
      if (error) throw error

      // 이미 알림을 받은 사람에게 또 보내지 않는다.
      const added = (input.sharedWith || []).filter((u) => !(input.previousSharedWith || []).includes(u))
      if (added.length && input.content !== undefined) {
        try {
          await notifyShared(added, {
            studentId: input.studentId,
            studentName: input.studentName || '',
            consultDate: input.consultDate || '',
            content: input.content,
            authorName: input.authorName,
          })
        } catch {
          // 알림은 부가 기능
        }
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['post-contract-consults', v.studentId] }),
  })
}

export function useDeletePostContractConsult() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; studentId: string }) => {
      const { error } = await supabase.from('post_contract_consults').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['post-contract-consults', v.studentId] }),
  })
}

/**
 * 전사본을 Point / Concerns / Solutions / Follow-up 으로 요약한다.
 *
 * Claude 는 음성을 못 읽는다. 그래서 여기 들어오는 건 이미 글이 된 전사본이거나
 * 손으로 적은 메모다. 음성 자동 전사를 붙이려면 전사 서비스의 키를 받아
 * summarize-consult 앞단에 전사 단계를 더하면 된다 — 화면과 이 자리는 그대로 쓴다.
 */
export function useSummarizeConsult() {
  return useMutation({
    mutationFn: async (input: {
      text: string
      studentName?: string
      parentName?: string
    }): Promise<ConsultSummary> => {
      const { data, error } = await supabase.functions.invoke('summarize-consult', {
        body: {
          text: input.text.slice(-TRANSCRIPT_MAX_CHARS),
          studentName: input.studentName || '',
          parentName: input.parentName || '',
        },
      })
      if (error) {
        // 함수를 아직 배포하지 않았을 때가 가장 흔하다 — 무엇을 해야 하는지 알려 준다
        throw new Error(
          `요약에 실패했습니다: ${error.message}` +
          ' (Supabase 대시보드에서 summarize-consult 함수를 배포했는지 확인해 주세요)',
        )
      }
      if (data?.error) throw new Error(data.error)
      return {
        point: (data?.point as string) || '',
        concerns: (data?.concerns as string) || '',
        solutions: (data?.solutions as string) || '',
        followUp: (data?.followUp as string) || '',
      }
    },
  })
}

/** 전사본 파일을 Storage 에 올리고 공개 주소를 돌려준다. */
export async function uploadTranscript(studentId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
  const path = `${studentId}/${Date.now()}-${safe}`
  const { error } = await supabase.storage
    .from('consult-transcripts')
    .upload(path, file, { upsert: true })
  if (error) throw new Error(`전사본 올리기 실패: ${error.message}`)
  return supabase.storage.from('consult-transcripts').getPublicUrl(path).data.publicUrl
}
