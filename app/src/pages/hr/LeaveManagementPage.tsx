import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, CalendarDays, Loader2, Trash2, Check, X, Info, ChevronLeft, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useLeaveRequests, useCreateLeaveRequest, useUpdateLeaveStatus, useUpdateLeaveRequest, useDeleteLeaveRequest,
  type LeaveRequest, type LeaveStatus,
} from '@/hooks/useLeaveRequests'
import {
  computeAnnualEntitlement, dayCount, FAMILY_EVENTS, familyEventLabel,
  LEAVE_TYPE_LABELS, PAID_LEAVE_ANNUAL, HALF_DAY_LABELS, type LeaveType, type HalfDayPeriod,
} from '@/lib/leave'
import { useProfiles } from '@/hooks/useProfiles'
import { useRewardLeaveGrants, useCreateRewardGrant, useDeleteRewardGrant, type RewardGrant } from '@/hooks/useRewardLeaveGrants'
import type { User } from '@/types'

// 연차 트래킹(직원 현황·포상 지급 대상)에서 제외할 이름 (부대표·시스템 계정 등)
const LEAVE_HIDDEN_NAMES = new Set(['재무담당자', '김지현'])

const STATUS_CFG: Record<LeaveStatus, { label: string; className: string }> = {
  requested: { label: '승인대기', className: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인됨', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700' },
}

type Tab = 'mine' | 'calendar' | 'approve' | 'summary' | 'reward'

