import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 수금 메모 — 계약별로 쌓이는 기록.
 *
 * 납입 일정이 바뀌는 일은 흔하다. 날짜를 미루고, 현금으로 일부만 받고, 환율 때문에
 * 쪼개 보내고. 그런데 그 사정을 적어 둘 데가 없어 계약서 여백에 손으로 적히거나
 * (김민준 건의 '잔금 500만 현금 지급예정'처럼) 아무 데도 안 남았다. 남지 않으면
 * 나중에 숫자가 왜 이런지 아무도 모른다.
 *
 * 한 칸짜리 메모가 아니라 쌓이는 기록으로 둔다. 덮어쓰면 "언제 무엇이 바뀌었나"가
 * 사라지는데, 수금에서 알고 싶은 건 바로 그것이다.
 */
export interface ContractPaymentNote {
  id: string
  contractId: string
  content: string
  createdBy?: string
  authorName?: string
  createdAt: string
  updatedAt: string
}

function mapNote(r: Record<string, unknown>): ContractPaymentNote {
  const profile = r.profiles as { name?: string } | null
  return {
    id: r.id as string,
    contractId: r.contract_id as string,
    content: (r.content as string) || '',
    createdBy: (r.created_by as string) || undefined,
    // 작성 당시 이름을 함께 남긴다 — 퇴사해 프로필이 지워져도 누가 썼는지 남아야 한다
    authorName: (r.author_name as string) || profile?.name || undefined,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) || (r.created_at as string),
  }
}

export function useContractPaymentNotes(contractId?: string) {
  return useQuery({
    queryKey: ['contract-payment-notes', contractId],
    enabled: !!contractId,
    queryFn: async (): Promise<ContractPaymentNote[]> => {
      const { data, error } = await supabase
        .from('contract_payment_notes')
        .select('*, profiles(name)')
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: false })
      if (error) {
        // 마이그레이션 전이면 테이블이 없다. 계약 화면 전체를 깨뜨리지 않는다.
        console.warn('Failed to fetch contract payment notes:', error.message)
        return []
      }
      return (data || []).map((r) => mapNote(r as Record<string, unknown>))
    },
  })
}

export function useCreateContractPaymentNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      contractId: string
      content: string
      createdBy?: string
      authorName?: string
    }) => {
      const { error } = await supabase.from('contract_payment_notes').insert({
        contract_id: input.contractId,
        content: input.content,
        created_by: input.createdBy || null,
        author_name: input.authorName || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['contract-payment-notes', v.contractId] }),
  })
}

export function useUpdateContractPaymentNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; contractId: string; content: string }) => {
      const { error } = await supabase
        .from('contract_payment_notes')
        .update({ content: input.content })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['contract-payment-notes', v.contractId] }),
  })
}

export function useDeleteContractPaymentNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; contractId: string }) => {
      const { error } = await supabase.from('contract_payment_notes').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['contract-payment-notes', v.contractId] }),
  })
}
