import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, ArrowRight, Loader2, AlertTriangle } from 'lucide-react'
import { useLeads, useMergeLeads } from '@/hooks/useLeads'
import type { Lead } from '@/types'

/** 두 리드 중 '유지(survivor)' 결정: 더 이른 리드일자(=최초 유입) 우선, 동률이면 더 이른 생성시각. */
function pickSurvivor(a: Lead, b: Lead): { survivor: Lead; duplicate: Lead } {
  const ad = a.leadDate || '', bd = b.leadDate || ''
  if (ad !== bd) return ad < bd ? { survivor: a, duplicate: b } : { survivor: b, duplicate: a }
  return (a.createdAt || '') <= (b.createdAt || '') ? { survivor: a, duplicate: b } : { survivor: b, duplicate: a }
}

function leadLine(l: Lead) {
  return [l.studentName || l.parentName || '(이름없음)', l.phone, l.sourceChannel]
    .filter(Boolean)
    .join(' · ')
}

interface Props {
  sourceLead: Lead | null
  onClose: () => void
}

export function MergeLeadDialog({ sourceLead, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const mergeLeads = useMergeLeads()

  const q = search.trim()
  const { data: candidates = [], isLoading } = useLeads(q ? { search: q } : undefined)

  const open = !!sourceLead
  const results = q && sourceLead
    ? candidates.filter((l) => l.id !== sourceLead.id).slice(0, 8)
    : []

  const plan = sourceLead && selected ? pickSurvivor(sourceLead, selected) : null

  const handleClose = () => {
    setSearch('')
    setSelected(null)
    onClose()
  }

  const handleMerge = () => {
    if (!plan) return
    mergeLeads.mutate(
      { survivorId: plan.survivor.id, duplicateId: plan.duplicate.id },
      {
        onSuccess: handleClose,
        onError: (e: unknown) =>
          alert(e instanceof Error ? e.message : '병합에 실패했습니다.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>중복 리드 병합</DialogTitle>
          <DialogDescription>
            {sourceLead ? `'${sourceLead.studentName || sourceLead.parentName}' 리드와 합칠 중복 리드를 선택하세요.` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* 기준 리드 */}
        {sourceLead && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-xs text-muted-foreground">기준 리드</span>
            <div className="font-medium">{leadLine(sourceLead)}</div>
            <div className="text-xs text-muted-foreground">리드일자 {sourceLead.leadDate || '-'}</div>
          </div>
        )}

        {/* 중복 리드 검색 */}
        {!selected && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="이름·연락처로 중복 리드 검색"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {isLoading && q ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> 검색 중…
                </div>
              ) : !q ? (
                <div className="py-6 text-center text-sm text-muted-foreground">이름이나 연락처를 입력하세요.</div>
              ) : results.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">일치하는 다른 리드가 없습니다.</div>
              ) : (
                results.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelected(l)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <div className="font-medium">{l.studentName || l.parentName || '(이름없음)'}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.phone} · {l.sourceChannel || '(유입채널 없음)'} · {l.leadDate || '-'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* 미리보기 (유지 / 합침) */}
        {plan && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
                <div className="text-[11px] font-semibold text-emerald-600">유지 (최초 유입)</div>
                <div className="font-medium">{leadLine(plan.survivor)}</div>
                <div className="text-xs text-muted-foreground">{plan.survivor.leadDate || '-'}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                <div className="text-[11px] font-semibold text-destructive">합쳐져 삭제</div>
                <div className="font-medium">{leadLine(plan.duplicate)}</div>
                <div className="text-xs text-muted-foreground">{plan.duplicate.leadDate || '-'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>
                합쳐지는 리드의 미팅·계약·세미나 출석·활동이 유지 리드로 이동하고, 잃는 유입채널은 메모에 보존됩니다.
                이 작업은 <b className="text-foreground">되돌릴 수 없습니다.</b>
              </span>
            </div>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelected(null)}>
              ← 다른 리드 선택
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mergeLeads.isPending}>
            취소
          </Button>
          <Button onClick={handleMerge} disabled={!plan || mergeLeads.isPending}>
            {mergeLeads.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            병합하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
