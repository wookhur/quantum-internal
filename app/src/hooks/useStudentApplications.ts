import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// 원서 지원상태 · 지원유형 옵션 (드롭다운)
export const APPLICATION_STATUSES = ['준비중', '제출완료', '합격', '불합격', '대기(WL)', '지원안함'] as const
export const APPLICATION_TYPES = ['ED', 'ED2', 'EA', 'REA', 'RD', 'Rolling'] as const

export interface StudentApplication {
  id: string
  studentId: string
  university?: string
  status?: string
  appType?: string
  deadline?: string
  sortOrder: number
}

function mapApp(r: Record<string, unknown>): StudentApplication {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    university: (r.university as string) || undefined,
    status: (r.status as string) || undefined,
    appType: (r.app_type as string) || undefined,
    deadline: (r.deadline as string) || undefined,
    sortOrder: (r.sort_order as number) ?? 0,
  }
}

export function useStudentApplications(studentId?: string) {
  return useQuery({
    queryKey: ['student_applications', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_applications')
        .select('*')
        .eq('student_id', studentId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapApp(r as Record<string, unknown>))
    },
  })
}

export function useUpsertStudentApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Partial<StudentApplication> & { studentId: string; id?: string }) => {
      const row: Record<string, unknown> = {
        student_id: a.studentId,
        university: a.university ?? null,
        status: a.status ?? null,
        app_type: a.appType ?? null,
        deadline: a.deadline || null,
        sort_order: a.sortOrder ?? 0,
        updated_at: new Date().toISOString(),
      }
      if (a.id) {
        const { error } = await supabase.from('student_applications').update(row).eq('id', a.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('student_applications').insert(row).select('id').single()
        if (error) throw error
        return (data as { id: string }).id
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['student_applications', v.studentId] }),
  })
}

export function useDeleteStudentApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('student_applications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['student_applications', v.studentId] }),
  })
}
