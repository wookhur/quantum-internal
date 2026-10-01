import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Printer, Plus, Pencil, Trash2, ExternalLink, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import {
  useSnsContents, useCreateSnsContent, useUpdateSnsContent, useDeleteSnsContent,
  type SnsContent,
} from '@/hooks/useSnsContents'
import {
  inPeriod, sumTotals, sortContents, engagementRateOf,
  fmtNum, fmtDelta, fmtRate, type SnsSortKey,
} from '@/lib/snsReport'

/** 보고서에서 다루는 채널. 값은 sns_contents.channel 에 그대로 저장된다. */
const CHANNELS = [
  { key: 'instagram', label: '인스타그램' },
  { key: 'youtube', label: '유튜브' },
  { key: 'blog', label: '블로그' },
  { key: 'threads', label: '스레드' },
  { key: 'other', label: '기타' },
] as const

const channelLabel = (key: string) => CHANNELS.find(c => c.key === key)?.label || key

/** 이번 주(월~일). 서비스팀 주간보고서와 같은 기준. */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(mon), end: fmt(sun) }
}

/** 정렬 가능한 표 머리칸. 렌더 중에 만들면 매 렌더마다 새 컴포넌트가 되므로 바깥에 둔다. */
function SortableTh({ k, active, onSort, children, title }: {
  k: SnsSortKey
  active: boolean
  onSort: (k: SnsSortKey) => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <th
      className={`font-medium p-2 cursor-pointer select-none hover:text-gray-900 ${active ? 'text-gray-900 underline decoration-dotted' : ''}`}
      onClick={() => onSort(k)}
      title={title || '이 값으로 정렬'}
    >
      {children}
    </th>
  )
}

const EMPTY_FORM = {
  channel: 'instagram',
  postedAt: '',
  title: '',
  category: '',
  url: '',
  views: '',
  likes: '',
  comments: '',
  saves: '',
  shares: '',
  follows: '',
  notes: '',
}
type FormState = typeof EMPTY_FORM

