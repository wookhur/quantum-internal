import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Handshake, CalendarCheck, TrendingUp, Plus, Loader2, Pencil, Trash2, ChevronRight, Zap } from 'lucide-react'
import { useSalesEvents, useCreateSalesEvent, useUpdateSalesEvent, useDeleteSalesEvent } from '@/hooks/useSalesEvents'
import { useLeads } from '@/hooks/useLeads'
import {
  useSeminarsWithRegistrations,
  useAllContactActivities,
  useAllMeetingsSlim,
  meetingsForLeads,
  computeColdCallOutcome,
  leadMatchesSeminar,
  seminarSessionsForLead,
  dedupeLeadsByPerson,
  normalizePhone,
  normalizeEmail,
  normalizeName,
  type SeminarLite,
  type MeetingSlim,
} from '@/hooks/useSeminarPerformance'
import { useSeminarRegistrations } from '@/hooks/useSeminars'
import { useAllLeadAttendance } from '@/hooks/useLeadAttendance'
import type { Lead, SalesEvent } from '@/types'
import { getStageConfig, MEETING_METHODS } from '@/types'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'

/** One display row: manual sales_event or auto-aggregated seminar. */
interface PerfRow {
  id: string
  month: string
  eventName: string
  /** For a session sub-row of a multi-session seminar; null otherwise. */
  sessionLabel: string | null
  applicants: number
  /** Cold-call planned (참석예정) toggles for this seminar/session. */
  plannedAttendees: number
  attendees: number
  phoneConsultations: number
  zoomBookings: number
  inPersonBookings: number
  totalMeetings: number
  contracts: number
  contractRate: number
  auto: boolean
  source: SalesEvent | null
  seminar: SeminarLite | null
}

const INITIAL_EVENT_FORM = {
  month: '',
  eventName: '',
  applicants: 0,
  attendees: 0,
  phoneConsultations: 0,
  zoomBookings: 0,
  inPersonBookings: 0,
  contracts: 0,
}

