import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceMeetings, useAllServiceFollowupsInRange } from '@/hooks/useServiceDashboard'
import { CONSULTANTS } from '@/lib/consultants'
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

const CANCEL_BY_LABEL: Record<string, string> = {
  client: '고객',
  consultant: '컨설턴트',
  other: '기타',
  unknown: '미기입',
}

export function WeeklyReportPage() {
  const init = currentWeekRange()
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)

  const { data: students = [] } = useServiceStudents()
  const { data: meetings = [] } = useAllServiceMeetings(start, end)
  const { data: followups = [] } = useAllServiceFollowupsInRange(start, end)

  const knownIds = useMemo(() => new Set<string>(CONSULTANTS.map(c => c.id)), [])
  const bucketOf = (id?: string) => (id && knownIds.has(id) ? id : OTHER_ID)

  const { rows, totals, cancelDist } = useMemo(() => {
    const buckets: { id: string; name: string }[] = [
      ...CONSULTANTS.map(c => ({ id: c.id, name: c.name })),
      { id: OTHER_ID, name: '기타 · 미배정' },
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
          Service QC · 주간보고서
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-auto" />
          <Button onClick={() => window.print()} className="gap-1.5">
            <Printer className="size-4" /> PDF로 출력
          </Button>
        </div>
      </div>

      <div id="qc-report">
        <div className="hidden print:block mb-4">
          <div className="text-lg font-semibold tracking-wide">QUANTUM ADMISSIONS</div>
          <div className="text-sm text-gray-500">Service QC · 주간 품질관리 보고서</div>
        </div>
        <div className="text-sm text-gray-500 mb-4">기간: {start} ~ {end}</div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">미팅 준수율</div>
            <div className="text-2xl font-semibold text-emerald-600">{pct(totals.held, totals.expected)}</div>
            <div className="text-[11px] text-gray-400">진행 {totals.held} / 예정 {totals.expected}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">취소 · 노쇼</div>
            <div className="text-2xl font-semibold text-red-600">{cancelTotal}</div>
            <div className="text-[11px] text-gray-400">취소 {totals.cancelled} · 노쇼 {totals.noShow}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">리포트 제출률</div>
            <div className="text-2xl font-semibold text-amber-600">{pct(totals.reportSubmitted, totals.held)}</div>
            <div className="text-[11px] text-gray-400">제출 {totals.reportSubmitted} / 진행 {totals.held}</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Follow-up 이행률</div>
            <div className="text-2xl font-semibold text-amber-600">{pct(totals.fuDone, totals.fuTotal)}</div>
            <div className="text-[11px] text-gray-400">완료 {totals.fuDone} / 총 {totals.fuTotal}</div>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-right">
                <th className="text-left font-medium p-2 pl-3">컨설턴트</th>
                <th className="font-medium p-2">학생</th>
                <th className="font-medium p-2">예정</th>
                <th className="font-medium p-2">진행</th>
                <th className="font-medium p-2">취소</th>
                <th className="font-medium p-2">노쇼</th>
                <th className="font-medium p-2">준수율</th>
                <th className="font-medium p-2">리포트</th>
                <th className="font-medium p-2 pr-3">F/U</th>
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
                <tr><td colSpan={9} className="p-4 text-center text-gray-400">해당 기간 데이터가 없습니다.</td></tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 bg-gray-50 font-medium">
                  <td className="text-left p-2 pl-3">전사 합계</td>
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
          <div className="text-sm font-medium text-gray-600 mb-2">취소 · 노쇼 사유 분포 ({cancelTotal}건)</div>
          {cancelTotal === 0 ? (
            <div className="text-sm text-gray-400">취소·노쇼가 없습니다.</div>
          ) : (
            <ul className="text-sm text-gray-600 space-y-1">
              {Object.entries(cancelDist).filter(([, n]) => n > 0).map(([k, n]) => (
                <li key={k} className="flex justify-between max-w-xs">
                  <span>{CANCEL_BY_LABEL[k]}</span>
                  <span>{n}건 · {pct(n, cancelTotal)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
