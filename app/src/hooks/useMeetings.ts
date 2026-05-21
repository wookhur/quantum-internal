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

export function useCreateMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (meeting: Partial<Meeting>) => {
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
      if (meeting.interestArea !== undefined) row.interest_area = meeting.interestArea
      if (meeting.nextMeetingDate !== undefined) row.next_meeting_date = meeting.nextMeetingDate
      if (meeting.requiredAction !== undefined) row.required_action = meeting.requiredAction
      const { data, error } = await supabase.from('meetings').insert(row).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
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
