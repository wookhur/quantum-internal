import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CashEventKind, TimelineEvent } from '@/lib/cashflowTimeline'

/**
 * 자금 흐름표의 단건 항목 — 기준 잔고, 대출 입금·상환, 인테리어 잔금처럼
 * 계약 수금(payment_installments)과 고정비(fixed_expenses)로 설명되지 않는 것들.
 */

export interface CashEvent extends TimelineEvent {
  createdAt: string
}

function mapEvent(row: Record<string, unknown>): CashEvent {
  return {
    id: row.id as string,
    eventDate: ((row.event_date as string) || '').slice(0, 10),
    label: (row.label as string) || '',
    amount: Number(row.amount) || 0,
    kind: ((row.kind as string) || 'other') as CashEventKind,
    currency: ((row.currency as string) || 'KRW') as 'KRW' | 'USD',
    settled: !!row.settled,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
  }
}

export function useCashEvents() {
  return useQuery({
    queryKey: ['cash-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_events')
        .select('*')
        .order('event_date', { ascending: true })
      if (error) {
        // 표가 아직 없으면(마이그레이션 전) 화면 전체가 죽지 않게 조용히 비운다
        console.warn('cash_events 조회 실패:', error.message)
        return [] as CashEvent[]
      }
      return (data || []).map(r => mapEvent(r as Record<string, unknown>))
    },
    retry: false,
  })
}

export interface CashEventInput {
  eventDate: string
  label: string
  amount: number
  kind: CashEventKind
  currency?: 'KRW' | 'USD'
  settled?: boolean
  notes?: string
}

export function useSaveCashEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id?: string; input: CashEventInput; createdBy?: string }) => {
      const row = {
        event_date: args.input.eventDate,
        label: args.input.label,
        amount: args.input.amount,
        kind: args.input.kind,
        currency: args.input.currency || 'KRW',
        settled: args.input.settled ?? false,
        notes: args.input.notes || null,
        updated_at: new Date().toISOString(),
      }
      if (args.id) {
        const { error } = await supabase.from('cash_events').update(row).eq('id', args.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('cash_events')
          .insert({ ...row, created_by: args.createdBy || null })
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-events'] }) },
  })
}

export function useDeleteCashEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cash_events').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cash-events'] }) },
  })
}
