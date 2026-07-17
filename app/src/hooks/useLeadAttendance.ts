import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type AttendanceStatus = 'planned' | 'unsure' | 'no_contact' | 'attended'

export interface LeadAttendance {
  id: string
  leadId: string
  seminarId: string
  sessionLabel: string
  status: AttendanceStatus
}

export const ATTENDANCE_OPTIONS: { value: AttendanceStatus; ko: string; badge: string }[] = [
  { value: 'planned',    ko: '참석예정', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'unsure',     ko: '미정',     badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'no_contact', ko: '연락안됨', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  { value: 'attended',   ko: '참석완료', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
]

function mapRow(r: Record<string, unknown>): LeadAttendance {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    seminarId: r.seminar_id as string,
    sessionLabel: (r.session_label as string) || '',
    status: (r.status as AttendanceStatus) || 'planned',
  }
}

/** All attendance rows (for list badges + aggregation). */
export function useAllLeadAttendance() {
  return useQuery({
    queryKey: ['lead-seminar-attendance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_seminar_attendance').select('*')
      if (error) { console.warn('attendance fetch failed:', error.message); return [] as LeadAttendance[] }
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useUpsertLeadAttendance() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { leadId: string; seminarId: string; sessionLabel: string; status: AttendanceStatus }) => {
      const { error } = await supabase.from('lead_seminar_attendance').upsert({
        lead_id: input.leadId,
        seminar_id: input.seminarId,
        session_label: input.sessionLabel,
        status: input.status,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lead_id,seminar_id,session_label' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-seminar-attendance'] }),
  })
}
