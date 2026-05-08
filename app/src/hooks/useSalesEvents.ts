import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SalesEvent } from '@/types'

function mapSalesEvent(row: Record<string, unknown>): SalesEvent {
  return {
    id: row.id as string,
    month: row.month as string,
    eventName: row.event_name as string,
    applicants: row.applicants as number,
    attendees: row.attendees as number,
    phoneConsultations: row.phone_consultations as number,
    zoomBookings: row.zoom_bookings as number,
    inPersonBookings: row.in_person_bookings as number,
    totalMeetings: row.total_meetings as number,
    contracts: row.contracts as number,
    contractRate: row.contract_rate as number,
    createdAt: row.created_at as string,
  }
}

export function useSalesEvents(filters?: { month?: string }) {
  return useQuery({
    queryKey: ['sales_events', filters],
    queryFn: async () => {
      let query = supabase
        .from('sales_events')
        .select('*')
        .order('month', { ascending: false })

      if (filters?.month) {
        query = query.eq('month', filters.month)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapSalesEvent)
    },
  })
}

export function useCreateSalesEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (event: Partial<SalesEvent>) => {
      const { data, error } = await supabase.from('sales_events').insert({
        month: event.month,
        event_name: event.eventName,
        applicants: event.applicants || 0,
        attendees: event.attendees || 0,
        phone_consultations: event.phoneConsultations || 0,
        zoom_bookings: event.zoomBookings || 0,
        in_person_bookings: event.inPersonBookings || 0,
        total_meetings: (event.phoneConsultations || 0) + (event.zoomBookings || 0) + (event.inPersonBookings || 0),
        contracts: event.contracts || 0,
        contract_rate: event.attendees ? ((event.contracts || 0) / event.attendees * 100) : 0,
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales_events'] }),
  })
}
