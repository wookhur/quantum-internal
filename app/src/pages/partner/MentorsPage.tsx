import { useState } from 'react'
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
import { Loader2, Plus, Pencil, Trash2, Lock, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCanEdit } from '@/hooks/usePermissions'
import { useMentors, useUpsertMentor, useDeleteMentor, type Mentor } from '@/hooks/useMentors'

export function MentorsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'c_level' || user?.role === 'account'
  const canEdit = isAdmin && useCanEdit(useLocation().pathname)

  const { data: mentors = [], isLoading } = useMentors()
  const del = useDeleteMentor()
  const [editing, setEditing] = useState<Mentor | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">학습코칭 멘토 관리</h1>
          <p className="text-sm text-muted-foreground">
            학습코칭 프로그램의 대학생 멘토 풀을 관리합니다. (한국이름·영문이름·출생연도·학교·전공·연락처·가능 과목)
          </p>
        </div>
        {canEdit && <Button onClick={() => setAddOpen(true)}><Plus className="size-4 mr-1" /> 멘토 추가</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : mentors.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">등록된 멘토가 없습니다. "멘토 추가"로 등록하세요.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">이름</TableHead>
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
                        <Users className="size-4 text-emerald-500 shrink-0" />
                        <span>{[m.koreanName, m.englishName].filter(Boolean).join(' · ') || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{m.birthYear || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">{m.school || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm">{m.major || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="max-w-[320px] whitespace-pre-wrap">{m.subjects || '-'}</div>
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
                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-emerald-600" title="수정" onClick={() => setEditing(m)}>
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

      {(addOpen || editing) && (
        <MentorDialog mentor={editing} canEdit={canEdit} onClose={() => { setAddOpen(false); setEditing(null) }} />
      )}
    </div>
  )
}

function MentorDialog({ mentor, canEdit, onClose }: { mentor: Mentor | null; canEdit: boolean; onClose: () => void }) {
  const upsert = useUpsertMentor()
  const [f, setF] = useState({
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
  const canSave = canEdit && (f.koreanName.trim() || f.englishName.trim()) && !upsert.isPending

  const handleSave = () => {
    if (!canSave) return
    upsert.mutate(
      {
        id: mentor?.id,
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{mentor ? '멘토 수정' : '멘토 추가'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
              <Input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="010-1234-5678" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">이메일주소</Label>
            <Input type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="mentor@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">멘토링 가능한 과목</Label>
            <Textarea value={f.subjects} onChange={e => set('subjects', e.target.value)} rows={3}
              placeholder="예: AP Calculus BC · Statistics · Micro · Macro · Psych · Research · Chem" />
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
