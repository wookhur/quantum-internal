import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Meeting, Event, Todo, GoogleCalendarEvent } from '@/types'

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
    eventDate: row.event_date as string | undefined,
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

function mapGoogleCalendarEvent(row: Record<string, unknown>): GoogleCalendarEvent {
  return {
    id: row.id as string,
    googleEventId: row.google_event_id as string,
    calendarId: row.calendar_id as string,
    summary: row.summary as string,
    description: row.description as string | undefined,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    isAllDay: (row.is_all_day as boolean) || false,
    location: row.location as string | undefined,
    creatorEmail: row.creator_email as string | undefined,
    status: row.status as string,
    conferenceUrl: row.conference_url as string | undefined,
    syncedAt: row.synced_at as string,
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

export interface BirthdayItem {
  profileId: string
  name: string
  birthDate: string   // YYYY-MM-DD
  department?: string
}

export interface CalendarData {
  meetings: Meeting[]
  events: Event[]
  todos: Todo[]
  contractExpiries: ContractCalendarItem[]
  googleEvents: GoogleCalendarEvent[]
  birthdays: BirthdayItem[]
}

export function useCalendarEvents(year: number, month: number) {
  return useQuery({
    queryKey: ['calendar-events', year, month],
    queryFn: async (): Promise<CalendarData> => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = new Date(year, month, 0) // last day of month
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`

      const monthStr = `${year}-${String(month).padStart(2, '0')}`

      const [meetingsRes, eventsRes, todosRes, contractsRes, googleEventsRes, employeeInfoRes, profilesRes] = await Promise.all([
        supabase
          .from('meetings')
          .select('*')
          .gte('meeting_date', startDate)
          .lte('meeting_date', endDateStr + 'T23:59:59')
          .order('meeting_date', { ascending: true }),
        // Events: match by event_date range OR month field
        supabase
          .from('events')
          .select('*')
          .or(`and(event_date.gte.${startDate},event_date.lte.${endDateStr}),month.eq.${monthStr}`)
          .order('event_date', { ascending: true }),
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
        // Fetch Google Calendar events for this month
        supabase
          .from('google_calendar_events')
          .select('*')
          .gte('start_time', startDate)
          .lte('start_time', endDateStr + 'T23:59:59')
          .eq('status', 'confirmed')
          .order('start_time', { ascending: true }),
        // Fetch employee info for birthdays
        supabase
          .from('employee_info')
          .select('profile_id, birth_date')
          .not('birth_date', 'is', null),
        // Fetch profiles for names
        supabase
          .from('profiles')
          .select('id, name, department'),
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

      // Build birthday list for this month
      const profileMap = new Map<string, { name: string; department?: string }>()
      ;(profilesRes.data || []).forEach((p: Record<string, unknown>) => {
        profileMap.set(p.id as string, { name: p.name as string, department: p.department as string | undefined })
      })

      const birthdays: BirthdayItem[] = []
      ;(employeeInfoRes.data || []).forEach((row: Record<string, unknown>) => {
        const bd = row.birth_date as string | null
        if (!bd) return
        // birth_date is YYYY-MM-DD; check if MM matches this month
        const bdMonth = parseInt(bd.slice(5, 7), 10)
        if (bdMonth !== month) return
        const profile = profileMap.get(row.profile_id as string)
        if (!profile) return
        // Build a date in this year for display
        const bdDay = bd.slice(8, 10)
        birthdays.push({
          profileId: row.profile_id as string,
          name: profile.name,
          birthDate: `${year}-${String(month).padStart(2, '0')}-${bdDay}`,
          department: profile.department,
        })
      })
      birthdays.sort((a, b) => a.birthDate.localeCompare(b.birthDate))

      return {
        meetings: (meetingsRes.data || []).map(mapMeeting),
        events: (eventsRes.data || []).map(mapEvent),
        todos: (todosRes.data || []).map(mapTodo),
        contractExpiries,
        googleEvents: (googleEventsRes.data || []).map(mapGoogleCalendarEvent),
        birthdays,
      }
    },
  })
}
