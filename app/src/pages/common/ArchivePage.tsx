import { useState, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FolderArchive, Plus, Search, Paperclip, X, Loader2, Pencil, Trash2, Download, ChevronDown, ChevronRight, Lock, Megaphone, HeartHandshake, Briefcase, Target } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useArchiveItems, useCreateArchiveItem, useUpdateArchiveItem, useDeleteArchiveItem, uploadArchiveFile,
  type ArchiveItem, type ArchiveAttachment, type ArchiveTeam,
} from '@/hooks/useArchive'
import type { User } from '@/types'

const TEAMS: { key: ArchiveTeam; label: string; icon: typeof Megaphone; box: string; boxOn: string }[] = [
  { key: 'marketing', label: '마케팅팀', icon: Megaphone, box: 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 text-amber-800', boxOn: 'border-amber-400 ring-2 ring-amber-300 bg-amber-100 text-amber-900' },
  { key: 'service', label: '서비스팀', icon: HeartHandshake, box: 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 text-emerald-800', boxOn: 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-100 text-emerald-900' },
  { key: 'planning', label: '경영기획팀', icon: Briefcase, box: 'border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50 text-indigo-800', boxOn: 'border-indigo-400 ring-2 ring-indigo-300 bg-indigo-100 text-indigo-900' },
  { key: 'sales', label: '세일즈팀', icon: Target, box: 'border-rose-200 bg-rose-50/60 hover:bg-rose-50 text-rose-800', boxOn: 'border-rose-400 ring-2 ring-rose-300 bg-rose-100 text-rose-900' },
]

/** 내부 직원 여부(외부/프리랜서 제외) */
function isInternalUser(u: User | null | undefined): boolean {
  return !!u && u.role !== 'external' && u.role !== 'freelancer' && !u.isExternal
}

/** 첨부파일 강제 다운로드(교차출처 blob). */
async function downloadFile(url: string, name: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank', 'noopener')
  }
}

