import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 원서·에세이 서비스 플랜: 총액을 (시작월~그해 12월) 개월수로 나눠 매월 컨설턴트에게 지급. */
export interface EssayPlan {
  id: string
  studentId: string
  studentName?: string
  studentKoreanName?: string
  consultantName?: string
  totalAmount: number
  startMonth: string      // 'YYYY-MM' (신청월)
  /**
   * 지급을 끊는 달 'YYYY-MM'. 비우면 그해 12월까지(종전과 같음).
   *
   * 에디터가 중간에 바뀌어 끝까지 못 맡은 경우에 쓴다 — 11월에 교체됐으면 10월로
   * 적어 11·12월분이 그 사람에게 나가지 않게 한다.
   */
  endMonth?: string
  packageLabel?: string   // 선택한 원서/에세이 패키지 (자동 총액 근거)
  currency?: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ─── 월 급여 계산 (시작월 포함 ~ 그해 12월) ─────────────────────────────────────
/** 'YYYY-MM' → 월 숫자(1~12) */
function monthNum(m: string): number { return Number((m || '').slice(5, 7)) || 0 }
/** 약정상 종료월 = 시작월 그해 12월. 월 지급액을 나누는 기준은 늘 이쪽이다. */
export function essayEndMonth(startMonth: string): string {
  return `${(startMonth || '').slice(0, 4)}-12`
}
/** 실제로 지급을 끊는 달 — 중간에 끊었으면 그 달, 아니면 약정 종료월(12월) */
export function essayPaidThrough(plan: Pick<EssayPlan, 'startMonth' | 'endMonth'>): string {
  const full = essayEndMonth(plan.startMonth)
  const e = (plan.endMonth || '').trim()
  // 약정 범위 밖으로 적힌 값은 무시한다 — 시작월보다 이르거나 12월을 넘길 수 없다
  if (!e || e < plan.startMonth || e > full) return full
  return e
}
/** 시작월~12월 개월수 (6월→7, 8월→5). 중간에 끊어도 이 값은 변하지 않는다. */
export function essayMonthCount(startMonth: string): number {
  const s = monthNum(startMonth)
  return s ? 12 - s + 1 : 0
}
/**
 * 특정 정산월(month, 'YYYY-MM')에 지급될 원서·에세이 급여.
 *
 * 나누는 기준(count)은 늘 '시작월~그해 12월' 이다. 중간에 끊어도 월 지급액은
 * 그대로 두고 지급 범위만 줄인다 — 끊었다고 월액이 올라가면, 못 받은 달의 몫이
 * 받은 달로 옮겨 붙어 더 많이 지급된다.
 *
 * 잔액 보정은 약정 마지막 달(12월)에만 한다. 중간에 끊은 경우 남은 금액은
 * 그대로 미지급으로 둔다 — 서비스를 끝까지 못 했으므로 총액을 다 받지 않는다.
 */
export function essayLineForMonth(
  plan: Pick<EssayPlan, 'totalAmount' | 'startMonth' | 'endMonth'>,
  month: string,
): { amount: number; index: number; count: number } | null {
  const start = plan.startMonth
  if (!start || month < start || month > essayPaidThrough(plan)) return null
  const count = essayMonthCount(start)
  if (count <= 0) return null
  const index = monthNum(month) - monthNum(start) + 1
  const base = Math.floor((plan.totalAmount || 0) / count)
  // 약정 마지막 달(12월)은 잔액까지 포함 → 끝까지 간 경우 합계가 정확히 총액
  const amount = monthNum(month) === 12 ? (plan.totalAmount || 0) - base * (count - 1) : base
  return { amount, index, count }
}

function mapRow(row: Record<string, unknown>): EssayPlan {
  const s = row.service_students as Record<string, unknown> | null
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentName: (s?.name as string) || undefined,
    studentKoreanName: (s?.korean_name as string) || undefined,
    consultantName: (row.consultant_name as string) || undefined,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : 0,
    startMonth: (row.start_month as string) || '',
    endMonth: (row.end_month as string) || undefined,
    packageLabel: (row.package_label as string) || undefined,
    currency: (row.currency as string) || 'KRW',
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** 한 학생의 원서·에세이 플랜 목록 */
export function useEssayPlans(studentId?: string) {
  return useQuery({
    queryKey: ['essay_plans', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('essay_service_plans')
        .select('*')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

/** 전 학생 원서·에세이 플랜 (인보이스 자동계산용) */
export function useAllEssayPlans() {
  return useQuery({
    queryKey: ['essay_plans_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('essay_service_plans')
        .select('*, service_students(name, korean_name)')
        .order('created_at', { ascending: false })
      if (error) {
        // 학생 조인(FK 임베드) 실패 시에도 플랜은 로드 → 인보이스 자동계산 유지(학생명만 생략)
        const { data: d2, error: e2 } = await supabase
          .from('essay_service_plans')
          .select('*')
          .order('created_at', { ascending: false })
        if (e2) throw e2
        return (d2 || []).map(mapRow)
      }
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateEssayPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Omit<EssayPlan, 'id' | 'createdAt' | 'updatedAt' | 'studentName' | 'studentKoreanName'>) => {
      const { data, error } = await supabase.from('essay_service_plans').insert({
        student_id: p.studentId,
        consultant_name: p.consultantName || null,
        total_amount: p.totalAmount ?? 0,
        start_month: p.startMonth,
        end_month: p.endMonth || null,
        package_label: p.packageLabel || null,
        currency: p.currency || 'KRW',
        notes: p.notes || null,
        created_by: p.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['essay_plans', v.studentId] })
      qc.invalidateQueries({ queryKey: ['essay_plans_all'] })
    },
  })
}

export function useUpdateEssayPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; studentId: string } & Partial<Omit<EssayPlan, 'id' | 'studentId' | 'createdAt' | 'updatedAt'>>) => {
      const row: Record<string, unknown> = {}
      if (p.consultantName !== undefined) row.consultant_name = p.consultantName || null
      if (p.totalAmount !== undefined) row.total_amount = p.totalAmount ?? 0
      if (p.startMonth !== undefined) row.start_month = p.startMonth
      // 빈 값 = 끊지 않음(그해 12월까지)
      if (p.endMonth !== undefined) row.end_month = p.endMonth || null
      if (p.packageLabel !== undefined) row.package_label = p.packageLabel || null
      if (p.currency !== undefined) row.currency = p.currency || 'KRW'
      if (p.notes !== undefined) row.notes = p.notes || null
      row.updated_at = new Date().toISOString()
      const { error } = await supabase.from('essay_service_plans').update(row).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['essay_plans', v.studentId] })
      qc.invalidateQueries({ queryKey: ['essay_plans_all'] })
    },
  })
}

export function useDeleteEssayPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('essay_service_plans').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['essay_plans', v.studentId] })
      qc.invalidateQueries({ queryKey: ['essay_plans_all'] })
    },
  })
}
