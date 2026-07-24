import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type DailyTaskStatus = 'in_progress' | 'done'
export type DailyTaskSource = 'manual' | 'task_request'

export interface DailyTask {
  id: string
  userId: string
  taskDate: string          // YYYY-MM-DD
  title: string
  status: DailyTaskStatus
  sourceType: DailyTaskSource
  sourceTaskId?: string
  note?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapTask(r: Record<string, unknown>): DailyTask {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    taskDate: r.task_date as string,
    title: (r.title as string) || '',
    status: (r.status as DailyTaskStatus) || 'in_progress',
    sourceType: (r.source_type as DailyTaskSource) || 'manual',
    sourceTaskId: (r.source_task_id as string) || undefined,
    note: (r.note as string) || undefined,
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ─── 대상자 명단 ───
export interface DailyTaskMember { profileId: string; name?: string }

export function useDailyTaskMembers() {
  return useQuery({
    queryKey: ['daily-task-members'],
    queryFn: async (): Promise<DailyTaskMember[]> => {
      const { data, error } = await supabase
        .from('daily_task_members')
        .select('profile_id, profiles(name)')
      if (error) throw error
      return (data || []).map((r) => {
        const rr = r as Record<string, unknown>
        const p = rr.profiles as { name?: string } | null
        return { profileId: rr.profile_id as string, name: p?.name }
      })
    },
  })
}

export function useAddDailyTaskMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { profileIds: string[]; createdBy?: string }) => {
      if (!params.profileIds.length) return
      const rows = params.profileIds.map((id) => ({ profile_id: id, created_by: params.createdBy || null }))
      const { error } = await supabase.from('daily_task_members').upsert(rows, { onConflict: 'profile_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-task-members'] }),
  })
}

export function useRemoveDailyTaskMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.from('daily_task_members').delete().eq('profile_id', profileId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-task-members'] }),
  })
}

// ─── 일일 업무 ───
export function useDailyTasks(date: string) {
  return useQuery({
    queryKey: ['daily-tasks', date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('task_date', date)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapTask(r as Record<string, unknown>))
    },
  })
}

/** 기간 조회(주/월 뷰·대시보드용) */
export function useDailyTasksRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['daily-tasks', 'range', startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .gte('task_date', startDate)
        .lte('task_date', endDate)
        .order('task_date', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapTask(r as Record<string, unknown>))
    },
  })
}

export function useCreateDailyTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: {
      userId: string
      taskDate: string
      title: string
      sourceType?: DailyTaskSource
      sourceTaskId?: string
      note?: string
      createdBy?: string
    }) => {
      const { error } = await supabase.from('daily_tasks').insert({
        user_id: t.userId,
        task_date: t.taskDate,
        title: t.title.trim(),
        status: 'in_progress',
        source_type: t.sourceType || 'manual',
        source_task_id: t.sourceTaskId || null,
        note: t.note || null,
        created_by: t.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-tasks'] }),
  })
}

export function useUpdateDailyTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: { id: string; title?: string; status?: DailyTaskStatus; note?: string }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (t.title !== undefined) row.title = t.title.trim()
      if (t.status !== undefined) row.status = t.status
      if (t.note !== undefined) row.note = t.note || null
      const { error } = await supabase.from('daily_tasks').update(row).eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-tasks'] }),
  })
}

export function useDeleteDailyTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('daily_tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-tasks'] }),
  })
}
