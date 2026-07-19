import { useState, useMemo, useRef } from 'react'
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
  ArrowDownUp,
  Upload,
} from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import {
  useSeminars,
  useCreateSeminar,
  useUpdateSeminar,
  useDeleteSeminar,
  useSeminarRegistrations,
  useDeleteRegistration,
  useUpdateRegistrationSessions,
  useUpdateRegistrationAttended,
  useBulkImportRegistrations,
  sortSeminarSessions,
  type Seminar,
  type SeminarSession,
  type ImportRegistrationRow,
} from '@/hooks/useSeminars'
import { useAllLeadAttendance } from '@/hooks/useLeadAttendance'
import { useLeads } from '@/hooks/useLeads'
import { normalizePhone, normalizeEmail, normalizeName, useSeminarsWithRegistrations } from '@/hooks/useSeminarPerformance'

/** Parse CSV text into rows, honoring quoted fields with commas/newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Detect column indices from a header row by keyword. */
function detectColumns(header: string[]): Record<string, number> {
  const find = (re: RegExp) => header.findIndex(h => re.test((h || '').trim()))
  return {
    parentName: find(/부모|parent/i),
    studentName: find(/학생|student/i),
    email: find(/이메일|email/i),
    phone: find(/연락처|전화|phone/i),
    school: find(/학교|school/i),
    grade: find(/학년|grade|year/i),
    attended: find(/참석\s*인원|attend/i),
  }
}

