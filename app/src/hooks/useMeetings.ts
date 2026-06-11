import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Meeting } from '@/types'

function mapMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    leadId: row.lead_id as string | undefined,
    meetingDate: row.meeting_date as string,
    meetingNumber: row.meeting_number as number,
    parentName: row.parent_name as string,
    studentName: row.student_name as string | undefined,
    phone: row.phone as string | undefined,
    currentSchool: row.current_school as string | undefined,
    grade: row.grade as string | undefined,
    region: row.region as string | undefined,
    interestArea: row.interest_area as string | undefined,
    sourceChannel: row.source_channel as string | undefined,
    memo: row.memo as string | undefined,
    noteDelivered: (row.note_delivered as boolean) ?? false,
    nextMeetingDate: row.next_meeting_date as string | undefined,
    requiredAction: row.required_action as string | undefined,
    notePdfUrl: row.note_pdf_url as string | undefined,
    googleCalendarEventId: row.google_calendar_event_id as string | undefined,
    createdBy: row.created_by as string | undefined,
    createdAt: row.created_at as string,
  }
}

export function useMeetings(filters?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ['meetings', filters],
    queryFn: async () => {
      let query = supabase
        .from('meetings')
        .select('*')
        .order('meeting_date', { ascending: false })

      if (filters?.dateFrom) {
        query = query.gte('meeting_date', filters.dateFrom)
      }
      if (filters?.dateTo) {
        query = query.lte('meeting_date', filters.dateTo)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapMeeting)
    },
  })
}

/**
 * Match meeting to existing lead by (parentName + phone) or (parentName + studentName).
 * If no match, create a new lead. Returns lead_id.
 */
async function matchOrCreateLead(meeting: Partial<Meeting>): Promise<string | null> {
  if (!meeting.parentName) return null

  // 1) Try matching by phone (most reliable)
  if (meeting.phone) {
    const normalized = meeting.phone.replace(/[^0-9+]/g, '')
    if (normalized.length >= 8) {
      const { data: byPhone } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', meeting.phone)
        .limit(1)
      if (byPhone && byPhone.length > 0) return byPhone[0].id as string

      // Also try normalized match
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, phone')
        .neq('phone', '')
        .not('phone', 'is', null)
      if (allLeads) {
        const match = allLeads.find(
          (l) => (l.phone as string).replace(/[^0-9+]/g, '') === normalized,
        )
        if (match) return match.id as string
      }
    }
  }

  // 2) Try matching by parentName + studentName
  if (meeting.studentName) {
    const { data: byName } = await supabase
      .from('leads')
      .select('id')
      .eq('parent_name', meeting.parentName)
      .eq('student_name', meeting.studentName)
      .limit(1)
    if (byName && byName.length > 0) return byName[0].id as string
  }

  // 3) Try matching by parentName only (if unique)
  {
    const { data: byParent } = await supabase
      .from('leads')
      .select('id')
      .eq('parent_name', meeting.parentName)
    if (byParent && byParent.length === 1) return byParent[0].id as string
  }

  // 4) No match — create a new lead
  const newLead: Record<string, unknown> = {
    lead_date: meeting.meetingDate || new Date().toISOString().slice(0, 10),
    parent_name: meeting.parentName,
    pipeline_stage: 'consultation',
  }
  if (meeting.studentName) newLead.student_name = meeting.studentName
  if (meeting.phone) newLead.phone = meeting.phone
  if (meeting.currentSchool) newLead.current_school = meeting.currentSchool
  if (meeting.grade) newLead.grade = meeting.grade
  if (meeting.region) newLead.region = meeting.region
  if (meeting.sourceChannel) newLead.source_channel = meeting.sourceChannel

  const { data: created, error } = await supabase
    .from('leads')
    .insert(newLead)
    .select('id')
    .single()
  if (error) {
    console.error('Failed to create lead from meeting:', error.message)
    return null
  }

  // Create system activity
  await supabase.from('lead_activities').insert({
    lead_id: created.id,
    activity_type: 'system',
    title: '미팅 기록에서 자동 생성',
    content: `${meeting.parentName} 리드가 미팅 기록 추가 시 자동 생성되었습니다.`,
    created_by: meeting.createdBy ?? null,
  })

  return created.id as string
}

