import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Handshake, CalendarCheck, TrendingUp, Plus, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useSalesEvents, useCreateSalesEvent, useUpdateSalesEvent, useDeleteSalesEvent } from '@/hooks/useSalesEvents'
import type { SalesEvent } from '@/types'
import { useT } from '@/i18n/LanguageContext'

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

  const { data: events = [], isLoading, error } = useSalesEvents({
    month: monthFilter !== 'all' ? monthFilter : undefined,
  })

  // Extract unique months for the filter dropdown
  const months = useMemo(() => {
    const set = new Set(events.map(e => e.month))
    return Array.from(set).sort().reverse()
  }, [events])

  // Summary calculations
  const totalApplicants = events.reduce((sum, e) => sum + (e.applicants || 0), 0)
  const totalMeetings = events.reduce((sum, e) => sum + (e.totalMeetings || 0), 0)
  const totalContracts = events.reduce((sum, e) => sum + (e.contracts || 0), 0)
  const avgContractRate = events.length > 0
    ? events.reduce((sum, e) => sum + (e.contractRate || 0), 0) / events.length
    : 0

  // Group events by month for display
  const groupedByMonth = useMemo(() => {
    const map = new Map<string, typeof events>()
    for (const event of events) {
      const month = event.month || t('salesPerf.undecided')
      if (!map.has(month)) map.set(month, [])
      map.get(month)!.push(event)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [events])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('salesPerf.title')}</h1>
          <p className="text-muted-foreground">
            {isLoading ? t('common.loading') : t('salesPerf.totalEvents').replace('{n}', String(events.length))}
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
          ) : events.length === 0 ? (
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
                {groupedByMonth.map(([month, monthEvents]) => (
                  monthEvents.map((event, idx) => (
                    <TableRow key={event.id}>
                      {idx === 0 ? (
                        <TableCell
                          rowSpan={monthEvents.length}
                          className="font-medium text-sm align-top border-r"
                        >
                          <Badge variant="outline" className="text-xs font-normal">
                            {month}
                          </Badge>
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium text-sm">{event.eventName}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{event.applicants}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{event.attendees}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{event.phoneConsultations}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{event.zoomBookings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{event.inPersonBookings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">{event.totalMeetings}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={event.contracts > 0 ? 'text-success font-medium' : ''}>
                          {event.contracts}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <Badge
                          variant={event.contractRate >= 10 ? 'default' : 'outline'}
                          className={`text-xs ${event.contractRate >= 10 ? 'bg-success text-white' : ''}`}
                        >
                          {event.contractRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditDialog(event)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(event)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
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
                      {events.reduce((s, e) => s + (e.attendees || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {events.reduce((s, e) => s + (e.phoneConsultations || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {events.reduce((s, e) => s + (e.zoomBookings || 0), 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {events.reduce((s, e) => s + (e.inPersonBookings || 0), 0)}
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
    </div>
  )
}
