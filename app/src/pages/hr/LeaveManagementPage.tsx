import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, CalendarDays, Loader2, Trash2, Check, X, Info } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useLeaveRequests, useCreateLeaveRequest, useUpdateLeaveStatus, useDeleteLeaveRequest,
  type LeaveRequest, type LeaveStatus,
} from '@/hooks/useLeaveRequests'
import {
  computeAnnualEntitlement, dayCount, FAMILY_EVENTS, familyEventLabel,
  LEAVE_TYPE_LABELS, type LeaveType,
} from '@/lib/leave'

const STATUS_CFG: Record<LeaveStatus, { label: string; className: string }> = {
  requested: { label: '승인대기', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인됨', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700' },
}

type Tab = 'mine' | 'all'

export function LeaveManagementPage() {
  const { user } = useAuth()
  const { data: requests = [], isLoading } = useLeaveRequests()
  const createReq = useCreateLeaveRequest()
  const updateStatus = useUpdateLeaveStatus()
  const deleteReq = useDeleteLeaveRequest()

  const isApprover = user?.role === 'admin' || !!user?.canApproveLeave
  const [tab, setTab] = useState<Tab>('mine')
  const [showForm, setShowForm] = useState(false)

  // My annual-leave balance
  const annual = useMemo(
    () => computeAnnualEntitlement(user?.contractStartDate),
    [user?.contractStartDate],
  )
  const myAnnualUsed = useMemo(() =>
    requests
      .filter(r => r.requesterId === user?.id && r.leaveType === 'annual' && r.status !== 'rejected')
      .reduce((s, r) => s + r.days, 0),
    [requests, user?.id],
  )
  const remaining = Math.max(0, annual.entitlement - myAnnualUsed)

  const mine = requests.filter(r => r.requesterId === user?.id)
  const pending = requests.filter(r => r.status === 'requested')
  const list = tab === 'mine' ? mine : requests

  async function handleStatus(r: LeaveRequest, status: LeaveStatus) {
    await updateStatus.mutateAsync({
      id: r.id, status, actorId: user?.id,
      requesterId: r.requesterId, startDate: r.startDate, endDate: r.endDate,
    })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">연차관리</h1>
          <p className="text-sm text-muted-foreground">연차·경조사 휴가 신청 및 승인</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />휴가 신청
        </Button>
      </div>

      {/* My annual balance */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">올해 연차</div>
              <div className="text-2xl font-bold">{annual.entitlement}<span className="text-sm font-normal text-muted-foreground">일</span></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">사용</div>
              <div className="text-2xl font-bold text-blue-600">{myAnnualUsed}<span className="text-sm font-normal text-muted-foreground">일</span></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">잔여</div>
              <div className="text-2xl font-bold text-emerald-600">{remaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground max-w-sm ml-auto">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                {annual.note}
                {annual.effectiveStart && ` · 연차 계산 시작일 ${annual.effectiveStart}`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mine')}>
          내 신청 ({mine.length})
        </Button>
        {isApprover && (
          <Button variant={tab === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTab('all')}>
            전체 {pending.length > 0 && <span className="ml-1 text-amber-600">· 대기 {pending.length}</span>}
          </Button>
        )}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>휴가 신청 내역이 없습니다.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map(r => (
            <LeaveCard
              key={r.id}
              req={r}
              isApprover={isApprover}
              isOwner={r.requesterId === user?.id}
              showRequester={tab === 'all'}
              onStatus={handleStatus}
              onDelete={(id) => deleteReq.mutate(id)}
            />
          ))}
        </div>
      )}

      {showForm && user && (
        <LeaveFormDialog
          onClose={() => setShowForm(false)}
          pending={createReq.isPending}
          onSubmit={async (payload) => {
            await createReq.mutateAsync({
              requesterId: user.id,
              requesterName: user.name,
              ...payload,
            })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function LeaveCard({ req, isApprover, isOwner, showRequester, onStatus, onDelete }: {
  req: LeaveRequest
  isApprover: boolean
  isOwner: boolean
  showRequester: boolean
  onStatus: (r: LeaveRequest, s: LeaveStatus) => void
  onDelete: (id: string) => void
}) {
  const cfg = STATUS_CFG[req.status]
  const typeLabel = req.leaveType === 'family_event'
    ? `경조사 · ${familyEventLabel(req.eventType)}`
    : LEAVE_TYPE_LABELS[req.leaveType]

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{typeLabel}</span>
              <Badge variant="outline" className="text-[10px]">{req.days}일</Badge>
              {!req.paid && <Badge variant="outline" className="text-[10px] text-gray-500">무급</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showRequester && <>{req.requesterName} · </>}
              {req.startDate} ~ {req.endDate}
              {req.approvedByName && <> · 승인: {req.approvedByName}</>}
            </p>
          </div>
          <Badge className={`text-xs shrink-0 ${cfg.className}`}>{cfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {req.reason && <p className="text-xs text-muted-foreground mb-2">사유: {req.reason}</p>}
        <div className="flex items-center gap-2">
          {isApprover && req.status === 'requested' && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={() => onStatus(req, 'approved')}>
                <Check className="h-3 w-3 mr-1" />승인
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onStatus(req, 'rejected')}>
                <X className="h-3 w-3 mr-1" />반려
              </Button>
            </>
          )}
          {(isApprover || (isOwner && req.status === 'requested')) && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onDelete(req.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function LeaveFormDialog({ onClose, onSubmit, pending }: {
  onClose: () => void
  onSubmit: (p: {
    leaveType: LeaveType; eventType?: string; startDate: string; endDate: string; days: number; paid: boolean; reason?: string
  }) => void
  pending: boolean
}) {
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [eventType, setEventType] = useState<string>(FAMILY_EVENTS[0].key)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [paid, setPaid] = useState(true)

  // Auto-computed days
  const autoDays = useMemo(() => {
    if (leaveType === 'family_event') {
      return FAMILY_EVENTS.find(e => e.key === eventType)?.days || 1
    }
    if (startDate && endDate) return dayCount(startDate, endDate)
    return 1
  }, [leaveType, eventType, startDate, endDate])

  const [daysOverride, setDaysOverride] = useState<string>('')
  const days = daysOverride !== '' ? Number(daysOverride) : autoDays

  const canSubmit = !!startDate && !!endDate && days > 0

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>휴가 신청</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>휴가 종류</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">연차</SelectItem>
                <SelectItem value="family_event">경조사</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {leaveType === 'family_event' && (
            <div>
              <Label>경조사 항목</Label>
              <Select value={eventType} onValueChange={(v) => v && setEventType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAMILY_EVENTS.map(e => (
                    <SelectItem key={e.key} value={e.key}>{e.label} ({e.days}일)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>일수</Label>
              <Input
                type="number" min="0.5" step="0.5"
                value={daysOverride !== '' ? daysOverride : String(autoDays)}
                onChange={(e) => setDaysOverride(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">자동 계산: {autoDays}일 (수정 가능)</p>
            </div>
            {leaveType === 'other' && (
              <div>
                <Label>유급 여부</Label>
                <Select value={paid ? 'paid' : 'unpaid'} onValueChange={(v) => setPaid(v === 'paid')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">유급</SelectItem>
                    <SelectItem value="unpaid">무급</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>사유</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button
              disabled={!canSubmit || pending}
              onClick={() => onSubmit({
                leaveType,
                eventType: leaveType === 'family_event' ? eventType : undefined,
                startDate, endDate, days,
                paid: leaveType === 'other' ? paid : true,
                reason: reason.trim() || undefined,
              })}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}신청
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