export function useCreateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: Partial<Meeting>) => {
      // Match or create lead first
      const leadId = await matchOrCreateLead(meeting)

      const row: Record<string, unknown> = {
        meeting_date: meeting.meetingDate,
        meeting_number: meeting.meetingNumber,
        parent_name: meeting.parentName,
        student_name: meeting.studentName,
        phone: meeting.phone,
        current_school: meeting.currentSchool,
        grade: meeting.grade,
        region: meeting.region,
        source_channel: meeting.sourceChannel,
        memo: meeting.memo,
        note_delivered: false,
        created_by: meeting.createdBy,
      }
      if (leadId) row.lead_id = leadId
      if (meeting.interestArea !== undefined) row.interest_area = meeting.interestArea
      if (meeting.nextMeetingDate !== undefined) row.next_meeting_date = meeting.nextMeetingDate
      if (meeting.requiredAction !== undefined) row.required_action = meeting.requiredAction
      const { data, error } = await supabase.from('meetings').insert(row).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      meetingDate?: string
      meetingNumber?: number
      parentName?: string
      studentName?: string
      phone?: string
      currentSchool?: string
      grade?: string
      region?: string
      interestArea?: string
      sourceChannel?: string
      memo?: string
      nextMeetingDate?: string
      requiredAction?: string
    }) => {
      const row: Record<string, unknown> = {}
      if (updates.meetingDate !== undefined) row.meeting_date = updates.meetingDate
      if (updates.meetingNumber !== undefined) row.meeting_number = updates.meetingNumber
      if (updates.parentName !== undefined) row.parent_name = updates.parentName
      if (updates.studentName !== undefined) row.student_name = updates.studentName || null
      if (updates.phone !== undefined) row.phone = updates.phone || null
      if (updates.currentSchool !== undefined) row.current_school = updates.currentSchool || null
      if (updates.grade !== undefined) row.grade = updates.grade || null
      if (updates.region !== undefined) row.region = updates.region || null
      if (updates.interestArea !== undefined) row.interest_area = updates.interestArea || null
      if (updates.sourceChannel !== undefined) row.source_channel = updates.sourceChannel || null
      if (updates.memo !== undefined) row.memo = updates.memo || null
      if (updates.nextMeetingDate !== undefined) row.next_meeting_date = updates.nextMeetingDate || null
      if (updates.requiredAction !== undefined) row.required_action = updates.requiredAction || null

      const { data, error } = await supabase
        .from('meetings')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

export function useUploadMeetingPdf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ meetingId, file }: { meetingId: string; file: File }) => {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `${meetingId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('meeting-pdfs')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('meeting-pdfs')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('meetings')
        .update({ note_pdf_url: publicUrl })
        .eq('id', meetingId)
      if (updateError) throw updateError

      return publicUrl
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

export function useDeleteMeetingPdf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ meetingId, pdfUrl }: { meetingId: string; pdfUrl: string }) => {
      // Extract path from URL
      const pathMatch = pdfUrl.match(/meeting-pdfs\/(.+)$/)
      if (pathMatch) {
        await supabase.storage.from('meeting-pdfs').remove([pathMatch[1]])
      }
      const { error } = await supabase
        .from('meetings')
        .update({ note_pdf_url: null })
        .eq('id', meetingId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
}

export function useUpdateNoteDelivered() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, noteDelivered }: { id: string; noteDelivered: boolean }) => {
      const { error } = await supabase
        .from('meetings')
        .update({ note_delivered: noteDelivered })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}
