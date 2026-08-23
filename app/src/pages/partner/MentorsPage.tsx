import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Trash2, Lock, Users, GraduationCap } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import { PhoneInput } from '@/components/PhoneInput'
import {
  useMentors, useUpsertMentor, useDeleteMentor,
  MAJOR_TIERS, majorTierLabel, majorTierAmount, COACHING_MONTHLY,
  type Mentor, type MentorType, type MajorTier,
} from '@/hooks/useMentors'

const wonFmt = (n: number) => `₩${n.toLocaleString('ko-KR')}`

export function MentorsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level' || user?.role === 'account'
  const canEdit = isAdmin && useCanEdit(useLocation().pathname)

  const { data: mentors = [], isLoading } = useMentors()
  const [editing, setEditing] = useState<Mentor | null>(null)
  const [addType, setAddType] = useState<MentorType | null>(null)

  const coaching = useMemo(() => mentors.filter(m => m.type === 'coaching'), [mentors])
  const major = useMemo(() => mentors.filter(m => m.type === 'major'), [mentors])

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">멘토 관리는 관리자만 사용할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Mentor Support 관리</h1>
        <p className="text-sm text-muted-foreground">
          학습코칭 멘토(월 지급)와 전공별 멘토(회당 지급) 풀을 관리합니다. 여기서 추가한 멘토는 Student360의 <b>Mentor Support</b> 드롭다운에 자동 반영됩니다.
        </p>
      </div>

      {/* ── 학습코칭 멘토 ── */}
      <MentorTable
        title="학습코칭 멘토 관리"
        desc={`월 지급 · 배정 학생 1인당 매월 ${wonFmt(COACHING_MONTHLY)}`}
        icon={<Users className="size-5 text-emerald-600" />}
        mentors={coaching}
        isMajor={false}
        isLoading={isLoading}
        canEdit={canEdit}
        onAdd={() => setAddType('coaching')}
        onEdit={setEditing}
      />

      {/* ── 전공별 멘토 ── */}
      <MentorTable
        title="전공별 멘토 관리"
        desc="회당 지급 · 등급별 단가 (대학생 5만 · 5년이하 7만 · 5년이상 10만)"
        icon={<GraduationCap className="size-5 text-indigo-600" />}
        mentors={major}
        isMajor
        isLoading={isLoading}
        canEdit={canEdit}
        onAdd={() => setAddType('major')}
        onEdit={setEditing}
      />

      {(addType || editing) && (
        <MentorDialog
          mentor={editing}
          defaultType={editing?.type || addType || 'coaching'}
          canEdit={canEdit}
          onClose={() => { setAddType(null); setEditing(null) }}
        />
      )}
    </div>
  )
}