export function SalesPerformancePage() {
  const t = useT()
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SalesEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SalesEvent | null>(null)
  const [form, setForm] = useState(INITIAL_EVENT_FORM)

  const createEvent = useCreateSalesEvent()
  const updateEvent = useUpdateSalesEvent()
  const deleteEvent = useDeleteSalesEvent()

  const handleSubmitEvent = () => {
    const payload = {
      month: form.month,
      eventName: form.eventName,
      applicants: form.applicants,
      attendees: form.attendees,
      phoneConsultations: form.phoneConsultations,
      zoomBookings: form.zoomBookings,
      inPersonBookings: form.inPersonBookings,
      contracts: form.contracts,
    }
    const onSuccess = () => {
      setDialogOpen(false)
      setEditingEvent(null)
      setForm(INITIAL_EVENT_FORM)
    }
    if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, ...payload }, { onSuccess })
    } else {
      createEvent.mutate(payload, { onSuccess })
    }
  }

  const openEditDialog = (event: SalesEvent) => {
    setEditingEvent(event)
    setForm({
      month: event.month,
      eventName: event.eventName,
      applicants: event.applicants,
      attendees: event.attendees,
      phoneConsultations: event.phoneConsultations,
      zoomBookings: event.zoomBookings,
      inPersonBookings: event.inPersonBookings,
      contracts: event.contracts,
    })
    setDialogOpen(true)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteEvent.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }

  const { data: events = [], isLoading, error } = useSalesEvents()
  const { data: seminars = [] } = useSeminarsWithRegistrations()
  const { data: allLeads = [] } = useLeads()
  const { data: contactActivities = [] } = useAllContactActivities()
  const { data: allMeetings = [] } = useAllMeetingsSlim()
  const { data: leadAttendance = [] } = useAllLeadAttendance()

  // Which cell was clicked → which list to show
  const [detailDialog, setDetailDialog] = useState<{
    row: PerfRow
    kind: 'leads' | 'registrants' | 'meetings' | 'planned' | 'attendees'
    /** meeting_method filter for kind='meetings'; undefined = all meetings */
    method?: string
  } | null>(null)

  // Registrant list for the applicants dialog (fetched on demand)
  const { data: dialogRegistrationsRaw = [], isLoading: regsLoading } = useSeminarRegistrations(
    (detailDialog?.kind === 'registrants' || detailDialog?.kind === 'attendees') ? detailDialog.row.seminar?.id : undefined,
  )
  // Scope registrants to the clicked session; for 'attendees' keep only attended.
  const dialogRegistrations = useMemo(() => {
    const label = detailDialog?.row.sessionLabel
    let list = dialogRegistrationsRaw
    if (detailDialog?.kind === 'attendees') list = list.filter(r => r.attended)
    if (label) list = list.filter(r => r.sessionLabels.includes(label))
    return list
  }, [dialogRegistrationsRaw, detailDialog])

  // 등록자(신청서) → 리드 매칭 인덱스 (이메일 → 전화 → 이름). 리스트에서 리드로 바로 이동.
  const leadIndex = useMemo(() => {
    const byEmail = new Map<string, string>(), byPhone = new Map<string, string>(), byName = new Map<string, string>()
    for (const l of allLeads) {
      const e = normalizeEmail(l.email); if (e && !byEmail.has(e)) byEmail.set(e, l.id)
      const p = normalizePhone(l.phone); if (p.length >= 9 && !byPhone.has(p)) byPhone.set(p, l.id)
      const nk = normalizeName(l.parentName) + '|' + normalizeName(l.studentName)
      if (nk !== '|' && !byName.has(nk)) byName.set(nk, l.id)
    }
    return { byEmail, byPhone, byName }
  }, [allLeads])
  const leadIdForReg = (r: { email?: string | null; phone?: string | null; parentName?: string; studentName?: string }): string | null => {
    const e = normalizeEmail(r.email); if (e && leadIndex.byEmail.has(e)) return leadIndex.byEmail.get(e)!
    const p = normalizePhone(r.phone); if (p.length >= 9 && leadIndex.byPhone.has(p)) return leadIndex.byPhone.get(p)!
    const nk = normalizeName(r.parentName) + '|' + normalizeName(r.studentName)
    if (nk !== '|' && leadIndex.byName.has(nk)) return leadIndex.byName.get(nk)!
    return null
  }

  // Merge manual sales_events with auto-aggregated seminars
  const rows = useMemo((): PerfRow[] => {
    const manualNames = new Set(events.map(e => e.eventName.trim()))

    const manualRows: PerfRow[] = events.map(e => {
      const seminar = seminars.find(s => s.title === e.eventName) ?? null
      // 연결된 세미나 등록에 참석 표시(참석여부 반영)가 있으면 실제 참석수를 우선 사용.
      // 없으면(예: 예약만 있는 웨비나) 팀이 입력한 수치를 유지.
      const attendees = seminar && seminar.attendees > 0 ? seminar.attendees : e.attendees
      // 세미나가 연결돼 있으면 신청자 셀도 실제 등록자 수를 써서 드릴다운(등록자 명단)과 일치시킨다.
      const applicants = seminar ? seminar.applicants : e.applicants
      return {
        id: e.id,
        month: e.month,
        eventName: e.eventName,
        sessionLabel: null,
        applicants,
        plannedAttendees: 0,
        attendees,
        phoneConsultations: e.phoneConsultations,
        zoomBookings: e.zoomBookings,
        inPersonBookings: e.inPersonBookings,
        totalMeetings: e.totalMeetings,
        contracts: e.contracts,
        contractRate: e.contractRate,
        auto: false,
        source: e,
        seminar,
      }
    })

    // Seminars from 세미나 관리 not manually recorded → auto rows.
    // Consultation counts come from actual meeting records (미팅 기록),
    // broken down by meeting_method. Multi-session seminars (e.g. the 4
    // 진학전략 webinars) expand into one row per session/topic.
    const autoRows: PerfRow[] = seminars
      .filter(s => !manualNames.has(s.title.trim()))
      .flatMap((s): PerfRow[] => {
        const allMatched = dedupeLeadsByPerson(allLeads.filter(l => leadMatchesSeminar(l, s)))
        const month = (s.date || s.createdAt).slice(0, 7)
        const attForSeminar = leadAttendance.filter(a => a.seminarId === s.id)

        const buildRow = (opts: {
          idSuffix: string
          eventName: string
          sessionLabel: string | null
          applicants: number
          matched: Lead[]
          planned: number
          attended: number
        }): PerfRow => {
          const outcome = computeColdCallOutcome(opts.matched, contactActivities, opts.applicants)
          const matchedMeetings = meetingsForLeads(allMeetings, opts.matched)
          const byMethod = (m: string) => matchedMeetings.filter(mt => mt.meetingMethod === m).length
          return {
            id: `seminar-${s.id}${opts.idSuffix}`,
            month,
            eventName: opts.eventName,
            sessionLabel: opts.sessionLabel,
            applicants: opts.applicants,
            plannedAttendees: opts.planned,
            attendees: opts.attended,
            phoneConsultations: byMethod('phone'),
            zoomBookings: byMethod('zoom'),
            inPersonBookings: byMethod('in_person'),
            totalMeetings: matchedMeetings.length,
            contracts: outcome.contracted,
            contractRate: opts.applicants > 0 ? (outcome.contracted / opts.applicants) * 100 : 0,
            auto: true,
            source: null,
            seminar: s,
          }
        }

        // Multi-session seminar → break out one row per session/topic.
        if (s.sessions.length > 1) {
          return s.sessions.map(session => {
            const matched = allMatched.filter(l => seminarSessionsForLead(s, l).includes(session))
            const planned = new Set(
              attForSeminar.filter(a => a.sessionLabel === session && a.status === 'planned').map(a => a.leadId),
            ).size
            const attended = new Set(
              attForSeminar.filter(a => a.sessionLabel === session && a.status === 'attended').map(a => a.leadId),
            ).size
            return buildRow({
              idSuffix: `-${session}`,
              eventName: session,
              sessionLabel: session,
              applicants: s.sessionApplicants.get(session) ?? 0,
              matched,
              planned,
              attended,
            })
          })
        }

        // Single-session (or no sub-sessions) seminar → one aggregate row.
        const planned = new Set(attForSeminar.filter(a => a.status === 'planned').map(a => a.leadId)).size
        const attendedLead = new Set(attForSeminar.filter(a => a.status === 'attended').map(a => a.leadId)).size
        return [buildRow({
          idSuffix: '',
          eventName: s.title,
          sessionLabel: null,
          applicants: s.applicants,
          matched: allMatched,
          planned,
          // registration attended flag (imported seminars) or cold-call attendance
          attended: Math.max(s.attendees, attendedLead),
        })]
      })

    let merged = [...manualRows, ...autoRows]
    if (monthFilter !== 'all') {
      merged = merged.filter(r => r.month === monthFilter)
    }
    return merged
  }, [events, seminars, allLeads, contactActivities, allMeetings, leadAttendance, monthFilter])

  // Extract unique months for the filter dropdown (from all rows, unfiltered)
  const months = useMemo(() => {
    const set = new Set<string>(events.map(e => e.month))
    for (const s of seminars) set.add((s.date || s.createdAt).slice(0, 7))
    return Array.from(set).filter(Boolean).sort().reverse()
  }, [events, seminars])

  // Leads matched to the clicked event row (scoped to the session when the
  // row is a session sub-row of a multi-session seminar).
  const dialogLeads = useMemo((): Lead[] => {
    if (!detailDialog) return []
    const row = detailDialog.row
    if (row.seminar) {
      const s = row.seminar
      let matched = dedupeLeadsByPerson(allLeads.filter(l => leadMatchesSeminar(l, s)))
      if (row.sessionLabel) {
        matched = matched.filter(l => seminarSessionsForLead(s, l).includes(row.sessionLabel!))
      }
      return matched
    }
    return allLeads.filter(l => l.sourceChannel === row.eventName)
  }, [detailDialog, allLeads])

  // Leads marked 참석예정(planned) in cold call for the clicked row's seminar/session
  const dialogPlannedLeads = useMemo((): Lead[] => {
    if (!detailDialog || detailDialog.kind !== 'planned' || !detailDialog.row.seminar) return []
    const s = detailDialog.row.seminar
    const label = detailDialog.row.sessionLabel
    const plannedIds = new Set(
      leadAttendance
        .filter(a => a.seminarId === s.id && a.status === 'planned' && (!label || a.sessionLabel === label))
        .map(a => a.leadId),
    )
    return allLeads.filter(l => plannedIds.has(l.id))
  }, [detailDialog, leadAttendance, allLeads])

  // Meetings matched to the clicked event row (optionally by method)
  const dialogMeetings = useMemo((): MeetingSlim[] => {
    if (!detailDialog || detailDialog.kind !== 'meetings') return []
    // 수동 입력 이벤트는 팀이 직접 입력한 수치가 진실이고, 연락처 매칭 계산은
    // 과다집계(웨비나 무관 상담 포함)로 셀과 안 맞으므로 목록을 계산하지 않는다.
    if (!detailDialog.row.auto) return []
    let matched = meetingsForLeads(allMeetings, dialogLeads)
    if (detailDialog.method) {
      matched = matched.filter(m => m.meetingMethod === detailDialog.method)
    }
    return matched
  }, [detailDialog, allMeetings, dialogLeads])

  // 수동 이벤트는 팀 입력값을 진실로 보여준다(참석·미팅은 계산 목록과 불일치하므로 팀 수치 표시).
  // 신청자(registrants)/리드는 실제 등록 리스트가 유용하므로 계산값 유지(null).
  const manualFigure = useMemo((): number | null => {
    if (!detailDialog || detailDialog.row.auto) return null
    const r = detailDialog.row
    // 실제 참석 등록이 있으면 그 목록(dialogRegistrations)을 쓰고, 없으면 팀 수동값
    if (detailDialog.kind === 'attendees') return (r.seminar && r.seminar.attendees > 0) ? null : r.attendees
    if (detailDialog.kind === 'meetings') {
      if (detailDialog.method === 'phone') return r.phoneConsultations
      if (detailDialog.method === 'zoom') return r.zoomBookings
      if (detailDialog.method === 'in_person') return r.inPersonBookings
      return r.totalMeetings
    }
    return null
  }, [detailDialog])

  // Summary calculations
  const totalApplicants = rows.reduce((sum, e) => sum + (e.applicants || 0), 0)
  const totalMeetings = rows.reduce((sum, e) => sum + (e.totalMeetings || 0), 0)
  const totalContracts = rows.reduce((sum, e) => sum + (e.contracts || 0), 0)
  const avgContractRate = rows.length > 0
    ? rows.reduce((sum, e) => sum + (e.contractRate || 0), 0) / rows.length
    : 0

  // Group rows by month for display
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, PerfRow[]>()
    for (const row of rows) {
      const month = row.month || t('salesPerf.undecided')
      if (!map.has(month)) map.set(month, [])
      map.get(month)!.push(row)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows, t])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('salesPerf.title')}</h1>
          <p className="text-muted-foreground">
            {isLoading ? t('common.loading') : t('salesPerf.totalEvents').replace('{n}', String(rows.length))}
          </p>
        </div>
        <Button className="gap-2" onClick={() => { setEditingEvent(null); setForm(INITIAL_EVENT_FORM); setDialogOpen(true) }}>
          <Plus className="size-4" /> {t('salesPerf.addRecord')}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{totalApplicants.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{t('salesPerf.totalApplicants')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CalendarCheck className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{totalMeetings.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{t('salesPerf.totalMeetings')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Handshake className="size-5 text-success" />
            <div>
              <div className="text-lg font-bold">{totalContracts.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{t('salesPerf.totalContracts')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-warning" />
            <div>
              <div className="text-lg font-bold">{avgContractRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">{t('salesPerf.avgContractRate')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v || 'all')}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={t('salesPerf.selectMonth')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {months.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">
              {t('common.error')}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('salesPerf.noEvents')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">{t('common.month')}</TableHead>
                  <TableHead>{t('salesPerf.col.eventName')}</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.applicants')}</TableHead>
                  <TableHead className="text-right w-[80px]">{t('salesPerf.col.plannedAttendees')}</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.attendees')}</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.phoneConsult')}</TableHead>
                  <TableHead className="text-right w-[70px]">Zoom</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.inPerson')}</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.totalMeetings')}</TableHead>
                  <TableHead className="text-right w-[70px]">{t('salesPerf.col.contracts')}</TableHead>
                  <TableHead className="text-right w-[80px]">{t('salesPerf.col.contractRate')}</TableHead>
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByMonth.map(([month, monthRows]) => (
                  monthRows.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setDetailDialog({ row, kind: 'leads' })}
                    >
                      {idx === 0 ? (
                        <TableCell
                          rowSpan={monthRows.length}
                          className="font-medium text-sm align-top border-r"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Badge variant="outline" className="text-xs font-normal">
                            {month}
                          </Badge>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium text-sm">
                        {row.sessionLabel && row.seminar && (
                          <div className="text-[11px] font-normal text-muted-foreground truncate">
                            {row.seminar.title}
                          </div>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          {row.sessionLabel && <span className="text-muted-foreground">└</span>}
                          {row.eventName}
                          {row.auto && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5" title={t('salesPerf.autoTooltip')}>
                              <Zap className="size-2.5" />
                              {t('salesPerf.autoBadge')}
                            </Badge>
                          )}
                          <ChevronRight className="size-3 text-muted-foreground" />
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums ${row.seminar ? 'hover:underline hover:text-primary' : ''}`}
                        onClick={(e) => {
                          if (!row.seminar) return
                          e.stopPropagation()
                          setDetailDialog({ row, kind: 'registrants' })
                        }}
                      >
                        {row.applicants}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums ${row.seminar && row.plannedAttendees > 0 ? 'hover:underline hover:text-primary cursor-pointer' : ''} ${row.plannedAttendees > 0 ? 'text-blue-600 font-medium' : ''}`}
                        onClick={(e) => {
                          if (!row.seminar || row.plannedAttendees === 0) return
                          e.stopPropagation()
                          setDetailDialog({ row, kind: 'planned' })
                        }}
                      >
                        {row.plannedAttendees || '-'}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums ${row.seminar && row.attendees > 0 ? 'hover:underline hover:text-primary cursor-pointer' : ''}`}
                        onClick={(e) => {
                          if (!row.seminar || row.attendees === 0) return
                          e.stopPropagation()
                          setDetailDialog({ row, kind: 'attendees' })
                        }}
                      >
                        {row.attendees || '-'}
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums hover:underline hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setDetailDialog({ row, kind: 'meetings', method: 'phone' }) }}
                      >
                        {row.phoneConsultations}
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums hover:underline hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setDetailDialog({ row, kind: 'meetings', method: 'zoom' }) }}
                      >
                        {row.zoomBookings}
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums hover:underline hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setDetailDialog({ row, kind: 'meetings', method: 'in_person' }) }}
                      >
                        {row.inPersonBookings}
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums font-medium hover:underline hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setDetailDialog({ row, kind: 'meetings' }) }}
                      >
                        {row.totalMeetings}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <span className={row.contracts > 0 ? 'text-success font-medium' : ''}>
                          {row.contracts}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums" onClick={(e) => e.stopPropagation()}>
                        <Badge
                          variant={row.contractRate >= 10 ? 'default' : 'outline'}
                          className={`text-xs ${row.contractRate >= 10 ? 'bg-success text-white' : ''}`}
                        >
                          {row.contractRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {row.source && (
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditDialog(row.source!)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row.source!)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ))}
                {/* Monthly subtotals */}
                {monthFilter === 'all' && groupedByMonth.length > 1 && (
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={2} className="text-sm">{t('common.total')}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{totalApplicants}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {rows.reduce((s, e) => s + (e.plannedAttendees || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {rows.reduce((s, e) => s + (e.attendees || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {rows.reduce((s, e) => s + (e.phoneConsultations || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {rows.reduce((s, e) => s + (e.zoomBookings || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {rows.reduce((s, e) => s + (e.inPersonBookings || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{totalMeetings}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-success">{totalContracts}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{avgContractRate.toFixed(1)}%</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Sales Event Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEvent(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEvent ? t('salesPerf.editRecordTitle') : t('salesPerf.addRecordTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('salesPerf.monthLabel')} *</Label>
                <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('salesPerf.col.eventName')} *</Label>
                <Input value={form.eventName} onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('salesPerf.col.applicants')}</Label>
                <Input type="number" min={0} value={form.applicants} onChange={e => setForm(f => ({ ...f, applicants: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('salesPerf.col.attendees')}</Label>
                <Input type="number" min={0} value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t('salesPerf.col.phoneConsult')}</Label>
                <Input type="number" min={0} value={form.phoneConsultations} onChange={e => setForm(f => ({ ...f, phoneConsultations: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('salesPerf.zoomBooking')}</Label>
                <Input type="number" min={0} value={form.zoomBookings} onChange={e => setForm(f => ({ ...f, zoomBookings: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('salesPerf.inPersonBooking')}</Label>
                <Input type="number" min={0} value={form.inPersonBookings} onChange={e => setForm(f => ({ ...f, inPersonBookings: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('salesPerf.col.contracts')}</Label>
              <Input type="number" min={0} value={form.contracts} onChange={e => setForm(f => ({ ...f, contracts: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmitEvent} disabled={!form.month || !form.eventName || createEvent.isPending || updateEvent.isPending}>
                {(createEvent.isPending || updateEvent.isPending) ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                {editingEvent ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('salesPerf.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{deleteTarget?.eventName}</strong> ({deleteTarget?.month}) {t('salesPerf.deleteConfirmMsg')}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteEvent.isPending}>
              {deleteEvent.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog: leads / registrants / meetings */}
      <Dialog open={!!detailDialog} onOpenChange={(open) => { if (!open) setDetailDialog(null) }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailDialog?.kind === 'registrants'
                ? t('salesPerf.registrantsDialogTitle').replace('{name}', detailDialog.row.eventName)
                : detailDialog?.kind === 'meetings'
                  ? t('salesPerf.meetingsDialogTitle')
                      .replace('{name}', detailDialog.row.eventName)
                      .replace(
                        '{method}',
                        detailDialog.method
                          ? (MEETING_METHODS.find(m => m.value === detailDialog.method)?.label ?? detailDialog.method)
                          : t('salesPerf.allMethods'),
                      )
                  : detailDialog?.kind === 'planned'
                    ? t('salesPerf.plannedDialogTitle').replace('{name}', detailDialog.row.eventName)
                    : detailDialog?.kind === 'attendees'
                      ? t('salesPerf.attendeesDialogTitle').replace('{name}', detailDialog.row.eventName)
                      : t('salesPerf.leadsDialogTitle').replace('{name}', detailDialog?.row.eventName ?? '')}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t('salesPerf.leadsDialogCount').replace(
                  '{n}',
                  String(
                    manualFigure ?? (
                      (detailDialog?.kind === 'registrants' || detailDialog?.kind === 'attendees')
                        ? dialogRegistrations.length
                        : detailDialog?.kind === 'meetings'
                          ? dialogMeetings.length
                          : detailDialog?.kind === 'planned'
                            ? dialogPlannedLeads.length
                            : dialogLeads.length
                    ),
                  ),
                )}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Registrants / attendees list */}
          {(detailDialog?.kind === 'registrants' || detailDialog?.kind === 'attendees') && (
            (detailDialog.kind === 'attendees' && !detailDialog.row.auto
              && !(detailDialog.row.seminar && detailDialog.row.seminar.attendees > 0)) ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t('salesPerf.manualFigureNote')}
              </p>
            ) : regsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : dialogRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t('salesPerf.noMatchingLeads')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('seminars.regDate')}</TableHead>
                    <TableHead>{t('leads.col.parent')}</TableHead>
                    <TableHead>{t('common.phone')}</TableHead>
                    <TableHead>{t('common.email')}</TableHead>
                    <TableHead>{t('leads.col.student')}</TableHead>
                    <TableHead>{t('leads.col.grade')}</TableHead>
                    <TableHead>{t('leads.col.school')}</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogRegistrations.map((r) => {
                    const leadId = leadIdForReg(r)
                    return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{r.parentName}</TableCell>
                      <TableCell className="text-sm font-mono">{r.phone || '-'}</TableCell>
                      <TableCell className="text-sm">{r.email || '-'}</TableCell>
                      <TableCell className="text-sm">{r.studentName || '-'}</TableCell>
                      <TableCell className="text-sm">{r.grade || '-'}</TableCell>
                      <TableCell className="text-sm">{r.school || '-'}</TableCell>
                      <TableCell>
                        {leadId ? (
                          <Link to={`/sales/leads/${leadId}`}>
                            <Button variant="ghost" size="icon" className="size-6" title="리드로 이동">
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </Link>
                        ) : (
                          <span className="text-[10px] text-muted-foreground" title="연결된 리드 없음">–</span>
                        )}
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          )}

          {/* Meetings list */}
          {detailDialog?.kind === 'meetings' && (
            !detailDialog.row.auto ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t('salesPerf.manualFigureNote')}
              </p>
            ) : dialogMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t('salesPerf.noMatchingMeetings')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('meetings.col.meetingDate')}</TableHead>
                    <TableHead>{t('meetings.col.method')}</TableHead>
                    <TableHead>{t('meetings.col.meetingNumber')}</TableHead>
                    <TableHead>{t('leads.col.parent')}</TableHead>
                    <TableHead>{t('leads.col.student')}</TableHead>
                    <TableHead>{t('common.phone')}</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogMeetings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm font-mono">{m.meetingDate || '-'}</TableCell>
                      <TableCell className="text-sm">
                        {m.meetingMethod
                          ? (MEETING_METHODS.find(mm => mm.value === m.meetingMethod)?.label ?? m.meetingMethod)
                          : <span className="text-muted-foreground">{t('salesPerf.methodUnknown')}</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {m.meetingNumber ? t('meetings.nthMeeting').replace('{n}', String(m.meetingNumber)) : '-'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{m.parentName || '-'}</TableCell>
                      <TableCell className="text-sm">{m.studentName || '-'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.phone || '-'}</TableCell>
                      <TableCell>
                        {m.leadId && (
                          <Link to={`/sales/leads/${m.leadId}`}>
                            <Button variant="ghost" size="icon" className="size-6">
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {/* Leads list (matched leads or 참석예정 leads) */}
          {(detailDialog?.kind === 'leads' || detailDialog?.kind === 'planned') && (() => {
            const leadsToShow = detailDialog.kind === 'planned' ? dialogPlannedLeads : dialogLeads
            return leadsToShow.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                {t('salesPerf.noMatchingLeads')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('leads.col.parent')}</TableHead>
                    <TableHead>{t('leads.col.student')}</TableHead>
                    <TableHead>{t('leads.col.school')}</TableHead>
                    <TableHead>{t('leads.col.grade')}</TableHead>
                    <TableHead>{t('leads.sourceChannel')}</TableHead>
                    <TableHead>{t('leads.col.stage')}</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsToShow.map((lead) => {
                    const stage = getStageConfig(lead.pipelineStage)
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="text-sm font-medium">{lead.parentName}</TableCell>
                        <TableCell className="text-sm">{lead.studentName || '-'}</TableCell>
                        <TableCell className="text-sm">{lead.currentSchool || '-'}</TableCell>
                        <TableCell className="text-sm">{lead.grade || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{lead.sourceChannel}</TableCell>
                        <TableCell>
                          <span className={`status-pill status-pill--${stage.color.replace('stage-', '')}`}>
                            {stage.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link to={`/sales/leads/${lead.id}`}>
                            <Button variant="ghost" size="icon" className="size-6">
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
