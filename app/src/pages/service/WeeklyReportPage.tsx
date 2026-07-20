import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceMeetings, useAllServiceDiaryInRange } from '@/hooks/useServiceDashboard'
import { useServiceFollowupsForDiaries } from '@/hooks/useServiceFollowups'
import { useContracts } from '@/hooks/useContracts'
import { useConsultantPool, useConsultantName } from '@/lib/consultants'

const OTHER_ID = '__other__'

/** Matches Student 360's archive definition — active = everything else. */
function isArchivedStatus(status?: string) { return status === 'finished' || status === 'canceled' }

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
  studentEntries: { id: string; name: string }[]
  studentNames: string[]
  held: number
  heldStudents: { id: string; name: string }[]
  cancelled: number
  noShow: number
  reportSubmitted: number
  cancelDetails: { student: string; reason: string }[]
  fuCount: number
  followups: { studentId: string; student: string; items: { text: string; done: boolean }[] }[]
}

function pct(num: number, den: number): string {
  if (den <= 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

export function WeeklyReportPage() {
  const t = useT()
  const init = currentWeekRange()
  const [start, setStart] = useState(init.start)
  const [end, setEnd] = useState(init.end)

  const { data: students = [] } = useServiceStudents()
  const activeStudents = useMemo(() => students.filter(s => !isArchivedStatus(s.status)), [students])
  const { data: meetings = [] } = useAllServiceMeetings(start, end)
  const { data: diaries = [] } = useAllServiceDiaryInRange(start, end)
  const { data: contracts = [] } = useContracts()

  // 계약관리 '서비스 진행중' 계약 + Student360 학생 교차검증 (전사 합계 리마인드용)
  const contractCheck = useMemo(() => {
    const norm = (s?: string) => (s || '').replace(/\s+/g, '')
    const inServiceContracts = contracts.filter(c => c.status === 'active' || c.status === 'expiring_soon')
    const contractNames = inServiceContracts.map(c => c.studentName).filter(Boolean) as string[]
    const serviceNames = students.map(s => s.name).filter(Boolean)
    const serviceSet = new Set(serviceNames.map(norm))
    const contractSet = new Set(contractNames.map(norm))
    const onlyInContract = contractNames.filter(n => !serviceSet.has(norm(n)))
    const onlyInService = serviceNames.filter(n => !contractSet.has(norm(n)))
    return { count: inServiceContracts.length, onlyInContract, onlyInService }
  }, [contracts, students])
  const inServiceContractCount = contractCheck.count

  const consultantPool = useConsultantPool()
  const consultantName = useConsultantName()
  // Bucket by canonical consultant NAME (matches Student360). assigned_consultant
  // may be stored as a name or a UUID; consultantName() canonicalizes both.
  const nameToBucket = useMemo(() => {
    const m = new Map<string, string>()
    consultantPool.forEach(c => m.set(c.name, c.id))
    return m
  }, [consultantPool])
  const bucketOf = (raw?: string) => {
    const cn = consultantName(raw)
    return cn && nameToBucket.has(cn) ? nameToBucket.get(cn)! : OTHER_ID
  }

  // Critical issues (risks/escalations) from diaries in the period
  const criticalIssues = useMemo(
    () => diaries
      .filter(d => (d.criticalIssue || '').trim().length > 0)
      .map(d => ({ date: d.entryDate || '', student: d.studentName, consultant: consultantName(d.studentConsultant), text: (d.criticalIssue || '').trim() })),
    [diaries],
  )

  // Structured follow-ups edited in Student 360 take precedence over the raw
  // diary text, so weekly-report reflects those edits.
  const diaryIds = useMemo(() => diaries.map(d => d.id).filter(Boolean), [diaries])
  const { data: structuredFollowups = [] } = useServiceFollowupsForDiaries(diaryIds)
  const followupsByDiary = useMemo(() => {
    const m = new Map<string, { text: string; done: boolean }[]>()
    for (const f of structuredFollowups) {
      if ((f.category || 'followup') !== 'followup' || !f.diaryId) continue
      if (!m.has(f.diaryId)) m.set(f.diaryId, [])
      m.get(f.diaryId)!.push({ text: f.text, done: f.done })
    }
    return m
  }, [structuredFollowups])

  const followupNotes = useMemo(
    () => diaries
      .flatMap(d => {
        const structured = followupsByDiary.get(d.id) || []
        const items = structured.length > 0
          ? structured.map(f => ({ text: f.text, done: f.done }))
          : ((d.followUpCommitments || '').trim() ? [{ text: (d.followUpCommitments || '').trim(), done: false }] : [])
        if (items.length === 0) return []
        return [{
          date: d.entryDate || '',
          consultant: consultantName(d.studentConsultant),
          student: d.studentName,
          items,
        }]
      })
      .sort((a, b) => a.consultant.localeCompare(b.consultant) || a.date.localeCompare(b.date)),
    [diaries, followupsByDiary, consultantName],
  )

  const cancelReasonText = (m: { cancelledBy?: string; cancellationReason?: string; status: string }) => {
    const by = m.cancelledBy === 'client' ? '고객' : m.cancelledBy === 'consultant' ? '컨설턴트' : m.cancelledBy === 'other' ? '기타' : ''
    const kind = m.status === 'no_show' ? '노쇼' : '취소'
    return [kind, by && `(${by})`, m.cancellationReason].filter(Boolean).join(' ')
  }

  const { rows, totals } = useMemo(() => {
    const buckets: { id: string; name: string }[] = [
      ...consultantPool.map(c => ({ id: c.id, name: c.name })),
      { id: OTHER_ID, name: t('weeklyReport.otherUnassigned') },
    ]

    const diaryFollowupItems = (d: typeof diaries[number]) => {
      const structured = followupsByDiary.get(d.id) || []
      if (structured.length > 0) return structured.map(f => ({ text: f.text, done: f.done }))
      const raw = (d.followUpCommitments || '').trim()
      return raw ? [{ text: raw, done: false }] : []
    }

    const rows: QcRow[] = buckets.map(b => {
      // Active students only (matches Student 360's active count / per-consultant search)
      const studentsC = activeStudents
        .filter(s => bucketOf(s.assignedConsultant) === b.id)
        .sort((a, z) => a.name.localeCompare(z.name, 'ko'))
      const meetingsC = meetings.filter(m => bucketOf(m.consultantId) === b.id)
      const heldMeetings = meetingsC.filter(m => m.status === 'held')
      const held = heldMeetings.length
      const cancelled = meetingsC.filter(m => m.status === 'cancelled').length
      const noShow = meetingsC.filter(m => m.status === 'no_show').length
      const reportSubmitted = heldMeetings.filter(m => m.reportStatus === 'submitted').length
      const cancelDetails = meetingsC
        .filter(m => m.status === 'cancelled' || m.status === 'no_show')
        .map(m => ({ student: m.studentName, reason: cancelReasonText(m) }))
      const followups = diaries
        .filter(d => bucketOf(d.studentConsultant) === b.id)
        .map(d => ({ studentId: d.studentId, student: d.studentName, items: diaryFollowupItems(d) }))
        .filter(x => x.items.length > 0)
      return {
        id: b.id, name: b.name,
        students: studentsC.length,
        studentEntries: studentsC.map(s => ({ id: s.id, name: s.name })),
        studentNames: studentsC.map(s => s.name),
        held,
        heldStudents: Array.from(new Map(heldMeetings.map(m => [m.studentId, { id: m.studentId, name: m.studentName }])).values()),
        cancelled, noShow, reportSubmitted, cancelDetails,
        fuCount: followups.length,
        followups,
      }
    }).filter(r => r.students > 0 || r.held > 0 || r.cancelled > 0 || r.noShow > 0 || r.fuCount > 0)

    const totals = rows.reduce((t, r) => ({
      students: t.students + r.students,
      held: t.held + r.held,
      cancelled: t.cancelled + r.cancelled,
      noShow: t.noShow + r.noShow,
      reportSubmitted: t.reportSubmitted + r.reportSubmitted,
      fuCount: t.fuCount + r.fuCount,
    }), { students: 0, held: 0, cancelled: 0, noShow: 0, reportSubmitted: 0, fuCount: 0 })

    return { rows, totals }
  }, [activeStudents, meetings, diaries, followupsByDiary, consultantPool, nameToBucket, consultantName, t])

  const cancelTotal = totals.cancelled + totals.noShow

  const nav = useNavigate()
  const [detail, setDetail] = useState<
    | { title: string; kind: 'students'; students: { id: string; name: string }[] }
    | { title: string; kind: 'followups'; followups: { studentId: string; student: string; items: { text: string; done: boolean }[] }[] }
    | null
  >(null)
  const goStudent = (id: string) => { setDetail(null); nav(`/service/student-360?student=${id}`) }

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
            <div className="text-2xl font-semibold text-emerald-600">{pct(totals.held, totals.held + totals.cancelled + totals.noShow)}</div>
            <div className="text-[11px] text-gray-400">상담완료 {totals.held} / 대상 {totals.held + totals.cancelled + totals.noShow} (상담완료+취소+노쇼)</div>
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
            <div className="text-xs text-gray-500">후속조치 기록</div>
            <div className="text-2xl font-semibold text-amber-600">{totals.fuCount}<span className="text-sm font-normal text-gray-400">건</span></div>
            <div className="text-[11px] text-gray-400">이 기간 미팅에 기록된 후속조치</div>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-right">
                <th className="text-left font-medium p-2 pl-3">{t('weeklyReport.consultant')}</th>
                <th className="font-medium p-2" title="Student 360 기준 담당 학생(활성) 수 · 숫자를 누르면 학생 명단">{t('weeklyReport.students')}</th>
                <th className="font-medium p-2">{t('weeklyReport.held')}</th>
                <th className="font-medium p-2">{t('weeklyReport.cancelled')}</th>
                <th className="font-medium p-2">{t('weeklyReport.noShowCol')}</th>
                <th className="font-medium p-2" title="상담완료 / (상담완료+취소+노쇼)">{t('weeklyReport.complianceRate')}</th>
                <th className="font-medium p-2">{t('weeklyReport.reportCol')}</th>
                <th className="font-medium p-2 pr-3">{t('weeklyReport.followUpCol')}</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {rows.map(r => {
                const cancelMemo = r.cancelDetails.filter(c => !c.reason.startsWith('노쇼')).map(c => `${c.student} · ${c.reason}`).join('\n')
                const noShowMemo = r.cancelDetails.filter(c => c.reason.startsWith('노쇼')).map(c => `${c.student} · ${c.reason}`).join('\n')
                return (
                  <tr key={r.id} className="border-t">
                    <td className="text-left p-2 pl-3">{r.name}</td>
                    <td className={`p-2 ${r.students > 0 ? 'cursor-pointer hover:underline hover:text-primary' : ''}`}
                      onClick={() => r.students > 0 && setDetail({ title: `${r.name} · ${t('weeklyReport.students')}`, kind: 'students', students: r.studentEntries })}>{r.students}</td>
                    <td className={`p-2 ${r.held > 0 ? 'cursor-pointer hover:underline hover:text-primary' : ''}`}
                      onClick={() => r.held > 0 && setDetail({ title: `${r.name} · ${t('weeklyReport.held')}`, kind: 'students', students: r.heldStudents })}>{r.held}</td>
                    <td className={`p-2 ${r.cancelled > 0 ? 'cursor-help text-red-600' : ''}`} title={cancelMemo}>{r.cancelled}</td>
                    <td className={`p-2 ${r.noShow > 0 ? 'cursor-help text-red-600' : ''}`} title={noShowMemo}>{r.noShow}</td>
                    <td className="p-2">{pct(r.held, r.held + r.cancelled + r.noShow)}</td>
                    <td className="p-2">{pct(r.reportSubmitted, r.held)}</td>
                    <td className={`p-2 pr-3 ${r.fuCount > 0 ? 'cursor-pointer hover:underline hover:text-primary' : ''}`}
                      onClick={() => r.fuCount > 0 && setDetail({ title: `${r.name} · ${t('weeklyReport.followUpCol')}`, kind: 'followups', followups: r.followups })}>{r.fuCount || '—'}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-gray-400">{t('weeklyReport.noData')}</td></tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 bg-gray-50 font-medium">
                  <td className="text-left p-2 pl-3">{t('weeklyReport.companyTotal')}</td>
                  {(() => {
                    const mismatch = totals.students !== inServiceContractCount
                    const memo = [
                      `계약관리 서비스진행중 학생 수: ${inServiceContractCount}명`,
                      contractCheck.onlyInContract.length ? `\n▸ 계약엔 있으나 Student360 없음 (${contractCheck.onlyInContract.length}): ${contractCheck.onlyInContract.join(', ')}` : '',
                      contractCheck.onlyInService.length ? `\n▸ Student360엔 있으나 서비스중 계약 없음 (${contractCheck.onlyInService.length}): ${contractCheck.onlyInService.join(', ')}` : '',
                    ].join('')
                    return (
                      <td className="p-2">
                        <span className="cursor-pointer hover:underline hover:text-primary"
                          onClick={() => setDetail({ title: t('weeklyReport.students'), kind: 'students', students: Array.from(new Map(rows.flatMap(r => r.studentEntries).map(s => [s.id, s])).values()) })}>{totals.students}</span>
                        <span className={`ml-1 cursor-help ${mismatch ? 'text-red-600 font-bold' : 'text-gray-400'}`} title={memo}>({inServiceContractCount})</span>
                      </td>
                    )
                  })()}
                  <td className="p-2 cursor-pointer hover:underline hover:text-primary"
                    onClick={() => setDetail({ title: t('weeklyReport.held'), kind: 'students', students: Array.from(new Map(rows.flatMap(r => r.heldStudents).map(s => [s.id, s])).values()) })}>{totals.held}</td>
                  <td className="p-2">{totals.cancelled}</td>
                  <td className="p-2">{totals.noShow}</td>
                  <td className="p-2">{pct(totals.held, totals.held + totals.cancelled + totals.noShow)}</td>
                  <td className="p-2">{pct(totals.reportSubmitted, totals.held)}</td>
                  <td className="p-2 pr-3 cursor-pointer hover:underline hover:text-primary"
                    onClick={() => setDetail({ title: t('weeklyReport.followUpCol'), kind: 'followups', followups: rows.flatMap(r => r.followups) })}>{totals.fuCount || '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
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

        {/* 후속조치 — 이 기간 미팅에 기록된 후속조치 내역 그대로 */}
        <div className="border rounded-lg p-4 mt-4">
          <div className="text-sm font-medium text-gray-600 mb-2">
            후속조치 내역
            {followupNotes.length > 0 && <span className="ml-1 text-gray-400">({followupNotes.length}건)</span>}
          </div>
          {followupNotes.length === 0 ? (
            <div className="text-sm text-gray-400">이 기간 미팅에 기록된 후속조치가 없습니다.</div>
          ) : (
            <ul className="space-y-2">
              {followupNotes.map((f, i) => (
                <li key={i} className="text-sm border-l-2 border-amber-300 pl-2.5">
                  <div className="text-[11px] text-gray-400">{f.date} · {f.consultant} · {f.student}</div>
                  <div className="space-y-0.5">
                    {f.items.map((it, j) => (
                      <div key={j} className="text-gray-700 whitespace-pre-wrap">
                        {it.done && (
                          <Badge variant="outline" className="mr-1.5 align-middle text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">완료됨</Badge>
                        )}
                        {it.text}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Drill-down: student / follow-up lists */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.title}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {detail?.kind === 'students' ? detail.students.length : detail?.kind === 'followups' ? detail.followups.length : 0}
              </span>
            </DialogTitle>
          </DialogHeader>
          {detail?.kind === 'students' && (
            detail.students.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">해당 없음</p> : (
              <div className="divide-y">
                {detail.students.map(s => (
                  <button key={s.id} onClick={() => goStudent(s.id)}
                    className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded text-left">
                    <span className="text-sm font-medium">{s.name}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )
          )}
          {detail?.kind === 'followups' && (
            detail.followups.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">해당 없음</p> : (
              <div className="space-y-2">
                {detail.followups.map((f, i) => (
                  <div key={`${f.studentId}-${i}`} className="rounded-lg border p-2.5">
                    <button onClick={() => goStudent(f.studentId)}
                      className="text-sm font-medium hover:underline hover:text-primary flex items-center gap-1">
                      {f.student} <ChevronRight className="size-3.5 text-muted-foreground" />
                    </button>
                    <div className="mt-1 space-y-0.5">
                      {f.items.map((it, j) => (
                        <p key={j} className="text-xs text-gray-600 whitespace-pre-wrap">
                          {it.done && (
                            <Badge variant="outline" className="mr-1.5 align-middle text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">완료됨</Badge>
                          )}
                          {it.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
