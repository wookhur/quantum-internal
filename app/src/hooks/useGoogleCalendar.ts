import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoogleCalendar {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  hangoutLink?: string
  htmlLink?: string
  attendees?: { email: string; responseStatus: string }[]
}

export interface CreateConsultationEventParams {
  calendarId: string
  title: string          // e.g. "[QA상담] 홍길동 (학생이름)"
  description: string    // consultation notes
  startTime: string      // ISO datetime
  endTime: string        // ISO datetime
  attendeeEmail?: string // parent's email for invitation
}

interface CalendarListResponse {
  items: GoogleCalendar[]
}

interface EventListResponse {
  items: GoogleCalendarEvent[]
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(`세션을 가져올 수 없습니다: ${error.message}`)
  }

  const token = data.session?.provider_token

  if (!token) {
    throw new Error(
      'Google 액세스 토큰이 없습니다. Google 캘린더 권한을 포함하여 다시 로그인해 주세요.'
    )
  }

  return token
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

async function calendarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getGoogleAccessToken()

  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google Calendar API 오류 (${res.status}): ${body}`)
  }

  return res.json() as Promise<T>
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * List all calendars accessible to the signed-in user.
 * Useful for finding the shared team calendar.
 */
export function useGoogleCalendars() {
  return useQuery<GoogleCalendar[]>({
    queryKey: ['google-calendars'],
    queryFn: async () => {
      const data = await calendarFetch<CalendarListResponse>(
        '/users/me/calendarList'
      )
      return data.items ?? []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Fetch events for a specific calendar within a date range.
 * Results are expanded (recurring events become single instances) and sorted by start time.
 */
export function useGoogleCalendarEvents(
  calendarId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery<GoogleCalendarEvent[]>({
    queryKey: ['google-calendar-events', calendarId, startDate, endDate],
    queryFn: async () => {
      if (!calendarId || !startDate || !endDate) return []

      const params = new URLSearchParams({
        timeMin: startDate,
        timeMax: endDate,
        singleEvents: 'true',
        orderBy: 'startTime',
      })

      const data = await calendarFetch<EventListResponse>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
      )
      return data.items ?? []
    },
    enabled: Boolean(calendarId && startDate && endDate),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

/**
 * Mutation to create a consultation event with an auto-generated Google Meet link.
 * Invalidates the events cache on success so the calendar view refreshes.
 */
export function useCreateGoogleCalendarEvent() {
  const queryClient = useQueryClient()

  return useMutation<GoogleCalendarEvent, Error, CreateConsultationEventParams>({
    mutationFn: async (params) => {
      const body: Record<string, unknown> = {
        summary: params.title,
        description: params.description,
        start: {
          dateTime: params.startTime,
          timeZone: 'Asia/Seoul',
        },
        end: {
          dateTime: params.endTime,
          timeZone: 'Asia/Seoul',
        },
        conferenceData: {
          createRequest: {
            requestId: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }

      if (params.attendeeEmail) {
        body.attendees = [{ email: params.attendeeEmail }]
      }

      return calendarFetch<GoogleCalendarEvent>(
        `/calendars/${encodeURIComponent(params.calendarId)}/events?conferenceDataVersion=1`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['google-calendar-events', variables.calendarId],
      })
    },
  })
}
