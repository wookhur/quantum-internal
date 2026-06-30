import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceMeetings, useAllServiceFollowupsInRange, useAllServiceDiaryInRange } from '@/hooks/useServiceDashboard'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { useConsultantPool, useConsultantName } from '@/lib/consultants'
import { countScheduledMeetings } from '@/lib/meetingSchedule'

const OTHER_ID = '__other__'

function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(mon), end: fmt(sun) }
}

interface QcRow {
  id: string
  name: string
  students: number
  expected: number
  held: number
  cancelled: number
  noShow: number
  reportSubmitted: number
  fuTotal: number
  fuDone: number
}

function pct(num: number, den: number): string {
  if (den <= 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

const CANCEL_BY_LABEL_KEYS: Record<string, string> = {
  client: 'weeklyReport.cancelByClient',
  consultant: 'weeklyReport.cancelByConsultant',
  other: 'weeklyReport.cancelByOther',
  unknown: 'weeklyReport.cancelByUnknown',
}

export function WeeklyReportPage() {
  const t = useT()
  const init = currentWeekRange()
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)

  const { data: students = [] } = useServiceStudents()
  const { data: meetings = [] } = useAllServiceMeetings(start, end)
  const { data: followups = [] } = useAllServiceFollowupsInRange(start, end)
  const { data: diaries = [] } = useAllServiceDiaryInRange(start, end)
  const { data: programs = [] } = useAllServiceProgramFees()

  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  const knownIds = useMemo(() => new Set<string>(consultantPool.map(c => c.id)), [consultantPool])
  const bucketOf = (id?: string) => (id && knownIds.has(id) ? id : OTHER_ID)

  // student id -> assigned consultant (for grouping EC programs)
  const studentConsultant = useMemo(() => {
    const m = new Map<string, string | undefined>()
    students.forEach(s => m.set(s.id, s.assignedConsultant))
    return m
  }, [students])

  // EC engagement grouped by consultant: { consultantName -> [{student, program}] }
  const ecByConsultant = useMemo(() => {
    const groups = new Map<string, { student: string; program: string }[]>()
    programs.filter(p => p.source === 'ec').forEach(p => {
      const label = `${p.label}${p.detail ? ` · ${p.detail}` : ''}`
      const cName = consultantName(studentConsultant.get(p.studentId))
      if (!groups.has(cName)) groups.set(cName, [])
      groups.get(cName)!.push({ student: p.studentName, program: label })
    })
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [programs, studentConsultant])

  // Critical issues (risks/escalations) from diaries in the period
  const criticalIssues = useMemo(
    () => diaries
      .filter(d => (d.criticalIssue || '').trim().length > 0)
      .map(d => ({ date: d.entryDate || '', student: d.studentName, consultant: consultantName(d.studentConsultant), text: (d.criticalIssue || '').trim() })),
    [diaries],
  )

  // Follow-up commitments due in the period, with completion status
  const followupStatus = useMemo(
    () => followups
      .map(f => ({ consultant: consultantName(f.studentConsultant), student: f.studentName, text: f.text, done: f.done, dueDate: f.dueDate }))
      .sort((a, b) => (a.done === b.done ? a.consultant.localeCompare(b.consultant) : a.done ? 1 : -1)),
    [followups],
  )

  const { rows, totals, cancelDist } = useMemo(() => {
    const buckets: { id: string; name: string }[] = [
      ...consultantPool.map(c => ({ id: c.id, name: c.name })),
      { id: OTHER_ID, name: t('weeklyReport.otherUnassigned') },
    ]

    const rows: QcRow[] = buckets.map(b => {
      const studentsC = students.filter(s => s.status === 'active' && bucketOf(s.assignedConsultant) === b.id)
      const expected = studentsC.reduce((sum, s) => sum + countScheduledMeetings(s.regularMeetingSchedule, start, end), 0)
      const meetingsC = meetings.filter(m => bucketOf(m.consultantId) === b.id)
      const held = meetingsC.filter(m => m.status === 'held').length
      const cancelled = meetingsC.filter(m => m.status === 'cancelled').length
      const noShow = meetingsC.filter(m => m.status === 'no_show').length
      const reportSubmitted = meetingsC.filter(m => m.status === 'held' && m.reportStatus === 'submitted').length
      const fuC = followups.filter(f => bucketOf(f.studentConsultant) === b.id)
      return {
        id: b.id, name: b.name,
        students: studentsC.length,
        expected, held, cancelled, noShow, reportSubmitted,
        fuTotal: fuC.length,
        fuDone: fuC.filter(f => f.done).length,
      }
    }).filter(r => r.students > 0 || r.expected > 0 || r.held > 0 || r.cancelled > 0 || r.noShow > 0 || r.fuTotal > 0)

    const totals = rows.reduce((t, r) => ({
      students: t.students + r.students,
      expected: t.expected + r.expected,
      held: t.held + r.held,
      cancelled: t.cancelled + r.cancelled,
      noShow: t.noShow + r.noShow,
      reportSubmitted: t.reportSubmitted + r.reportSubmitted,
      fuTotal: t.fuTotal + r.fuTotal,
      fuDone: t.fuDone + r.fuDone,
    }), { students: 0, expected: 0, held: 0, cancelled: 0, noShow: 0, reportSubmitted: 0, fuTotal: 0, fuDone: 0 })

    const cancelDist: Record<string, number> = { client: 0, consultant: 0, other: 0, unknown: 0 }
    meetings.filter(m => m.status === 'cancelled' || m.status === 'no_show').forEach(m => {
      const key = m.cancelledBy && cancelDist[m.cancelledBy] !== undefined ? m.cancelledBy : 'unknown'
      cancelDist[key] += 1
    })

    return { rows, totals, cancelDist }
  }, [students, meetings, followups, start, end, knownIds])

  const cancelTotal = totals.cancelled + totals.noShow

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #qc-report, #qc-report * { visibility: visible !important; }
        #qc-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 8mm; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="flex items-center justify-between gap-3 mb-5 no-print flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          {t('weeklyReport.title')}
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-auto" />
          <Button onClick={() => window.print()} className="gap-1.5">
            <Printer className="size-4" /> {t('weeklyReport.printBtn')}
          </Button>
        </div>
      </div>

      <div id="qc-report">
        <div className="hidden print:block mb-4">
          <div className="text-lg font-semibold tracking-wide">QUANTUM ADMISSIONS</div>
          <div className="text-sm text-gray-500">{t('weeklyReport.printTitle')}</div>
        </div>
        <div className="text-sm text-gray-500 mb-4">{t('weeklyReport.period', { start, end })}</div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">{t('weeklyReport.meetingCompliance')}</div>
            <div className="text-2xl font-semibold text-emerald-600">{pct(totals.held, totals.expected)}</div>
            <div className="text-[11px] text-gray-400">{t('weeklyReport.meetingComplianceDetail', { held: String(totals.held), expected: String(totals.expected) })}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">{t('weeklyReport.cancelNoShow')}</div>
            <div className="text-2xl font-semibold text-red-600">{cancelTotal}</div>
            <div className="text-[11px] text-gray-400">{t('weeklyReport.cancelNoShowDetail', { cancelled: String(totals.cancelled), noShow: String(totals.noShow) })}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">{t('weeklyReport.reportSubmission')}</div>
            <div className="text-2xl font-semibold text-amber-600">{pct(totals.reportSubmitted, totals.held)}</div>
            <div className="text-[11px] text-gray-400">{t('weeklyReport.reportSubmissionDetail', { submitted: String(totals.reportSubmitted), held: String(totals.held) })}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">{t('weeklyReport.followUpRate')}</div>
            <div className="text-2xl font-semibold text-amber-600">{pct(totals.fuDone, totals.fuTotal)}</div>
            <div className="text-[11px] text-gray-400">{t('weeklyReport.followUpRateDetail', { done: String(totals.fuDone), total: String(totals.fuTotal) })}</div>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-right">
                <th className="text-left font-medium p-2 pl-3">{t('weeklyReport.consultant')}</th>
                <th className="font-medium p-2">{t('weeklyReport.students')}</th>
                <th className="font-medium p-2">{t('weeklyReport.scheduled')}</th>
                <th className="font-medium p-2">{t('weeklyReport.held')}</th>
                <th className="font-medium p-2">{t('weeklyReport.cancelled')}</th>
                <th className="font-medium p-2">{t('weeklyReport.noShowCol')}</th>
                <th className="font-medium p-2">{t('weeklyReport.complianceRate')}</th>
                <th className="font-medium p-2">{t('weeklyReport.reportCol')}</th>
                <th className="font-medium p-2 pr-3">{t('weeklyReport.followUpCol')}</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="text-left p-2 pl-3">{r.name}</td>
                  <td className="p-2">{r.students}</td>
                  <td className="p-2">{r.expected}</td>
                  <td className="p-2">{r.held}</td>
                  <td className="p-2">{r.cancelled}</td>
                  <td className="p-2">{r.noShow}</td>
                  <td className="p-2">{pct(r.held, r.expected)}</td>
                  <td className="p-2">{pct(r.reportSubmitted, r.held)}</td>
                  <td className="p-2 pr-3">{pct(r.fuDone, r.fuTotal)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="p-4 text-center text-gray-400">{t('weeklyReport.noData')}</td></tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 bg-gray-50 font-medium">
                  <td className="text-left p-2 pl-3">{t('weeklyReport.companyTotal')}</td>
                  <td className="p-2">{totals.students}</td>
                  <td className="p-2">{totals.expected}</td>
                  <td className="p-2">{totals.held}</td>
                  <td className="p-2">{totals.cancelled}</td>
                  <td className="p-2">{totals.noShow}</td>
                  <td className="p-2">{pct(totals.held, totals.expected)}</td>
                  <td className="p-2">{pct(totals.reportSubmitted, totals.held)}</td>
                  <td className="p-2 pr-3">{pct(totals.fuDone, totals.fuTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm font-medium text-gray-600 mb-2">{t('weeklyReport.cancelDistTitle', { count: String(cancelTotal) })}</div>
          {cancelTotal === 0 ? (
            <div className="text-sm text-gray-400">{t('weeklyReport.noCancels')}</div>
          ) : (
            <ul className="text-sm text-gray-600 space-y-1">
              {Object.entries(cancelDist).filter(([, n]) => n > 0).map(([k, n]) => (
                <li key={k} className="flex justify-between max-w-xs">
                  <span>{t(CANCEL_BY_LABEL_KEYS[k])}</span>
                  <span>{t('weeklyReport.countUnit', { n: String(n), pct: pct(n, cancelTotal) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Engagement status — EC programs (by consultant) */}
        <div className="border rounded-lg p-4 mt-4">
          <div className="text-sm font-medium text-gray-600 mb-2">{t('weeklyReport.ecTitle')}</div>
          {ecByConsultant.length === 0 ? (
            <div className="text-sm text-gray-400">{t('weeklyReport.noEc')}</div>
          ) : (
            <div className="space-y-3">
              {ecByConsultant.map(([cName, items]) => (
                <div key={cName}>
                  <div className="text-xs font-semibold text-gray-500 mb-1">{cName} <span className="text-gray-400">({items.length})</span></div>
                  <ul className="text-sm text-gray-700 space-y-0.5 pl-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-gray-500 shrink-0 w-24 truncate">{it.student}</span>
                        <span className="text-gray-700">{it.program}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risks, Issues & Escalations (from meeting diary critical issue) */}
        <div className="border rounded-lg p-4 mt-4">
          <div className="text-sm font-medium text-gray-600 mb-2">Risks, Issues &amp; Escalations</div>
          {criticalIssues.length === 0 ? (
            <div className="text-sm text-gray-400">{t('weeklyReport.noRisks')}</div>
          ) : (
            <ul className="space-y-2">
              {criticalIssues.map((c, i) => (
                <li key={i} className="text-sm border-l-2 border-red-300 pl-2.5">
                  <div className="text-[11px] text-gray-400">{c.date} · {c.consultant} · {c.student}</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{c.text}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Follow-up commitments — completion status */}
        <div className="border rounded-lg p-4 mt-4">
          <div className="text-sm font-medium text-gray-600 mb-2">
            {t('weeklyReport.followUpStatus')}
            {followupStatus.length > 0 && (
              <span className="ml-1 text-gray-400">({followupStatus.filter(f => f.done).length}/{followupStatus.length} {t('weeklyReport.followUpCompleted')})</span>
            )}
          </div>
          {followupStatus.length === 0 ? (
            <div className="text-sm text-gray-400">{t('weeklyReport.noFollowUps')}</div>
          ) : (
            <ul className="space-y-1">
              {followupStatus.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`shrink-0 mt-0.5 ${f.done ? 'text-emerald-600' : 'text-amber-600'}`}>{f.done ? '✓' : '○'}</span>
                  <span className="text-gray-400 shrink-0 w-20 truncate text-xs mt-0.5">{f.consultant} · {f.student}</span>
                  <span className={`flex-1 ${f.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{f.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
