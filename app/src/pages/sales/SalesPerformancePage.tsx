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
  computeColdCallOutcome,
  leadMatchesSeminar,
  type SeminarLite,
} from '@/hooks/useSeminarPerformance'
import type { Lead, SalesEvent } from '@/types'
import { getStageConfig } from '@/types'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/LanguageContext'

/** One display row: manual sales_event or auto-aggregated seminar. */
interface PerfRow {
  id: string
  month: string
  eventName: string
  applicants: number
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

  const [leadsDialogRow, setLeadsDialogRow] = useState<PerfRow | null>(null)

  // Merge manual sales_events with auto-aggregated seminars
  const rows = useMemo((): PerfRow[] => {
    const manualNames = new Set(events.map(e => e.eventName.trim()))

    const manualRows: PerfRow[] = events.map(e => ({
      id: e.id,
      month: e.month,
      eventName: e.eventName,
      applicants: e.applicants,
      attendees: e.attendees,
      phoneConsultations: e.phoneConsultations,
      zoomBookings: e.zoomBookings,
      inPersonBookings: e.inPersonBookings,
      totalMeetings: e.totalMeetings,
      contracts: e.contracts,
      contractRate: e.contractRate,
      auto: false,
      source: e,
      seminar: seminars.find(s => s.title === e.eventName) ?? null,
    }))

    // Seminars from 세미나 관리 not manually recorded → auto rows
    const autoRows: PerfRow[] = seminars
      .filter(s => !manualNames.has(s.title.trim()))
      .map(s => {
        const matched = allLeads.filter(l => leadMatchesSeminar(l, s))
        const outcome = computeColdCallOutcome(matched, contactActivities, s.applicants)
        const month = (s.date || s.createdAt).slice(0, 7)
        return {
          id: `seminar-${s.id}`,
          month,
          eventName: s.title,
          applicants: s.applicants,
          attendees: 0,
          phoneConsultations: outcome.confirmed,
          zoomBookings: 0,
          inPersonBookings: 0,
          totalMeetings: outcome.consultScheduled,
          contracts: outcome.contracted,
          contractRate: s.applicants > 0 ? (outcome.contracted / s.applicants) * 100 : 0,
          auto: true,
          source: null,
          seminar: s,
        }
      })

    let merged = [...manualRows, ...autoRows]
    if (monthFilter !== 'all') {
      merged = merged.filter(r => r.month === monthFilter)
    }
    return merged
  }, [events, seminars, allLeads, contactActivities, monthFilter])

  // Extract unique months for the filter dropdown (from all rows, unfiltered)
  const months = useMemo(() => {
    const set = new Set<string>(events.map(e => e.month))
    for (const s of seminars) set.add((s.date || s.createdAt).slice(0, 7))
    return Array.from(set).filter(Boolean).sort().reverse()
  }, [events, seminars])

  // Leads for the clicked event row
  const dialogLeads = useMemo((): Lead[] => {
    if (!leadsDialogRow) return []
    if (leadsDialogRow.seminar) {
      const s = leadsDialogRow.seminar
      return allLeads.filter(l => leadMatchesSeminar(l, s))
    }
    return allLeads.filter(l => l.sourceChannel === leadsDialogRow.eventName)
  }, [leadsDialogRow, allLeads])

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
                      onClick={() => setLeadsDialogRow(row)}
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
                        <span className="inline-flex items-center gap-1.5">
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
                      <TableCell className="text-right text-sm tabular-nums">{row.applicants}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.attendees || '-'}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.phoneConsultations}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.zoomBookings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{row.inPersonBookings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">{row.totalMeetings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={row.contracts > 0 ? 'text-success font-medium' : ''}>
                          {row.contracts}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
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

      {/* Leads for Event Dialog */}
      <Dialog open={!!leadsDialogRow} onOpenChange={(open) => { if (!open) setLeadsDialogRow(null) }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('salesPerf.leadsDialogTitle').replace('{name}', leadsDialogRow?.eventName ?? '')}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t('salesPerf.leadsDialogCount').replace('{n}', String(dialogLeads.length))}
              </span>
            </DialogTitle>
          </DialogHeader>
          {dialogLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {t('salesPerf.noMatchingLeads')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('leads.col.parentName')}</TableHead>
                  <TableHead>{t('leads.col.studentName')}</TableHead>
                  <TableHead>{t('leads.col.school')}</TableHead>
                  <TableHead>{t('leads.col.grade')}</TableHead>
                  <TableHead>{t('leads.sourceChannel')}</TableHead>
                  <TableHead>{t('leads.col.stage')}</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dialogLeads.map((lead) => {
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
