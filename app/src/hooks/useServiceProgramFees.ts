import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { canonicalPartnerName } from '@/lib/partners'
import type { RefundStatus } from '@/types'

/** A Student-360 program (EC activity or academic support) surfaced as an
 *  external service fee item. Contributors come from Student 360; billing and
 *  per-contributor % are set by admins on the External Service Fees page. */
export interface ServiceProgramFee {
  id: string
  /** manual = 서비스입금관리에서 손으로 적은 불규칙 정산 건 (360 프로그램에 걸 수 없는 것) */
  source: 'ec' | 'academic' | 'manual'
  studentId: string
  studentName: string
  studentKoreanName?: string
  label: string          // EC: partner / Academic: academy name
  detail?: string        // EC: program / Academic: subject
  serviceMonth?: string  // 교육비 처리 월 (1월..12월 / 여름특강 / 겨울특강)
  periodStart?: string
  periodEnd?: string
  contributor1?: string
  contributor2?: string
  billedAmount?: number
  paidAmount?: number      // 실제 입금금액(페이백 반영). 인센티브는 청구금액 기준.
  currency: string
  collectionStatus: 'pending' | 'paid'
  paidDate?: string
  contributor1Percentage?: number
  contributor2Percentage?: number
  contributor1Team?: 'sales' | 'service' | 'none'
  contributor2Team?: 'sales' | 'service' | 'none'
  /** 건별로 직접 고른 인센티브 요율(%). 있으면 파트너사 수수료표 대신 이걸 쓴다. */
  incentiveRate?: number
  // 환불(건별)
  refundStatus?: RefundStatus
  refundAmount?: number
  refundDate?: string
  refundReason?: string
}

function num(v: unknown): number | undefined {
  return v != null ? Number(v) : undefined
}

