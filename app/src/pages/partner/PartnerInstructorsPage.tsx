import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  useProfiles, useUpdateProfile,
  useFeatureAccess, useUpdateFeatureAccess,
  getEffectiveModules,
  FEATURE_MODULES, NAV_ROUTE_DEFS, ADMIN_ONLY_ROUTES,
  type FeatureModule,
} from '@/hooks/useProfiles'
import type { User } from '@/types'

/** Routes for a set of modules (used to persist enabled_routes consistently). */
function routesForModules(modules: FeatureModule[]): string[] {
  return NAV_ROUTE_DEFS
    .filter(r => modules.includes(r.module) && !ADMIN_ONLY_ROUTES.includes(r.path))
    .map(r => r.path)
}

export function PartnerInstructorsPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: profiles = [], isLoading } = useProfiles()
  const { data: featureAccess = [] } = useFeatureAccess()

  const [dialogUserId, setDialogUserId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const instructors = useMemo(() => profiles.filter(p => p.isPartner), [profiles])
  const nonInstructors = useMemo(() => profiles.filter(p => !p.isPartner), [profiles])
  const editing = dialogUserId ? profiles.find(p => p.id === dialogUserId) || null : null

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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">파트너 강사관리</h1>
          <p className="text-sm text-muted-foreground">
            파트너 강사 계정의 <b>소속학원명</b>과 <b>접근가능기능</b>을 수동으로 설정합니다.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="size-4 mr-1" /> 강사 추가</Button>
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
                  <TableHead>강사(사용자)</TableHead>
                  <TableHead className="w-48">소속학원명</TableHead>
                  <TableHead>접근가능기능</TableHead>
                  <TableHead className="w-24 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructors.map(p => {
                  const mods = getEffectiveModules(p, featureAccess)
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GraduationCap className="size-4 text-purple-500 shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{p.partnerAcademy || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {mods.length === 0 ? <span className="text-xs text-muted-foreground">없음</span> :
                            mods.map(m => {
                              const cfg = FEATURE_MODULES.find(f => f.key === m)
                              return <Badge key={m} variant="outline" className="text-[10px]">{cfg ? t(cfg.labelKey) : m}</Badge>
                            })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-purple-600" title="수정" onClick={() => setDialogUserId(p.id)}>
                            <Pencil className="size-4" />
                          </Button>
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

      {/* 강사 추가: 사용자 선택 */}
      {addOpen && (
        <AddInstructorDialog
          candidates={nonInstructors}
          onClose={() => setAddOpen(false)}
          onPick={(id) => { setAddOpen(false); setDialogUserId(id) }}
        />
      )}

      {/* 강사 설정(소속학원 + 접근가능기능) */}
      {editing && (
        <InstructorDialog
          profile={editing}
          currentModules={getEffectiveModules(editing, featureAccess)}
          onClose={() => setDialogUserId(null)}
        />
      )}
    </div>
  )
}

function AddInstructorDialog({ candidates, onClose, onPick }: { candidates: User[]; onClose: () => void; onPick: (id: string) => void }) {
  const [sel, setSel] = useState('')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>강사 추가</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">사용자 선택</Label>
          <Select value={sel} onValueChange={(v) => setSel(v || '')}>
            <SelectTrigger><SelectValue placeholder="사용자 선택" /></SelectTrigger>
            <SelectContent>
              {candidates.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">추가할 사용자가 없습니다</div>
              ) : candidates.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">선택 후 소속학원명과 접근가능기능을 설정합니다.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={!sel} onClick={() => sel && onPick(sel)}>다음</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InstructorDialog({ profile, currentModules, onClose }: { profile: User; currentModules: FeatureModule[]; onClose: () => void }) {
  const t = useT()
  const updateProfile = useUpdateProfile()
  const updateFeatureAccess = useUpdateFeatureAccess()

  const [academy, setAcademy] = useState(profile.partnerAcademy || '')
  const [mods, setMods] = useState<FeatureModule[]>(currentModules)
  const saving = updateProfile.isPending || updateFeatureAccess.isPending

  const toggle = (m: FeatureModule) => setMods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({ id: profile.id, isPartner: true, partnerAcademy: academy.trim() || null })
      await updateFeatureAccess.mutateAsync({ userId: profile.id, enabledModules: mods, enabledRoutes: routesForModules(mods) })
      onClose()
    } catch (e: unknown) {
      const err = e as { message?: string }
      alert(`저장에 실패했습니다.\n${err?.message || ''}`)
    }
  }

  const handleRemove = async () => {
    if (!confirm(`'${profile.name}'을(를) 파트너 강사에서 제외할까요?`)) return
    try {
      await updateProfile.mutateAsync({ id: profile.id, isPartner: false })
      onClose()
    } catch (e: unknown) {
      const err = e as { message?: string }
      alert(`저장에 실패했습니다.\n${err?.message || ''}`)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{profile.name} · 강사 설정</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">소속학원명</Label>
            <Input value={academy} onChange={e => setAcademy(e.target.value)} placeholder="예: 김효진 수학" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">접근가능기능</Label>
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_MODULES.map(m => (
                <label key={m.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 cursor-pointer">
                  <span className="text-sm">{t(m.labelKey)}</span>
                  <Switch checked={mods.includes(m.key)} onCheckedChange={() => toggle(m.key)} />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">선택한 기능(모듈)에 해당하는 메뉴만 이 강사에게 보입니다.</p>
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={handleRemove} disabled={saving}>
            <Trash2 className="size-4 mr-1" /> 강사 제외
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
