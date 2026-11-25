import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'

/**
 * 주간 출근 스케줄 — 컨설턴트가 매주 금요일까지 다음 주를 미리 적는다.
 *
 * attendances(실제 출퇴근 기록)와는 다른 표다. 이쪽은 '앞으로 언제 나오기로
 * 했나'이고, 그쪽은 '실제로 몇 시에 찍었나'다. 섞으면 나중에 어느 쪽이 사실인지
 * 알 수 없게 되므로 따로 둔다.
 */

export type ShiftKind = 'office' | 'remote' | 'off'

export interface WorkShift {
  id: string
  userId: string
  workDate: string          // YYYY-MM-DD
  kind: ShiftKind
  startTime?: string        // HH:mm (kind='off' 이면 없음)
  endTime?: string
  note?: string
}

/** 저장할 때 넘기는 꼴 — id 는 서버가 만든다. */
export interface WorkShiftInput {
  workDate: string
  kind: ShiftKind
  startTime?: string
  endTime?: string
  note?: string
}

export const SHIFT_KIND_LABEL: Record<ShiftKind, string> = {
  office: '출근',
  remote: '재택',
  off: '휴무',
}

/** 'HH:mm:ss' 로 돌아오는 time 값을 'HH:mm' 으로. */
function hhmm(v: unknown): string | undefined {
  const s = (v as string) || ''
  return s ? s.slice(0, 5) : undefined
}

function mapShift(row: Record<string, unknown>): WorkShift {
  const kind = (row.kind as string) || 'office'
  return {
    id: row.id as string,
    userId: row.user_id as string,
    workDate: ((row.work_date as string) || '').slice(0, 10),
    kind: (kind === 'remote' || kind === 'off' ? kind : 'office') as ShiftKind,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    note: (row.note as string) || undefined,
  }
}

/** 기간 안의 모든 사람 출근 스케줄. */
export function useWorkShifts(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['work-shifts', startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: async () => {
      const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
        supabase
          .from('work_shifts')
          .select('id, user_id, work_date, kind, start_time, end_time, note')
          .gte('work_date', startDate!)
          .lte('work_date', endDate!)
          .range(from, to),
      )
      return rows.map(mapShift)
    },
    // 표가 아직 없으면(마이그레이션 전) 화면 전체가 죽지 않게 조용히 빈 배열
    retry: false,
  })
}

/**
 * 한 사람의 한 주치를 통째로 저장한다.
 *
 * 넘긴 날짜는 upsert 하고, 그 주에서 빠진 날짜는 지운다 — '휴무'와 '아직 안 적음'을
 * 구분해야 금요일 마감을 챙길 수 있기 때문이다. 둘 다 '줄 없음'으로 두면 못 가린다.
 */
export function useSaveWorkShifts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      userId: string
      /** 이 주의 전체 날짜(월~일). 여기 있는데 shifts 에 없으면 지운다. */
      weekDates: string[]
      shifts: WorkShiftInput[]
    }) => {
      const { userId, weekDates, shifts } = args
      const keep = new Set(shifts.map(s => s.workDate))
      const remove = weekDates.filter(d => !keep.has(d))

      if (remove.length) {
        const { error } = await supabase
          .from('work_shifts')
          .delete()
          .eq('user_id', userId)
          .in('work_date', remove)
        if (error) throw error
      }

      if (shifts.length) {
        const rows = shifts.map(s => ({
          user_id: userId,
          work_date: s.workDate,
          kind: s.kind,
          // 휴무에 시간이 남아 있으면 화면에 '휴무 10:00' 처럼 보인다 — 지우고 넣는다
          start_time: s.kind === 'off' ? null : (s.startTime || null),
          end_time: s.kind === 'off' ? null : (s.endTime || null),
          note: s.note || null,
          updated_at: new Date().toISOString(),
        }))
        const { error } = await supabase
          .from('work_shifts')
          .upsert(rows, { onConflict: 'user_id,work_date' })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-shifts'] })
    },
  })
}
