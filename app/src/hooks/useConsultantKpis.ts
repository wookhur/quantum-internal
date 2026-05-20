import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ConsultantKpi {
  assigned: number          // students assigned
  meetings30d: number       // total meetings (consultant) in last 30 days
  meetingsScore: number     // 0-4 — 2 pts per meeting per student, capped at 2 / student
  prepScore: number         // 0-1 — % of meetings with prep_url
  summaryScore: number      // 0-2 — % of meetings with report_url (summary)
  reportsScore: number      // 0-2 — required-report coverage per student
  followupScore: number     // 0-2 — % of follow-up items marked done
  score: number             // total 0-11
}

export const KPI_MAX = 11

const REQUIRED_REPORT_CATEGORIES = [
  'strength_result', 'strength_report', 'grade_report', 'grade_analysis',
] as const

/**
 * Per-consultant management score (관리지수, max 11).
 *   Meeting cadence (2pts × up to 2 meetings/month per student, avg)  = 0..4
 *   Prep materials uploaded across meetings                            = 0..1
 *   Summary report uploaded across meetings                            = 0..2
 *   Required reports complete per student                              = 0..2
 *   Follow-up completion rate                                          = 0..2
 */
export function useConsultantKpis() {
  return useQuery({
    queryKey: ['consultant_kpis'],
    queryFn: async (): Promise<Record<string, ConsultantKpi>> => {
      const since30 = new Date()
      since30.setDate(since30.getDate() - 30)
      const sinceIso = since30.toISOString().slice(0, 10)

      const [stRes, mtRes, repRes, fupRes] = await Promise.all([
        supabase.from('service_students').select('id, assigned_consultant'),
        supabase
          .from('service_meetings')
          .select('id, consultant_id, student_id, meeting_date, prep_url, report_url')
          .gte('meeting_date', sinceIso),
        supabase.from('service_reports').select('student_id, category'),
        supabase
          .from('service_followups')
          .select('id, student_id, diary_id, done, created_at')
          .gte('created_at', `${sinceIso}T00:00:00Z`),
      ])
      if (stRes.error) throw stRes.error
      if (mtRes.error) throw mtRes.error
      const reports = repRes.error ? [] : (repRes.data || [])
      const followups = fupRes.error ? [] : (fupRes.data || [])

      // ── Index ──
      const studentsByConsultant: Record<string, Set<string>> = {}
      ;(stRes.data || []).forEach((s: { id: string; assigned_consultant: string | null }) => {
        if (!s.assigned_consultant) return
        if (!studentsByConsultant[s.assigned_consultant]) studentsByConsultant[s.assigned_consultant] = new Set()
        studentsByConsultant[s.assigned_consultant].add(s.id)
      })

      type MeetingRow = {
        consultant_id: string | null
        student_id: string | null
        prep_url: string | null
        report_url: string | null
      }
      const meetingsByConsultant: Record<string, MeetingRow[]> = {}
      ;(mtRes.data || []).forEach((m: MeetingRow) => {
        if (!m.consultant_id) return
        if (!meetingsByConsultant[m.consultant_id]) meetingsByConsultant[m.consultant_id] = []
        meetingsByConsultant[m.consultant_id].push(m)
      })

      const reportsByStudent: Record<string, Set<string>> = {}
      reports.forEach((r) => {
        const row = r as { student_id: string; category: string }
        if (!reportsByStudent[row.student_id]) reportsByStudent[row.student_id] = new Set()
        reportsByStudent[row.student_id].add(row.category)
      })

      const followupsByStudent: Record<string, { done: boolean }[]> = {}
      followups.forEach((f) => {
        const row = f as { student_id: string; done: boolean }
        if (!followupsByStudent[row.student_id]) followupsByStudent[row.student_id] = []
        followupsByStudent[row.student_id].push({ done: row.done })
      })

      const consultantIds = new Set<string>([
        ...Object.keys(studentsByConsultant),
        ...Object.keys(meetingsByConsultant),
      ])

      const out: Record<string, ConsultantKpi> = {}
      consultantIds.forEach(c => {
        const sids = studentsByConsultant[c] || new Set<string>()
        const assigned = sids.size
        const ms = meetingsByConsultant[c] || []
        const meetings30d = ms.length

        // 1) Meeting cadence (per-student, 2pts × min(meetings, 2), averaged)
        let meetingsScore = 0
        if (assigned > 0) {
          const byStudent: Record<string, number> = {}
          ms.forEach(m => {
            if (!m.student_id) return
            byStudent[m.student_id] = (byStudent[m.student_id] || 0) + 1
          })
          let sum = 0
          sids.forEach(sid => {
            const cnt = byStudent[sid] || 0
            sum += Math.min(cnt, 2) * 2
          })
          meetingsScore = sum / assigned
        }

        // 2) Prep materials coverage (0-1)
        const prepRate = ms.length ? ms.filter(m => !!m.prep_url).length / ms.length : 0
        const prepScore = prepRate * 1

        // 3) Summary report coverage (0-2)
        const summaryRate = ms.length ? ms.filter(m => !!m.report_url).length / ms.length : 0
        const summaryScore = summaryRate * 2

        // 4) Required reports (0-2)
        let repHit = 0
        let repTotal = 0
        sids.forEach(sid => {
          const cats = reportsByStudent[sid] || new Set<string>()
          REQUIRED_REPORT_CATEGORIES.forEach(cat => {
            repTotal += 1
            if (cats.has(cat)) repHit += 1
          })
        })
        const reportsScore = repTotal ? (repHit / repTotal) * 2 : 0

        // 5) Follow-up completion (0-2)
        let fDone = 0
        let fTotal = 0
        sids.forEach(sid => {
          const fps = followupsByStudent[sid] || []
          fTotal += fps.length
          fDone += fps.filter(f => f.done).length
        })
        const followupScore = fTotal ? (fDone / fTotal) * 2 : 0

        const score = Math.max(0, Math.min(KPI_MAX,
          meetingsScore + prepScore + summaryScore + reportsScore + followupScore,
        ))

        out[c] = { assigned, meetings30d, meetingsScore, prepScore, summaryScore, reportsScore, followupScore, score }
      })

      return out
    },
  })
}
