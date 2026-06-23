import { useState } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CheckCircle2, Loader2, Megaphone, Plus, Pencil, Trash2, Pin,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayKST } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import {
  useNotices, useCreateNotice, useUpdateNotice, useDeleteNotice,
  type Notice,
} from '@/hooks/useNotices'

function useDashboardTodos() {
  return useQuery({
    queryKey: ['dashboard-todos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .neq('status', 'done')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true })
        .limit(10)
      if (error) throw error
      return data || []
    },
  })
}

export function DashboardPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'

  const { data: todos = [], isLoading: todosLoading } = useDashboardTodos()
  const { data: notices = [], isLoading: noticesLoading } = useNotices()
  const createNotice = useCreateNotice()
  const updateNotice = useUpdateNotice()
  const deleteNotice = useDeleteNotice()

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공지사항 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="size-4" /> 공지사항
              </CardTitle>
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateForm}>
                  <Plus className="size-3 mr-1" /> 작성
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
                등록된 공지사항이 없습니다.
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
                          {notice.authorName || '관리자'} · {notice.createdAt.slice(0, 10)}
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

        {/* 급한 할일 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="size-4" /> {t('dashboard.urgentTodos')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : todos.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t('dashboard.noTodos')}
              </div>
            ) : (
              todos.map((todo: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    todo.priority === 'high' ? 'bg-destructive' :
                    todo.priority === 'medium' ? 'bg-warning' : 'bg-muted-foreground'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{String(todo.title || '')}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {t('priority.' + ((todo.priority as string) || 'medium'))}
                      </span>
                      {todo.due_date ? (
                        <span className="text-xs text-muted-foreground">
                          · {t('dashboard.due')}: {String(todo.due_date).slice(0, 10)}
                        </span>
                      ) : null}
                    </div>
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
            <DialogTitle>{editingNotice ? '공지사항 수정' : '공지사항 작성'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleNoticeSubmit} className="space-y-4">
            <div>
              <Label>제목 *</Label>
              <Input
                value={noticeForm.title}
                onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                placeholder="공지사항 제목"
              />
            </div>
            <div>
              <Label>내용</Label>
              <Textarea
                value={noticeForm.content}
                onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                placeholder="공지사항 내용을 입력하세요"
                rows={5}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={noticeForm.pinned}
                onCheckedChange={(v) => setNoticeForm({ ...noticeForm, pinned: v })}
              />
              <Label className="cursor-pointer">상단 고정</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNoticeForm(false)}>취소</Button>
              <Button type="submit" disabled={!noticeForm.title.trim() || createNotice.isPending || updateNotice.isPending}>
                {(createNotice.isPending || updateNotice.isPending) && <Loader2 className="size-4 animate-spin mr-1" />}
                {editingNotice ? '수정' : '등록'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
