import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarDays, Clock, MapPin, Users, Plus, Trash2, Pencil, MessageSquare, Send, Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { createNotificationsForUsers } from '@/hooks/useUserNotifications'
import {
  useMeetingAgendas, useCreateMeeting, useUpdateMeeting, useDeleteMeeting,
  useMeetingItems, useCreateItem, useUpdateItem, useDeleteItem,
  useMeetingComments, useCreateComment, useDeleteComment,
  type MeetingAgenda, type ItemStatus, type MeetingStatus,
} from '@/hooks/useMeetingAgendas'

const MEETING_STATUS: Record<MeetingStatus, { label: string; cls: string }> = {
  scheduled: { label: '예정', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  done: { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '취소', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}
const ITEM_STATUS: Record<ItemStatus, { label: string; cls: string }> = {
  open: { label: '예정', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  in_progress: { label: '진행중', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  done: { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function fmtDate(d?: string) {
  if (!d) return '날짜 미정'
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

export function MeetingAgendaPage() {
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const { data: meetings = [], isLoading } = useMeetingAgendas()
  const updateMeeting = useUpdateMeeting()
  const deleteMeeting = useDeleteMeeting()

  const profileName = (id?: string) => profiles.find(p => p.id === id)?.name || '—'
  const activeProfiles = useMemo(
    () => [...profiles].filter(p => !p.isExternal).sort((a, b) => Number(a.resigned) - Number(b.resigned) || a.name.localeCompare(b.name, 'ko')),
    [profiles],
  )

  const [selectedId, setSelectedId] = useState<string>('')
  const selected = meetings.find(m => m.id === selectedId) || meetings[0]
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MeetingAgenda | null>(null)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">General</p>
          <h1 className="text-xl font-bold">회의안건</h1>
          <p className="text-sm text-muted-foreground mt-0.5">예정된 회의와 안건, 진행상황을 함께 기록하고 소통하세요.</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="size-4 mr-1" /> 새 회의
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* 회의 목록 */}
        <div className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</p>
          ) : meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">등록된 회의가 없습니다.</p>
          ) : meetings.map(m => {
            const st = MEETING_STATUS[m.status]
            const isSel = selected?.id === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left rounded-lg border p-3 transition ${isSel ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{m.title}</span>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${st.cls}`}>{st.label}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><CalendarDays className="size-3" />{fmtDate(m.meetingDate)}</span>
                  {m.meetingTime && <span className="flex items-center gap-1"><Clock className="size-3" />{m.meetingTime}</span>}
                  <span className="flex items-center gap-1"><Users className="size-3" />{m.attendeeIds.length}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* 상세 */}
        {selected ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold">{selected.title}</h2>
                      <Select value={selected.status} onValueChange={(v) => v && updateMeeting.mutate({ id: selected.id, status: v as MeetingStatus })}>
                        <SelectTrigger className="h-6 w-20 text-xs"><span>{MEETING_STATUS[selected.status].label}</span></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MEETING_STATUS) as MeetingStatus[]).map(s => <SelectItem key={s} value={s}>{MEETING_STATUS[s].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{fmtDate(selected.meetingDate)}</span>
                      {selected.meetingTime && <span className="flex items-center gap-1"><Clock className="size-3.5" />{selected.meetingTime}</span>}
                      {selected.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{selected.location}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(selected); setFormOpen(true) }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={() => { if (confirm('이 회의를 삭제할까요? (안건·댓글 모두 삭제)')) { deleteMeeting.mutate(selected.id); setSelectedId('') } }}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                {selected.notes && <p className="text-sm whitespace-pre-wrap text-muted-foreground border-t pt-2">{selected.notes}</p>}
                {selected.attendeeIds.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap border-t pt-2">
                    <span className="text-xs text-muted-foreground">참석자</span>
                    {selected.attendeeIds.map(id => (
                      <Badge key={id} variant="outline" className="text-[11px] font-normal">{profileName(id)}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <AgendaItems meetingId={selected.id} profiles={activeProfiles} profileName={profileName} userId={user?.id} />
          </div>
        ) : (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">왼쪽에서 회의를 선택하거나 새 회의를 만드세요.</CardContent></Card>
        )}
      </div>

      {formOpen && (
        <MeetingFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editing={editing}
          profiles={activeProfiles}
          userId={user?.id}
          userName={user?.name}
        />
      )}
    </div>
  )
}

// ─── 안건 항목 + 댓글 ───
function AgendaItems({ meetingId, profiles, profileName, userId }: {
  meetingId: string
  profiles: { id: string; name: string }[]
  profileName: (id?: string) => string
  userId?: string
}) {
  const { data: items = [] } = useMeetingItems(meetingId)
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const [newContent, setNewContent] = useState('')
  const [newOwner, setNewOwner] = useState('')

  const addItem = () => {
    if (!newContent.trim()) return
    createItem.mutate(
      { meetingId, content: newContent.trim(), ownerId: newOwner || undefined, position: items.length, createdBy: userId },
      { onSuccess: () => { setNewContent(''); setNewOwner('') } },
    )
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2">안건 <span className="text-muted-foreground font-normal">({items.length})</span></div>

        {items.length === 0 && <p className="text-sm text-muted-foreground py-2">아직 안건이 없습니다. 아래에서 추가하세요.</p>}

        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={it.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{idx + 1}.</span>
                  <span className="text-sm whitespace-pre-wrap">{it.content}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Select value={it.status} onValueChange={(v) => v && updateItem.mutate({ id: it.id, meetingId, status: v as ItemStatus })}>
                    <SelectTrigger className={`h-6 w-[76px] text-[11px] ${ITEM_STATUS[it.status].cls}`}><span>{ITEM_STATUS[it.status].label}</span></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ITEM_STATUS) as ItemStatus[]).map(s => <SelectItem key={s} value={s}>{ITEM_STATUS[s].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600" onClick={() => { if (confirm('이 안건을 삭제할까요?')) deleteItem.mutate({ id: it.id, meetingId }) }}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-[11px] text-muted-foreground">담당</span>
                <Select value={it.ownerId || '_none'} onValueChange={(v) => updateItem.mutate({ id: it.id, meetingId, ownerId: v === '_none' ? null : v })}>
                  <SelectTrigger className="h-6 w-32 text-[11px]"><span>{it.ownerId ? profileName(it.ownerId) : '미지정'}</span></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">미지정</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <ItemComments meetingId={meetingId} itemId={it.id} profileName={profileName} userId={userId} />
            </div>
          ))}
        </div>

        {/* 안건 추가 */}
        <div className="flex items-end gap-2 pt-2 border-t">
          <div className="flex-1">
            <Label className="text-xs">새 안건</Label>
            <Input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="안건 내용" onKeyDown={e => { if (e.key === 'Enter') addItem() }} />
          </div>
          <Select value={newOwner || '_none'} onValueChange={(v) => setNewOwner(v === '_none' ? '' : (v || ''))}>
            <SelectTrigger className="h-9 w-32 text-xs"><span>{newOwner ? profileName(newOwner) : '담당 미지정'}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">담당 미지정</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={addItem} disabled={!newContent.trim() || createItem.isPending}><Plus className="size-4 mr-1" />추가</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 항목별 댓글 ───
function ItemComments({ meetingId, itemId, profileName, userId }: {
  meetingId: string
  itemId: string
  profileName: (id?: string) => string
  userId?: string
}) {
  const { data: allComments = [] } = useMeetingComments(meetingId)
  const createComment = useCreateComment()
  const deleteComment = useDeleteComment()
  const comments = allComments.filter(c => c.itemId === itemId)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  const send = () => {
    if (!text.trim()) return
    createComment.mutate({ meetingId, itemId, content: text.trim(), authorId: userId }, { onSuccess: () => setText('') })
  }

  return (
    <div className="pl-5 pt-1">
      <button className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground" onClick={() => setOpen(o => !o)}>
        <MessageSquare className="size-3" /> 피드백·진행 {comments.length > 0 && `(${comments.length})`}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2 text-sm bg-muted/40 rounded px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium text-muted-foreground mr-1.5">{profileName(c.authorId)}</span>
                <span className="whitespace-pre-wrap">{c.content}</span>
              </div>
              {c.authorId === userId && (
                <button className="text-muted-foreground hover:text-red-600 shrink-0" onClick={() => deleteComment.mutate({ id: c.id, meetingId })}><Trash2 className="size-3" /></button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Input value={text} onChange={e => setText(e.target.value)} placeholder="피드백 또는 진행 결과 남기기" className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') send() }} />
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={send} disabled={!text.trim()}><Send className="size-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 회의 생성/편집 ───
function MeetingFormDialog({ open, onOpenChange, editing, profiles, userId, userName }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: MeetingAgenda | null
  profiles: { id: string; name: string }[]
  userId?: string
  userName?: string
}) {
  const create = useCreateMeeting()
  const update = useUpdateMeeting()
  const [title, setTitle] = useState(editing?.title || '')
  const [date, setDate] = useState(editing?.meetingDate || '')
  const [time, setTime] = useState(editing?.meetingTime || '')
  const [location, setLocation] = useState(editing?.location || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [attendees, setAttendees] = useState<string[]>(editing?.attendeeIds || [])
  const toggle = (id: string) => setAttendees(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id])

  const notify = (ids: string[], title: string) => {
    const targets = ids.filter(id => id !== userId)
    if (!targets.length) return
    createNotificationsForUsers(targets, {
      type: 'meeting_agenda',
      title: '회의 참석 요청',
      message: `${userName || '누군가'}님이 "${title}" 회의에 참석자로 지정했습니다.`,
      link: '/common/meeting-agenda',
      metadata: { title },
    }).catch(() => {})
  }

  const submit = () => {
    if (!title.trim()) return
    if (editing) {
      const newlyAdded = attendees.filter(id => !editing.attendeeIds.includes(id))
      update.mutate(
        { id: editing.id, title: title.trim(), meetingDate: date || undefined, meetingTime: time || undefined, location: location || undefined, notes: notes || undefined, attendeeIds: attendees },
        { onSuccess: () => { if (newlyAdded.length) notify(newlyAdded, title.trim()); onOpenChange(false) } },
      )
    } else {
      create.mutate(
        { title: title.trim(), meetingDate: date || undefined, meetingTime: time || undefined, location: location || undefined, notes: notes || undefined, attendeeIds: attendees, createdBy: userId },
        { onSuccess: () => { if (attendees.length) notify(attendees, title.trim()); onOpenChange(false) } },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? '회의 편집' : '새 회의'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">제목</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 주간 서비스팀 회의" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">날짜</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><Label className="text-xs">시간</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <div>
            <Label className="text-xs">장소 / 온라인 링크</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="회의실 또는 Zoom/Meet 링크" />
          </div>
          <div>
            <Label className="text-xs">참석자 <span className="text-muted-foreground">({attendees.length}명)</span></Label>
            <Popover>
              <PopoverTrigger className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring">
                <span className={attendees.length ? 'text-foreground truncate' : 'text-muted-foreground'}>
                  {attendees.length ? attendees.map(id => profiles.find(p => p.id === id)?.name).filter(Boolean).join(', ') : '참석자 선택'}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1 max-h-72 overflow-y-auto">
                {profiles.map(p => (
                  <button key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-left">
                    <span className={`size-4 rounded border flex items-center justify-center ${attendees.includes(p.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                      {attendees.includes(p.id) && <Check className="size-3" />}
                    </span>
                    {p.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs">회의 개요 (선택)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="회의 목적·배경 등" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending || update.isPending}>{editing ? '저장' : '만들기'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