function CsvImportDialog() {
  const { data: seminars = [] } = useSeminars()
  const createSeminar = useCreateSeminar()
  const bulkImport = useBulkImportRegistrations()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ImportRegistrationRow[]>([])
  const [fileName, setFileName] = useState('')
  const [target, setTarget] = useState<string>('new') // 'new' | seminarId
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const reset = () => { setRows([]); setFileName(''); setTarget('new'); setNewName(''); setErr(null); setDone(null) }

  const handleFile = async (file: File) => {
    setErr(null); setDone(null)
    try {
      const text = await file.text()
      const all = parseCsv(text)
      // Header = first row containing a parent/student column
      const headerIdx = all.findIndex(r => r.some(c => /부모|parent/i.test(c)) && r.some(c => /학생|student/i.test(c)))
      if (headerIdx < 0) { setErr('헤더 행을 찾지 못했습니다. (부모님/학생 컬럼 필요)'); return }
      const cols = detectColumns(all[headerIdx])
      if (cols.parentName < 0 && cols.studentName < 0) { setErr('부모님/학생 이름 컬럼을 찾지 못했습니다.'); return }
      const out: ImportRegistrationRow[] = []
      for (let i = headerIdx + 1; i < all.length; i++) {
        const r = all[i]
        const g = (idx: number) => (idx >= 0 ? (r[idx] || '').trim() : '')
        const parentName = g(cols.parentName)
        const studentName = g(cols.studentName)
        const phone = g(cols.phone)
        if (!parentName && !studentName && !phone) continue // skip empty rows
        const attendedRaw = g(cols.attended)
        const attendedNum = parseInt(attendedRaw.replace(/[^\d]/g, ''), 10)
        out.push({
          parentName, studentName,
          email: g(cols.email) || null,
          phone: phone || null,
          school: g(cols.school) || null,
          grade: g(cols.grade) || null,
          attended: !Number.isNaN(attendedNum) && attendedNum > 0,
        })
      }
      if (out.length === 0) { setErr('가져올 데이터 행이 없습니다.'); return }
      setRows(out)
      setFileName(file.name)
      if (!newName) setNewName(file.name.replace(/\.csv$/i, '').replace(/\s*\(Responses\).*/i, '').trim())
    } catch (e) {
      setErr((e as Error).message || 'CSV 파싱 실패')
    }
  }

  const doImport = async () => {
    setBusy(true); setErr(null)
    try {
      let seminarId = target
      if (target === 'new') {
        if (!newName.trim()) { setErr('세미나 이름을 입력하세요.'); setBusy(false); return }
        const created = await createSeminar.mutateAsync({
          title: newName.trim(), description: null, date: null, location: null, maxCapacity: null, sessions: [],
        })
        seminarId = created.id
      }
      const n = await bulkImport.mutateAsync({ seminarId, rows })
      setDone(n)
    } catch (e) {
      setErr((e as Error).message || '가져오기 실패')
    } finally {
      setBusy(false)
    }
  }

  const attendedCount = rows.filter(r => r.attended).length

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download className="size-4 mr-2 rotate-180" /> CSV 가져오기
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>세미나 신청자 CSV 가져오기</DialogTitle></DialogHeader>
        {done !== null ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-emerald-700">{done}명 신청자를 가져왔습니다.</p>
            <p className="text-xs text-muted-foreground">참석 {rows.filter(r => r.attended).length}명 · 세미나 성과·고객카드에 자동 반영됩니다.</p>
            <Button onClick={() => { setOpen(false); reset() }}>닫기</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4 mr-2" /> CSV 파일 선택
              </Button>
              {fileName && <span className="ml-2 text-xs text-muted-foreground">{fileName}</span>}
              <p className="text-[11px] text-muted-foreground mt-1">부모님/학생/이메일/연락처/학교/학년/참석인원 컬럼을 자동 인식합니다. (참석인원 &gt; 0 → 참석)</p>
            </div>

            {rows.length > 0 && (
              <>
                <div className="rounded-lg border bg-muted/30 p-2 text-xs">
                  <span className="font-medium">{rows.length}명</span> 신청자 인식됨 · 참석 <span className="font-medium text-emerald-700">{attendedCount}명</span>
                </div>
                <div>
                  <Label className="text-xs">가져올 세미나</Label>
                  <select value={target} onChange={e => setTarget(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring">
                    <option value="new">＋ 새 세미나로 만들기</option>
                    {seminars.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
                {target === 'new' && (
                  <div>
                    <Label className="text-xs">새 세미나 이름</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: 선배 초청 세미나" />
                  </div>
                )}
              </>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); reset() }}>취소</Button>
              <Button onClick={doImport} disabled={busy || rows.length === 0 || (target === 'new' && !newName.trim())}>
                {busy && <Loader2 className="size-4 animate-spin mr-1" />} 가져오기
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

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
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= sessions.length) return
    const next = [...sessions]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }
  // 날짜·시간순 정렬 (datetime 우선, 없으면 라벨의 M/D를 읽어 정렬).
  const sortByTime = () => onChange(sortSeminarSessions(sessions))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>세션 일정 (여러 개 등록 가능)</Label>
        <div className="flex gap-1.5">
          {sessions.length > 1 && (
            <Button type="button" variant="outline" size="sm" onClick={sortByTime}>
              <ArrowDownUp className="size-3 mr-1" /> 날짜·시간순 정렬
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="size-3 mr-1" /> 세션 추가
          </Button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          세션을 추가하지 않으면 위의 단일 날짜/시간이 그대로 사용됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex flex-col pt-1">
                <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">
                  <ChevronUp className="size-4 text-muted-foreground" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => move(i, 1)} disabled={i === sessions.length - 1} aria-label="아래로">
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              </div>
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
  const { data: allLeads = [] } = useLeads()
  const { data: leadAttendance = [] } = useAllLeadAttendance()
  const deleteMut = useDeleteRegistration()
  const updateSessions = useUpdateRegistrationSessions()
  const updateAttended = useUpdateRegistrationAttended()
  const [sessionFilter, setSessionFilter] = useState<string>('all')

  // Match keys (phone/email/name) of leads marked 참석완료 in cold-call for this seminar
  const coldAttendedKeys = useMemo(() => {
    const attendedLeadIds = new Set(
      leadAttendance.filter(a => a.seminarId === seminar.id && a.status === 'attended').map(a => a.leadId),
    )
    const phones = new Set<string>(), emails = new Set<string>(), names = new Set<string>()
    for (const l of allLeads) {
      if (!attendedLeadIds.has(l.id)) continue
      const p = normalizePhone(l.phone); if (p.length >= 9) phones.add(p)
      const e = normalizeEmail(l.email); if (e) emails.add(e)
      const n = normalizeName(l.parentName) + '|' + normalizeName(l.studentName); if (n !== '|') names.add(n)
    }
    return { phones, emails, names }
  }, [leadAttendance, allLeads, seminar.id])

  // A registration counts as attended if its own flag is set OR a matched lead
  // was marked 참석완료 in cold-call.
  const isAttended = (r: { attended: boolean; phone: string; email: string | null; parentName: string; studentName: string }) => {
    if (r.attended) return true
    const p = normalizePhone(r.phone); if (p.length >= 9 && coldAttendedKeys.phones.has(p)) return true
    const e = normalizeEmail(r.email); if (e && coldAttendedKeys.emails.has(e)) return true
    const n = normalizeName(r.parentName) + '|' + normalizeName(r.studentName); if (n !== '|' && coldAttendedKeys.names.has(n)) return true
    return false
  }
  const [editId, setEditId] = useState<string | null>(null)
  const [editLabels, setEditLabels] = useState<string[]>([])

  const startEdit = (id: string, labels: string[]) => { setEditId(id); setEditLabels(labels) }
  const toggleEditLabel = (label: string) =>
    setEditLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  const saveEdit = (id: string) =>
    updateSessions.mutate(
      { id, sessionLabels: editLabels },
      { onSuccess: () => setEditId(null), onError: (e) => alert((e as Error).message) },
    )

  const hasSessions = seminar.sessions.length > 1

  const filteredRegs = useMemo(() => {
    if (!hasSessions || sessionFilter === 'all') return regs
    return regs.filter(r => r.sessionLabels.includes(sessionFilter))
  }, [regs, sessionFilter, hasSessions])

  const sessionCounts = useMemo(() => {
    if (!hasSessions) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const s of seminar.sessions) {
      map.set(s.label, regs.filter(r => r.sessionLabels.includes(s.label)).length)
    }
    return map
  }, [regs, seminar.sessions, hasSessions])

  const exportCsv = () => {
    const headers = ['신청일', '학부모', '연락처', '이메일', '학생', '학년', '학교', '관심사항', '메모', '신청 세션']
    const rows = filteredRegs.map(r => [
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
    const suffix = sessionFilter !== 'all' ? `_${sessionFilter}` : ''
    a.download = `${seminar.title}${suffix}_registrations.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (isLoading) return <Loader2 className="size-4 animate-spin mx-auto my-4" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">신청자 목록 ({filteredRegs.length}명{hasSessions && sessionFilter !== 'all' ? ` / 전체 ${regs.length}명` : ''})</p>
        {regs.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4 mr-1" /> CSV 다운로드
          </Button>
        )}
      </div>
      {hasSessions && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={sessionFilter === 'all' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setSessionFilter('all')}
          >
            전체 ({regs.length})
          </Button>
          {seminar.sessions.map(s => (
            <Button
              key={s.label}
              size="sm"
              variant={sessionFilter === s.label ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setSessionFilter(s.label)}
            >
              {s.label} ({sessionCounts.get(s.label) || 0})
            </Button>
          ))}
        </div>
      )}
      {filteredRegs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{regs.length === 0 ? '아직 신청자가 없습니다.' : '해당 세션에 신청자가 없습니다.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>참석</TableHead>
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
              {filteredRegs.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    {(() => {
                      const attended = isAttended(r)
                      const fromCold = attended && !r.attended
                      return (
                        <button
                          onClick={() => updateAttended.mutate({ id: r.id, attended: !r.attended })}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${attended ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                          title={fromCold ? '콜드콜에서 참석완료로 표시됨' : '참석 여부 토글'}
                        >
                          {attended ? (fromCold ? '참석(콜드콜)' : '참석') : '미참석'}
                        </button>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell>{r.parentName}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell>{r.email || '-'}</TableCell>
                  <TableCell>{r.studentName}</TableCell>
                  <TableCell>{r.grade || '-'}</TableCell>
                  <TableCell>{r.school || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.interest || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.memo || '-'}</TableCell>
                  <TableCell className="min-w-[160px] max-w-[300px]">
                    {editId === r.id && hasSessions ? (
                      <div className="space-y-1">
                        <p className="text-[10px] text-amber-600 mb-1">한 부만 하려면 다른 부는 체크 해제하세요 (다중 선택 가능)</p>
                        {[
                          ...seminar.sessions.map(s => s.label),
                          ...editLabels.filter(l => !seminar.sessions.some(s => s.label === l)),
                        ].map((label, i) => {
                          const orphaned = !seminar.sessions.some(s => s.label === label)
                          return (
                            <label key={`${label}-${i}`} className="flex items-start gap-1.5 cursor-pointer text-[11px]">
                              <input
                                type="checkbox"
                                className="mt-0.5 size-3.5 accent-indigo-600"
                                checked={editLabels.includes(label)}
                                onChange={() => toggleEditLabel(label)}
                              />
                              <span className={`leading-snug ${orphaned ? 'text-muted-foreground line-through' : ''}`}>
                                {label}{orphaned ? ' (옛 라벨)' : ''}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    ) : r.sessionLabels.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.sessionLabels.map((l, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] max-w-[240px] truncate">{l}</Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editId === r.id ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(r.id)} disabled={updateSessions.isPending}>
                          {updateSessions.isPending ? <Loader2 className="size-3.5 animate-spin" /> : '저장'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>취소</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5">
                        {hasSessions && (
                          <Button variant="ghost" size="icon" onClick={() => startEdit(r.id, r.sessionLabels)} aria-label="세션 수정">
                            <Pencil className="size-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('이 신청을 삭제하시겠습니까?')) deleteMut.mutate(r.id)
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    )}
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
  const { data: attendance = [] } = useAllLeadAttendance()
  const { data: seminarsLite = [] } = useSeminarsWithRegistrations()
  const liteById = useMemo(() => new Map(seminarsLite.map(s => [s.id, s])), [seminarsLite])
  const attBySeminar = useMemo(() => {
    const m = new Map<string, { planned: number; unsure: number; no_contact: number; attended: number }>()
    for (const a of attendance) {
      const c = m.get(a.seminarId) || { planned: 0, unsure: 0, no_contact: 0, attended: 0 }
      c[a.status] = (c[a.status] || 0) + 1
      m.set(a.seminarId, c)
    }
    return m
  }, [attendance])
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
        <div className="flex items-center gap-2">
          <CsvImportDialog />
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-2" /> 새 세미나
          </Button>
        </div>
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
                {(() => {
                  const lite = liteById.get(s.id)
                  const c = attBySeminar.get(s.id)
                  const applicants = lite?.applicants ?? 0
                  const attended = Math.max(lite?.attendees ?? 0, c?.attended ?? 0)
                  return applicants > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-1 text-[11px]">
                      <span className="text-muted-foreground">참석 집계:</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">참석 {attended}</span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">총 신청 {applicants}</span>
                    </div>
                  ) : null
                })()}
                {(() => {
                  const c = attBySeminar.get(s.id)
                  return c && (c.planned + c.unsure + c.no_contact + c.attended) > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-2 text-[11px]">
                      <span className="text-muted-foreground">콜드콜 집계:</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">참석예정 {c.planned}</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">미정 {c.unsure}</span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">연락안됨 {c.no_contact}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">참석완료 {c.attended}</span>
                    </div>
                  ) : null
                })()}
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
