import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Per-employee KPI metric assignment.
 * Stored in app_settings under key "kpi_assignments".
 *
 * Shape: Record<profileId, { categories: string[], metrics: string[] }>
 * - categories: which high-level categories apply (marketing, sales, attendance)
 * - metrics: specific metric keys enabled (if empty, all metrics in enabled categories apply)
 */

export interface KpiAssignment {
  categories: string[]
  metrics: string[] // empty = all metrics in selected categories
  excluded?: boolean // true = completely hidden from KPI page
}

export type KpiAssignmentMap = Record<string, KpiAssignment>

const QUERY_KEY = ['app-settings', 'kpi_assignments']

export function useKpiAssignments() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'kpi_assignments')
        .single()
      if (error) return {} as KpiAssignmentMap
      return (data?.value || {}) as KpiAssignmentMap
    },
  })
}

export function useUpdateKpiAssignments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assignments: KpiAssignmentMap) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'kpi_assignments',
          value: assignments,
          updated_at: new Date().toISOString(),
        })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
