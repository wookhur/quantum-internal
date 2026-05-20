import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ConsultantKpi {
  assigned: number          // students assigned
  meetings30d: number       // meetings in last 30 days
  expected: number          // 2 × assigned target (last 30 days)
  meetingsScore: number     // 0-10 — meeting cadence
  prepSummaryScore: number  // 0-10 — % of meetings with both prep + summary URL
  reportsScore: number      // 0-10 — required-report coverage per student
  followupScore: number     // 0-10 — % of follow-up items marked done
  diaryScore: number        // 0-10 — diary completeness (9 fields)
  score: number             // weighted 0-10 total
}

const REQUIRED_REPORT_CATEGORIES = [
  'strength_result', 'strength_report', 'grade_report', 'grade_analysis',
] as const

const DIARY_FIELD_KEYS = [
  'agenda_items', 'meeting_summary', 'extracurricular_notes',
  'identity_narrative_notes', 'questions_concerns', 'next_meeting_agenda',
  'follow_up_commitments', 'assignments', 'critical_dates',
] as const

// Weights (sum = 1)
const W_FOLLOWUP = 0.30
const W_MEETINGS = 0.20
const W_PREP_SUM = 0.20
const W_REPORTS  = 0.20
const W_DIARY    = 0.10

/**
 * Per-consultant management score (관리지수, out of 10).
 *
 *   Followup completion 3pts  +  Meeting cadence 2pts  +
 *   Prep & summary uploads 2pts  +  Required reports 2pts  +
 *   Diary completeness 1pt
 */
export function useConsultantKpis() {
  return useQuery({
    queryKey: ['consultant_kpis'],
    queryFn: async (): Promise<Record<string, ConsultantKpi>> => {
      const since30 = new Date()
      since30.setDate(since30.getDate() - 30)
      const sinceIso = since30.toISOString().slice(0, 10)

      const [stRes, mtRes, repRes, diaryRes, fupRes] = await Promise.all([
        supabase.from('service_students').select('id, assigned_consultant'),
        supabase
          .from('service_meetings')
          .select('id, consultant_id, student_id, meeting_date, prep_url, report_url')
          .gte('meeting_date', sinceIso),
        supabase.from('service_reports').select('student_id, category'),
        supabase
          .from('service_diary')
          .select('*')
          .gte('entry_date', sinceIso),
        supabase
          .from('service_followups')
          .select('id, student_id, diary_id, done, created_at')
          .gte('created_at', `${sinceIso}T00:00:00Z`),
      ])
      if (stRes.error) throw stRes.error
      if (mtRes.error) throw mtRes.error
      // reports/diary/followups: tables may not exist yet for some users.
      // Treat missing tables as "no data" rather than fail the whole query.
      const reports = repRes.error ? [] : (repRes.data || [])
      const diary = diaryRes.error ? [] : (diaryRes.data || [])
      const followups = fupRes.error ? [] : (fupRes.data || [])

      // ── Index by consultant / student ──
      const studentsByConsultant: Record<string, Set<string>> = {}
      ;(stRes.data || []).forEach((s: { id: string; assigned_consultant: string | null }) => {
        if (!s.assigned_consultant) return
        if (!studentsByConsultant[s.assigned_consultant]) studentsByConsultant[s.assigned_consultant] = new Set()
        studentsByConsultant[s.assigned_consultant].add(s.id)
      })

      type MeetingRow = { consultant_id: string | null; prep_url: string | null; report_url: string | null }
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

      type DiaryRow = Record<string, unknown> & { student_id: string }
      const diaryByStudent: Record<string, DiaryRow[]> = {}
      ;(diary as unknown as DiaryRow[]).forEach((row) => {
        if (!diaryByStudent[row.student_id]) diaryByStudent[row.student_id] = []
        diaryByStudent[row.student_id].push(row)
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

        // 1) Meeting cadence
        const ms = meetingsByConsultant[c] || []
        const meetings30d = ms.length
        const expected = Math.max(2 * assigned, 1)
        const meetingsScore = Math.max(0, Math.min(10, (meetings30d / expected) * 10))

        // 2) Prep + summary on every meeting
        const both = ms.filter(m => !!m.prep_url && !!m.report_url).length
        const prepSummaryScore = ms.length ? (both / ms.length) * 10 : 0

        // 3) Required reports coverage
        let repHit = 0
        let repTotal = 0
        sids.forEach(sid => {
          const cats = reportsByStudent[sid] || new Set<string>()
          REQUIRED_REPORT_CATEGORIES.forEach(cat => {
            repTotal += 1
            if (cats.has(cat)) repHit += 1
          })
        })
        const reportsScore = repTotal ? (repHit / repTotal) * 10 : 0

        // 4) Follow-up completion rate
        let fDone = 0
        let fTotal = 0
        sids.forEach(sid => {
          const fps = followupsByStudent[sid] || []
          fTotal += fps.length
          fDone += fps.filter(f => f.done).length
        })
        const followupScore = fTotal ? (fDone / fTotal) * 10 : 0

        // 5) Diary completeness
        let entries = 0
        let filledRatioSum = 0
        sids.forEach(sid => {
          const ds = diaryByStudent[sid] || []
          ds.forEach(d => {
            entries += 1
            const filled = DIARY_FIELD_KEYS.reduce((n, k) => {
              const v = d[k]
              return n + (v && String(v).trim().length > 0 ? 1 : 0)
            }, 0)
            filledRatioSum += filled / DIARY_FIELD_KEYS.length
          })
        })
        const diaryScore = entries ? (filledRatioSum / entries) * 10 : 0

        const score = Math.max(0, Math.min(10,
          followupScore * W_FOLLOWUP +
          meetingsScore * W_MEETINGS +
          prepSummaryScore * W_PREP_SUM +
          reportsScore * W_REPORTS +
          diaryScore * W_DIARY,
        ))

        out[c] = {
          assigned, meetings30d, expected,
          meetingsScore, prepSummaryScore, reportsScore, followupScore, diaryScore,
          score,
        }
      })

      return out
    },
  })
}
