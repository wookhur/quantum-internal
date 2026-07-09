import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SeminarSession {
  /** UI label shown as the checkbox text, e.g. "7/18 (토) Natural Science". */
  label: string
  /** Optional "YYYY-MM-DD HH:mm" so future sorting/analytics have structured data. */
  datetime?: string | null
}

export interface Seminar {
  id: string
  title: string
  description: string | null
  date: string | null
  location: string | null
  maxCapacity: number | null
  active: boolean
  /** When non-empty, the public form renders checkboxes for these instead of the single `date`. */
  sessions: SeminarSession[]
  createdAt: string
}

export interface SeminarRegistration {
  id: string
  seminarId: string
  parentName: string
  phone: string
  email: string | null
  studentName: string
  grade: string | null
  school: string | null
  interest: string | null
  memo: string | null
  /** Session labels the registrant selected. Empty for legacy single-date seminars. */
  sessionLabels: string[]
  createdAt: string
}

function mapSeminar(r: Record<string, unknown>): Seminar {
  const rawSessions = r.sessions
  let sessions: SeminarSession[] = []
  if (Array.isArray(rawSessions)) {
    sessions = rawSessions
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map(s => ({
        label: String(s.label ?? ''),
        datetime: (s.datetime as string | null | undefined) ?? null,
      }))
      .filter(s => s.label)
  }
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string | null,
    date: r.date as string | null,
    location: r.location as string | null,
    maxCapacity: r.max_capacity as number | null,
    active: r.active as boolean,
    sessions,
    createdAt: r.created_at as string,
  }
}

function mapRegistration(r: Record<string, unknown>): SeminarRegistration {
  return {
    id: r.id as string,
    seminarId: r.seminar_id as string,
    parentName: r.parent_name as string,
    phone: r.phone as string,
    email: r.email as string | null,
    studentName: r.student_name as string,
    grade: r.grade as string | null,
    school: r.school as string | null,
    interest: r.interest as string | null,
    memo: r.memo as string | null,
    sessionLabels: Array.isArray(r.session_labels) ? (r.session_labels as string[]) : [],
    createdAt: r.created_at as string,
  }
}

export function useSeminars() {
  return useQuery({
    queryKey: ['seminars'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seminars')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapSeminar(r as Record<string, unknown>))
    },
  })
}

export function useSeminarById(id: string | undefined) {
  return useQuery({
    queryKey: ['seminars', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seminars')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return mapSeminar(data as Record<string, unknown>)
    },
  })
}

export function useCreateSeminar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      title: string
      description?: string | null
      date?: string | null
      location?: string | null
      maxCapacity?: number | null
      sessions?: SeminarSession[]
    }) => {
      const { data, error } = await supabase
        .from('seminars')
        .insert({
          title: params.title,
          description: params.description ?? null,
          date: params.date ?? null,
          location: params.location ?? null,
          max_capacity: params.maxCapacity ?? null,
          sessions: params.sessions ?? [],
        })
        .select()
        .single()
      if (error) throw error
      return mapSeminar(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seminars'] }),
  })
}

export function useUpdateSeminar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      title?: string
      description?: string | null
      date?: string | null
      location?: string | null
      maxCapacity?: number | null
      active?: boolean
      sessions?: SeminarSession[]
    }) => {
      const updates: Record<string, unknown> = {}
      if (params.title !== undefined) updates.title = params.title
      if (params.description !== undefined) updates.description = params.description
      if (params.date !== undefined) updates.date = params.date
      if (params.location !== undefined) updates.location = params.location
      if (params.maxCapacity !== undefined) updates.max_capacity = params.maxCapacity
      if (params.active !== undefined) updates.active = params.active
      if (params.sessions !== undefined) updates.sessions = params.sessions
      const { error } = await supabase.from('seminars').update(updates).eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seminars'] }),
  })
}

export function useDeleteSeminar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('seminars').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seminars'] }),
  })
}

export function useSeminarRegistrations(seminarId: string | undefined) {
  return useQuery({
    queryKey: ['seminar-registrations', seminarId],
    enabled: !!seminarId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seminar_registrations')
        .select('*')
        .eq('seminar_id', seminarId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapRegistration(r as Record<string, unknown>))
    },
  })
}

export function useSubmitRegistration() {
  return useMutation({
    mutationFn: async (params: {
      seminarId: string
      parentName: string
      phone: string
      email?: string | null
      studentName: string
      grade?: string | null
      school?: string | null
      interest?: string | null
      memo?: string | null
      sessionLabels?: string[]
    }) => {
      const { error } = await supabase.from('seminar_registrations').insert({
        seminar_id: params.seminarId,
        parent_name: params.parentName,
        phone: params.phone,
        email: params.email ?? null,
        student_name: params.studentName,
        grade: params.grade ?? null,
        school: params.school ?? null,
        interest: params.interest ?? null,
        memo: params.memo ?? null,
        session_labels: params.sessionLabels ?? [],
      })
      if (error) throw error
    },
  })
}

export function useDeleteRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('seminar_registrations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seminar-registrations'] }),
  })
}
