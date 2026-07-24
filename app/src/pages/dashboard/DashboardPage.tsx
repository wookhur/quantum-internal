import { useState, useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Loader2, Megaphone, Plus, Pencil, Trash2, Pin, Building2, Globe, Smartphone, Landmark,
  Phone, Mail, Users, ExternalLink,
} from 'lucide-react'
import { todayKST } from '@/lib/date'
import { useAuth } from '@/contexts/AuthContext'
import {
  useNotices, useCreateNotice, useUpdateNotice, useDeleteNotice, type Notice,
} from '@/hooks/useNotices'
import { useCompanyInfo, useUpdateCompanyInfo, type CompanyInfo } from '@/hooks/useCompanyInfo'
import { useProfiles } from '@/hooks/useProfiles'

/** URL을 http(s) 형태로 정규화 (링크용) */
function toUrl(v?: string) {
  if (!v) return undefined
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export function DashboardPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level'

  const { data: notices = [], isLoading: noticesLoading } = useNotices()
  const createNotice = useCreateNotice()
  const updateNotice = useUpdateNotice()
  const deleteNotice = useDeleteNotice()
  const { data: company } = useCompanyInfo()
  const updateCompany = useUpdateCompanyInfo()
  const { data: profiles = [] } = useProfiles()

  // 대시보드에 노출할 임직원 명단 — 지정된 순서·직함은 고정, 이메일은 프로필에서 보완
  const staff = useMemo(() => {
    const roster: { name: string; title: string; email?: string }[] = [
      { name: '한상범', title: '대표', email: 'samhan@quantumadmissions.com' },
      { name: '김지현', title: '부대표' },
      { name: '곽지수', title: '이사 · Sales Department' },
      { name: '허욱', title: '팀장 · 경영기획팀' },
      { name: '남연서', title: '팀장 · Consultant Department' },
      { name: '신디', title: '팀장 · Sales Operations Manager' },
      { name: '박성원', title: '팀장 · Marketing Department' },
    ]
    return roster.map((r) => {
      const p = profiles.find((x) => x.name === r.name || x.name.includes(r.name) || r.name.includes(x.name))
      return { id: p?.id || r.name, name: r.name, title: r.title, email: r.email || p?.email }
    })
  }, [profiles])

  // 공지 폼
  const [showNoticeForm, setShowNoticeForm] = useState(false)
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null)
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', pinned: false })
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null)

  // 회사 정보 편집
  const [companyOpen, setCompanyOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyInfo>({})

  function openCreateNotice() {
    setEditingNotice(null)
    setNoticeForm({ title: '', content: '', pinned: false })
    setShowNoticeForm(true)
  }
  function openEditNotice(n: Notice) {
    setEditingNotice(n)
    setNoticeForm({ title: n.title, content: n.content || '', pinned: n.pinned })
    setShowNoticeForm(true)
  }
  function submitNotice() {
    const title = noticeForm.title.trim()
    if (!title) return
    const content = noticeForm.content.trim()
    const pinned = noticeForm.pinned
    if (editingNotice) updateNotice.mutate({ id: editingNotice.id, title, content, pinned }, { onSuccess: () => setShowNoticeForm(false) })
    else createNotice.mutate({ title, content, pinned, createdBy: user?.id || '' }, { onSuccess: () => setShowNoticeForm(false) })
  }
  function handleDeleteNotice(id: string) {
    if (confirm('이 공지를 삭제할까요?')) deleteNotice.mutate(id)
  }
  function openCompanyEdit() {
    setCompanyForm(company || {})
    setCompanyOpen(true)
  }

  const infoRow = (icon: React.ReactNode, label: string, value?: string, href?: string) => (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {value ? (
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all inline-flex items-center gap-1">
              {value}<ExternalLink className="size-3 shrink-0" />
            </a>
          ) : <div className="break-words whitespace-pre-wrap">{value}</div>
        ) : <div className="text-muted-foreground">—</div>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">{todayKST()}</p>
      </div>

      {/* 회사 정보 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="size-4 text-primary" /> 퀀텀어드미션즈 안내</CardTitle>
            {isAdmin && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={openCompanyEdit}>
                <Pencil className="size-3" /> 편집
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {infoRow(<Building2 className="size-4" />, '주소', company?.address)}
          {infoRow(<Landmark className="size-4" />, '은행계좌', company?.bankInfo)}
          {infoRow(<Globe className="size-4" />, '홈페이지', company?.website, toUrl(company?.website))}
          {infoRow(<Smartphone className="size-4" />, '학생관리 앱', company?.studentAppUrl, toUrl(company?.studentAppUrl))}
          {infoRow(<Phone className="size-4" />, '대표 전화', company?.companyPhone)}
          {infoRow(<Mail className="size-4" />, '대표 이메일', company?.companyEmail)}
          {company?.notes && (
            <div className="sm:col-span-2 text-sm border-t pt-3 whitespace-pre-wrap text-muted-foreground">{company.notes}</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공지사항 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Megaphone className="size-4" /> 공지사항</CardTitle>
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openCreateNotice}>
                  <Plus className="size-3 mr-1" /> {t('dashboard.write')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {noticesLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : notices.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('dashboard.noNotices')}</div>
            ) : (
              notices.map((notice) => (
                <div key={notice.id} className={`rounded-lg border p-3 transition-colors ${notice.pinned ? 'bg-amber-50/50 border-amber-200' : 'hover:bg-muted/30'}`}>
                  <div className="flex items-start gap-2">
                    {notice.pinned && <Pin className="size-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <button className="text-sm font-medium text-left w-full truncate hover:underline" onClick={() => setExpandedNotice(expandedNotice === notice.id ? null : notice.id)}>
                        {notice.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{notice.authorName || t('dashboard.admin')} · {notice.createdAt.slice(0, 10)}</span>
                      </div>
                      {expandedNotice === notice.id && notice.content && (
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap border-t pt-2">{notice.content}</div>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditNotice(notice)}><Pencil className="size-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteNotice(notice.id)}><Trash2 className="size-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 직원 연락처 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Users className="size-4" /> 직원 연락처 <span className="text-xs font-normal text-muted-foreground">({staff.length})</span></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {staff.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}
                      <span className="text-xs text-muted-foreground ml-1.5">{p.title}</span>
                    </div>
                  </div>
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="text-xs text-primary hover:underline truncate shrink-0 max-w-[55%] text-right">{p.email}</a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 공지 작성/수정 */}
      <Dialog open={showNoticeForm} onOpenChange={setShowNoticeForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingNotice ? '공지 수정' : '공지 작성'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">제목</Label>
              <Input value={noticeForm.title} onChange={(e) => setNoticeForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">내용</Label>
              <Textarea rows={5} value={noticeForm.content} onChange={(e) => setNoticeForm((f) => ({ ...f, content: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={noticeForm.pinned} onCheckedChange={(v) => setNoticeForm((f) => ({ ...f, pinned: v }))} /> 상단 고정
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoticeForm(false)}>취소</Button>
            <Button onClick={submitNotice} disabled={!noticeForm.title.trim() || createNotice.isPending || updateNotice.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 회사 정보 편집 (관리자) */}
      <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>회사 정보 편집</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([
              ['address', '주소'], ['bankInfo', '은행계좌 (예: 국민은행 123-45-6789 (주)퀀텀어드미션즈)'],
              ['website', '홈페이지 주소'], ['studentAppUrl', '학생관리 앱 주소'],
              ['companyPhone', '대표 전화'], ['companyEmail', '대표 이메일'],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={companyForm[key] || ''} onChange={(e) => setCompanyForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">기타 안내 (선택)</Label>
              <Textarea rows={3} value={companyForm.notes || ''} onChange={(e) => setCompanyForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyOpen(false)}>취소</Button>
            <Button onClick={() => updateCompany.mutate(companyForm, { onSuccess: () => setCompanyOpen(false) })} disabled={updateCompany.isPending}>
              {updateCompany.isPending ? <Loader2 className="size-4 animate-spin" /> : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
