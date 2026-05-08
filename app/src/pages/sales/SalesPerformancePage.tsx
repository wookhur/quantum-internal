import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Handshake, CalendarCheck, TrendingUp, Plus, Loader2 } from 'lucide-react'
import { useSalesEvents, useCreateSalesEvent } from '@/hooks/useSalesEvents'

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
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_EVENT_FORM)

  const createEvent = useCreateSalesEvent()

  const handleCreateEvent = () => {
    createEvent.mutate(
      {
        month: form.month,
        eventName: form.eventName,
        applicants: form.applicants,
        attendees: form.attendees,
        phoneConsultations: form.phoneConsultations,
        zoomBookings: form.zoomBookings,
        inPersonBookings: form.inPersonBookings,
        contracts: form.contracts,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_EVENT_FORM)
        },
      },
    )
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
      const month = event.month || '미정'
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
          <h1 className="text-2xl font-bold tracking-tight">영업 현황</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : `총 ${events.length}건의 이벤트`}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> 실적 추가
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{totalApplicants.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">총 신청자</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CalendarCheck className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{totalMeetings.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">총 미팅</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Handshake className="size-5 text-success" />
            <div>
              <div className="text-lg font-bold">{totalContracts.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">총 계약</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-warning" />
            <div>
              <div className="text-lg font-bold">{avgContractRate.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">평균 계약률</div>
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
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
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
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              영업 이벤트 데이터가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">월</TableHead>
                  <TableHead>이벤트명</TableHead>
                  <TableHead className="text-right w-[70px]">신청자</TableHead>
                  <TableHead className="text-right w-[70px]">참석자</TableHead>
                  <TableHead className="text-right w-[70px]">전화상담</TableHead>
                  <TableHead className="text-right w-[70px]">Zoom</TableHead>
                  <TableHead className="text-right w-[70px]">대면</TableHead>
                  <TableHead className="text-right w-[70px]">총 미팅</TableHead>
                  <TableHead className="text-right w-[70px]">계약</TableHead>
                  <TableHead className="text-right w-[80px]">계약률</TableHead>
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
                    </TableRow>
                  ))
                ))}
                {/* Monthly subtotals */}
                {monthFilter === 'all' && groupedByMonth.length > 1 && (
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={2} className="text-sm">합계</TableCell>
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
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Sales Event Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 실적 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>월 (YYYY-MM) *</Label>
                <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>이벤트명 *</Label>
                <Input value={form.eventName} onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>신청자</Label>
                <Input type="number" min={0} value={form.applicants} onChange={e => setForm(f => ({ ...f, applicants: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>참석자</Label>
                <Input type="number" min={0} value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>전화상담</Label>
                <Input type="number" min={0} value={form.phoneConsultations} onChange={e => setForm(f => ({ ...f, phoneConsultations: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Zoom 예약</Label>
                <Input type="number" min={0} value={form.zoomBookings} onChange={e => setForm(f => ({ ...f, zoomBookings: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>대면 예약</Label>
                <Input type="number" min={0} value={form.inPersonBookings} onChange={e => setForm(f => ({ ...f, inPersonBookings: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>계약</Label>
              <Input type="number" min={0} value={form.contracts} onChange={e => setForm(f => ({ ...f, contracts: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleCreateEvent} disabled={!form.month || !form.eventName || createEvent.isPending}>
                {createEvent.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
