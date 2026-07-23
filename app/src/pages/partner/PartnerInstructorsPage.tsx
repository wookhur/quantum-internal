import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Trash2, GraduationCap, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import {
  FEATURE_MODULES, NAV_ROUTE_DEFS, ADMIN_ONLY_ROUTES,
} from '@/hooks/useProfiles'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { EC_PARTNERS } from '@/lib/ecPartners'
import { X } from 'lucide-react'
import {
  usePartnerInstructors, useUpsertPartnerInstructor, useDeletePartnerInstructor,
  type PartnerInstructor,
} from '@/hooks/usePartnerInstructors'
import { useCanEdit } from '@/hooks/usePermissions'

/** Selectable internal boards, grouped by section — excludes admin-only routes. */
const SELECTABLE_SECTIONS = FEATURE_MODULES
  .map(m => ({
    key: m.key,
    labelKey: m.labelKey,
    routes: NAV_ROUTE_DEFS.filter(r => r.module === m.key && !ADMIN_ONLY_ROUTES.includes(r.path)),
  }))
  .filter(s => s.routes.length > 0)

function isActiveStudent(status?: string): boolean {
  if (!status) return true
  return !/(pause|중단|중지|hold|ended|종료|해지|complete|완료|graduat|졸업|inactive|finish|cancel|취소)/i.test(status)
}

