import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Meeting, Event, Todo, Contract } from '@/types'

function mapMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    meetingDate: row.meeting_date as string,
    meetingNumber: (row.meeting_number as number) || 1,
    parentName: row.parent_name as string,
    studentName: row.student_name as string,
    phone: row.phone as string,
    currentSchool: row.current_school as string,
    grade: row.grade as string,
    region: row.region as string,
    interestArea: row.interest_area as string,
    sourceChannel: row.source_channel as string,
    memo: row.memo as string,
    noteDelivered: (row.note_delivered as boolean) || false,
    nextMeetingDate: row.next_meeting_date as string,
    requiredAction: row.required_action as string,
    googleCalendarEventId: row.google_calendar_event_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  }
}

function mapEvent(row: Record<string, unknown>): Event {
  return {
    id: row.id as string,
    month: row.month as string,
    week: row.week as number,
    eventName: row.event_name as string,
    eventDatetime: row.event_datetime as string,
    venue: row.venue as string,
    speakers: row.speakers as string[],
    speakerConfirmed: (row.speaker_confirmed as boolean) || false,
    venueConfirmed: (row.venue_confirmed as boolean) || false,
    copyWritten: (row.copy_written as boolean) || false,
    designCompleted: (row.design_completed as boolean) || false,
    pptCompleted: (row.ppt_completed as boolean) || false,
    uploaded: (row.uploaded as boolean) || false,
    createdAt: row.created_at as string,
  }
}

function mapTodo(row: Record<string, unknown>): Todo {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    assignedTo: row.assigned_to as string,
    status: row.status as Todo['status'],
    priority: row.priority as Todo['priority'],
    dueDate: row.due_date as string,
    linkedEntityType: row.linked_entity_type as Todo['linkedEntityType'],
    linkedEntityId: row.linked_entity_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export interface ContractCalendarItem {
  id: string
  contractorName: string
  studentName: string
  schoolName: string
  expiryDate: string
  status: string
}

export interface CalendarData {
  meetings: Meeting[]
  events: Event[]
  todos: Todo[]
  contractExpiries: ContractCalendarItem[]
}

export function useCalendarEvents(year: number, month: number) {
  return useQuery({
    queryKey: ['calendar-events', year, month],
    queryFn: async (): Promise<CalendarData> => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = new Date(year, month, 0) // last day of month
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

      const [meetingsRes, eventsRes, todosRes, contractsRes] = await Promise.all([
        supabase
          .from('meetings')
          .select('*')
          .gte('meeting_date', startDate)
          .lte('meeting_date', endDateStr + 'T23:59:59')
          .order('meeting_date', { ascending: true }),
        supabase
          .from('events')
          .select('*')
          .gte('event_datetime', startDate)
          .lte('event_datetime', endDateStr + 'T23:59:59')
          .order('event_datetime', { ascending: true }),
        supabase
          .from('todos')
          .select('*')
          .gte('due_date', startDate)
          .lte('due_date', endDateStr)
          .neq('status', 'done')
          .order('due_date', { ascending: true }),
        // Fetch contracts whose expiry_date falls within this month
        supabase
          .from('contracts')
          .select('id, contractor_name, student_name, school_name, expiry_date, status')
          .gte('expiry_date', startDate)
          .lte('expiry_date', endDateStr)
          .order('expiry_date', { ascending: true }),
      ])

      if (meetingsRes.error) throw meetingsRes.error
      if (eventsRes.error) throw eventsRes.error
      if (todosRes.error) throw todosRes.error
      // Don't throw on contracts error — it's supplementary
      const contractExpiries: ContractCalendarItem[] = (contractsRes.data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        contractorName: row.contractor_name as string,
        studentName: row.student_name as string,
        schoolName: row.school_name as string,
        expiryDate: row.expiry_date as string,
        status: row.status as string,
      }))

      return {
        meetings: (meetingsRes.data || []).map(mapMeeting),
        events: (eventsRes.data || []).map(mapEvent),
        todos: (todosRes.data || []).map(mapTodo),
        contractExpiries,
      }
    },
  })
}
