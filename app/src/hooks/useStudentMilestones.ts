import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StudentMilestone, MilestoneType, MilestoneStatus } from '@/types'

function mapMilestone(row: Record<string, unknown>): StudentMilestone {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    type: row.type as MilestoneType,
    title: row.title as string,
    date: row.date as string,
    status: row.status as MilestoneStatus,
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export interface DashboardMilestone extends StudentMilestone {
  studentName: string
  studentConsultant?: string
}

export function useAllStudentMilestones(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['student_milestones_range', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_milestones')
        .select('*, service_students!inner(name, assigned_consultant)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
      if (error) throw error
      return (data || []).map((row: Record<string, unknown>) => {
        const s = row.service_students as Record<string, unknown>
        return {
          ...mapMilestone(row),
          studentName: (s?.name as string) || '',
          studentConsultant: (s?.assigned_consultant as string) || undefined,
        } as DashboardMilestone
      })
    },
  })
}

export function useStudentMilestones(studentId?: string) {
  return useQuery({
    queryKey: ['student_milestones', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_milestones')
        .select('*')
        .eq('student_id', studentId as string)
        .order('date', { ascending: true })
      if (error) throw error
      return (data || []).map(mapMilestone)
    },
  })
}

export function useCreateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: {
      studentId: string
      type: MilestoneType
      title: string
      date: string
      status?: MilestoneStatus
      notes?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('student_milestones').insert({
        student_id: m.studentId,
        type: m.type,
        title: m.title,
        date: m.date,
        status: m.status || 'upcoming',
        notes: m.notes || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapMilestone(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['student_milestones', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_milestones_range'] })
    },
  })
}

export function useUpdateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      studentId: string
      type?: MilestoneType
      title?: string
      date?: string
      status?: MilestoneStatus
      notes?: string
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.type !== undefined) update.type = rest.type
      if (rest.title !== undefined) update.title = rest.title
      if (rest.date !== undefined) update.date = rest.date
      if (rest.status !== undefined) update.status = rest.status
      if (rest.notes !== undefined) update.notes = rest.notes
      const { error } = await supabase.from('student_milestones').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['student_milestones', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_milestones_range'] })
    },
  })
}

export function useDeleteMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('student_milestones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['student_milestones', v.studentId] })
      qc.invalidateQueries({ queryKey: ['student_milestones_range'] })
    },
  })
}
