import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ConsultantKpi {
  assigned: number          // students assigned
  meetings30d: number       // meetings in the last 30 days
  expected: number          // 2 × assigned (last 30 days target)
  score: number             // 0..10
}

/**
 * Per-consultant management score.
 *
 * Current basis: regular-meeting cadence (2 meetings/month per student).
 * Will grow to include prep/summary uploads, required-report coverage,
 * and contract-renewal once those features land.
 */
export function useConsultantKpis() {
  return useQuery({
    queryKey: ['consultant_kpis'],
    queryFn: async (): Promise<Record<string, ConsultantKpi>> => {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const sinceIso = since.toISOString().slice(0, 10)

      const [stRes, mtRes] = await Promise.all([
        supabase.from('service_students').select('assigned_consultant'),
        supabase
          .from('service_meetings')
          .select('consultant_id, meeting_date')
          .gte('meeting_date', sinceIso),
      ])
      if (stRes.error) throw stRes.error
      if (mtRes.error) throw mtRes.error

      const assignedCount: Record<string, number> = {}
      ;(stRes.data || []).forEach((s: { assigned_consultant: string | null }) => {
        const c = s.assigned_consultant
        if (c) assignedCount[c] = (assignedCount[c] || 0) + 1
      })

      const meetingsCount: Record<string, number> = {}
      ;(mtRes.data || []).forEach((m: { consultant_id: string | null }) => {
        const c = m.consultant_id
        if (c) meetingsCount[c] = (meetingsCount[c] || 0) + 1
      })

      const out: Record<string, ConsultantKpi> = {}
      const ids = new Set<string>([...Object.keys(assignedCount), ...Object.keys(meetingsCount)])
      ids.forEach(c => {
        const assigned = assignedCount[c] || 0
        const meetings30d = meetingsCount[c] || 0
        const expected = Math.max(2 * assigned, 1)
        const score = Math.max(0, Math.min(10, (meetings30d / expected) * 10))
        out[c] = { assigned, meetings30d, expected, score }
      })
      return out
    },
  })
}
