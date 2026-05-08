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
    createdAt: row.created_at as string,
  }
}

export interface CreateEventInput {
  month: string
  week: number
  event_name: string
  event_datetime: string
  venue?: string
  speakers?: string[]
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          month: input.month,
          week: input.week,
          event_name: input.event_name,
          event_datetime: input.event_datetime,
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
