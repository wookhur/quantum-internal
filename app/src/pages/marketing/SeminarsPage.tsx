import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Loader2,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
  X,
} from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import {
  useSeminars,
  useCreateSeminar,
  useUpdateSeminar,
  useDeleteSeminar,
  useSeminarRegistrations,
  useDeleteRegistration,
  type Seminar,
  type SeminarSession,
} from '@/hooks/useSeminars'

function formatSeminarDate(raw: string): string {
  const [datePart, timePart] = raw.split(' ')
  if (!datePart) return raw
  const [y, m, d] = datePart.split('-')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const dayName = days[dt.getDay()]
  const base = `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 (${dayName})`
  return timePart ? `${base} ${timePart}` : base
}

/** Small editor for the multi-session list. Add / remove / edit rows in place. */
function SessionsEditor({
  sessions,
  onChange,
}: {
  sessions: SeminarSession[]
  onChange: (next: SeminarSession[]) => void
}) {
  const update = (idx: number, patch: Partial<SeminarSession>) => {
    onChange(sessions.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  const add = () => onChange([...sessions, { label: '', datetime: '' }])
  const remove = (idx: number) => onChange(sessions.filter((_, i) => i !== idx))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>세션 일정 (여러 개 등록 가능)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-3 mr-1" /> 세션 추가
        </Button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          세션을 추가하지 않으면 위의 단일 날짜/시간이 그대로 사용됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <Input
                  value={s.label}
                  onChange={e => update(i, { label: e.target.value })}
                  placeholder="예: 7/18 (토) Natural Science: Bio, Chem, Physics 등"
                />
                <input
                  type="datetime-local"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={s.datetime || ''}
                  onChange={e => update(i, { datetime: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label="세션 삭제"
              >
                <X className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CopyLinkButton({ seminarId }: { seminarId: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/seminar/${seminarId}`
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      <Copy className="size-4 mr-1" />
      {copied ? '복사됨' : '링크 복사'}
    </Button>
  )
}

function RegistrationsPanel({ seminar }: { seminar: Seminar }) {
  const { data: regs = [], isLoading } = useSeminarRegistrations(seminar.id)
  const deleteMut = useDeleteRegistration()

  const exportCsv = () => {
    const headers = ['신청일', '학부모', '연락처', '이메일', '학생', '학년', '학교', '관심사항', '메모', '신청 세션']
    const rows = regs.map(r => [
      new Date(r.createdAt).toLocaleDateString('ko-KR'),
      r.parentName,
      r.phone,
      r.email || '',
      r.studentName,
      r.grade || '',
      r.school || '',
      r.interest || '',
      r.memo || '',
      r.sessionLabels.join(' / '),
    ])
    const bom = '﻿'
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${seminar.title}_registrations.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (isLoading) return <Loader2 className="size-4 animate-spin mx-auto my-4" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">신청자 목록 ({regs.length}명)</p>
        {regs.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4 mr-1" /> CSV 다운로드
          </Button>
        )}
      </div>
      {regs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">아직 신청자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>신청일</TableHead>
                <TableHead>학부모</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>학생</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>학교</TableHead>
                <TableHead>관심사항</TableHead>
                <TableHead>메모</TableHead>
                <TableHead>신청 세션</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell>{r.parentName}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell>{r.email || '-'}</TableCell>
                  <TableCell>{r.studentName}</TableCell>
                  <TableCell>{r.grade || '-'}</TableCell>
                  <TableCell>{r.school || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.interest || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.memo || '-'}</TableCell>
                  <TableCell className="max-w-[200px]">
                    {r.sessionLabels.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="space-y-0.5">
                        {r.sessionLabels.map((l, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{l}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('이 신청을 삭제하시겠습니까?')) deleteMut.mutate(r.id)
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function SeminarsPage() {
  const { t } = useLanguage()
  const { data: seminars = [], isLoading } = useSeminars()
  const createMut = useCreateSeminar()
  const updateMut = useUpdateSeminar()
  const deleteMut = useDeleteSeminar()

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Seminar | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    maxCapacity: '',
    sessions: [] as SeminarSession[],
  })

  const [error, setError] = useState<string | null>(null)

  const resetForm = () => setForm({
    title: '', description: '', date: '', time: '', location: '', maxCapacity: '', sessions: [],
  })

  const openEdit = (s: Seminar) => {
    const [d, tm] = (s.date || ' ').split(' ')
    setEditing(s)
    setForm({
      title: s.title,
      description: s.description || '',
      date: d || '',
      time: tm || '',
      location: s.location || '',
      maxCapacity: s.maxCapacity ? String(s.maxCapacity) : '',
      sessions: s.sessions,
    })
    setError(null)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setError(null)
    try {
      const dateStr = form.date && form.time
        ? `${form.date} ${form.time}`
        : form.date || null
      await createMut.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: dateStr,
        location: form.location.trim() || null,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
        sessions: form.sessions.filter(s => s.label.trim()),
      })
      resetForm()
      setShowCreate(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '세미나 생성에 실패했습니다.')
    }
  }

  const handleUpdate = async () => {
    if (!editing || !form.title.trim()) return
    setError(null)
    try {
      const dateStr = form.date && form.time
        ? `${form.date} ${form.time}`
        : form.date || null
      await updateMut.mutateAsync({
        id: editing.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: dateStr,
        location: form.location.trim() || null,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
        sessions: form.sessions.filter(s => s.label.trim()),
      })
      resetForm()
      setEditing(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '세미나 수정에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.seminars')}</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" /> 새 세미나
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : seminars.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 등록된 세미나가 없습니다. 새 세미나를 만들어보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {seminars.map(s => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {s.title}
                      <Badge variant={s.active ? 'default' : 'secondary'}>
                        {s.active ? '모집중' : '마감'}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {s.sessions.length === 0 && s.date && <span>{formatSeminarDate(s.date)}</span>}
                      {s.location && <span>{s.location}</span>}
                      {s.maxCapacity && <span>정원 {s.maxCapacity}명</span>}
                      {s.sessions.length > 0 && (
                        <span>세션 {s.sessions.length}개</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyLinkButton seminarId={s.id} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="size-4 mr-1" /> 수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMut.mutate({ id: s.id, active: !s.active })}
                    >
                      {s.active ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />}
                      {s.active ? '마감' : '열기'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('이 세미나를 삭제하시겠습니까?')) deleteMut.mutate(s.id)
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {s.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.description}</p>
                )}
                {s.sessions.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm text-gray-700">
                    {s.sessions.map((ss, i) => (
                      <li key={i} className="pl-3 border-l-2 border-indigo-200">{ss.label}</li>
                    ))}
                  </ul>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                >
                  {expandedId === s.id ? (
                    <><ChevronUp className="size-4 mr-1" /> 신청자 숨기기</>
                  ) : (
                    <><ChevronDown className="size-4 mr-1" /> 신청자 보기</>
                  )}
                </Button>
                {expandedId === s.id && <RegistrationsPanel seminar={s} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 세미나 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>세미나 제목 *</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="2026 여름 미국 대학 입시 세미나"
              />
            </div>
            <div>
              <Label>설명</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="세미나 소개 및 안내사항"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>날짜</Label>
                <input
                  type="date"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <Label>시간</Label>
                <input
                  type="time"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div>
                <Label>장소</Label>
                <Input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="퀀텀어드미션즈 세미나실"
                />
              </div>
            </div>
            <div>
              <Label>정원 (선택)</Label>
              <Input
                type="number"
                value={form.maxCapacity}
                onChange={e => setForm({ ...form, maxCapacity: e.target.value })}
                placeholder="50"
              />
            </div>
            <SessionsEditor
              sessions={form.sessions}
              onChange={sessions => setForm({ ...form, sessions })}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowCreate(false) }}>취소</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending || !form.title.trim()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); resetForm() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>세미나 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>세미나 제목 *</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>설명</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>대표 날짜 (세션 없을 때만 표시)</Label>
                <input
                  type="date"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <Label>시간</Label>
                <input
                  type="time"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div>
                <Label>장소</Label>
                <Input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>정원 (선택)</Label>
              <Input
                type="number"
                value={form.maxCapacity}
                onChange={e => setForm({ ...form, maxCapacity: e.target.value })}
              />
            </div>
            <SessionsEditor
              sessions={form.sessions}
              onChange={sessions => setForm({ ...form, sessions })}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); resetForm() }}>취소</Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending || !form.title.trim()}>
              {updateMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
