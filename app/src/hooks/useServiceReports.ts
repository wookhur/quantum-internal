import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ServiceReport, ServiceReportCategory } from '@/types'

function mapReport(row: Record<string, unknown>): ServiceReport {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    category: row.category as ServiceReportCategory,
    grade: (row.grade as string) || undefined,
    label: (row.label as string) || undefined,
    url: row.url as string,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useServiceReports(studentId?: string) {
  return useQuery({
    queryKey: ['service_reports', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_reports')
        .select('*')
        .eq('student_id', studentId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapReport)
    },
  })
}

export function useCreateServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      studentId: string
      category: ServiceReportCategory
      grade?: string
      label?: string
      url: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_reports').insert({
        student_id: r.studentId,
        category: r.category,
        grade: r.grade,
        label: r.label,
        url: r.url,
        created_by: r.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapReport(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_reports', v.studentId] }),
  })
}

export function useUpdateServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      studentId: string
      grade?: string
      label?: string
      url?: string
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.grade !== undefined) update.grade = rest.grade
      if (rest.label !== undefined) update.label = rest.label
      if (rest.url !== undefined) update.url = rest.url
      const { error } = await supabase.from('service_reports').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_reports', v.studentId] }),
  })
}

export function useDeleteServiceReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_reports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_reports', v.studentId] }),
  })
}