function MentorTable({ title, desc, icon, mentors, isMajor, isLoading, canEdit, onAdd, onEdit }: {
  title: string
  desc: string
  icon: React.ReactNode
  mentors: Mentor[]
  isMajor: boolean
  isLoading: boolean
  canEdit: boolean
  onAdd: () => void
  onEdit: (m: Mentor) => void
}) {
  const del = useDeleteMentor()
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">{icon}{title}<span className="text-muted-foreground font-normal text-sm">({mentors.length})</span></h2>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
        {canEdit && <Button size="sm" onClick={onAdd}><Plus className="size-4 mr-1" /> 멘토 추가</Button>}
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : mentors.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">등록된 멘토가 없습니다. "멘토 추가"로 등록하세요.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">이름</TableHead>
                  {isMajor && <TableHead className="w-40">등급 · 회당 단가</TableHead>}
                  <TableHead className="w-20">출생연도</TableHead>
                  <TableHead className="w-40">재학중 학교</TableHead>
                  <TableHead className="w-32">전공</TableHead>
                  <TableHead>멘토링 가능 과목</TableHead>
                  <TableHead className="w-44">연락처</TableHead>
                  <TableHead className="w-20 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mentors.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {isMajor ? <GraduationCap className="size-4 text-indigo-500 shrink-0" /> : <Users className="size-4 text-emerald-500 shrink-0" />}
                        <span>{[m.koreanName, m.englishName].filter(Boolean).join(' · ') || '-'}</span>
                      </div>
                    </TableCell>
                    {isMajor && (
                      <TableCell className="text-sm">
                        {m.tier ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-medium">{majorTierLabel(m.tier)}</span>
                            <span className="text-indigo-600 tabular-nums">{wonFmt(majorTierAmount(m.tier))}</span>
                          </span>
                        ) : <span className="text-muted-foreground">등급 미지정</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-sm tabular-nums">{m.birthYear || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">{m.school || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">{m.major || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="max-w-[280px] whitespace-pre-wrap">{m.subjects || '-'}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.phone && <div>{m.phone}</div>}
                      {m.email && <div className="truncate max-w-[180px]" title={m.email}>{m.email}</div>}
                      {!m.phone && !m.email && '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-emerald-600" title="수정" onClick={() => onEdit(m)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600" title="삭제"
                              onClick={() => { if (confirm(`'${m.koreanName || m.englishName || ''}' 멘토를 삭제할까요?`)) del.mutate(m.id) }}>
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MentorDialog({ mentor, defaultType, canEdit, onClose }: { mentor: Mentor | null; defaultType: MentorType; canEdit: boolean; onClose: () => void }) {
  const upsert = useUpsertMentor()
  const [f, setF] = useState({
    type: (mentor?.type || defaultType) as MentorType,
    tier: (mentor?.tier || 'college') as MajorTier,
    koreanName: mentor?.koreanName || '',
    englishName: mentor?.englishName || '',
    birthYear: mentor?.birthYear ? String(mentor.birthYear) : '',
    school: mentor?.school || '',
    major: mentor?.major || '',
    phone: mentor?.phone || '',
    email: mentor?.email || '',
    subjects: mentor?.subjects || '',
    notes: mentor?.notes || '',
  })
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))
  const isMajor = f.type === 'major'
  const canSave = canEdit && (f.koreanName.trim() || f.englishName.trim()) && (!isMajor || !!f.tier) && !upsert.isPending

  const handleSave = () => {
    if (!canSave) return
    upsert.mutate(
      {
        id: mentor?.id,
        type: f.type,
        tier: isMajor ? f.tier : undefined,
        koreanName: f.koreanName.trim() || undefined,
        englishName: f.englishName.trim() || undefined,
        birthYear: f.birthYear ? Number(f.birthYear) : undefined,
        school: f.school.trim() || undefined,
        major: f.major.trim() || undefined,
        phone: f.phone.trim() || undefined,
        email: f.email.trim() || undefined,
        subjects: f.subjects.trim() || undefined,
        notes: f.notes.trim() || undefined,
      },
      { onSuccess: onClose, onError: (e: unknown) => alert(`저장에 실패했습니다.\n${(e as Error)?.message || ''}`) },
    )
  }

  const title = `${isMajor ? '전공별' : '학습코칭'} 멘토 ${mentor ? '수정' : '추가'}`

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isMajor && (
            <div className="space-y-1">
              <Label className="text-xs">등급 (회당 단가)</Label>
              <select value={f.tier} onChange={e => set('tier', e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                {MAJOR_TIERS.map(t => <option key={t.key} value={t.key}>{t.label} · {wonFmt(t.amount)}/회</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">한국이름</Label>
              <Input value={f.koreanName} onChange={e => set('koreanName', e.target.value)} placeholder="예: 김지성" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">영문이름</Label>
              <Input value={f.englishName} onChange={e => set('englishName', e.target.value)} placeholder="예: Jisung Kim" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">출생연도</Label>
              <Input type="number" value={f.birthYear} onChange={e => set('birthYear', e.target.value)} placeholder="예: 2004" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">재학중 학교</Label>
              <Input value={f.school} onChange={e => set('school', e.target.value)} placeholder="예: UCSD" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">전공</Label>
              <Input value={f.major} onChange={e => set('major', e.target.value)} placeholder="예: Computer Science" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">전화번호</Label>
              <PhoneInput value={f.phone} onChange={v => set('phone', v)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">이메일주소 <span className="text-muted-foreground font-normal">(멘토 로그인 계정과 동일하게 — Mentor Support 접근 매칭)</span></Label>
            <Input type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="mentor@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">멘토링 가능한 과목/분야</Label>
            <Textarea value={f.subjects} onChange={e => set('subjects', e.target.value)} rows={3}
              placeholder="예: AP Calculus BC · Statistics · Research · Chem" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">특이사항 (선택)</Label>
            <Textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="배치 코멘트 등" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={upsert.isPending}>취소</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
