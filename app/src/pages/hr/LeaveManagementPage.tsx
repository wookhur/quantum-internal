import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, CalendarDays, Loader2, Trash2, Check, X, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useLeaveRequests, useCreateLeaveRequest, useUpdateLeaveStatus, useDeleteLeaveRequest,
  type LeaveRequest, type LeaveStatus,
} from '@/hooks/useLeaveRequests'
import {
  computeAnnualEntitlement, dayCount, FAMILY_EVENTS, familyEventLabel,
  LEAVE_TYPE_LABELS, PAID_LEAVE_ANNUAL, type LeaveType,
} from '@/lib/leave'
import { useProfiles } from '@/hooks/useProfiles'
import type { User } from '@/types'

const STATUS_CFG: Record<LeaveStatus, { label: string; className: string }> = {
  requested: { label: '승인대기', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인됨', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700' },
}

type Tab = 'mine' | 'calendar' | 'approve' | 'summary'

export function LeaveManagementPage() {
  const { user } = useAuth()
  const { data: requests = [], isLoading } = useLeaveRequests()
  const { data: profiles = [] } = useProfiles()
  const createReq = useCreateLeaveRequest()
  const updateStatus = useUpdateLeaveStatus()
  const deleteReq = useDeleteLeaveRequest()

  const isApprover = user?.role === 'admin' || !!user?.canApproveLeave
  const [tab, setTab] = useState<Tab>('mine')
  const [showForm, setShowForm] = useState(false)

  // My annual-leave balance
  const annual = useMemo(
    () => computeAnnualEntitlement(user?.hireDate || user?.contractStartDate),
    [user?.hireDate, user?.contractStartDate],
  )
  const myAnnualUsed = useMemo(() =>
    requests
      .filter(r => r.requesterId === user?.id && r.leaveType === 'annual' && r.status !== 'rejected')
      .reduce((s, r) => s + r.days, 0),
    [requests, user?.id],
  )
  const myPaidUsed = useMemo(() =>
    requests
      .filter(r => r.requesterId === user?.id && r.leaveType === 'paid_special' && r.status !== 'rejected')
      .reduce((s, r) => s + r.days, 0),
    [requests, user?.id],
  )
  const remaining = Math.max(0, annual.entitlement - myAnnualUsed)
  const paidRemaining = Math.max(0, PAID_LEAVE_ANNUAL - myPaidUsed)

  const mine = requests.filter(r => r.requesterId === user?.id)
  const pending = requests.filter(r => r.status === 'requested')
  // Approved leaves visible to everyone (for the calendar / 현황판)
  const approvedLeaves = useMemo(() => requests.filter(r => r.status === 'approved'), [requests])
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

      {/* My balances */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">연차</div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-muted-foreground">부여</div>
                <div className="text-2xl font-bold">{annual.entitlement}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">사용</div>
                <div className="text-2xl font-bold text-blue-600">{myAnnualUsed}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">잔여</div>
                <div className="text-2xl font-bold text-emerald-600">{remaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
            </div>
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-2">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>{annual.note}{annual.effectiveStart && ` · 시작일 ${annual.effectiveStart}`}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">유급휴가</div>
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-muted-foreground">부여</div>
                <div className="text-2xl font-bold">{PAID_LEAVE_ANNUAL}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">사용</div>
                <div className="text-2xl font-bold text-blue-600">{myPaidUsed}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">잔여</div>
                <div className="text-2xl font-bold text-emerald-600">{paidRemaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">연 {PAID_LEAVE_ANNUAL}일 · 경조사는 별도(잔여 차감 없음)</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mine')}>
          내 신청 ({mine.length})
        </Button>
        <Button variant={tab === 'calendar' ? 'default' : 'outline'} size="sm" onClick={() => setTab('calendar')}>
          현황판(캘린더)
        </Button>
        {isApprover && (
          <Button variant={tab === 'approve' ? 'default' : 'outline'} size="sm" onClick={() => setTab('approve')}>
            승인 관리 {pending.length > 0 && <span className="ml-1 text-amber-600">· 대기 {pending.length}</span>}
          </Button>
        )}
        {isApprover && (
          <Button variant={tab === 'summary' ? 'default' : 'outline'} size="sm" onClick={() => setTab('summary')}>
            직원 현황
          </Button>
        )}
      </div>

      {tab === 'calendar' ? (
        <LeaveCalendar approved={approvedLeaves} />
      ) : tab === 'summary' ? (
        <EmployeeLeaveSummary profiles={profiles} requests={requests} />
      ) : list.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>{tab === 'approve' ? '신청 내역이 없습니다.' : '휴가 신청 내역이 없습니다.'}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map(r => (
            <LeaveCard
              key={r.id}
              req={r}
              isApprover={isApprover}
              isOwner={r.requesterId === user?.id}
              showRequester={tab === 'approve'}
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
                <SelectItem value="paid_special">유급휴가 (연 {PAID_LEAVE_ANNUAL}일)</SelectItem>
                <SelectItem value="sick">병가</SelectItem>
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
            {(leaveType === 'other' || leaveType === 'sick') && (
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
                paid: (leaveType === 'other' || leaveType === 'sick') ? paid : true,
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

const TYPE_COLOR: Record<string, string> = {
  annual: 'bg-blue-100 text-blue-700',
  paid_special: 'bg-emerald-100 text-emerald-700',
  sick: 'bg-orange-100 text-orange-700',
  family_event: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-700',
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monthly calendar of approved leaves (현황판) — everyone can see. */
function LeaveCalendar({ approved }: { approved: LeaveRequest[] }) {
  const [offset, setOffset] = useState(0)
  const base = new Date()
  base.setDate(1)
  base.setMonth(base.getMonth() + offset)
  const year = base.getFullYear()
  const month = base.getMonth()
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const todayStr = ymd(new Date())

  const byDate = new Map<string, LeaveRequest[]>()
  for (const r of approved) {
    const start = new Date(`${r.startDate}T00:00:00`)
    const end = new Date(`${r.endDate}T00:00:00`)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = ymd(d)
      if (!ds.startsWith(monthStr)) continue
      const arr = byDate.get(ds) || []
      arr.push(r)
      byDate.set(ds, arr)
    }
  }

  const days = Array.from({ length: daysInMonth }, (_, i) => `${monthStr}-${String(i + 1).padStart(2, '0')}`)

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold min-w-[96px] text-center">{year}년 {month + 1}월</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            {offset !== 0 && <Button variant="ghost" size="sm" className="h-7" onClick={() => setOffset(0)}>이번달</Button>}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            {Object.entries({ annual: '연차', paid_special: '유급휴가', sick: '병가', family_event: '경조사', other: '기타' }).map(([k, label]) => (
              <span key={k} className={`px-1.5 py-0.5 rounded ${TYPE_COLOR[k]}`}>{label}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-semibold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`b-${i}`} />)}
          {days.map(ds => {
            const items = byDate.get(ds) || []
            const dnum = Number(ds.slice(-2))
            const dow = new Date(`${ds}T00:00:00`).getDay()
            const weekend = dow === 0 || dow === 6
            return (
              <div key={ds} className={`min-h-[76px] rounded-md border p-1 flex flex-col gap-0.5 ${weekend ? 'bg-red-50/30' : 'bg-white'} ${ds === todayStr ? 'ring-2 ring-blue-400' : ''}`}>
                <div className={`text-[11px] font-medium ${weekend ? 'text-red-500' : 'text-gray-600'}`}>{dnum}</div>
                {items.map(r => (
                  <div key={r.id} className={`text-[10px] rounded px-1 py-0.5 truncate ${TYPE_COLOR[r.leaveType] || TYPE_COLOR.other}`} title={`${r.requesterName || ''} · ${LEAVE_TYPE_LABELS[r.leaveType]}`}>
                    {r.requesterName || '?'}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        {approved.length === 0 && <p className="text-[11px] text-muted-foreground mt-2 text-center">승인된 휴가가 없습니다.</p>}
      </CardContent>
    </Card>
  )
}

function EmployeeLeaveSummary({ profiles, requests }: { profiles: User[]; requests: LeaveRequest[] }) {
  const rows = useMemo(() => {
    // sum non-rejected days per requester per type
    const usedAnnual = new Map<string, number>()
    const usedPaid = new Map<string, number>()
    requests.forEach(r => {
      if (r.status === 'rejected') return
      const m = r.leaveType === 'annual' ? usedAnnual : r.leaveType === 'paid_special' ? usedPaid : null
      if (!m) return
      m.set(r.requesterId, (m.get(r.requesterId) || 0) + r.days)
    })
    return profiles
      // 정규직(풀타임)만 연차 발생 대상
      .filter(p => (p.employmentTypes?.includes('permanent') || p.employmentType === 'permanent') && !p.isPartner)
      .map(p => {
        const hire = p.hireDate || p.contractStartDate
        const ent = computeAnnualEntitlement(hire)
        const aUsed = usedAnnual.get(p.id) || 0
        const pUsed = usedPaid.get(p.id) || 0
        return {
          id: p.id,
          name: p.name,
          hireDate: hire,
          annualEnt: ent.entitlement,
          annualUsed: aUsed,
          annualLeft: Math.max(0, ent.entitlement - aUsed),
          paidUsed: pUsed,
          paidLeft: Math.max(0, PAID_LEAVE_ANNUAL - pUsed),
          noHire: !p.contractStartDate,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [profiles, requests])

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground">
              <th className="text-left font-medium px-3 py-2">이름</th>
              <th className="text-left font-medium px-3 py-2 whitespace-nowrap">입사일</th>
              <th className="text-right font-medium px-3 py-2">연차 부여</th>
              <th className="text-right font-medium px-3 py-2">연차 사용</th>
              <th className="text-right font-medium px-3 py-2">연차 잔여</th>
              <th className="text-right font-medium px-3 py-2">유급 사용</th>
              <th className="text-right font-medium px-3 py-2">유급 잔여</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/50">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {r.hireDate || <span className="text-amber-600">미설정</span>}
                </td>
                <td className="px-3 py-2 text-right">{r.annualEnt}</td>
                <td className="px-3 py-2 text-right text-blue-600">{r.annualUsed}</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-600">{r.annualLeft}</td>
                <td className="px-3 py-2 text-right text-blue-600">{r.paidUsed}</td>
                <td className="px-3 py-2 text-right font-semibold text-emerald-600">{r.paidLeft}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">표시할 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
