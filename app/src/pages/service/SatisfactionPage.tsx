import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, ExternalLink, Loader2, Plus, RefreshCw, Settings2, Star, Trash2, Users } from 'lucide-react'
import { useCanEdit } from '@/hooks/usePermissions'
import { extractSpreadsheetId } from '@/lib/satisfaction'
import {
  useSatisfactionSources, useSatisfactionResponses, useSaveSatisfactionSource,
  useDeleteSatisfactionSource, useSyncSatisfaction, useRemapSatisfaction,
  useConsultantSatisfaction, useResponseColumns,
  type SatisfactionSource,
} from '@/hooks/useSatisfaction'

const ROUTE = '/service/satisfaction'

export function SatisfactionPage() {
  const canEdit = useCanEdit(ROUTE)
  const { data: sources = [], isLoading } = useSatisfactionSources()
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const selected = useMemo(
    () => sources.find(s => s.id === selectedId) || sources[0],
    [sources, selectedId],
  )
  const { data: responses = [] } = useSatisfactionResponses(selected?.id)
  const byConsultant = useConsultantSatisfaction(selected, responses)
  const columns = useResponseColumns(responses)

  const sync = useSyncSatisfaction()
  const [syncMsg, setSyncMsg] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editing, setEditing] = useState<SatisfactionSource | undefined>()

  const totalResponses = responses.length
  const overall = useMemo(() => {
    const s = responses.map(r => r.avgScore).filter((n): n is number => n != null)
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
  }, [responses])

  const runSync = async () => {
    setSyncMsg('')
    try {
      const res = await sync.mutateAsync(selected?.id)
      const failed = res.results.filter(r => r.error)
      setSyncMsg(
        failed.length
          ? `일부 실패: ${failed.map(f => `${f.source} — ${f.error}`).join(' / ')}`
          : `동기화 완료 · 새 응답 ${res.inserted}건`,
      )
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">서비스 만족도</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            익명 설문 결과를 컨설턴트별로 집계합니다. 응답 원본은 관리자만 볼 수 있습니다.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(undefined); setSettingsOpen(true) }}>
              <Plus className="size-4 mr-1" />설문 추가
            </Button>
            {selected && (
              <>
                <Button variant="outline" size="sm" onClick={() => { setEditing(selected); setSettingsOpen(true) }}>
                  <Settings2 className="size-4 mr-1" />설정·컬럼 지정
                </Button>
                <Button size="sm" disabled={sync.isPending} onClick={runSync}>
                  {sync.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
                  지금 동기화
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {sources.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sources.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                s.id === selected?.id ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/50'
              }`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {syncMsg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${
          syncMsg.startsWith('동기화 완료') ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <span className="whitespace-pre-wrap">{syncMsg}</span>
        </div>
      )}

      {selected?.lastSyncError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">마지막 동기화 오류: {selected.lastSyncError}</span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}

      {!isLoading && sources.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          등록된 설문이 없습니다. {canEdit ? "'설문 추가'로 구글 시트를 연결하세요." : '관리자에게 문의하세요.'}
        </CardContent></Card>
      )}

      {selected && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="응답 수" value={`${totalResponses}건`} icon={<Users className="size-4 text-primary" />} />
            <StatCard label="전체 평균"
              value={overall != null ? `${overall.toFixed(2)} / ${selected.scoreMax}` : '—'}
              icon={<Star className="size-4 text-amber-500" />} />
            <StatCard label="100점 환산"
              value={overall != null ? `${((overall / selected.scoreMax) * 100).toFixed(1)}점` : '—'} />
            <StatCard label="마지막 동기화"
              value={selected.lastSyncedAt ? new Date(selected.lastSyncedAt).toLocaleString('ko-KR') : '—'} />
          </div>

          {!selected.columnMap.consultant && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              컨설턴트 칸이 아직 지정되지 않았습니다. <b>설정·컬럼 지정</b>에서 어느 문항이 담당 컨설턴트인지 골라주세요.
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">컨설턴트별 만족도</CardTitle></CardHeader>
            <CardContent>
              {byConsultant.length === 0 ? (
                <p className="text-sm text-muted-foreground">집계할 응답이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {byConsultant.map(c => (
                    <div key={c.name} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline" className="text-[10px]">응답 {c.responses}건</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold tabular-nums">
                            {c.avgScore != null ? c.avgScore.toFixed(2) : '—'}
                            <span className="text-muted-foreground font-normal"> / {selected.scoreMax}</span>
                          </span>
                          {c.percent != null && (
                            <span className="text-xs text-muted-foreground tabular-nums">({c.percent.toFixed(1)}점)</span>
                          )}
                        </div>
                      </div>
                      {c.percent != null && (
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, c.percent))}%` }} />
                        </div>
                      )}
                      {c.commentsHidden && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          응답이 {selected.minResponsesToShowComments}건 미만이라 개별 의견을 가렸습니다(익명성 보호).
                        </p>
                      )}
                      {c.comments.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {c.comments.map((txt, i) => (
                            <li key={i} className="text-xs text-muted-foreground border-l-2 border-muted pl-2 whitespace-pre-wrap">
                              {txt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {canEdit && (
        <SourceDialog
          // 열 때마다 새로 마운트해 초기값으로 시작한다(effect 안에서 setState 하지 않도록).
          key={`${editing?.id ?? 'new'}-${settingsOpen}`}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          source={editing}
          columns={columns}
          responseCount={editing ? responses.length : 0}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  )
}

function SourceDialog({ open, onOpenChange, source, columns, responseCount }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  source?: SatisfactionSource
  columns: string[]
  responseCount: number
}) {
  const save = useSaveSatisfactionSource()
  const del = useDeleteSatisfactionSource()
  const remap = useRemapSatisfaction()
  const { data: responses = [] } = useSatisfactionResponses(source?.id)

  const [form, setForm] = useState(() => ({
    name: source?.name || '',
    spreadsheetId: source?.spreadsheetId || '',
    sheetTab: source?.sheetTab || '',
    formUrl: source?.formUrl || '',
    scoreMax: String(source?.scoreMax ?? 5),
    minComments: String(source?.minResponsesToShowComments ?? 3),
    consultant: source?.columnMap?.consultant || '',
    timestamp: source?.columnMap?.timestamp || '',
    scores: source?.columnMap?.scores || [],
    comments: source?.columnMap?.comments || [],
  }))
  const [err, setErr] = useState('')

  const toggle = (key: 'scores' | 'comments', col: string) =>
    setForm(f => ({ ...f, [key]: f[key].includes(col) ? f[key].filter(c => c !== col) : [...f[key], col] }))

  const submit = async () => {
    setErr('')
    if (!form.name.trim()) { setErr('설문 이름을 입력하세요.'); return }
    const sid = extractSpreadsheetId(form.spreadsheetId)
    if (!sid) { setErr('구글 시트 링크 또는 ID를 입력하세요.'); return }
    try {
      const id = await save.mutateAsync({
        id: source?.id,
        name: form.name.trim(),
        spreadsheetId: sid,
        sheetTab: form.sheetTab.trim() || undefined,
        formUrl: form.formUrl.trim() || undefined,
        scoreMax: Number(form.scoreMax) || 5,
        minResponsesToShowComments: Number(form.minComments) || 0,
        active: true,
        columnMap: {
          consultant: form.consultant || undefined,
          timestamp: form.timestamp || undefined,
          scores: form.scores.length ? form.scores : undefined,
          comments: form.comments.length ? form.comments : undefined,
        },
      })
      // 매핑이 바뀌면 이미 저장된 응답의 집계 칸도 다시 채운다.
      if (source?.id === id && responses.length) {
        await remap.mutateAsync({
          source: {
            ...source,
            scoreMax: Number(form.scoreMax) || 5,
            columnMap: {
              consultant: form.consultant || undefined,
              timestamp: form.timestamp || undefined,
              scores: form.scores, comments: form.comments,
            },
          },
          responses,
        })
      }
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const busy = save.isPending || remap.isPending || del.isPending

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{source ? '설문 설정' : '설문 추가'}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">설문 이름</Label>
            <Input className="h-9 mt-1" value={form.name} placeholder="2026 상반기 서비스 만족도"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">응답 시트 링크 또는 ID</Label>
            <Input className="h-9 mt-1" value={form.spreadsheetId} placeholder="https://docs.google.com/spreadsheets/d/..."
              onChange={e => setForm(f => ({ ...f, spreadsheetId: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground mt-1">
              시트를 공개할 필요 없습니다. 서비스 계정 이메일에 '뷰어'로 공유만 하세요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">탭 이름 (비우면 첫 번째 탭)</Label>
              <Input className="h-9 mt-1" value={form.sheetTab}
                onChange={e => setForm(f => ({ ...f, sheetTab: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">점수 만점</Label>
              <Input className="h-9 mt-1" type="number" value={form.scoreMax}
                onChange={e => setForm(f => ({ ...f, scoreMax: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label className="text-xs">폼 링크 (선택 · 공유용)</Label>
            <Input className="h-9 mt-1" value={form.formUrl}
              onChange={e => setForm(f => ({ ...f, formUrl: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">개별 의견을 보여줄 최소 응답 수</Label>
            <Input className="h-9 mt-1" type="number" value={form.minComments}
              onChange={e => setForm(f => ({ ...f, minComments: e.target.value }))} />
            <p className="text-[11px] text-muted-foreground mt-1">
              이 수보다 응답이 적으면 개별 의견을 가립니다. 응답자가 누구인지 드러나지 않게 하기 위함입니다.
            </p>
          </div>

          <div className="rounded-lg border border-input p-3 space-y-3">
            <div className="text-xs font-medium">컬럼 지정</div>
            {columns.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                먼저 '지금 동기화'를 실행하면 시트의 문항이 여기 나타납니다. 그 뒤 어느 문항이 무엇인지 고르세요.
              </p>
            ) : (
              <>
                <div>
                  <Label className="text-xs">담당 컨설턴트 문항</Label>
                  <select value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))}
                    className="h-9 w-full mt-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="">— 선택 —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">응답일시 문항</Label>
                  <select value={form.timestamp} onChange={e => setForm(f => ({ ...f, timestamp: e.target.value }))}
                    className="h-9 w-full mt-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                    <option value="">— 선택 —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <ColumnPicker label="점수 문항 (여러 개 선택 가능 · 평균을 냅니다)"
                  columns={columns} selected={form.scores} onToggle={c => toggle('scores', c)} />
                <ColumnPicker label="자유 의견 문항"
                  columns={columns} selected={form.comments} onToggle={c => toggle('comments', c)} />
                {source && responseCount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    저장하면 이미 받아온 {responseCount}건의 집계도 새 지정대로 다시 계산합니다.
                  </p>
                )}
              </>
            )}
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{err}</span>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <div>
            {source && (
              <Button variant="outline" size="sm" disabled={busy}
                onClick={async () => {
                  if (!confirm('이 설문과 받아온 응답을 모두 삭제할까요?')) return
                  await del.mutateAsync(source.id)
                  onOpenChange(false)
                }}>
                <Trash2 className="size-4 mr-1 text-red-600" />삭제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {form.formUrl && (
              <a href={form.formUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center h-8 px-3 rounded-lg border border-input text-sm hover:bg-muted/50 transition-colors">
                <ExternalLink className="size-4 mr-1" />폼 열기
              </a>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>취소</Button>
            <Button size="sm" disabled={busy} onClick={submit}>
              {busy && <Loader2 className="size-4 mr-1 animate-spin" />}저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ColumnPicker({ label, columns, selected, onToggle }: {
  label: string; columns: string[]; selected: string[]; onToggle: (c: string) => void
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {columns.map(c => (
          <button key={c} type="button" onClick={() => onToggle(c)}
            className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
              selected.includes(c) ? 'border-primary bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
            }`}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
