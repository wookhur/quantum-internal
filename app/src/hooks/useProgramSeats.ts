import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ServiceProgram {
  id: string
  key: string
  name: string
  subtitle?: string      // 이름 아래 작은 부제(담당자·기관). 그룹 소속이면 그룹 밴드의 부제로 쓰임
  groupName?: string
  capacity: number       // 학년당 정원
  sortOrder: number
}

export interface SeatAssignment {
  id: string
  programId: string
  studentId: string
}

function mapProgram(r: Record<string, unknown>): ServiceProgram {
  return {
    id: r.id as string,
    key: r.key as string,
    name: r.name as string,
    subtitle: (r.subtitle as string) || undefined,
    groupName: (r.group_name as string) || undefined,
    capacity: Number(r.capacity) || 0,
    sortOrder: Number(r.sort_order) || 0,
  }
}

export function useServicePrograms() {
  return useQuery({
    queryKey: ['service_programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_programs')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapProgram(r as Record<string, unknown>))
    },
  })
}

export function useProgramSeatAssignments() {
  return useQuery({
    queryKey: ['program_seat_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_seat_assignments')
        .select('id, program_id, student_id')
      if (error) throw error
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        programId: r.program_id as string,
        studentId: r.student_id as string,
      })) as SeatAssignment[]
    },
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { name: string; subtitle?: string; groupName?: string; capacity: number; sortOrder?: number }) => {
      // key는 안정적 slug — 이름 기반 + 타임스탬프로 유일성 확보
      const base = (p.name || 'program').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'program'
      const key = `${base}_${Math.floor(Date.now() / 1000)}`
      const { error } = await supabase.from('service_programs').insert({
        key,
        name: p.name,
        subtitle: p.subtitle || null,
        group_name: p.groupName || null,
        capacity: p.capacity,
        sort_order: p.sortOrder ?? 999,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_programs'] }),
  })
}

export function useUpdateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; name?: string; subtitle?: string | null; groupName?: string | null; capacity?: number; sortOrder?: number }) => {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (p.name !== undefined) update.name = p.name
      if (p.subtitle !== undefined) update.subtitle = p.subtitle || null
      if (p.groupName !== undefined) update.group_name = p.groupName || null
      if (p.capacity !== undefined) update.capacity = p.capacity
      if (p.sortOrder !== undefined) update.sort_order = p.sortOrder
      const { error } = await supabase.from('service_programs').update(update).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_programs'] }),
  })
}

export function useDeleteProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_programs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_programs'] })
      qc.invalidateQueries({ queryKey: ['program_seat_assignments'] })
    },
  })
}

export function useAssignSeat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { programId: string; studentId: string }) => {
      const { error } = await supabase.from('program_seat_assignments').insert({
        program_id: a.programId,
        student_id: a.studentId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['program_seat_assignments'] }),
  })
}

export function useUnassignSeat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('program_seat_assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['program_seat_assignments'] }),
  })
}
