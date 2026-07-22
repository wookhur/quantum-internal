import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export interface Attendance {
  id: string
  profileId: string
  date: string           // YYYY-MM-DD
  clockIn: string | null  // HH:mm
  clockOut: string | null // HH:mm
  scheduleStart: string | null
  scheduleEnd: string | null
  note: string | null
  lateExempt: boolean       // 지각 처리 수동 해제 (근무시간은 유지)
  createdAt: string
  updatedAt: string
}

function mapAttendance(row: Record<string, unknown>): Attendance {
  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    date: row.date as string,
    clockIn: row.clock_in as string | null,
    clockOut: row.clock_out as string | null,
    scheduleStart: row.schedule_start as string | null,
    scheduleEnd: row.schedule_end as string | null,
    note: row.note as string | null,
    lateExempt: !!row.late_exempt,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Fetch attendances for a given month (YYYY-MM) */
export function useAttendances(month: string) {
  return useQuery({
    queryKey: ['attendances', month],
    queryFn: async () => {
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('profile_id', { ascending: true })

      if (error) throw error
      return (data || []).map((r) => mapAttendance(r as Record<string, unknown>))
    },
  })
}

/**
 * Fetch attendances for an arbitrary date range (inclusive).
 * Used by the weekly view, where a week can straddle two months.
 */
export function useAttendancesRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['attendances', 'range', startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('profile_id', { ascending: true })

      if (error) throw error
      return (data || []).map((r) => mapAttendance(r as Record<string, unknown>))
    },
  })
}

/** Upsert a single attendance record */
export function useUpsertAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      profileId: string
      date: string
      clockIn?: string | null
      clockOut?: string | null
      scheduleStart?: string | null
      scheduleEnd?: string | null
      note?: string | null
    }) => {
      const { data, error } = await supabase
        .from('attendances')
        .upsert(
          {
            profile_id: params.profileId,
            date: params.date,
            clock_in: params.clockIn ?? null,
            clock_out: params.clockOut ?? null,
            schedule_start: params.scheduleStart ?? null,
            schedule_end: params.scheduleEnd ?? null,
            note: params.note ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id,date' },
        )
        .select()
        .single()
      if (error) throw error
      return mapAttendance(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendances'] }),
  })
}

/** Bulk upsert attendance records */
export function useBulkUpsertAttendances() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (records: {
      profileId: string
      date: string
      clockIn?: string | null
      clockOut?: string | null
      scheduleStart?: string | null
      scheduleEnd?: string | null
      note?: string | null
    }[]) => {
      const rows = records.map(r => ({
        profile_id: r.profileId,
        date: r.date,
        clock_in: r.clockIn ?? null,
        clock_out: r.clockOut ?? null,
        schedule_start: r.scheduleStart ?? null,
        schedule_end: r.scheduleEnd ?? null,
        note: r.note ?? null,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('attendances')
        .upsert(rows, { onConflict: 'profile_id,date' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendances'] }),
  })
}

/** Toggle the manual 지각 면제(late-exempt) flag on one record (keeps clock times). */
export function useSetLateExempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; lateExempt: boolean }) => {
      const { error } = await supabase
        .from('attendances')
        .update({ late_exempt: params.lateExempt, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendances'] }),
  })
}

/** Delete attendance record */
export function useDeleteAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendances').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendances'] }),
  })
}
