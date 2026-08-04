import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Lock, Unlock, Plus, Trash2, Upload, Download, Loader2, Search, X,
  FileText, Image as ImageIcon, Tag,
} from 'lucide-react'
import { useCanEdit } from '@/hooks/usePermissions'
import { useLanguage } from '@/i18n/LanguageContext'
import {
  usePriceGroups, usePriceItems,
  useCreatePriceGroup, useUpdatePriceGroup, useDeletePriceGroup, useUploadPriceAttachment,
  useCreatePriceItem, useUpdatePriceItem, useDeletePriceItem,
  type PriceGroup, type PriceItem, type PriceCategory,
} from '@/hooks/useSalesPrices'

/** True if a URL points to a PDF (vs. an image). */
function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split('?')[0].endsWith('.pdf')
}

/** Force-download an attachment (works cross-origin via blob). */
async function downloadAttachment(url: string, baseName: string) {
  const ext = isPdfUrl(url) ? 'pdf' : (url.toLowerCase().split('?')[0].split('.').pop() || 'png')
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = baseName.toLowerCase().endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    window.open(url, '_blank')
  }
}

// ── 안내문 첨부 (업로드/다운로드) ───────────────────────────────
function AttachmentControl({ group, canEdit }: { group: PriceGroup; canEdit: boolean }) {
  const { language: lang } = useLanguage()
  const upload = useUploadPriceAttachment()
  const updateGroup = useUpdatePriceGroup()
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(null)
    try {
      await upload.mutateAsync({ groupId: group.id, file })
    } catch {
      setErr(lang === 'en' ? 'Upload failed.' : '업로드 실패')
    }
  }

  const hasFile = !!group.attachmentUrl
  const label = group.attachmentName || (lang === 'en' ? 'Guide' : '안내문')

  return (
    <div className="flex items-center gap-1.5">
      {hasFile && (
        <button
          onClick={() => downloadAttachment(group.attachmentUrl!, group.attachmentName || `${group.name}`)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
          title={lang === 'en' ? 'Download guide' : '안내문 다운로드'}
        >
          {isPdfUrl(group.attachmentUrl!) ? <FileText className="h-3.5 w-3.5 text-red-500" /> : <ImageIcon className="h-3.5 w-3.5 text-blue-500" />}
          <span className="max-w-[140px] truncate">{label}</span>
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {canEdit && (
        <>
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onPick} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            title={hasFile ? (lang === 'en' ? 'Replace guide' : '안내문 교체') : (lang === 'en' ? 'Upload guide (PDF/image)' : '안내문 업로드 (PDF/이미지)')}
          >
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {hasFile ? (lang === 'en' ? 'Replace' : '교체') : (lang === 'en' ? 'Upload' : '안내문')}
          </button>
          {hasFile && (
            <button
              onClick={() => updateGroup.mutate({ id: group.id, attachmentUrl: null, attachmentName: null })}
              className="text-muted-foreground hover:text-red-500"
              title={lang === 'en' ? 'Remove guide' : '안내문 삭제'}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      {err && <span className="text-xs text-red-500">{err}</span>}
    </div>
  )
}

// ── 개별 가격 항목 (잠금/메모/인라인 편집) ──────────────────────
function PriceItemRow({ item, canEdit }: { item: PriceItem; canEdit: boolean }) {
  const { language: lang } = useLanguage()
  const update = useUpdatePriceItem()
  const del = useDeletePriceItem()

  const [name, setName] = useState(item.serviceName)
  const [price, setPrice] = useState(item.priceText ?? '')
  const [memo, setMemo] = useState(item.memo ?? '')

  // keep local drafts in sync if the row is refetched
  useEffect(() => { setName(item.serviceName) }, [item.serviceName])
  useEffect(() => { setPrice(item.priceText ?? '') }, [item.priceText])
  useEffect(() => { setMemo(item.memo ?? '') }, [item.memo])

  const editable = canEdit && !item.locked

  function saveField(patch: { serviceName?: string; priceText?: string | null; memo?: string | null }) {
    update.mutate({ id: item.id, ...patch })
  }

  const memoRef = useRef<HTMLTextAreaElement>(null)
  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  // 편집모드 진입/값 변경 시 메모 높이 맞춤
  useEffect(() => { if (editable) autosize(memoRef.current) }, [editable, memo])

  return (
    <div className={`rounded-lg border px-3 py-2.5 transition-colors ${item.locked ? 'border-border/60 bg-muted/30' : 'border-border bg-background'}`}>
      {/* 1행: 서비스명 + 금액 + 액션 */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editable ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== item.serviceName && saveField({ serviceName: name })}
              className="h-8 w-full border-transparent bg-muted/40 px-2 text-sm font-medium focus:border-input"
              placeholder={lang === 'en' ? 'Service name' : '서비스명'}
            />
          ) : (
            <div className="px-1 py-0.5 text-sm font-medium leading-snug text-foreground break-words">{item.serviceName}</div>
          )}
        </div>

        {/* 금액 (잘리지 않게: 보기=내용폭 nowrap, 편집=넉넉한 폭) */}
        <div className="shrink-0">
          {editable ? (
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => price !== (item.priceText ?? '') && saveField({ priceText: price || null })}
              className="h-8 w-56 border-transparent bg-muted/40 px-2 text-right text-sm font-bold text-primary focus:border-input"
              placeholder={lang === 'en' ? 'Price' : '금액'}
            />
          ) : (
            <div className="whitespace-nowrap px-1 py-0.5 text-right text-base font-bold tabular-nums text-primary">{item.priceText || '—'}</div>
          )}
        </div>

        {/* 자물쇠 + 삭제 */}
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1 pt-0.5">
            <button
              onClick={() => update.mutate({ id: item.id, locked: !item.locked })}
              className={`rounded-md p-1.5 transition-colors ${item.locked ? 'text-amber-600 hover:bg-amber-50' : 'text-muted-foreground hover:bg-muted'}`}
              title={item.locked ? (lang === 'en' ? 'Locked — click to edit' : '잠김 — 클릭하면 수정 가능') : (lang === 'en' ? 'Unlocked — click to lock' : '수정 가능 — 클릭하면 잠금')}
            >
              {item.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </button>
            {!item.locked && (
              <button
                onClick={() => { if (confirm(lang === 'en' ? 'Delete this item?' : '이 항목을 삭제할까요?')) del.mutate(item.id) }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                title={lang === 'en' ? 'Delete' : '삭제'}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2행: 메모 (전체 폭, 끝까지 줄바꿈) */}
      {editable ? (
        <textarea
          ref={memoRef}
          value={memo}
          rows={1}
          onChange={(e) => { setMemo(e.target.value); autosize(e.target) }}
          onBlur={() => memo !== (item.memo ?? '') && saveField({ memo: memo || null })}
          placeholder={lang === 'en' ? 'Memo (notes)' : '메모 (특이사항)'}
          className="mt-1 w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-xs leading-relaxed text-muted-foreground focus:border-input focus:bg-muted/40 focus:outline-none"
        />
      ) : (
        item.memo ? <div className="mt-1 whitespace-pre-wrap break-words px-1 text-xs leading-relaxed text-muted-foreground">{item.memo}</div> : null
      )}
    </div>
  )
}

// ── 그룹 카드 ───────────────────────────────────────────────────
function GroupCard({ group, items, canEdit }: { group: PriceGroup; items: PriceItem[]; canEdit: boolean }) {
  const { language: lang } = useLanguage()
  const createItem = useCreatePriceItem()
  const updateGroup = useUpdatePriceGroup()
  const deleteGroup = useDeletePriceGroup()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b bg-muted/20 py-3">
        <div className="min-w-0">
          {editingName && canEdit ? (
            <Input
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { setEditingName(false); if (nameDraft.trim() && nameDraft !== group.name) updateGroup.mutate({ id: group.id, name: nameDraft.trim() }) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-8 text-base font-semibold"
            />
          ) : (
            <div
              className={`truncate text-base font-semibold text-foreground ${canEdit ? 'cursor-text hover:underline decoration-dotted' : ''}`}
              onClick={() => canEdit && (setNameDraft(group.name), setEditingName(true))}
            >
              {group.name}
            </div>
          )}
          {group.subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{group.subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AttachmentControl group={group} canEdit={canEdit} />
          {canEdit && (
            <button
              onClick={() => { if (confirm(lang === 'en' ? 'Delete this group and all its items?' : '이 그룹과 하위 항목을 모두 삭제할까요?')) deleteGroup.mutate(group.id) }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
              title={lang === 'en' ? 'Delete group' : '그룹 삭제'}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3">
        {items.length === 0 && <div className="py-2 text-center text-xs text-muted-foreground">{lang === 'en' ? 'No items' : '항목 없음'}</div>}
        {items.map((it) => <PriceItemRow key={it.id} item={it} canEdit={canEdit} />)}
        {canEdit && (
          <button
            onClick={() => createItem.mutate({ groupId: group.id, serviceName: lang === 'en' ? 'New service' : '새 서비스', priceText: '', sortOrder: (items[items.length - 1]?.sortOrder ?? 0) + 1 })}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> {lang === 'en' ? 'Add item' : '항목 추가'}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// ── 페이지 ──────────────────────────────────────────────────────
export function SalesPriceGuidePage() {
  const { language: lang } = useLanguage()
  const canEdit = useCanEdit('/partner/programs')
  const { data: groups = [], isLoading } = usePriceGroups()
  const { data: items = [] } = usePriceItems()
  const createGroup = useCreatePriceGroup()
  const [search, setSearch] = useState('')

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, PriceItem[]>()
    for (const it of items) {
      const arr = m.get(it.groupId) || []
      arr.push(it)
      m.set(it.groupId, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder)
    return m
  }, [items])

  // 검색: 그룹명/제공처/서비스명/금액/메모 어디든 매칭
  const q = search.trim().toLowerCase()
  const matches = (g: PriceGroup) => {
    if (!q) return true
    if (g.name.toLowerCase().includes(q) || (g.subtitle ?? '').toLowerCase().includes(q)) return true
    return (itemsByGroup.get(g.id) || []).some(
      (it) => it.serviceName.toLowerCase().includes(q) || (it.priceText ?? '').toLowerCase().includes(q) || (it.memo ?? '').toLowerCase().includes(q),
    )
  }

  const quantum = groups.filter((g) => g.category === 'quantum' && matches(g))
  const partner = groups.filter((g) => g.category === 'partner' && matches(g))

  const addGroup = (category: PriceCategory) => {
    const same = groups.filter((g) => g.category === category)
    createGroup.mutate({
      category,
      name: lang === 'en' ? 'New group' : '새 그룹',
      sortOrder: (same[same.length - 1]?.sortOrder ?? (category === 'quantum' ? 0 : 9)) + 1,
    })
  }

  const Section = ({ title, accent, cat, list }: { title: string; accent: string; cat: PriceCategory; list: PriceGroup[] }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <span className={`inline-block h-5 w-1.5 rounded-full ${accent}`} />
          {title}
          <Badge variant="secondary" className="ml-1 font-normal">{list.length}</Badge>
        </h2>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => addGroup(cat)} className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> {lang === 'en' ? 'Add group' : '그룹 추가'}
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {q ? (lang === 'en' ? 'No matches' : '검색 결과 없음') : (lang === 'en' ? 'No groups yet' : '등록된 항목이 없습니다')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.map((g) => <GroupCard key={g.id} group={g} items={itemsByGroup.get(g.id) || []} canEdit={canEdit} />)}
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Tag className="h-6 w-6 text-primary" />
            {lang === 'en' ? 'Sales Price Guide' : '세일즈 가격안내'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === 'en'
              ? 'Quickly check service names and prices for sales inquiries. Lock a price to prevent accidental edits.'
              : '세일즈 문의 시 서비스명과 금액을 바로 확인하세요. 자물쇠를 잠그면 실수로 수정되지 않습니다.'}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'en' ? 'Search service / price…' : '서비스·금액 검색…'}
            className="pl-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <Section title={lang === 'en' ? 'Quantum Services' : '퀀텀 서비스'} accent="bg-primary" cat="quantum" list={quantum} />
          <Section title={lang === 'en' ? 'Partner Programs' : '파트너사 프로그램'} accent="bg-amber-500" cat="partner" list={partner} />
        </>
      )}
    </div>
  )
}
