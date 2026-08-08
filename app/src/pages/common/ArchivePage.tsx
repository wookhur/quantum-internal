import { useState, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FolderArchive, Plus, Search, Paperclip, X, Loader2, Pencil, Trash2, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import {
  useArchiveItems, useCreateArchiveItem, useUpdateArchiveItem, useDeleteArchiveItem, uploadArchiveFile,
  type ArchiveItem, type ArchiveAttachment,
} from '@/hooks/useArchive'

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
  const canEdit = useCanEdit(useLocation().pathname)
  const { data: items = [], isLoading } = useArchiveItems()
  const del = useDeleteArchiveItem()

  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<ArchiveItem | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(it =>
      it.title.toLowerCase().includes(q) ||
      it.content.toLowerCase().includes(q) ||
      it.attachments.some(a => a.name.toLowerCase().includes(q)),
    )
  }, [items, search])

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FolderArchive className="h-6 w-6 text-primary" /> Archive
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">각종 자료(문서·이미지·PDF 등)를 업로드·검색·다운로드하는 내부 자료 보관함입니다.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)} className="gap-1.5 shrink-0"><Plus className="size-4" /> 새 자료</Button>
        )}
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
          {search ? '검색 결과가 없습니다.' : '등록된 자료가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(it => {
            const open = expanded === it.id
            return (
              <Card key={it.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <button className="mt-0.5 text-muted-foreground shrink-0" onClick={() => setExpanded(open ? null : it.id)}>
                      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button className="block w-full text-left" onClick={() => setExpanded(open ? null : it.id)}>
                        <span className="text-sm font-semibold text-foreground">{it.title}</span>
                      </button>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{it.authorName || '관리자'} · {it.createdAt.slice(0, 10)}</span>
                        {it.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" />{it.attachments.length}</span>}
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
                    {canEdit && (
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
        <ArchiveDialog item={editing} createdBy={user?.id} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
    </div>
  )
}

function ArchiveDialog({ item, createdBy, onClose }: { item: ArchiveItem | null; createdBy?: string; onClose: () => void }) {
  const create = useCreateArchiveItem()
  const update = useUpdateArchiveItem()
  const [title, setTitle] = useState(item?.title || '')
  const [content, setContent] = useState(item?.content || '')
  const [attachments, setAttachments] = useState<ArchiveAttachment[]>(item?.attachments || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const save = () => {
    const t = title.trim()
    if (!t) return
    if (item) update.mutate({ id: item.id, title: t, content, attachments }, { onSuccess: onClose })
    else create.mutate({ title: t, content, attachments, createdBy: createdBy || '' }, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? '자료 수정' : '새 자료'}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label className="text-xs">제목</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="자료 제목" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">내용 <span className="text-muted-foreground font-normal">(길게 작성 가능)</span></Label>
            <Textarea rows={14} value={content} onChange={e => setContent(e.target.value)} placeholder="프롬프트·설명 등 긴 내용을 자유롭게 작성하세요..." />
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
