import { useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Plus, Trash2, Pencil, X, Check, XCircle, Banknote, AlertTriangle, MessageSquare, Send, Receipt, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles, canAccessAccount } from '@/hooks/useProfiles'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import { formatCurrency } from '@/types'
import {
  useExpenseRequests, useCreateExpense, useUpdateExpense, useSetExpenseStatus, useDeleteExpense,
  useExpenseFiles, useUploadExpenseFile, useDeleteExpenseFile,
  useExpenseComments, useCreateExpenseComment, useDeleteExpenseComment,
  type ExpenseRequest, type ExpenseStatus, type ExpenseFileKind,
} from '@/hooks/useExpenseRequests'

const STATUS_META: Record<ExpenseStatus, { label: string; cls: string }> = {
  pending: { label: '승인대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: '승인', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  rejected: { label: '반려', cls: 'bg-red-50 text-red-700 border-red-200' },
  paid: { label: '지급완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}
const CATEGORIES = ['소프트웨어·구독', '마케팅·광고', '출장·교통', '식비·회식', '교육·도서', '사무·비품', '외주·용역', '경조사', '기타']
const CURRENT_MONTH = () => new Date().toISOString().slice(0, 7)

export function ExpenseRequestsPage() {
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const { data: requests = [], isLoading } = useExpenseRequests()
  const setStatus = useSetExpenseStatus()
  const deleteReq = useDeleteExpense()

  const canApprove = !!user && (user.role === 'admin' || user.role === 'c_level' || canAccessAccount(user))
  const profileName = (id?: string) => profiles.find(p => p.id === id)?.name || '—'
  const approverIds = useMemo(
    () => profiles.filter(p => p.role === 'admin' || p.role === 'c_level' || p.role === 'account' || p.isAccount).map(p => p.id),
    [profiles],
  )

  const [filter, setFilter] = useState<ExpenseStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseRequest | null>(null)

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const selected = filtered.find(r => r.id === selectedId) || filtered[0]

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const monthPaidTotal = requests.filter(r => r.status === 'paid' && (r.paidAt || '').slice(0, 7) === CURRENT_MONTH()).reduce((s, r) => s + r.amount, 0)

  const notifyDecision = (req: ExpenseRequest, status: ExpenseStatus) => {
    if (!req.requestedBy || req.requestedBy === user?.id) return
    const label = STATUS_META[status].label
    createNotificationsForUsers([req.requestedBy], {
      type: 'expense_request',
      title: `지출결의 ${label}`,
      message: `"${req.title}" 지출결의가 ${label} 처리되었습니다.`,
      link: '/common/expense-requests',
      metadata: { title: req.title, status },
    }).catch(() => {})
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">General</p>
          <h1 className="text-xl font-bold">지출결의</h1>
          <p className="text-sm text-muted-foreground mt-0.5">주문요청 외의 지출을 올리고 승인·지급·증빙까지 관리하세요.</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-4 mr-1" /> 새 지출결의</Button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">승인 대기</div><div className="text-xl font-bold text-amber-600">{pendingCount}건</div></div>
        <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">이번달 지급 합계</div><div className="text-xl font-bold">{formatCurrency(monthPaidTotal, 'KRW')}</div></div>
        <div className="rounded-lg bg-muted/50 p-3"><div className="text-xs text-muted-foreground">전체</div><div className="text-xl font-bold">{requests.length}건</div></div>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all', 'pending', 'approved', 'rejected', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`text-xs px-2.5 py-1 rounded-full border ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>
            {f === 'all' ? '전체' : STATUS_META[f].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* 목록 */}
        <div className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</p>
            : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">항목이 없습니다.</p>
            : filtered.map(r => {
              const st = STATUS_META[r.status]
              const isSel = selected?.id === r.id
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left rounded-lg border p-3 transition ${isSel ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{r.title}</span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${st.cls}`}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-1">
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(r.amount, r.currency as 'KRW' | 'USD')}</span>
                    <span>{r.category || '기타'} · {profileName(r.requestedBy)}</span>
                  </div>
                </button>
              )
            })}
        </div>

        {/* 상세 */}
        {selected ? (
          <ExpenseDetail
            key={selected.id}
            req={selected}
            canApprove={canApprove}
            userId={user?.id}
            userName={user?.name}
            profileName={profileName}
            isAdmin={user?.role === 'admin'}
            onEdit={() => { setEditing(selected); setFormOpen(true) }}
            onDelete={() => { if (confirm('이 지출결의를 삭제할까요?')) { deleteReq.mutate(selected.id); setSelectedId('') } }}
            onDecision={(status, note) => { setStatus.mutate({ id: selected.id, status, approverId: user?.id, approvalNote: note, paidBy: user?.id }); notifyDecision(selected, status) }}
          />
        ) : (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">왼쪽에서 항목을 선택하거나 새 지출결의를 만드세요.</CardContent></Card>
        )}
      </div>

      {formOpen && (
        <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} userId={user?.id} userName={user?.name} approverIds={approverIds} />
      )}
    </div>
  )
}

function ExpenseDetail({ req, canApprove, userId, userName, profileName, isAdmin, onEdit, onDelete, onDecision }: {
  req: ExpenseRequest
  canApprove: boolean
  userId?: string
  userName?: string
  profileName: (id?: string) => string
  isAdmin?: boolean
  onEdit: () => void
  onDelete: () => void
  onDecision: (status: ExpenseStatus, note?: string) => void
}) {
  const [note, setNote] = useState('')
  const st = STATUS_META[req.status]
  const files = useExpenseFiles(req.id)
  const proofs = (files.data || []).filter(f => f.kind === 'proof')
  const quotes = (files.data || []).filter(f => f.kind === 'quote')
  const missingProof = req.status === 'paid' && proofs.length === 0

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{req.title}</h2>
              <Badge variant="outline" className={`text-xs ${st.cls}`}>{st.label}</Badge>
              {missingProof && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 gap-1"><AlertTriangle className="size-3" />증빙 누락</Badge>}
            </div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(req.amount, req.currency as 'KRW' | 'USD')}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(req.requestedBy === userId || isAdmin) && req.status === 'pending' && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="size-4" /></Button>}
            {(req.requestedBy === userId || isAdmin) && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={onDelete}><Trash2 className="size-4" /></Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border-t pt-2">
          <Info label="분류" value={req.category} />
          <Info label="거래처/지급처" value={req.vendor} />
          <Info label="결제수단" value={req.paymentMethod} />
          <Info label="희망 지급일" value={req.neededBy} />
          <Info label="신청자" value={profileName(req.requestedBy)} />
          {req.approverId && <Info label="처리자" value={profileName(req.approverId)} />}
          {req.paidAt && <Info label="지급일" value={req.paidAt} />}
        </div>
        {req.description && <div className="text-sm border-t pt-2"><span className="text-xs text-muted-foreground">사유·내역</span><p className="whitespace-pre-wrap mt-0.5">{req.description}</p></div>}
        {req.approvalNote && <div className="text-sm"><span className="text-xs text-muted-foreground">승인/반려 메모</span><p className="whitespace-pre-wrap mt-0.5">{req.approvalNote}</p></div>}

        {/* 첨부: 견적/근거 */}
        <ExpenseAttachments requestId={req.id} kind="quote" label="견적·요청근거" icon={<FileText className="size-3.5" />} profileName={profileName} userId={userId} isAdmin={isAdmin} existing={quotes} />
        {/* 첨부: 지출증빙 */}
        <ExpenseAttachments requestId={req.id} kind="proof" label="지출증빙 (영수증·세금계산서)" icon={<Receipt className="size-3.5" />} profileName={profileName} userId={userId} isAdmin={isAdmin} existing={proofs} />

        {/* 승인/지급 처리 (재무·관리자) */}
        {canApprove && (
          <div className="border-t pt-3 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">결재 처리</span>
            {req.status === 'pending' && (
              <>
                <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="승인/반려 메모 (선택)" />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => onDecision('approved', note)}><Check className="size-4 mr-1" />승인</Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onDecision('rejected', note)}><XCircle className="size-4 mr-1" />반려</Button>
                </div>
              </>
            )}
            {req.status === 'approved' && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onDecision('paid')}><Banknote className="size-4 mr-1" />지급완료 처리</Button>
            )}
            {req.status === 'paid' && missingProof && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="size-3.5" />지급완료 상태인데 지출증빙이 없습니다. 증빙을 첨부하세요.</p>}
            {req.status === 'rejected' && <p className="text-xs text-muted-foreground">반려된 건입니다.</p>}
          </div>
        )}

        <ExpenseComments requestId={req.id} profileName={profileName} userId={userId} userName={userName} />
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return <div><span className="text-xs text-muted-foreground">{label}</span><div>{value || '—'}</div></div>
}

function ExpenseAttachments({ requestId, kind, label, icon, profileName, userId, isAdmin, existing }: {
  requestId: string; kind: ExpenseFileKind; label: string; icon: React.ReactNode
  profileName: (id?: string) => string; userId?: string; isAdmin?: boolean
  existing: { id: string; name: string; url: string; path?: string; uploadedBy?: string }[]
}) {
  const upload = useUploadExpenseFile()
  const del = useDeleteExpenseFile()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="border-t pt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">{icon}{label} {existing.length > 0 && `(${existing.length})`}</span>
        <button className="text-[11px] text-primary" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>{upload.isPending ? '업로드 중…' : '파일 추가'}</button>
        <input ref={inputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate({ requestId, file: f, kind, uploadedBy: userId }); if (inputRef.current) inputRef.current.value = '' }} />
      </div>
      {existing.map(f => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <a href={f.url} target="_blank" rel="noreferrer" className="text-primary underline truncate">{f.name}</a>
          <span className="text-[11px] text-muted-foreground">· {profileName(f.uploadedBy)}</span>
          {(f.uploadedBy === userId || isAdmin) && <button className="text-muted-foreground hover:text-red-600 shrink-0" onClick={() => { if (confirm('첨부파일을 삭제할까요?')) del.mutate({ id: f.id, requestId, path: f.path }) }}><X className="size-3.5" /></button>}
        </div>
      ))}
      {existing.length === 0 && <p className="text-[11px] text-muted-foreground">없음</p>}
    </div>
  )
}

function ExpenseComments({ requestId, profileName, userId }: { requestId: string; profileName: (id?: string) => string; userId?: string; userName?: string }) {
  const { data: comments = [] } = useExpenseComments(requestId)
  const create = useCreateExpenseComment()
  const del = useDeleteExpenseComment()
  const [text, setText] = useState('')
  const send = () => { const c = text.trim(); if (!c) return; create.mutate({ requestId, content: c, authorId: userId }, { onSuccess: () => setText('') }) }
  return (
    <div className="border-t pt-2 space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="size-3.5" />의견 {comments.length > 0 && `(${comments.length})`}</span>
      {comments.map(c => (
        <div key={c.id} className="flex items-start gap-2 text-sm bg-muted/40 rounded px-2 py-1.5">
          <div className="min-w-0 flex-1"><span className="text-[11px] font-medium text-muted-foreground mr-1.5">{profileName(c.authorId)}</span><span className="whitespace-pre-wrap">{c.content}</span></div>
          {c.authorId === userId && <button className="text-muted-foreground hover:text-red-600 shrink-0" onClick={() => del.mutate({ id: c.id, requestId })}><Trash2 className="size-3" /></button>}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="의견·질문 남기기" className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') send() }} />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={send} disabled={!text.trim()}><Send className="size-3.5" /></Button>
      </div>
    </div>
  )
}

function ExpenseFormDialog({ open, onOpenChange, editing, userId, userName, approverIds }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: ExpenseRequest | null
  userId?: string; userName?: string; approverIds: string[]
}) {
  const create = useCreateExpense()
  const update = useUpdateExpense()
  const [title, setTitle] = useState(editing?.title || '')
  const [category, setCategory] = useState(editing?.category || '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [vendor, setVendor] = useState(editing?.vendor || '')
  const [payment, setPayment] = useState(editing?.paymentMethod || '')
  const [neededBy, setNeededBy] = useState(editing?.neededBy || '')
  const [description, setDescription] = useState(editing?.description || '')

  const submit = () => {
    if (!title.trim() || !amount) return
    const amt = Number(amount.replace(/,/g, '')) || 0
    if (editing) {
      update.mutate({ id: editing.id, title: title.trim(), category, amount: amt, vendor, paymentMethod: payment, neededBy, description }, { onSuccess: () => onOpenChange(false) })
    } else {
      create.mutate(
        { title: title.trim(), category, amount: amt, vendor, paymentMethod: payment, neededBy, description, requestedBy: userId },
        {
          onSuccess: () => {
            const targets = approverIds.filter(id => id !== userId)
            if (targets.length) createNotificationsForUsers(targets, {
              type: 'expense_request', title: '지출결의 승인 요청',
              message: `${userName || '누군가'}님이 "${title.trim()}" 지출결의(${formatCurrency(amt, 'KRW')})를 올렸습니다.`,
              link: '/common/expense-requests', metadata: { title: title.trim() },
            }).catch(() => {})
            onOpenChange(false)
          },
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? '지출결의 편집' : '새 지출결의'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">제목</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 디자인 외주 비용" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">분류</Label>
              <Select value={category || '_none'} onValueChange={v => setCategory(v === '_none' ? '' : (v || ''))}>
                <SelectTrigger className="h-9 text-sm"><span>{category || '선택'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선택</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">금액 (원)</Label><Input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="0" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">거래처/지급처</Label><Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="예: OO스튜디오" /></div>
            <div><Label className="text-xs">결제수단</Label><Input value={payment} onChange={e => setPayment(e.target.value)} placeholder="법인카드/계좌이체 등" /></div>
          </div>
          <div><Label className="text-xs">희망 지급일 (선택)</Label><Input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} /></div>
          <div><Label className="text-xs">지출 사유·내역</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="무엇을 위한 지출인지, 산출근거 등" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={submit} disabled={!title.trim() || !amount || create.isPending || update.isPending}>{editing ? '저장' : '올리기'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