export function MarketingWeeklyReportPage() {
  const canEdit = useCanEdit(useLocation().pathname)
  const { user } = useAuth()
  const week = currentWeekRange()
  const [start, setStart] = useState(week.start)
  const [end, setEnd] = useState(week.end)
  const [channel, setChannel] = useState<string>('instagram')
  const [sortKey, setSortKey] = useState<SnsSortKey>('follows')

  const { data: all = [], isLoading } = useSnsContents()
  const create = useCreateSnsContent()
  const update = useUpdateSnsContent()
  const del = useDeleteSnsContent()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SnsContent | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const rows = useMemo(() => {
    const byChannel = channel === 'all' ? all : all.filter(c => c.channel === channel)
    return sortContents(inPeriod(byChannel, start, end), sortKey)
  }, [all, channel, start, end, sortKey])

  const totals = useMemo(() => sumTotals(rows), [rows])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, channel: channel === 'all' ? 'instagram' : channel, postedAt: end })
    setDialogOpen(true)
  }
  const openEdit = (c: SnsContent) => {
    setEditing(c)
    setForm({
      channel: c.channel, postedAt: c.postedAt, title: c.title,
      category: c.category || '', url: c.url || '', notes: c.notes || '',
      views: String(c.views), likes: String(c.likes), comments: String(c.comments),
      saves: String(c.saves), shares: String(c.shares), follows: String(c.follows),
    })
    setDialogOpen(true)
  }

  const n = (v: string) => Number(v) || 0
  const save = () => {
    if (!form.title.trim() || !form.postedAt) return
    const payload = {
      channel: form.channel,
      postedAt: form.postedAt,
      title: form.title.trim(),
      category: form.category.trim() || undefined,
      url: form.url.trim() || undefined,
      views: n(form.views), likes: n(form.likes), comments: n(form.comments),
      saves: n(form.saves), shares: n(form.shares), follows: n(form.follows),
      notes: form.notes.trim() || undefined,
    }
    const onError = (e: unknown) => alert(`저장하지 못했습니다.\n${(e as { message?: string })?.message || ''}`)
    const onSuccess = () => { setDialogOpen(false); setEditing(null) }
    if (editing) update.mutate({ id: editing.id, ...payload }, { onSuccess, onError })
    else create.mutate({ ...payload, createdBy: user?.id }, { onSuccess, onError })
  }

  return (
    <div className="p-1">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #mkt-report, #mkt-report * { visibility: visible !important; }
        #mkt-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 8mm; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="flex items-center justify-between gap-3 mb-5 no-print flex-wrap">
        <h1 className="text-xl font-semibold">마케팅 주간보고서</h1>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Select value={channel} onValueChange={v => setChannel(v || 'instagram')}>
            <SelectTrigger className="w-[130px]">
              <span className="truncate">{channel === 'all' ? '전체 채널' : channelLabel(channel)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 채널</SelectItem>
              {CHANNELS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-auto" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-auto" />
          {canEdit && (
            <Button variant="outline" onClick={openCreate} className="gap-1.5">
              <Plus className="size-4" />콘텐츠 추가
            </Button>
          )}
          <Button onClick={() => window.print()} className="gap-1.5">
            <Printer className="size-4" />인쇄
          </Button>
        </div>
      </div>

      <div id="mkt-report">
        <div className="hidden print:block mb-4">
          <div className="text-lg font-semibold tracking-wide">QUANTUM ADMISSIONS</div>
          <div className="text-sm text-gray-500">마케팅 주간보고서</div>
        </div>
        <div className="text-sm text-gray-500 mb-4">
          {channel === 'all' ? '전체 채널' : channelLabel(channel)} · 기간 {start} ~ {end}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">게시물</div>
            <div className="text-2xl font-semibold">{totals.posts}<span className="text-sm font-normal text-gray-400">편</span></div>
            <div className="text-[11px] text-gray-400">이 기간에 올린 콘텐츠</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">조회수</div>
            <div className="text-2xl font-semibold">{fmtNum(totals.views)}</div>
            <div className="text-[11px] text-gray-400">콘텐츠 조회 합계</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">팔로워 순증</div>
            <div className="text-2xl font-semibold text-emerald-600">{fmtDelta(totals.follows)}</div>
            <div className="text-[11px] text-gray-400">콘텐츠로 늘어난 팔로워 합계</div>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <div className="text-xs text-gray-500">참여</div>
            <div className="text-2xl font-semibold">{fmtNum(totals.engagements)}</div>
            <div className="text-[11px] text-gray-400">좋아요+댓글+저장+공유 · 참여율 {fmtRate(totals.engagementRate)}</div>
          </div>
        </div>

        <div className="text-xs text-gray-500 mb-2">
          콘텐츠별 성과 · 전체 {rows.length}건 · {sortKey === 'postedAt' ? '게시일' : sortKey === 'engagementRate' ? '참여율' : { follows: '팔로우', views: '조회수', likes: '좋아요', comments: '댓글', saves: '저장' }[sortKey]} 순 정렬
        </div>

        <div className="border rounded-lg overflow-x-auto mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-right">
                <th className="font-medium p-2 pl-3 w-10 text-left">#</th>
                <th className="font-medium p-2 text-left">콘텐츠명</th>
                <SortableTh k="postedAt" active={sortKey === 'postedAt'} onSort={setSortKey}>게시일</SortableTh>
                <SortableTh k="views" active={sortKey === 'views'} onSort={setSortKey}>조회수</SortableTh>
                <SortableTh k="likes" active={sortKey === 'likes'} onSort={setSortKey}>좋아요</SortableTh>
                <SortableTh k="comments" active={sortKey === 'comments'} onSort={setSortKey}>댓글</SortableTh>
                <SortableTh k="saves" active={sortKey === 'saves'} onSort={setSortKey}>저장</SortableTh>
                <th className="font-medium p-2">공유</th>
                <SortableTh k="follows" active={sortKey === 'follows'} onSort={setSortKey}>팔로우</SortableTh>
                <SortableTh k="engagementRate" active={sortKey === 'engagementRate'} onSort={setSortKey} title="(좋아요+댓글+저장+공유) ÷ 조회수">참여율</SortableTh>
                {canEdit && <th className="font-medium p-2 pr-3 w-20 no-print"></th>}
              </tr>
            </thead>
            <tbody className="text-right">
              {isLoading && (
                <tr><td colSpan={canEdit ? 11 : 10} className="p-8 text-center text-gray-400">
                  <Loader2 className="size-5 animate-spin inline" />
                </td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={canEdit ? 11 : 10} className="p-8 text-center text-gray-400 text-sm">
                  이 기간에 등록된 콘텐츠가 없습니다. {canEdit ? "'콘텐츠 추가'로 채널 인사이트 숫자를 입력하세요." : ''}
                </td></tr>
              )}
              {rows.map((c, i) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2 pl-3 text-left text-gray-400">{i + 1}</td>
                  <td className="p-2 text-left">
                    <div className="font-medium flex items-center gap-1.5">
                      <span className="line-clamp-2">{c.title}</span>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="no-print text-gray-300 hover:text-primary shrink-0" title="게시물 열기">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {c.category && <Badge variant="outline" className="text-[10px] h-4">{c.category}</Badge>}
                      {channel === 'all' && <span className="text-[10px] text-gray-400">{channelLabel(c.channel)}</span>}
                    </div>
                  </td>
                  <td className="p-2 font-mono text-xs text-gray-500">{c.postedAt}</td>
                  <td className="p-2 tabular-nums">{fmtNum(c.views)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(c.likes)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(c.comments)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(c.saves)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(c.shares)}</td>
                  <td className={`p-2 tabular-nums font-medium ${c.follows > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{fmtDelta(c.follows)}</td>
                  <td className="p-2 tabular-nums">{fmtRate(engagementRateOf(c))}</td>
                  {canEdit && (
                    <td className="p-2 pr-3 no-print">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(c)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7 text-gray-300 hover:text-red-600"
                          onClick={() => { if (confirm(`'${c.title}' 콘텐츠를 삭제할까요?`)) del.mutate(c.id) }}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="border-t bg-gray-50 font-semibold">
                  <td className="p-2 pl-3 text-left" colSpan={3}>합계</td>
                  <td className="p-2 tabular-nums">{fmtNum(totals.views)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(totals.likes)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(totals.comments)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(totals.saves)}</td>
                  <td className="p-2 tabular-nums">{fmtNum(totals.shares)}</td>
                  <td className="p-2 tabular-nums text-emerald-600">{fmtDelta(totals.follows)}</td>
                  <td className="p-2 tabular-nums">{fmtRate(totals.engagementRate)}</td>
                  {canEdit && <td className="no-print" />}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 입력 / 수정 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '콘텐츠 성과 수정' : '콘텐츠 성과 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">채널</Label>
                <Select value={form.channel} onValueChange={v => set('channel', v || 'instagram')}>
                  <SelectTrigger><span>{channelLabel(form.channel)}</span></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">게시일 <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.postedAt} onChange={e => set('postedAt', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">콘텐츠명 <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="예: 미국 대학 조기전형 마감일 총정리" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">카테고리</Label>
                <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="예: 입시정보" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">게시물 링크</Label>
                <Input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['views', '조회수'], ['likes', '좋아요'], ['comments', '댓글'],
                ['saves', '저장'], ['shares', '공유'], ['follows', '팔로우'],
              ] as [keyof FormState, string][]).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" min={0} value={form[k]} onChange={e => set(k, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">메모</Label>
              <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={save} disabled={!form.title.trim() || !form.postedAt || create.isPending || update.isPending}>
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
