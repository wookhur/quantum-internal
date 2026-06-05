import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'

function mapEvent(row: Record<string, unknown>): Event {
  return {
    id: row.id as string,
    month: row.month as string,
    week: row.week as number | undefined,
    eventName: row.event_name as string,
    eventDatetime: row.event_datetime as string | undefined,
    venue: row.venue as string | undefined,
    speakers: row.speakers as string[] | undefined,
    speakerConfirmed: row.speaker_confirmed as boolean,
    venueConfirmed: row.venue_confirmed as boolean,
    copyWritten: row.copy_written as boolean,
    designCompleted: row.design_completed as boolean,
    pptCompleted: row.ppt_completed as boolean,
    uploaded: row.uploaded as boolean,
    notes: (row.notes as string) || undefined,
    checklistDetails: (row.checklist_details as Record<string, string>) || {},
    createdAt: row.created_at as string,
  }
}

export interface CreateEventInput {
  month: string
  week: number
  event_name: string
  event_datetime: string
  event_date?: string  // YYYY-MM-DD
  venue?: string
  speakers?: string[]
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      // Auto-derive event_date from event_datetime if not provided
      const eventDate = input.event_date || (input.event_datetime ? input.event_datetime.slice(0, 10) : null)

      const { data, error } = await supabase
        .from('events')
        .insert({
          month: input.month,
          week: input.week,
          event_name: input.event_name,
          event_datetime: input.event_datetime,
          event_date: eventDate,
          venue: input.venue || null,
          speakers: input.speakers || [],
          speaker_confirmed: false,
          venue_confirmed: false,
          copy_written: false,
          design_completed: false,
          ppt_completed: false,
          uploaded: false,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
    },
  })
}

const FIELD_TO_COLUMN: Record<string, string> = {
  speakerConfirmed: 'speaker_confirmed',
  venueConfirmed: 'venue_confirmed',
  copyWritten: 'copy_written',
  designCompleted: 'design_completed',
  pptCompleted: 'ppt_completed',
  uploaded: 'uploaded',
  notes: 'notes',
  checklistDetails: 'checklist_details',
  venue: 'venue',
  speakers: 'speakers',
  eventName: 'event_name',
  eventDatetime: 'event_datetime',
  eventDate: 'event_date',
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: unknown }) => {
      const column = FIELD_TO_COLUMN[field]
      if (!column) throw new Error(`Unknown field: ${field}`)
      const { error } = await supabase
        .from('events')
        .update({ [column]: value })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
    },
  })
}

export function useEvents(filters?: { month?: string }) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('*')
        .order('event_datetime', { ascending: true })

      if (filters?.month) query = query.eq('month', filters.month)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapEvent)
    },
  })
}
