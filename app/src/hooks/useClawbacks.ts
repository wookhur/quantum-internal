import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from './useUserNotifications'
import { canonicalConsultantName } from '@/lib/consultants'

export type ClawbackStatus = 'pending' | 'deducted'

export interface Clawback {
  id: string
  source: 'contract' | 'service'
  sourceId?: string
  studentName?: string
  contributorName: string
  amount: number
  reason?: string
  deductMonth: string      // 'YYYY-MM'
  status: ClawbackStatus
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** 다음달 'YYYY-MM' (환불일 기준 기본 차감월) */
export function nextMonthKey(from?: string): string {
  const d = from ? new Date(`${from}T00:00:00`) : new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mapRow(r: Record<string, unknown>): Clawback {
  return {
    id: r.id as string,
    source: (r.source as 'contract' | 'service') || 'contract',
    sourceId: (r.source_id as string) || undefined,
    studentName: (r.student_name as string) || undefined,
    contributorName: (r.contributor_name as string) || '',
    amount: r.amount != null ? Number(r.amount) : 0,
    reason: (r.reason as string) || undefined,
    deductMonth: (r.deduct_month as string) || '',
    status: (r.status as ClawbackStatus) || 'pending',
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function useAllClawbacks() {
  return useQuery({
    queryKey: ['incentive_clawbacks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_clawbacks')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export interface ClawbackInput {
  source: 'contract' | 'service'
  sourceId?: string
  studentName?: string
  contributorName: string
  amount: number
  reason?: string
  deductMonth: string
}

/** 차감 기록 생성 + 담당자에게 알림(다음달 급여 차감 안내) */
export function useCreateClawbacks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, createdBy }: { items: ClawbackInput[]; createdBy?: string }) => {
      const valid = items.filter(i => i.contributorName.trim() && i.amount > 0)
      if (!valid.length) return
      const { error } = await supabase.from('incentive_clawbacks').insert(valid.map(i => ({
        source: i.source,
        source_id: i.sourceId || null,
        student_name: i.studentName || null,
        contributor_name: i.contributorName.trim(),
        amount: i.amount,
        reason: i.reason || null,
        deduct_month: i.deductMonth,
        status: 'pending',
        created_by: createdBy || null,
      })))
      if (error) throw error
      // 담당자 알림 (이름 → profile id 해소)
      const { data: profiles } = await supabase.from('profiles').select('id, name')
      const profs = (profiles || []) as { id: string; name: string }[]
      for (const i of valid) {
        const canon = canonicalConsultantName(i.contributorName)
        const prof = profs.find(p => canonicalConsultantName(p.name) === canon)
        if (!prof) continue
        await createNotificationsForUsers([prof.id], {
          type: 'incentive_clawback',
          title: '인센티브 차감 예정',
          message: `${i.studentName ? i.studentName + ' ' : ''}환불 처리로 세일즈 인센티브 ₩${Math.round(i.amount).toLocaleString()}이(가) ${i.deductMonth} 급여에서 차감됩니다.`,
          link: '/finance/dashboard',
          metadata: { source: i.source, sourceId: i.sourceId, amount: i.amount, deductMonth: i.deductMonth },
        }).catch(() => {})
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive_clawbacks'] })
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
  })
}

export function useSetClawbackStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ClawbackStatus }) => {
      const { error } = await supabase.from('incentive_clawbacks')
        .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incentive_clawbacks'] }),
  })
}

export function useDeleteClawback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_clawbacks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incentive_clawbacks'] }),
  })
}
