import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PartnerStudentMeeting {
  id: string
  partnerId?: string
  partnerAcademy?: string
  authorName?: string
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
    partnerAcademy: (row.partner_academy as string) || undefined,
    authorName: (row.author_name as string) || undefined,
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

/**
 * 같은 학원(academy) 소속 강사들이 서로의 코멘트를 볼 수 있도록,
 * partner_academy가 일치하거나(대소문자 무시) 본인이 작성한(partner_id) 미팅을 조회.
 */
export function usePartnerStudentMeetingsForAcademy(academy?: string, partnerId?: string) {
  return useQuery({
    queryKey: ['partner_student_meetings', 'academy', academy || '', partnerId || ''],
    enabled: !!(academy || partnerId),
    queryFn: async () => {
      const ors: string[] = []
      // 값에 공백/콤마가 있어도 안전하도록 큰따옴표로 감쌈 (ilike 정확 일치 = 대소문자 무시)
      if (academy) ors.push(`partner_academy.ilike."${academy}"`)
      if (partnerId) ors.push(`partner_id.eq.${partnerId}`)
      let q = supabase.from('partner_student_meetings').select('*')
      if (ors.length) q = q.or(ors.join(','))
      const { data, error } = await q.order('meeting_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

/** All partner meetings (admin/oversight). */
export function useAllPartnerStudentMeetings(enabled = true) {
  return useQuery({
    queryKey: ['partner_student_meetings', 'all'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_student_meetings')
        .select('*')
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
      partnerAcademy?: string
      authorName?: string
      studentName: string
      schoolName?: string
      meetingDate?: string
      program?: string
      content?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('partner_student_meetings').insert({
        partner_id: m.partnerId || null,
        partner_academy: m.partnerAcademy || null,
        author_name: m.authorName || null,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_student_meetings'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_student_meetings'] }),
  })
}

export function useDeletePartnerStudentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; partnerId?: string }) => {
      const { error } = await supabase.from('partner_student_meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_student_meetings'] }),
  })
}
