import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Per-student management score ───
export interface StudentKpi {
  meetings30d: number       // meetings for this student in last 30 days
  meetingsScore: number     // 0-4 — 2pts × min(meetings, 2)
  prepScore: number         // 0-1 — % of student's meetings with prep_url
  summaryScore: number      // 0-2 — % of student's meetings with report_url
  reportsScore: number      // 0-2 — required-report coverage for this student
  followupScore: number     // 0-2 — % of last-30d meeting diaries that have a next-meeting date
  score: number             // 0-11 total
}

// ─── Per-consultant view (average of their students' scores) ───
export interface ConsultantKpi {
  assigned: number
  meetings30d: number       // total meetings for the consultant
  meetingsScore: number
  prepScore: number
  summaryScore: number
  reportsScore: number
  followupScore: number
  score: number
}

export const KPI_MAX = 11

const REQUIRED_REPORT_CATEGORIES = [
  'strength_result', 'strength_report', 'grade_report', 'grade_analysis',
] as const

interface KpiData {
  byStudent: Record<string, StudentKpi>
  byConsultant: Record<string, ConsultantKpi>
}

const KPI_QUERY_KEY = ['kpi_data'] as const

async function fetchAllKpi(): Promise<KpiData> {
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
    // ⑤ 다음 미팅 일정: 최근 30일 미팅 다이어리에 next_meeting_date 가 적혔는지
    supabase
      .from('service_diary')
      .select('student_id, entry_date, next_meeting_date')
      .gte('entry_date', sinceIso),
  ])
  if (stRes.error) throw stRes.error
  if (mtRes.error) throw mtRes.error
  const reports = repRes.error ? [] : (repRes.data || [])
  const diaries = fupRes.error ? [] : (fupRes.data || [])

  type StudentRow = { id: string; assigned_consultant: string | null }
  type MeetingRow = {
    student_id: string | null
    consultant_id: string | null
    prep_url: string | null
    report_url: string | null
  }

  const students = (stRes.data || []) as StudentRow[]
  const meetings = (mtRes.data || []) as MeetingRow[]

  // ─── Index per student ───
  const meetingsByStudent: Record<string, MeetingRow[]> = {}
  meetings.forEach(m => {
    if (!m.student_id) return
    if (!meetingsByStudent[m.student_id]) meetingsByStudent[m.student_id] = []
    meetingsByStudent[m.student_id].push(m)
  })

  const reportsByStudent: Record<string, Set<string>> = {}
  reports.forEach(r => {
    const row = r as { student_id: string; category: string }
    if (!reportsByStudent[row.student_id]) reportsByStudent[row.student_id] = new Set()
    reportsByStudent[row.student_id].add(row.category)
  })

  // 학생별 최근 30일 다이어리 — 다음 미팅 일정이 적혔는지만 본다.
  const diariesByStudent: Record<string, { hasNext: boolean }[]> = {}
  diaries.forEach(d => {
    const row = d as { student_id: string; next_meeting_date: string | null }
    if (!row.student_id) return
    if (!diariesByStudent[row.student_id]) diariesByStudent[row.student_id] = []
    diariesByStudent[row.student_id].push({ hasNext: !!row.next_meeting_date })
  })

  // ─── Compute per-student KPI ───
  const byStudent: Record<string, StudentKpi> = {}
  students.forEach(s => {
    const ms = meetingsByStudent[s.id] || []
    const meetings30d = ms.length

    const meetingsScore = Math.min(meetings30d, 2) * 2  // 0 / 2 / 4

    const prepScore = ms.length ? (ms.filter(m => !!m.prep_url).length / ms.length) * 1 : 0
    const summaryScore = ms.length ? (ms.filter(m => !!m.report_url).length / ms.length) * 2 : 0

    const cats = reportsByStudent[s.id] || new Set<string>()
    const present = REQUIRED_REPORT_CATEGORIES.reduce((n, c) => n + (cats.has(c) ? 1 : 0), 0)
    const reportsScore = (present / REQUIRED_REPORT_CATEGORIES.length) * 2

    // ⑤ 다음 미팅 일정 (0-2): 최근 30일 다이어리 중 다음 일정이 기록된 비율.
    //    체크박스 클릭과 무관하게 "일정을 잡아 기록했는가"만 본다.
    const dys = diariesByStudent[s.id] || []
    const followupScore = dys.length ? (dys.filter(d => d.hasNext).length / dys.length) * 2 : 0

    const score = Math.max(0, Math.min(KPI_MAX,
      meetingsScore + prepScore + summaryScore + reportsScore + followupScore,
    ))

    byStudent[s.id] = { meetings30d, meetingsScore, prepScore, summaryScore, reportsScore, followupScore, score }
  })

  // ─── Aggregate per consultant (average of their students' scores) ───
  const byConsultant: Record<string, ConsultantKpi> = {}
  const studentsByConsultant: Record<string, string[]> = {}
  students.forEach(s => {
    if (!s.assigned_consultant) return
    if (!studentsByConsultant[s.assigned_consultant]) studentsByConsultant[s.assigned_consultant] = []
    studentsByConsultant[s.assigned_consultant].push(s.id)
  })

  Object.entries(studentsByConsultant).forEach(([cid, sids]) => {
    let sumMeetings30d = 0
    let sumMeetings = 0
    let sumPrep = 0
    let sumSummary = 0
    let sumReports = 0
    let sumFollowup = 0
    let sumTotal = 0
    sids.forEach(sid => {
      const k = byStudent[sid]
      if (!k) return
      sumMeetings30d += k.meetings30d
      sumMeetings += k.meetingsScore
      sumPrep += k.prepScore
      sumSummary += k.summaryScore
      sumReports += k.reportsScore
      sumFollowup += k.followupScore
      sumTotal += k.score
    })
    const n = sids.length || 1
    byConsultant[cid] = {
      assigned: sids.length,
      meetings30d: sumMeetings30d,
      meetingsScore: sumMeetings / n,
      prepScore: sumPrep / n,
      summaryScore: sumSummary / n,
      reportsScore: sumReports / n,
      followupScore: sumFollowup / n,
      score: sumTotal / n,
    }
  })

  return { byStudent, byConsultant }
}

/** All KPI data (per-student + per-consultant aggregates). */
export function useKpiData() {
  return useQuery<KpiData>({
    queryKey: KPI_QUERY_KEY,
    queryFn: fetchAllKpi,
  })
}

/** Per-student management score — drives the dot next to each student. */
export function useStudentKpis() {
  return useQuery<KpiData, Error, Record<string, StudentKpi>>({
    queryKey: KPI_QUERY_KEY,
    queryFn: fetchAllKpi,
    select: (d) => d.byStudent,
  })
}

/** Per-consultant management score (average of their assigned students). */
export function useConsultantKpis() {
  return useQuery<KpiData, Error, Record<string, ConsultantKpi>>({
    queryKey: KPI_QUERY_KEY,
    queryFn: fetchAllKpi,
    select: (d) => d.byConsultant,
  })
}
