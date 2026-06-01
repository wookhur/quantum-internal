import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface KpiTarget {
  id: string
  profileId: string
  month: string
  category: 'marketing' | 'sales' | 'attendance'
  metricKey: string
  targetValue: number
  actualValue: number
  note: string | null
}

export const MARKETING_METRICS = [
  { key: 'upload_count', labelKey: 'kpiTarget.uploadCount' },
  { key: 'followers', labelKey: 'kpiTarget.followers' },
  { key: 'seminar_recruit', labelKey: 'kpiTarget.seminarRecruit' },
] as const

export const SALES_METRICS = [
  { key: 'db_to_first_consult', labelKey: 'kpiTarget.dbToFirstConsult' },
  { key: 'first_to_second_consult', labelKey: 'kpiTarget.firstToSecondConsult' },
  { key: 'consult_note_rate', labelKey: 'kpiTarget.consultNoteRate' },
  { key: 'consult_note_24h_rate', labelKey: 'kpiTarget.consultNote24hRate' },
] as const

export const ATTENDANCE_METRICS = [
  { key: 'attendance_days', labelKey: 'kpiTarget.attendanceDays' },
  { key: 'late_count', labelKey: 'kpiTarget.lateCount' },
] as const

export function useKpiTargets(month: string) {
  return useQuery({
    queryKey: ['kpi-targets', month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_targets')
        .select('*')
        .eq('month', month)
        .order('profile_id')
      if (error) throw error
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        profileId: r.profile_id as string,
        month: r.month as string,
        category: r.category as KpiTarget['category'],
        metricKey: r.metric_key as string,
        targetValue: Number(r.target_value),
        actualValue: Number(r.actual_value),
        note: r.note as string | null,
      }))
    },
  })
}

export function useUpsertKpiTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      profileId: string
      month: string
      category: string
      metricKey: string
      targetValue: number
      actualValue: number
      note?: string | null
    }) => {
      const { error } = await supabase
        .from('kpi_targets')
        .upsert(
          {
            profile_id: input.profileId,
            month: input.month,
            category: input.category,
            metric_key: input.metricKey,
            target_value: input.targetValue,
            actual_value: input.actualValue,
            note: input.note || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,month,metric_key' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi-targets'] })
    },
  })
}

export function useDeleteKpiTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kpi_targets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi-targets'] })
    },
  })
}