/** All EC + academic-support programs across every student, for the fees page. */
export function useAllServiceProgramFees() {
  return useQuery({
    queryKey: ['service-program-fees'],
    queryFn: async () => {
      const [ecRes, acRes, mfRes] = await Promise.all([
        supabase
          .from('service_ec_activities')
          .select('*, service_students:student_id(name, korean_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('service_academic_support')
          .select('*, service_students:student_id(name, korean_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('service_manual_fees')
          .select('*, service_students:student_id(name, korean_name)')
          .order('settlement_month', { ascending: false }),
      ])
      if (ecRes.error) throw ecRes.error
      if (acRes.error) throw acRes.error

      const out: ServiceProgramFee[] = []
      for (const r of ecRes.data || []) {
        const s = r.service_students as Record<string, unknown> | null
        out.push({
          id: r.id as string,
          source: 'ec',
          studentId: r.student_id as string,
          studentName: (s?.name as string) || '',
          studentKoreanName: (s?.korean_name as string) || undefined,
          label: canonicalPartnerName(r.partner as string) || 'EC',
          detail: (r.program as string) || undefined,
          serviceMonth: (r.service_month as string) || undefined,
          periodStart: (r.period_start as string) || undefined,
          periodEnd: (r.period_end as string) || undefined,
          contributor1: (r.sales_contributor_1 as string) || undefined,
          contributor2: (r.sales_contributor_2 as string) || undefined,
          billedAmount: num(r.billed_amount),
          paidAmount: num(r.paid_amount),
          currency: (r.currency as string) || 'KRW',
          collectionStatus: (r.collection_status as 'pending' | 'paid') || 'pending',
          paidDate: (r.paid_date as string) || undefined,
          contributor1Percentage: num(r.contributor_1_percentage),
          contributor2Percentage: num(r.contributor_2_percentage),
          contributor1Team: (r.contributor_1_team as 'sales' | 'service') || undefined,
          contributor2Team: (r.contributor_2_team as 'sales' | 'service') || undefined,
          refundStatus: (r.refund_status as RefundStatus) || undefined,
          refundAmount: num(r.refund_amount),
          refundDate: (r.refund_date as string) || undefined,
          refundReason: (r.refund_reason as string) || undefined,
        })
      }
      for (const r of acRes.data || []) {
        const s = r.service_students as Record<string, unknown> | null
        out.push({
          id: r.id as string,
          source: 'academic',
          studentId: r.student_id as string,
          studentName: (s?.name as string) || '',
          studentKoreanName: (s?.korean_name as string) || undefined,
          label: canonicalPartnerName(r.academy_name as string) || 'Academic',
          detail: (r.subject as string) || undefined,
          serviceMonth: (r.service_month as string) || undefined,
          periodStart: (r.period_start as string) || undefined,
          periodEnd: (r.period_end as string) || undefined,
          contributor1: (r.sales_contributor_1 as string) || undefined,
          contributor2: (r.sales_contributor_2 as string) || undefined,
          billedAmount: num(r.billed_amount),
          paidAmount: num(r.paid_amount),
          currency: (r.currency as string) || 'KRW',
          collectionStatus: (r.collection_status as 'pending' | 'paid') || 'pending',
          paidDate: (r.paid_date as string) || undefined,
          contributor1Percentage: num(r.contributor_1_percentage),
          contributor2Percentage: num(r.contributor_2_percentage),
          contributor1Team: (r.contributor_1_team as 'sales' | 'service') || undefined,
          contributor2Team: (r.contributor_2_team as 'sales' | 'service') || undefined,
          refundStatus: (r.refund_status as RefundStatus) || undefined,
          refundAmount: num(r.refund_amount),
          refundDate: (r.refund_date as string) || undefined,
          refundReason: (r.refund_reason as string) || undefined,
        })
      }
      // 수기 입금 내역. 마이그레이션 전이면 테이블이 없으니 조용히 건너뛴다 —
      // 이 훅은 11곳이 쓰므로 여기서 던지면 화면이 통째로 멈춘다.
      if (mfRes.error) {
        console.warn('Failed to fetch manual service fees:', mfRes.error.message)
      } else {
        for (const r of mfRes.data || []) {
          const st = r.service_students as Record<string, unknown> | null
          const month = (r.settlement_month as string) || ''
          out.push({
            id: r.id as string,
            source: 'manual',
            studentId: r.student_id as string,
            studentName: (st?.name as string) || '',
            studentKoreanName: (st?.korean_name as string) || undefined,
            label: (r.title as string) || '수기 정산',
            detail: (r.note as string) || undefined,
            // 목록의 월 칩은 '10월' 꼴 — 정산월에서 만들어 쓴다(따로 저장하면 서로 어긋난다)
            serviceMonth: month ? `${Number(month.slice(5, 7))}월` : undefined,
            contributor1: (r.sales_contributor_1 as string) || undefined,
            billedAmount: num(r.billed_amount),
            // 입금액 하나만 받는다 — 청구금액과 실입금이 같은 건이다
            paidAmount: num(r.billed_amount),
            currency: (r.currency as string) || 'KRW',
            // 돈이 들어온 것을 적는 칸이라 수금 완료로 둔다
            collectionStatus: 'paid',
            // 인센티브가 잡히는 달은 paidDate 의 월이다 — 고른 정산월 1일로 맞춘다
            paidDate: month ? `${month}-01` : undefined,
            incentiveRate: num(r.incentive_rate),
          })
        }
      }

      return out
    },
  })
}

// ─────────────── 수기 입금 내역 쓰기 ───────────────
// 읽기는 위 useAllServiceProgramFees 에 합쳐져 있어, 재무 대시보드·인센티브
// 인보이스는 따로 손대지 않아도 이 건들을 함께 집계한다.

function invalidateFees(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['service-program-fees'] })
}

export interface ManualFeeInput {
  studentId: string
  settlementMonth: string   // 'YYYY-MM'
  title?: string
  billedAmount: number
  incentiveRate: number     // %
  contributor1?: string
  note?: string
  currency?: string
}

export function useCreateManualServiceFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ManualFeeInput & { createdBy?: string; authorName?: string }) => {
      const { error } = await supabase.from('service_manual_fees').insert({
        student_id: input.studentId,
        settlement_month: input.settlementMonth,
        title: input.title?.trim() || null,
        billed_amount: input.billedAmount,
        currency: input.currency || 'KRW',
        incentive_rate: input.incentiveRate,
        sales_contributor_1: input.contributor1?.trim() || null,
        note: input.note?.trim() || null,
        created_by: input.createdBy || null,
        author_name: input.authorName || null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateFees(qc),
  })
}

export function useUpdateManualServiceFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<ManualFeeInput> & { id: string }) => {
      const row: Record<string, unknown> = {}
      if (input.settlementMonth !== undefined) row.settlement_month = input.settlementMonth
      if (input.title !== undefined) row.title = input.title?.trim() || null
      if (input.billedAmount !== undefined) row.billed_amount = input.billedAmount
      if (input.incentiveRate !== undefined) row.incentive_rate = input.incentiveRate
      if (input.contributor1 !== undefined) row.sales_contributor_1 = input.contributor1?.trim() || null
      if (input.note !== undefined) row.note = input.note?.trim() || null
      const { error } = await supabase.from('service_manual_fees').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => invalidateFees(qc),
  })
}

export function useDeleteManualServiceFee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_manual_fees').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateFees(qc),
  })
}