export function LeaveManagementPage() {
  const { user } = useAuth()
  const { data: requests = [], isLoading } = useLeaveRequests()
  const { data: profiles = [] } = useProfiles()
  const createReq = useCreateLeaveRequest()
  const updateReq = useUpdateLeaveRequest()
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null)
  const updateStatus = useUpdateLeaveStatus()
  const deleteReq = useDeleteLeaveRequest()
  const { data: rewardGrants = [] } = useRewardLeaveGrants()

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
  // 포상휴가: 부여합계(내게 지급된 것) - 사용합계
  const myRewardGranted = useMemo(() =>
    rewardGrants.filter(g => g.profileId === user?.id).reduce((s, g) => s + g.days, 0),
    [rewardGrants, user?.id],
  )
  const myRewardUsed = useMemo(() =>
    requests
      .filter(r => r.requesterId === user?.id && r.leaveType === 'reward' && r.status !== 'rejected')
      .reduce((s, r) => s + r.days, 0),
    [requests, user?.id],
  )
  const rewardRemaining = myRewardGranted - myRewardUsed

  // 잔여는 음수 허용(초과 사용). 연차는 매월 1일씩 발생하므로 시간이 지나면 자동 회복된다.
  const remaining = annual.entitlement - myAnnualUsed
  const paidRemaining = PAID_LEAVE_ANNUAL - myPaidUsed
  const totalRemaining = remaining + paidRemaining + rewardRemaining // 연차+유급+포상 통합 잔여

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
                <div className={`text-2xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{remaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
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
                <div className={`text-2xl font-bold ${paidRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{paidRemaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">연 {PAID_LEAVE_ANNUAL}일 · 경조사는 별도(잔여 차감 없음)</div>
          </CardContent>
        </Card>
        {myRewardGranted > 0 && (
          <Card>
            <CardContent className="py-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">포상휴가 🎉</div>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[11px] text-muted-foreground">부여</div>
                  <div className="text-2xl font-bold">{myRewardGranted}<span className="text-sm font-normal text-muted-foreground">일</span></div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">사용</div>
                  <div className="text-2xl font-bold text-blue-600">{myRewardUsed}<span className="text-sm font-normal text-muted-foreground">일</span></div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">잔여</div>
                  <div className={`text-2xl font-bold ${rewardRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{rewardRemaining}<span className="text-sm font-normal text-muted-foreground">일</span></div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">포상으로 지급된 휴가 · 신청 시 ‘포상휴가’ 유형 선택</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 통합 잔여 (연차 + 유급) — 초과 사용 시 음수, 연차 월 발생으로 자동 회복 */}
      <Card className={totalRemaining < 0 ? 'border-red-300 bg-red-50/40' : ''}>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">잔여 휴가 <span className="text-xs font-normal text-muted-foreground">(연차 + 유급{myRewardGranted > 0 ? ' + 포상' : ''})</span></div>
            <div className={`text-2xl font-bold ${totalRemaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {totalRemaining}<span className="text-sm font-normal text-muted-foreground">일</span>
            </div>
          </div>
          {totalRemaining < 0 && (
            <div className="text-[11px] text-red-600 mt-1.5">
              초과 사용 {-totalRemaining}일 · 연차가 매월 1일씩 발생하여 자동으로 회복됩니다.
            </div>
          )}
        </CardContent>
      </Card>

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
        {isApprover && (
          <Button variant={tab === 'reward' ? 'default' : 'outline'} size="sm" onClick={() => setTab('reward')}>
            🎉 포상휴가 지급
          </Button>
        )}
      </div>

      {tab === 'calendar' ? (
        <LeaveCalendar approved={approvedLeaves} />
      ) : tab === 'reward' ? (
        <RewardGrantPanel profiles={profiles} grants={rewardGrants} requests={requests} actorId={user?.id} />
      ) : tab === 'summary' ? (
        <EmployeeLeaveSummary profiles={profiles} requests={requests} grants={rewardGrants} />
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
              onEdit={setEditingLeave}
            />
          ))}
        </div>
      )}

      {showForm && user && (
        <LeaveFormDialog
          onClose={() => setShowForm(false)}
          pending={createReq.isPending}
          rewardAvailable={rewardRemaining > 0}
          onSubmit={async (payload) => {
            try {
              await createReq.mutateAsync({
                requesterId: user.id,
                requesterName: user.name,
                ...payload,
              })
              setShowForm(false)
            } catch (e: unknown) {
              const err = e as { message?: string; details?: string; hint?: string; code?: string }
              alert(`휴가 신청 저장에 실패했습니다.\n${err?.message || ''}${err?.details ? `\n${err.details}` : ''}${err?.hint ? `\n${err.hint}` : ''}${err?.code ? `\n(${err.code})` : ''}`)
            }
          }}
        />
      )}

      {/* 연차 신청 수정 (승인자/본인 대기건) */}
      {editingLeave && (
        <LeaveFormDialog
          title="휴가 신청 수정"
          onClose={() => setEditingLeave(null)}
          pending={updateReq.isPending}
          rewardAvailable
          initial={{
            leaveType: editingLeave.leaveType,
            eventType: editingLeave.eventType,
            startDate: editingLeave.startDate,
            endDate: editingLeave.endDate,
            days: editingLeave.days,
            halfDayPeriod: editingLeave.halfDayPeriod,
            paid: editingLeave.paid,
            reason: editingLeave.reason,
          }}
          onSubmit={async (payload) => {
            try {
              await updateReq.mutateAsync({ id: editingLeave.id, ...payload })
              setEditingLeave(null)
            } catch (e: unknown) {
              const err = e as { message?: string }
              alert(`휴가 수정에 실패했습니다.\n${err?.message || ''}`)
            }
          }}
        />
      )}
    </div>
  )
}

function LeaveCard({ req, isApprover, isOwner, showRequester, onStatus, onDelete, onEdit }: {
  req: LeaveRequest
  isApprover: boolean
  isOwner: boolean
  showRequester: boolean
  onStatus: (r: LeaveRequest, s: LeaveStatus) => void
  onDelete: (id: string) => void
  onEdit?: (r: LeaveRequest) => void
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
              {req.halfDayPeriod && (
                <Badge className={`text-[10px] text-white border-transparent ${req.halfDayPeriod === 'morning' ? 'bg-sky-500' : 'bg-amber-500'}`}>
                  {HALF_DAY_LABELS[req.halfDayPeriod]}
                </Badge>
              )}
              {!req.paid && <Badge variant="outline" className="text-[10px] text-gray-500">무급</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {showRequester && <>{req.requesterName} · </>}
              {req.startDate}{req.endDate !== req.startDate ? ` ~ ${req.endDate}` : ''}
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
          {onEdit && (isApprover || (isOwner && req.status === 'requested')) && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEdit(req)}>
              <Pencil className="h-3 w-3 mr-1" />수정
            </Button>
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

function LeaveFormDialog({ onClose, onSubmit, pending, rewardAvailable, initial, title }: {
  onClose: () => void
  onSubmit: (p: {
    leaveType: LeaveType; eventType?: string; startDate: string; endDate: string; days: number; halfDayPeriod?: HalfDayPeriod; paid: boolean; reason?: string
  }) => void
  pending: boolean
  rewardAvailable?: boolean
  initial?: { leaveType: LeaveType; eventType?: string; startDate: string; endDate: string; days: number; halfDayPeriod?: HalfDayPeriod; paid: boolean; reason?: string }
  title?: string
}) {
  const [leaveType, setLeaveType] = useState<LeaveType>(initial?.leaveType ?? 'annual')
  const [eventType, setEventType] = useState<string>(initial?.eventType || FAMILY_EVENTS[0].key)
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [reason, setReason] = useState(initial?.reason ?? '')
  const [paid, setPaid] = useState(initial?.paid ?? true)
  // 반차(0.5일) 신청 여부 + 오전/오후. 경조사는 일수가 고정이라 반차 불가.
  const [halfDay, setHalfDay] = useState(!!initial?.halfDayPeriod)
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod>(initial?.halfDayPeriod ?? 'morning')
  const halfDayAllowed = leaveType !== 'family_event'
  const useHalfDay = halfDay && halfDayAllowed

  // Auto-computed days
  const autoDays = useMemo(() => {
    if (leaveType === 'family_event') {
      return FAMILY_EVENTS.find(e => e.key === eventType)?.days || 1
    }
    if (startDate && endDate) return dayCount(startDate, endDate)
    return 1
  }, [leaveType, eventType, startDate, endDate])

  const [daysOverride, setDaysOverride] = useState<string>(initial && !initial.halfDayPeriod ? String(initial.days) : '')
  // 반차면 0.5일 고정, 종료일은 시작일과 동일(단일 날짜).
  const effectiveEndDate = useHalfDay ? startDate : endDate
  const days = useHalfDay ? 0.5 : (daysOverride !== '' ? Number(daysOverride) : autoDays)

  const canSubmit = !!startDate && !!effectiveEndDate && days > 0

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title || '휴가 신청'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>휴가 종류</Label>
            <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">연차</SelectItem>
                <SelectItem value="paid_special">유급휴가 (연 {PAID_LEAVE_ANNUAL}일)</SelectItem>
                {rewardAvailable && <SelectItem value="reward">포상휴가 🎉</SelectItem>}
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

          {halfDayAllowed && (
            <div className="rounded-md border p-2.5 space-y-2 bg-gray-50/50">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} className="size-4" />
                <span className="text-sm font-medium">반차 (0.5일)</span>
              </label>
              {halfDay && (
                <div className="flex gap-2">
                  {(['morning', 'afternoon'] as HalfDayPeriod[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setHalfDayPeriod(p)}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        halfDayPeriod === p
                          ? (p === 'morning' ? 'bg-sky-500 text-white border-sky-500' : 'bg-amber-500 text-white border-amber-500')
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {HALF_DAY_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{useHalfDay ? '날짜' : '시작일'}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            {!useHalfDay && (
              <div>
                <Label>종료일</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {useHalfDay ? (
              <div>
                <Label>일수</Label>
                <div className="h-9 flex items-center text-sm font-medium">0.5일 · {HALF_DAY_LABELS[halfDayPeriod]}</div>
              </div>
            ) : (
              <div>
                <Label>일수</Label>
                <Input
                  type="number" min="0.5" step="0.5"
                  value={daysOverride !== '' ? daysOverride : String(autoDays)}
                  onChange={(e) => setDaysOverride(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">자동 계산: {autoDays}일 (수정 가능)</p>
              </div>
            )}
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
                startDate, endDate: effectiveEndDate, days,
                halfDayPeriod: useHalfDay ? halfDayPeriod : undefined,
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
  reward: 'bg-pink-100 text-pink-700',
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
            <span className="w-px h-3 bg-gray-200" />
            <span className="px-1 py-0.5 rounded bg-sky-500 text-white">오전 반차</span>
            <span className="px-1 py-0.5 rounded bg-amber-500 text-white">오후 반차</span>
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
                  <div key={r.id} className={`text-[10px] rounded px-1 py-0.5 truncate flex items-center gap-1 ${TYPE_COLOR[r.leaveType] || TYPE_COLOR.other}`} title={`${r.requesterName || ''} · ${LEAVE_TYPE_LABELS[r.leaveType]}${r.halfDayPeriod ? ` · ${HALF_DAY_LABELS[r.halfDayPeriod]}` : ''}`}>
                    {r.halfDayPeriod && (
                      <span className={`shrink-0 rounded px-1 text-white text-[9px] leading-tight ${r.halfDayPeriod === 'morning' ? 'bg-sky-500' : 'bg-amber-500'}`}>
                        {r.halfDayPeriod === 'morning' ? '오전' : '오후'}
                      </span>
                    )}
                    <span className="truncate">{r.requesterName || '?'}</span>
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

/** 포상휴가 지급 패널 (승인자/연차 담당 전용) — 직원에게 일수 부여 + 지급 내역 관리. */
function RewardGrantPanel({ profiles, grants, requests, actorId }: {
  profiles: User[]
  grants: RewardGrant[]
  requests: LeaveRequest[]
  actorId?: string
}) {
  const createReward = useCreateRewardGrant()
  const deleteReward = useDeleteRewardGrant()
  const [profileId, setProfileId] = useState('')
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')

  const nameOf = (id?: string) => profiles.find(p => p.id === id)?.name || '(이름 미설정)'

  // 지급 대상: 정규직(풀타임) 내부직원 (파트너여도 내부 정규직이면 포함, 외부만 제외)
  const grantable = useMemo(() =>
    profiles
      .filter(p => (p.employmentTypes?.includes('permanent') || p.employmentType === 'permanent') && !p.isExternal && !LEAVE_HIDDEN_NAMES.has((p.name || '').trim()))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
    [profiles],
  )

  const grantedByProfile = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of grants) m.set(g.profileId, (m.get(g.profileId) || 0) + g.days)
    return m
  }, [grants])
  const usedByProfile = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of requests) if (r.leaveType === 'reward' && r.status !== 'rejected') m.set(r.requesterId, (m.get(r.requesterId) || 0) + r.days)
    return m
  }, [requests])

  const canGrant = !!profileId && Number(days) > 0
  const handleGrant = () => {
    if (!canGrant) return
    createReward.mutate(
      { profileId, days: Number(days), reason: reason.trim() || undefined, grantedBy: actorId },
      { onSuccess: () => { setDays(''); setReason('') }, onError: (e: unknown) => alert(e instanceof Error ? e.message : '지급에 실패했습니다.') },
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="text-sm font-semibold">포상휴가 지급 🎉</div>
          <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
            <div>
              <Label className="text-xs">직원</Label>
              <Select value={profileId} onValueChange={v => setProfileId(v ?? '')}>
                <SelectTrigger><span className="truncate">{profileId ? nameOf(profileId) : '직원 선택'}</span></SelectTrigger>
                <SelectContent>
                  {grantable.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">일수</Label>
              <Input type="number" min="0.5" step="0.5" value={days} onChange={e => setDays(e.target.value)} placeholder="예: 1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">사유 (선택)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 우수사원 포상" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleGrant} disabled={!canGrant || createReward.isPending}>
              {createReward.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}지급
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-semibold px-1">지급 내역 ({grants.length})</div>
        {grants.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">지급된 포상휴가가 없습니다.</CardContent></Card>
        ) : grants.map(g => {
          const granted = grantedByProfile.get(g.profileId) || 0
          const used = usedByProfile.get(g.profileId) || 0
          return (
            <Card key={g.id}>
              <CardContent className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {nameOf(g.profileId)} · <span className="text-pink-600 font-bold">+{g.days}일</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">잔여 {granted - used}일 (부여 {granted} · 사용 {used})</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {g.grantedAt}{g.reason ? ` · ${g.reason}` : ''}{g.grantedBy ? ` · 지급: ${nameOf(g.grantedBy)}` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => { if (confirm('이 포상휴가 지급을 삭제할까요?')) deleteReward.mutate(g.id) }}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function EmployeeLeaveSummary({ profiles, requests, grants }: { profiles: User[]; requests: LeaveRequest[]; grants: RewardGrant[] }) {
  const rows = useMemo(() => {
    // sum non-rejected days per requester per type
    const usedAnnual = new Map<string, number>()
    const usedPaid = new Map<string, number>()
    const usedReward = new Map<string, number>()
    requests.forEach(r => {
      if (r.status === 'rejected') return
      const m = r.leaveType === 'annual' ? usedAnnual : r.leaveType === 'paid_special' ? usedPaid : r.leaveType === 'reward' ? usedReward : null
      if (!m) return
      m.set(r.requesterId, (m.get(r.requesterId) || 0) + r.days)
    })
    const grantedReward = new Map<string, number>()
    grants.forEach(g => grantedReward.set(g.profileId, (grantedReward.get(g.profileId) || 0) + g.days))
    return profiles
      // 정규직(풀타임) 내부직원만 연차 발생 대상 (파트너여도 내부 정규직이면 포함, 외부만 제외)
      // 재무담당자·김지현(부대표)은 연차 트래킹 대상에서 제외
      .filter(p => (p.employmentTypes?.includes('permanent') || p.employmentType === 'permanent') && !p.isExternal && !LEAVE_HIDDEN_NAMES.has((p.name || '').trim()))
      .map(p => {
        const hire = p.hireDate || p.contractStartDate
        // 퇴사자는 퇴사일(계약종료일)까지만 연차 적립 — 이후 적립 방지 (없으면 오늘 기준)
        const asOf = p.resigned && p.contractEndDate ? new Date(`${p.contractEndDate}T00:00:00`) : new Date()
        const ent = computeAnnualEntitlement(hire, asOf)
        const aUsed = usedAnnual.get(p.id) || 0
        const pUsed = usedPaid.get(p.id) || 0
        const rGranted = grantedReward.get(p.id) || 0
        const rUsed = usedReward.get(p.id) || 0
        const annualLeft = ent.entitlement - aUsed
        const paidLeft = PAID_LEAVE_ANNUAL - pUsed
        const rewardLeft = rGranted - rUsed
        return {
          id: p.id,
          name: p.name,
          hireDate: hire,
          annualEnt: ent.entitlement,
          annualUsed: aUsed,
          annualLeft, // 음수 허용
          paidUsed: pUsed,
          paidLeft, // 음수 허용
          rewardGranted: rGranted,
          rewardUsed: rUsed,
          rewardLeft,
          totalLeft: annualLeft + paidLeft + rewardLeft, // 연차+유급+포상 통합 잔여
          noHire: !p.contractStartDate,
          resigned: !!p.resigned,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [profiles, requests, grants])

  // 사용 숫자 클릭 시 해당 직원·종류의 실제 신청 내역을 보여준다.
  const [detail, setDetail] = useState<{ name: string; typeLabel: string; items: LeaveRequest[] } | null>(null)
  const [showResigned, setShowResigned] = useState(false)
  const openDetail = (id: string, name: string, type: LeaveType, typeLabel: string) => {
    const items = requests
      .filter(r => r.requesterId === id && r.leaveType === type && r.status !== 'rejected')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    if (items.length) setDetail({ name, typeLabel, items })
  }

  const activeRows = rows.filter(r => !r.resigned)
  const resignedRows = rows.filter(r => r.resigned)
  const renderRow = (r: typeof rows[number], dim = false) => (
    <tr key={r.id} className={`border-b last:border-0 hover:bg-gray-50/50 ${dim ? 'text-muted-foreground bg-gray-50/40' : ''}`}>
      <td className="px-3 py-2 font-medium">{r.name}</td>
      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
        {r.hireDate || <span className="text-amber-600">미설정</span>}
      </td>
      <td className="px-3 py-2 text-right">{r.annualEnt}</td>
      <td className="px-3 py-2 text-right text-blue-600">
        {r.annualUsed > 0 ? (
          <button className="hover:underline font-medium" onClick={() => openDetail(r.id, r.name, 'annual', '연차')}>{r.annualUsed}</button>
        ) : r.annualUsed}
      </td>
      <td className={`px-3 py-2 text-right font-semibold ${r.annualLeft < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.annualLeft}</td>
      <td className="px-3 py-2 text-right text-blue-600">
        {r.paidUsed > 0 ? (
          <button className="hover:underline font-medium" onClick={() => openDetail(r.id, r.name, 'paid_special', '유급휴가')}>{r.paidUsed}</button>
        ) : r.paidUsed}
      </td>
      <td className={`px-3 py-2 text-right font-semibold ${r.paidLeft < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.paidLeft}</td>
      <td className="px-3 py-2 text-right text-pink-600 font-medium">{r.rewardGranted > 0 ? r.rewardGranted : '-'}</td>
      <td className="px-3 py-2 text-right text-blue-600">
        {r.rewardUsed > 0 ? (
          <button className="hover:underline font-medium" onClick={() => openDetail(r.id, r.name, 'reward', '포상휴가')}>{r.rewardUsed}</button>
        ) : (r.rewardGranted > 0 ? r.rewardUsed : '-')}
      </td>
      <td className={`px-3 py-2 text-right font-semibold ${r.rewardGranted === 0 ? 'text-muted-foreground' : r.rewardLeft < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.rewardGranted > 0 ? r.rewardLeft : '-'}</td>
      <td className={`px-3 py-2 text-right font-bold ${r.totalLeft < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.totalLeft}</td>
    </tr>
  )

  return (
    <>
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
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">포상 부여</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">포상 사용</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">포상 잔여</th>
              <th className="text-right font-medium px-3 py-2 whitespace-nowrap">총 잔여</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map(r => renderRow(r))}
            {resignedRows.length > 0 && (
              <>
                <tr className="bg-gray-100/70 border-y cursor-pointer hover:bg-gray-100" onClick={() => setShowResigned(v => !v)}>
                  <td colSpan={11} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {showResigned ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      퇴사자 (기록용) · {resignedRows.length}명
                    </span>
                  </td>
                </tr>
                {showResigned && resignedRows.map(r => renderRow(r, true))}
              </>
            )}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">표시할 직원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>

    <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{detail?.name} · {detail?.typeLabel} 사용 내역</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {detail?.items.map(it => (
            <div key={it.id} className="rounded-lg border p-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {it.startDate}{it.endDate !== it.startDate ? ` ~ ${it.endDate}` : ''}
                  {it.halfDayPeriod && (
                    <span className={`ml-1.5 text-[10px] text-white rounded px-1 ${it.halfDayPeriod === 'morning' ? 'bg-sky-500' : 'bg-amber-500'}`}>
                      {HALF_DAY_LABELS[it.halfDayPeriod]}
                    </span>
                  )}
                </div>
                {it.reason && <div className="text-xs text-muted-foreground mt-0.5">{it.reason}</div>}
                {it.approvedByName && <div className="text-[11px] text-muted-foreground mt-0.5">승인: {it.approvedByName}</div>}
              </div>
              <div className="text-right shrink-0">
                <Badge variant="outline" className="text-[10px]">{it.days}일</Badge>
                <div className={`text-[10px] mt-1 px-1.5 py-0.5 rounded ${STATUS_CFG[it.status].className}`}>{STATUS_CFG[it.status].label}</div>
              </div>
            </div>
          ))}
          <div className="text-xs text-muted-foreground text-right pt-1">
            합계 {detail?.items.reduce((s, it) => s + it.days, 0)}일
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