export function PartnerInstructorsPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canEditPerm = useCanEdit(useLocation().pathname)
  const canEdit = isAdmin && canEditPerm

  const { data: instructors = [], isLoading } = usePartnerInstructors()
  const { data: fees = [] } = useAllServiceProgramFees()
  const del = useDeletePartnerInstructor()

  const [editing, setEditing] = useState<PartnerInstructor | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const academyOptions = useMemo(() => {
    const s = new Set<string>()
    for (const p of EC_PARTNERS) s.add(p)
    for (const f of fees) if (f.label?.trim()) s.add(f.label.trim())
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [fees])

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">파트너 강사관리는 관리자만 사용할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">파트너 강사관리</h1>
          <p className="text-sm text-muted-foreground">
            외부 파트너사 강사 계정을 이메일로 등록하고 <b>소속학원 · 담당과목 · 특이사항 · 접근가능권한</b>을 설정합니다.
          </p>
        </div>
        {canEdit && <Button onClick={() => setAddOpen(true)}><Plus className="size-4 mr-1" /> 강사 추가</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : instructors.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">등록된 파트너 강사가 없습니다. "강사 추가"로 등록하세요.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">이름</TableHead>
                  <TableHead>이메일주소</TableHead>
                  <TableHead className="w-40">소속학원</TableHead>
                  <TableHead className="w-32">담당과목</TableHead>
                  <TableHead>특이사항</TableHead>
                  <TableHead className="w-40">접근가능권한</TableHead>
                  <TableHead className="w-24 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructors.map(ins => {
                  const routeLabels = ins.enabledRoutes
                    .map(rp => NAV_ROUTE_DEFS.find(d => d.path === rp)?.labelKey)
                    .filter(Boolean) as string[]
                  return (
                    <TableRow key={ins.id}>
                      <TableCell className="text-sm font-medium">{ins.name || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GraduationCap className="size-4 text-purple-500 shrink-0" />
                          <span className="text-sm">{ins.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{ins.academy || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-sm">{ins.subject || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="max-w-[240px] truncate" title={ins.notes || ''}>{ins.notes || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {routeLabels.length === 0 ? <span className="text-xs text-muted-foreground">없음</span> :
                            routeLabels.slice(0, 3).map((lk, i) => <Badge key={i} variant="outline" className="text-[10px]">{t(lk)}</Badge>)}
                          {routeLabels.length > 3 && <Badge variant="outline" className="text-[10px]">+{routeLabels.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-purple-600" title="수정" onClick={() => setEditing(ins)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600" title="삭제"
                                onClick={() => { if (confirm(`'${ins.email}' 강사를 삭제할까요?`)) del.mutate(ins.id) }}>
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(addOpen || editing) && (
        <InstructorDialog
          instructor={editing}
          academyOptions={academyOptions}
          canEdit={canEdit}
          onClose={() => { setAddOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function InstructorDialog({ instructor, academyOptions, canEdit, onClose }: {
  instructor: PartnerInstructor | null
  academyOptions: string[]
  canEdit: boolean
  onClose: () => void
}) {
  const t = useT()
  const upsert = useUpsertPartnerInstructor()
  const { data: students = [] } = useServiceStudents()

  const [name, setName] = useState(instructor?.name || '')
  const [email, setEmail] = useState(instructor?.email || '')
  const [academy, setAcademy] = useState(instructor?.academy || '')
  const [subject, setSubject] = useState(instructor?.subject || '')
  const [notes, setNotes] = useState(instructor?.notes || '')
  const [studentIds, setStudentIds] = useState<string[]>(instructor?.studentIds || [])
  const [routes, setRoutes] = useState<string[]>(instructor?.enabledRoutes || [])

  const toggleRoute = (path: string) => setRoutes(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])

  const activeStudents = useMemo(
    () => students.filter(s => isActiveStudent(s.status)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')),
    [students],
  )
  const studentLabel = (id: string) => {
    const s = students.find(x => x.id === id)
    return s ? (s.koreanName ? `${s.name} · ${s.koreanName}` : s.name) : id
  }
  const addStudent = (id: string) => setStudentIds(prev => prev.includes(id) ? prev : [...prev, id])
  const removeStudent = (id: string) => setStudentIds(prev => prev.filter(x => x !== id))

  const emailValid = /.+@.+\..+/.test(email.trim())
  const canSave = canEdit && emailValid && !upsert.isPending

  const handleSave = () => {
    if (!canEdit) return
    if (!canSave) return
    upsert.mutate(
      { id: instructor?.id, name: name.trim() || undefined, email: email.trim(), academy: academy || undefined, subject, notes, studentIds, enabledRoutes: routes },
      {
        onSuccess: onClose,
        onError: (e: unknown) => {
          const err = e as { message?: string; code?: string }
          alert(`저장에 실패했습니다.\n${err?.message || ''}${err?.code === '23505' ? '\n(이미 등록된 이메일입니다)' : ''}`)
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{instructor ? '강사 수정' : '강사 추가'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* 0. 이름 */}
          <div className="space-y-1">
            <Label className="text-xs">이름</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="강사 이름 (코멘트에 표시됩니다)" />
          </div>
          {/* 1. 이메일주소 */}
          <div className="space-y-1">
            <Label className="text-xs">이메일주소 <span className="text-red-500">*</span></Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="instructor@example.com" disabled={!!instructor} />
            {!!instructor && <p className="text-[11px] text-muted-foreground">이메일은 수정할 수 없습니다.</p>}
          </div>
          {/* 2. 소속학원 */}
          <div className="space-y-1">
            <Label className="text-xs">소속학원</Label>
            <Select value={academy || undefined} onValueChange={v => setAcademy(v || '')}>
              <SelectTrigger><SelectValue placeholder="소속학원 선택" /></SelectTrigger>
              <SelectContent>
                {academyOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* 3. 담당과목 */}
          <div className="space-y-1">
            <Label className="text-xs">담당과목</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="예: 수학, 물리" />
          </div>
          {/* 4. 담당학생 (현재 서비스 중인 학생) */}
          <div className="space-y-1">
            <Label className="text-xs">담당학생</Label>
            <Select value="" onValueChange={v => v && addStudent(v)}>
              <SelectTrigger><SelectValue placeholder="담당학생 선택 (여러 명 선택 가능)" /></SelectTrigger>
              <SelectContent>
                {activeStudents.filter(s => !studentIds.includes(s.id)).length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">선택할 학생이 없습니다</div>
                ) : activeStudents.filter(s => !studentIds.includes(s.id)).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.koreanName ? `${s.name} · ${s.koreanName}` : s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {studentIds.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {studentIds.map(id => (
                  <Badge key={id} variant="secondary" className="gap-1 text-[11px]">
                    {studentLabel(id)}
                    <button type="button" onClick={() => removeStudent(id)} className="hover:text-red-600"><X className="size-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {/* 5. 특이사항 */}
          <div className="space-y-1">
            <Label className="text-xs">특이사항</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="어떤 학생의 선생님인지 등" />
          </div>
          {/* 5. 접근가능권한 */}
          <div className="space-y-2">
            <Label className="text-xs">접근가능권한 <span className="text-muted-foreground font-normal">(내부 웹 게시판 섹션 선택)</span></Label>
            <div className="space-y-3 rounded-md border p-3 max-h-64 overflow-y-auto">
              {SELECTABLE_SECTIONS.map(sec => (
                <div key={sec.key}>
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1">{t(sec.labelKey)}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {sec.routes.map(r => (
                      <label key={r.path} className="flex items-center justify-between gap-2 rounded border px-2 py-1 cursor-pointer">
                        <span className="text-xs truncate">{t(r.labelKey)}</span>
                        <Switch checked={routes.includes(r.path)} onCheckedChange={() => toggleRoute(r.path)} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">선택한 게시판만 이 강사가 로그인 시 볼 수 있습니다.</p>
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
