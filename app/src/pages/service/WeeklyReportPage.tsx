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
import { reconcileContracts } from '@/lib/contractReconcile'
import { useConsultantPool, useConsultantName } from '@/lib/consultants'
import { studentPickerLabel } from '@/lib/studentDisplay'

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
  // 학생 표시명: 한글+영문 병기 (예: "김은서 Amy Kim"). id 우선, 없으면 이름으로 한글명 해소.
  const studentKo = useMemo(() => {
    const byId = new Map<string, string>(), byName = new Map<string, string>()
    for (const s of students) if (s.koreanName) { byId.set(s.id, s.koreanName); if (s.name) byName.set(s.name, s.koreanName) }
    return { byId, byName }
  }, [students])
  const dispStudent = (name?: string, id?: string): string => {
    const ko = (id ? studentKo.byId.get(id) : undefined) || (name ? studentKo.byName.get(name) : undefined)
    return studentPickerLabel({ name: name || '—', koreanName: ko })
  }
  const { data: meetings = [] } = useAllServiceMeetings(start, end)
  const { data: diaries = [] } = useAllServiceDiaryInRange(start, end)
  const { data: contracts = [] } = useContracts()

  // 계약관리 '서비스 진행중'(건수) ↔ Student360 '활성'(명수) 대조.
  // 차이를 항목별로 분해해 어디서 몇 명/몇 건이 벌어졌는지 그대로 보여준다.
  const contractCheck = useMemo(
    () => reconcileContracts(activeStudents, contracts),
    [activeStudents, contracts],
  )
  const inServiceContractCount = contractCheck.contractCount

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

  // ── 미팅보고서 2회 이상 완료 학생 (컨설턴트별, 조회 기간 내) ──
  const twoDoneByConsultant = useMemo(() => {
    // 학생별 이 기간 완료 리포트 수 (제출완료 or 리포트URL, 취소 제외)
    const doneCount = new Map<string, number>()
    for (const mt of meetings) {
      if ((mt.reportStatus === 'submitted' || !!mt.reportUrl) && mt.status !== 'cancelled') {
        doneCount.set(mt.studentId, (doneCount.get(mt.studentId) || 0) + 1)
      }
    }
    const byC = new Map<string, { name: string; students: { id: string; label: string; count: number }[] }>()
    for (const s of activeStudents) {
      const count = doneCount.get(s.id) || 0
      if (count < 2) continue
      const cn = consultantName(s.assignedConsultant) || '미배정'
      const label = [s.koreanName, s.name].filter(Boolean).join(' ') || s.name || '—'
      const entry = byC.get(cn) || { name: cn, students: [] }
      entry.students.push({ id: s.id, label, count })
      byC.set(cn, entry)
    }
    byC.forEach(e => e.students.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko')))
    return Array.from(byC.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [meetings, activeStudents, consultantName])

  // Critical issues (risks/escalations) from diaries in the period
  const criticalIssues = useMemo(
    () => diaries
      .filter(d => (d.criticalIssue || '').trim().length > 0)
      .map(d => ({ date: d.entryDate || '', student: d.studentName, studentId: d.studentId, consultant: consultantName(d.studentConsultant), text: (d.criticalIssue || '').trim() })),
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
          studentId: d.studentId,
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
                <th className="font-medium p-2 pr-3">{t('weeklyReport.noShowCol')}</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {rows.map(r => {
                const cancelMemo = r.cancelDetails.filter(c => !c.reason.startsWith('노쇼')).map(c => `${dispStudent(c.student)} · ${c.reason}`).join('\n')
                const noShowMemo = r.cancelDetails.filter(c => c.reason.startsWith('노쇼')).map(c => `${dispStudent(c.student)} · ${c.reason}`).join('\n')
                return (
                  <tr key={r.id} className="border-t">
                    <td className="text-left p-2 pl-3">{r.name}</td>
                    <td className={`p-2 ${r.students > 0 ? 'cursor-pointer hover:underline hover:text-primary' : ''}`}
                      onClick={() => r.students > 0 && setDetail({ title: `${r.name} · ${t('weeklyReport.students')}`, kind: 'students', students: r.studentEntries })}>{r.students}</td>
                    <td className={`p-2 ${r.held > 0 ? 'cursor-pointer hover:underline hover:text-primary' : ''}`}
                      onClick={() => r.held > 0 && setDetail({ title: `${r.name} · ${t('weeklyReport.held')}`, kind: 'students', students: r.heldStudents })}>{r.held}</td>
                    <td className={`p-2 ${r.cancelled > 0 ? 'cursor-help text-red-600' : ''}`} title={cancelMemo}>{r.cancelled}</td>
                    <td className={`p-2 pr-3 ${r.noShow > 0 ? 'cursor-help text-red-600' : ''}`} title={noShowMemo}>{r.noShow}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">{t('weeklyReport.noData')}</td></tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 bg-gray-50 font-medium">
                  <td className="text-left p-2 pl-3">{t('weeklyReport.companyTotal')}</td>
                  {(() => {
                    // 장학생은 계약이 없는 것이 정상이므로 그 수만큼 빼고 비교한다.
                    const rc = contractCheck
                    // 장학생·중복계약은 설명 가능한 정상 차이 → 빨간 경고는 사람이 손봐야 할 때만.
                    const mismatch = rc.needsAttention
                    const memo = [
                      `계약관리 서비스진행중: ${rc.contractCount}건`,
                      `Student360 활성: ${rc.studentCount}명 (이름 기준)`,
                      rc.noContract.length ? `\n▸ 활성 학생인데 진행중 계약 없음 (${rc.noContract.length}명): ${rc.noContract.join(', ')}\n   → 계약이 끝났는데 학생 상태가 '진행중'으로 남았거나, 계약 등록 누락` : '',
                      rc.scholarshipNoContract.length ? `\n▸ 장학생 — 무료라 계약 없음이 정상 (${rc.scholarshipNoContract.length}명): ${rc.scholarshipNoContract.join(', ')}` : '',
                      rc.noActiveStudent.length ? `\n▸ 진행중 계약인데 활성 학생 없음 (${rc.noActiveStudent.length}건): ${rc.noActiveStudent.join(', ')}\n   → Student360 미등록이거나, 학생만 완료·취소 처리됨` : '',
                      rc.duplicated.length ? `\n▸ 같은 학생 진행중 계약 2건 이상 — 건수가 명수보다 많아짐 (+${rc.duplicateExtra}건): ${rc.duplicated.join(', ')}` : '',
                      rc.sameNameStudents.length ? `\n▸ 활성 학생 동명이인 (${rc.sameNameStudents.length}): ${rc.sameNameStudents.join(', ')}\n   → 이름으로 계약을 맞추므로 매칭이 틀릴 수 있음` : '',
                      `\n\n계산: 활성 ${rc.studentCount}명 − 계약없음 ${rc.noContract.length} − 장학생 ${rc.scholarshipNoContract.length} + 활성학생없는계약 ${rc.noActiveStudent.length}건 + 중복 ${rc.duplicateExtra}건 = ${rc.contractCount}건`,
                    ].filter(Boolean).join('')
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
                  <td className="p-2 pr-3">{totals.noShow}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 미팅보고서 2회 이상 완료 학생 (컨설턴트별) */}
        <div className="border rounded-lg overflow-hidden mb-5">
          <div className="bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600">
            미팅보고서 2회 이상 완료 학생 <span className="text-xs text-gray-400">(컨설턴트별 · 이 기간 {start} ~ {end})</span>
          </div>
          {twoDoneByConsultant.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">이 기간에 미팅보고서를 2회 완료한 학생이 없습니다.</div>
          ) : (
            <div className="divide-y">
              {twoDoneByConsultant.map(c => (
                <div key={c.name} className="px-4 py-3">
                  <div className="font-medium text-sm mb-1.5">{c.name} <span className="text-xs text-gray-400">({c.students.length}명)</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.students.map(s => (
                      <span key={s.id} className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">
                        {s.label} · {s.count}회
                      </span>
                    ))}
                  </div>
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
                  <div className="text-[11px] text-gray-400">{c.date} · {c.consultant} · {dispStudent(c.student, c.studentId)}</div>
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
                  <div className="text-[11px] text-gray-400">{f.date} · {f.consultant} · {dispStudent(f.student, f.studentId)}</div>
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
                    <span className="text-sm font-medium">{dispStudent(s.name, s.id)}</span>
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
                      {dispStudent(f.student, f.studentId)} <ChevronRight className="size-3.5 text-muted-foreground" />
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
