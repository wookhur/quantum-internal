import { useState, useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Loader2, Megaphone, Plus, Pencil, Trash2, Pin, CalendarDays, ChevronRight, Wallet, CalendarClock, AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDailyTasks, useDailyTaskMembers } from '@/hooks/useDailyTasks'
import { useInstallments } from '@/hooks/useInstallments'
import { useAllServiceMeetings, useOpenServiceFollowups } from '@/hooks/useServiceDashboard'
import { useConsultantName } from '@/lib/consultants'

function addDaysISO(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function fmtWon(n?: number) {
  if (!n) return ''
  return n >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : n.toLocaleString()
}
import { todayKST } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import {
  useNotices, useCreateNotice, useUpdateNotice, useDeleteNotice,
  type Notice,
} from '@/hooks/useNotices'

export function DashboardPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'

  const { data: notices = [], isLoading: noticesLoading } = useNotices()
  const { data: dtMembers = [] } = useDailyTaskMembers()
  const { data: dtTasks = [] } = useDailyTasks(todayKST())
  const createNotice = useCreateNotice()
  const updateNotice = useUpdateNotice()
  const deleteNotice = useDeleteNotice()

  // ── 자동 연동: 수금 예정 · 예정 미팅 · 미해결 follow-up ──
  const today = todayKST()
  const weekEnd = addDaysISO(today, 7)
  const consultantName = useConsultantName()
  const { data: installments = [] } = useInstallments()
  const { data: upcomingMeetings = [] } = useAllServiceMeetings(today, weekEnd)
  const { data: openFollowups = [] } = useOpenServiceFollowups()

  // 수금: 미납이면서 마감이 오늘~7일 이내(연체 포함)
  const dueCollections = useMemo(() => installments
    .filter((i) => i.status !== 'paid' && i.dueDate && i.dueDate.slice(0, 10) <= weekEnd)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')), [installments, weekEnd])
  // 미팅: 오늘~7일, 취소/노쇼 제외
  const meetings = useMemo(() => upcomingMeetings
    .filter((m) => m.status !== 'cancelled' && m.status !== 'no_show' && m.meetingDate)
    .sort((a, b) => (a.meetingDate || '').localeCompare(b.meetingDate || '')), [upcomingMeetings])

  const [showNoticeForm, setShowNoticeForm] = useState(false)
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null)
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', pinned: false })
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null)

  function openCreateForm() {
    setEditingNotice(null)
    setNoticeForm({ title: '', content: '', pinned: false })
    setShowNoticeForm(true)
  }

  function openEditForm(notice: Notice) {
    setEditingNotice(notice)
    setNoticeForm({ title: notice.title, content: notice.content, pinned: notice.pinned })
    setShowNoticeForm(true)
  }

  async function handleNoticeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!noticeForm.title.trim()) return
    if (editingNotice) {
      await updateNotice.mutateAsync({
        id: editingNotice.id,
        title: noticeForm.title.trim(),
        content: noticeForm.content.trim(),
        pinned: noticeForm.pinned,
      })
    } else {
      await createNotice.mutateAsync({
        title: noticeForm.title.trim(),
        content: noticeForm.content.trim(),
        pinned: noticeForm.pinned,
        createdBy: user!.id,
      })
    }
    setShowNoticeForm(false)
  }

  async function handleDeleteNotice(id: string) {
    await deleteNotice.mutateAsync(id)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">{todayKST()} {t('dashboard.companyStatus')}</p>
      </div>

      {/* 오늘의 업무 (담당자별) */}
      {dtMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" /> 오늘의 업무
              </CardTitle>
              <Link to="/daily-tasks" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                일일 업무 <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[...dtMembers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((mem) => {
                const list = dtTasks.filter((t) => t.userId === mem.profileId)
                const done = list.filter((t) => t.status === 'done').length
                return (
                  <div key={mem.profileId} className="rounded-md border p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{mem.name || '(이름 없음)'}</span>
                      <span className="text-[11px] text-muted-foreground">{list.length}건 · 완료 {done}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground">기록 없음</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {list.slice(0, 5).map((t) => (
                          <li key={t.id} className={`text-xs flex items-center gap-1 ${t.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                            <span className={`size-1.5 rounded-full shrink-0 ${t.status === 'done' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                            <span className="truncate">{t.title}</span>
                          </li>
                        ))}
                        {list.length > 5 && <li className="text-[11px] text-muted-foreground">+{list.length - 5}건</li>}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 자동 연동: 수금 예정 · 예정 미팅 · 미해결 follow-up */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 수금 예정 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Wallet className="size-4 text-amber-600" /> 수금 예정</span>
              <Link to="/consulting/collections" className="text-xs font-normal text-muted-foreground hover:text-foreground">전체 <ChevronRight className="size-3 inline" /></Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dueCollections.length === 0 ? <p className="text-sm text-muted-foreground py-2">예정된 수금 없음</p> :
              dueCollections.slice(0, 8).map((i) => {
                const overdue = !!i.dueDate && i.dueDate.slice(0, 10) < today
                return (
                  <div key={i.id} className="text-sm flex items-start gap-2">
                    <span className={`mt-1 size-1.5 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{i.contract?.studentName || i.contract?.contractorName || '-'} <span className="text-muted-foreground">· {fmtWon(i.amount)}</span></div>
                      <div className="text-[11px] text-muted-foreground">{i.dueDate?.slice(0, 10)}{i.contract?.salesRep ? ` · ${i.contract.salesRep}` : ''}{overdue ? ' · 연체' : ''}</div>
                    </div>
                  </div>
                )
              })}
            {dueCollections.length > 8 && <p className="text-[11px] text-muted-foreground">+{dueCollections.length - 8}건</p>}
          </CardContent>
        </Card>

        {/* 예정 미팅 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="size-4 text-blue-600" /> 예정 미팅 <span className="text-xs font-normal text-muted-foreground">(7일)</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {meetings.length === 0 ? <p className="text-sm text-muted-foreground py-2">예정 미팅 없음</p> :
              meetings.slice(0, 8).map((m) => {
                const c = consultantName(m.consultantId || m.studentConsultant)
                return (
                  <div key={m.id} className="text-sm flex items-start gap-2">
                    <span className="mt-1 size-1.5 rounded-full shrink-0 bg-blue-400" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{m.studentName || '-'}{m.meetingType ? ` · ${m.meetingType}` : ''}</div>
                      <div className="text-[11px] text-muted-foreground">{m.meetingDate}{c ? ` · ${c}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            {meetings.length > 8 && <p className="text-[11px] text-muted-foreground">+{meetings.length - 8}건</p>}
          </CardContent>
        </Card>

        {/* 미해결 follow-up */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-rose-500" /> 미해결 follow-up <span className="text-xs font-normal text-muted-foreground">({openFollowups.length})</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {openFollowups.length === 0 ? <p className="text-sm text-muted-foreground py-2">미해결 없음</p> :
              openFollowups.slice(0, 8).map((f) => (
                <div key={f.id} className="text-sm flex items-start gap-2">
                  <span className="mt-1 size-1.5 rounded-full shrink-0 bg-rose-400" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{f.text}</div>
                    <div className="text-[11px] text-muted-foreground">{f.studentName}{f.dueDate ? ` · 마감 ${f.dueDate.slice(0, 10)}` : ''}</div>
                  </div>
                </div>
              ))}
            {openFollowups.length > 8 && <p className="text-[11px] text-muted-foreground">+{openFollowups.length - 8}건</p>}
          </CardContent>
        </Card>
      </div>

      <div>
        {/* 공지사항 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="size-4" /> 공지사항
              </CardTitle>
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateForm}>
                  <Plus className="size-3 mr-1" /> {t('dashboard.write')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {noticesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : notices.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t('dashboard.noNotices')}
              </div>
            ) : (
              notices.map((notice) => (
                <div
                  key={notice.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    notice.pinned ? 'bg-amber-50/50 border-amber-200' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {notice.pinned && <Pin className="size-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <button
                        className="text-sm font-medium text-left w-full truncate hover:underline"
                        onClick={() => setExpandedNotice(expandedNotice === notice.id ? null : notice.id)}
                      >
                        {notice.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {notice.authorName || t('dashboard.admin')} · {notice.createdAt.slice(0, 10)}
                        </span>
                      </div>
                      {expandedNotice === notice.id && notice.content && (
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap border-t pt-2">
                          {notice.content}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditForm(notice)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteNotice(notice.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notice Create/Edit Dialog */}
      <Dialog open={showNoticeForm} onOpenChange={setShowNoticeForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNotice ? t('dashboard.editNotice') : t('dashboard.createNotice')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleNoticeSubmit} className="space-y-4">
            <div>
              <Label>{t('dashboard.noticeTitle')} *</Label>
              <Input
                value={noticeForm.title}
                onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                placeholder={t('dashboard.noticeTitlePh')}
              />
            </div>
            <div>
              <Label>{t('dashboard.noticeContent')}</Label>
              <Textarea
                value={noticeForm.content}
                onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                placeholder={t('dashboard.noticeContentPh')}
                rows={5}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={noticeForm.pinned}
                onCheckedChange={(v) => setNoticeForm({ ...noticeForm, pinned: v })}
              />
              <Label className="cursor-pointer">{t('dashboard.pinToTop')}</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNoticeForm(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!noticeForm.title.trim() || createNotice.isPending || updateNotice.isPending}>
                {(createNotice.isPending || updateNotice.isPending) && <Loader2 className="size-4 animate-spin mr-1" />}
                {editingNotice ? t('dashboard.edit') : t('dashboard.register')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
