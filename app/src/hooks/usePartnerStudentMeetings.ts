import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PartnerStudentMeeting {
  id: string
  partnerId?: string
  studentName: string
  schoolName?: string
  meetingDate?: string
  program?: string
  content?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): PartnerStudentMeeting {
  return {
    id: row.id as string,
    partnerId: (row.partner_id as string) || undefined,
    studentName: row.student_name as string,
    schoolName: (row.school_name as string) || undefined,
    meetingDate: (row.meeting_date as string) || undefined,
    program: (row.program as string) || undefined,
    content: (row.content as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function usePartnerStudentMeetings(partnerId?: string) {
  return useQuery({
    queryKey: ['partner_student_meetings', partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_student_meetings')
        .select('*')
        .eq('partner_id', partnerId as string)
        .order('meeting_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreatePartnerStudentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: {
      partnerId?: string
      studentName: string
      schoolName?: string
      meetingDate?: string
      program?: string
      content?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('partner_student_meetings').insert({
        partner_id: m.partnerId || null,
        student_name: m.studentName,
        school_name: m.schoolName || null,
        meeting_date: m.meetingDate || null,
        program: m.program || null,
        content: m.content || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner_student_meetings', v.partnerId] }),
  })
}

export function useUpdatePartnerStudentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; partnerId?: string; meetingDate?: string; program?: string; content?: string }) => {
      const row: Record<string, unknown> = {}
      if (a.meetingDate !== undefined) row.meeting_date = a.meetingDate || null
      if (a.program !== undefined) row.program = a.program || null
      if (a.content !== undefined) row.content = a.content || null
      const { error } = await supabase.from('partner_student_meetings').update(row).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner_student_meetings', v.partnerId] }),
  })
}

export function useDeletePartnerStudentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; partnerId?: string }) => {
      const { error } = await supabase.from('partner_student_meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner_student_meetings', v.partnerId] }),
  })
}