export function ArchivePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canCreate = isInternalUser(user)
  const { data: items = [], isLoading } = useArchiveItems()
  const del = useDeleteArchiveItem()

  const [team, setTeam] = useState<ArchiveTeam>('marketing')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<ArchiveItem | null>(null)
  const [creating, setCreating] = useState(false)

  // 접근 권한: admin·작성자·허가된 사람·전체공개(빈 배열) 이면 볼 수 있음
  const canView = (it: ArchiveItem) =>
    isAdmin || it.createdBy === user?.id || it.allowedUserIds.length === 0 || (!!user && it.allowedUserIds.includes(user.id))
  const canEditItem = (it: ArchiveItem) => isAdmin || it.createdBy === user?.id

  const viewable = useMemo(() => items.filter(canView), [items, user, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
  const countByTeam = useMemo(() => {
    const m: Record<string, number> = { marketing: 0, service: 0, planning: 0, sales: 0 }
    for (const it of viewable) if (it.team && m[it.team] !== undefined) m[it.team]++
    return m
  }, [viewable])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return viewable.filter(it => {
      if ((it.team || 'planning') !== team) return false
      if (!q) return true
      return it.title.toLowerCase().includes(q) ||
        it.content.toLowerCase().includes(q) ||
        it.attachments.some(a => a.name.toLowerCase().includes(q))
    })
  }, [viewable, team, search])

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FolderArchive className="h-6 w-6 text-primary" /> 자료실 <span className="text-base font-normal text-muted-foreground">Archive</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">팀별 자료를 업로드·검색·다운로드하는 내부 자료 보관함입니다. 자료는 내부 직원 누구나 올릴 수 있고, 접근 인원은 관리자가 자료별로 설정합니다.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="gap-1.5 shrink-0"><Plus className="size-4" /> 새 자료</Button>
        )}
      </div>

      {/* 팀별 4개 박스 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TEAMS.map(tm => {
          const Icon = tm.icon
          const on = team === tm.key
          return (
            <button
              key={tm.key}
              onClick={() => { setTeam(tm.key); setExpanded(null) }}
              className={`rounded-xl border p-4 text-left transition ${on ? tm.boxOn : tm.box}`}
            >
              <Icon className="size-6" />
              <div className="mt-2 text-base font-bold">{tm.label}</div>
              <div className="text-xs opacity-70">자료 {countByTeam[tm.key] || 0}건</div>
            </button>
          )
        })}
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="제목·내용·파일명 검색…" className="pl-8" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          {search ? '검색 결과가 없습니다.' : `${TEAMS.find(t => t.key === team)?.label}에 등록된 자료가 없습니다.`}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(it => {
            const open = expanded === it.id
            const restricted = it.allowedUserIds.length > 0
            return (
              <Card key={it.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <button className="mt-0.5 text-muted-foreground shrink-0" onClick={() => setExpanded(open ? null : it.id)}>
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button className="block w-full text-left" onClick={() => setExpanded(open ? null : it.id)}>
                        <span className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                          {it.title}
                          {restricted && <Lock className="size-3 text-amber-600" aria-label="접근 제한" />}
                        </span>
                      </button>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{it.authorName || '관리자'} · {it.createdAt.slice(0, 10)}</span>
                        {it.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{it.attachments.length}</span>}
                        {restricted && <span className="text-amber-600">· 지정 인원만</span>}
                      </div>
                      {open && (
                        <div className="mt-2 space-y-2 border-t pt-2">
                          {it.content && <div className="whitespace-pre-wrap text-sm text-muted-foreground">{it.content}</div>}
                          {it.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {it.attachments.map((a, i) => (
                                <button key={i} onClick={() => downloadFile(a.url, a.name)} className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted" title="다운로드">
                                  <Paperclip className="size-3 text-muted-foreground" /><span className="max-w-[180px] truncate">{a.name}</span><Download className="size-3 text-muted-foreground" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {canEditItem(it) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(it)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm('이 자료를 삭제할까요?')) del.mutate(it.id) }}><Trash2 className="size-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <ArchiveDialog item={editing} defaultTeam={team} isAdmin={isAdmin} createdBy={user?.id} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
    </div>
  )
}

function ArchiveDialog({ item, defaultTeam, isAdmin, createdBy, onClose }: { item: ArchiveItem | null; defaultTeam: ArchiveTeam; isAdmin: boolean; createdBy?: string; onClose: () => void }) {
  const create = useCreateArchiveItem()
  const update = useUpdateArchiveItem()
  const { data: profiles = [] } = useProfiles()
  const [title, setTitle] = useState(item?.title || '')
  const [content, setContent] = useState(item?.content || '')
  const [team, setTeam] = useState<ArchiveTeam>(item?.team || defaultTeam)
  const [attachments, setAttachments] = useState<ArchiveAttachment[]>(item?.attachments || [])
  const [restrict, setRestrict] = useState<boolean>((item?.allowedUserIds.length || 0) > 0)
  const [allowedIds, setAllowedIds] = useState<string[]>(item?.allowedUserIds || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 접근 지정 후보 = 내부 직원
  const internalProfiles = useMemo(
    () => profiles.filter(p => p.role !== 'external' && p.role !== 'freelancer' && !p.isExternal),
    [profiles],
  )

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      const up: ArchiveAttachment[] = []
      for (const f of files) up.push(await uploadArchiveFile(f))
      setAttachments(prev => [...prev, ...up])
    } catch (err) {
      alert('파일 업로드 실패: ' + ((err as Error)?.message || ''))
    } finally { setUploading(false) }
  }

  const toggleAllowed = (id: string) =>
    setAllowedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = () => {
    const t = title.trim()
    if (!t) return
    const allowed = restrict ? allowedIds : []
    if (item) update.mutate({ id: item.id, title: t, content, attachments, team, allowedUserIds: allowed }, { onSuccess: onClose })
    else create.mutate({ title: t, content, attachments, team, allowedUserIds: allowed, createdBy: createdBy || '' }, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? '자료 수정' : '새 자료'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label className="text-xs">팀</Label>
            <div className="flex flex-wrap gap-1.5">
              {TEAMS.map(tm => (
                <button
                  key={tm.key}
                  type="button"
                  onClick={() => setTeam(tm.key)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition ${team === tm.key ? tm.boxOn : tm.box}`}
                >{tm.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">제목</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="자료 제목" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">내용 <span className="text-muted-foreground font-normal">(길게 작성 가능)</span></Label>
            <Textarea rows={12} value={content} onChange={e => setContent(e.target.value)} placeholder="프롬프트·설명 등 긴 내용을 자유롭게 작성하세요..." />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">첨부파일 <span className="text-muted-foreground font-normal">(PDF · docx · txt · 이미지)</span></Label>
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                  <Paperclip className="size-3 text-muted-foreground" /><span className="max-w-[180px] truncate">{a.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-red-500"><X className="size-3" /></button>
                </span>
              ))}
              <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.doc,.docx,image/*" className="hidden" onChange={onFiles} />
              <Button variant="outline" size="sm" className="h-8 gap-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} 파일 추가
              </Button>
            </div>
          </div>

          {/* 접근 권한 — 관리자만 설정 */}
          {isAdmin ? (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-xs flex items-center gap-1.5"><Lock className="size-3.5" /> 접근 허가 인원</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRestrict(false)} className={`rounded-md border px-3 py-1.5 text-xs ${!restrict ? 'border-primary bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`}>전체 공개</button>
                <button type="button" onClick={() => setRestrict(true)} className={`rounded-md border px-3 py-1.5 text-xs ${restrict ? 'border-primary bg-primary/10 text-primary font-medium' : 'text-muted-foreground'}`}>지정 인원만</button>
              </div>
              {restrict && (
                <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                  {internalProfiles.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                      <input type="checkbox" className="size-4" checked={allowedIds.includes(p.id)} onChange={() => toggleAllowed(p.id)} />
                      <span>{p.name}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{p.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">‘전체 공개’면 내부 직원 누구나 볼 수 있고, ‘지정 인원만’이면 체크한 사람과 작성자·관리자만 볼 수 있습니다.</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">접근 허가 인원 설정은 관리자만 변경할 수 있습니다. (기본: 전체 공개)</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={!title.trim() || create.isPending || update.isPending}>
            {(create.isPending || update.isPending) && <Loader2 className="size-4 mr-1 animate-spin" />}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
