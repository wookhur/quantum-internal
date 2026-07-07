import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Loader2, Shield, Search, UserCog, Save,
  CheckCircle2, Users, ShieldCheck, Eye, Briefcase, UserX,
  ChevronDown, ChevronRight, Mail, UserPlus, Copy, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  useProfiles, useUpdateProfile,
  useFeatureAccess, useUpdateFeatureAccess,
  FEATURE_MODULES, ROLE_DEFAULT_ACCESS,
  NAV_ROUTE_DEFS, ADMIN_ONLY_ROUTES,
  getEffectiveModules, getEffectiveRoutes, getRoutesForModule,
  type FeatureModule, type FeatureAccessRecord,
} from '@/hooks/useProfiles'
import type { User, UserRole, Department, EmploymentType, WorkerType } from '@/types'

const ROLE_CONFIG: Record<UserRole, { label: string; className: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', className: 'bg-red-50 text-red-700 border-red-200', icon: Shield },
  c_level: { label: 'C-Level', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: ShieldCheck },
  sales_manager: { label: 'Sales Mgr', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Users },
  service_manager: { label: 'Service Mgr', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Users },
  marketing_manager: { label: 'Marketing Mgr', className: 'bg-purple-50 text-purple-700 border-purple-200', icon: Users },
  consultant: { label: 'Consultant', className: 'bg-teal-50 text-teal-700 border-teal-200', icon: Briefcase },
  freelancer: { label: 'Freelancer', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: UserX },
  external: { label: 'External', className: 'bg-gray-50 text-gray-600 border-gray-200', icon: Eye },
}

function useDeptOptions() {
  const t = useT()
  return [
    { value: 'management' as Department, label: t('access.deptManagement') },
    { value: 'sales' as Department, label: t('access.deptSales') },
    { value: 'marketing' as Department, label: t('access.deptMarketing') },
    { value: 'finance' as Department, label: t('access.deptFinance') },
    { value: 'service' as Department, label: t('access.deptService') },
  ]
}

function useRoleOptions() {
  const t = useT()
  return [
    { value: 'admin' as UserRole, label: `Admin (${t('access.roleAdmin')})` },
    { value: 'c_level' as UserRole, label: `C-Level (${t('access.roleCLevel')})` },
    { value: 'sales_manager' as UserRole, label: `Sales Mgr (${t('access.roleSalesManager')})` },
    { value: 'service_manager' as UserRole, label: `Service Mgr (${t('access.roleServiceManager')})` },
    { value: 'marketing_manager' as UserRole, label: `Marketing Mgr (${t('access.roleMarketingManager')})` },
    { value: 'consultant' as UserRole, label: `Consultant (${t('access.roleConsultant')})` },
    { value: 'freelancer' as UserRole, label: `Freelancer (${t('access.roleFreelancer')})` },
    { value: 'external' as UserRole, label: `External (${t('access.roleExternal')})` },
  ]
}

function useEmploymentTypeOptions() {
  const t = useT()
  return [
    { value: 'permanent' as EmploymentType, label: t('access.empPermanent') },
    { value: 'contract' as EmploymentType, label: t('access.empContract') },
    { value: 'intern' as EmploymentType, label: t('access.empIntern') },
    { value: 'dispatch' as EmploymentType, label: t('access.empDispatch') },
    { value: 'daily' as EmploymentType, label: t('access.empDaily') },
    { value: 'freelancer' as EmploymentType, label: t('access.empFreelancer') },
    { value: 'commissioned' as EmploymentType, label: t('access.empCommissioned') },
    { value: 'executive' as EmploymentType, label: t('access.empExecutive') },
  ]
}

function useWorkerTypeOptions() {
  const t = useT()
  return [
    { value: 'employee' as WorkerType, label: t('access.workerEmployee') },
    { value: 'freelancer' as WorkerType, label: t('access.workerFreelancer') },
    { value: 'business' as WorkerType, label: t('access.workerBusiness') },
  ]
}

// ─── User Edit Dialog with Package + Route toggles ─────────────────────────

function UserEditDialog({
  user,
  featureAccess,
  open,
  onOpenChange,
}: {
  user: User
  featureAccess: FeatureAccessRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const DEPT_OPTIONS = useDeptOptions()
  const ROLE_OPTIONS = useRoleOptions()
  const EMPLOYMENT_TYPE_OPTIONS = useEmploymentTypeOptions()
  const updateProfile = useUpdateProfile()
  const updateFeatureAccess = useUpdateFeatureAccess()
  const { user: currentUser } = useAuth()

  const effectiveModules = getEffectiveModules(user, featureAccess)
  const effectiveRoutes = getEffectiveRoutes(user, featureAccess)

  const [displayName, setDisplayName] = useState<string>(user.name || '')
  const [role, setRole] = useState<UserRole>(user.role)
  const [department, setDepartment] = useState<string>(user.department || '')
  const [position, setPosition] = useState<string>(user.position || '')
  const [employmentTypes, setEmploymentTypes] = useState<string[]>(user.employmentTypes || (user.employmentType ? [user.employmentType] : []))
  const toggleEmploymentType = (v: string) =>
    setEmploymentTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])
  const [contractStartDate, setContractStartDate] = useState(user.contractStartDate || '')
  const [contractEndDate, setContractEndDate] = useState(user.contractEndDate || '')
  const [hireDate, setHireDate] = useState(user.hireDate || '')
  const [isExternal, setIsExternal] = useState(user.isExternal)
  const [isPartner, setIsPartner] = useState(user.isPartner || false)
  const [canApproveOrders, setCanApproveOrders] = useState(user.canApproveOrders || false)
  const [canApproveLeave, setCanApproveLeave] = useState(user.canApproveLeave || false)
  const [enabledModules, setEnabledModules] = useState<FeatureModule[]>(effectiveModules)
  const [enabledRoutes, setEnabledRoutes] = useState<string[]>(effectiveRoutes)
  const [useCustomAccess, setUseCustomAccess] = useState(
    featureAccess.some(r => r.userId === user.id),
  )
  const [expandedModules, setExpandedModules] = useState<Set<FeatureModule>>(new Set())
  const [saving, setSaving] = useState(false)

  const isSelf = currentUser?.id === user.id

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole)
    if (!useCustomAccess) {
      const defaultMods = ROLE_DEFAULT_ACCESS[newRole] || []
      setEnabledModules(defaultMods)
      // Expand default modules to routes
      const defaultRoutes = NAV_ROUTE_DEFS.filter(r => defaultMods.includes(r.module)).map(r => r.path)
      setEnabledRoutes(defaultRoutes)
    }
  }

  const toggleModule = (mod: FeatureModule) => {
    const wasEnabled = enabledModules.includes(mod)
    const modRoutes = getRoutesForModule(mod)

    if (wasEnabled) {
      // Remove module and all its routes
      setEnabledModules(prev => prev.filter(m => m !== mod))
      setEnabledRoutes(prev => prev.filter(r => !modRoutes.includes(r)))
    } else {
      // Add module and all its routes
      setEnabledModules(prev => [...prev, mod])
      setEnabledRoutes(prev => [...new Set([...prev, ...modRoutes])])
    }
  }

  const toggleRoute = (route: string, mod: FeatureModule) => {
    const modRoutes = getRoutesForModule(mod)
    const wasEnabled = enabledRoutes.includes(route)

    let newRoutes: string[]
    if (wasEnabled) {
      newRoutes = enabledRoutes.filter(r => r !== route)
    } else {
      newRoutes = [...enabledRoutes, route]
    }
    setEnabledRoutes(newRoutes)

    // If all routes in this module are now disabled, disable the module too
    const remainingModRoutes = newRoutes.filter(r => modRoutes.includes(r))
    if (remainingModRoutes.length === 0 && enabledModules.includes(mod)) {
      setEnabledModules(prev => prev.filter(m => m !== mod))
    }
    // If any route in this module is enabled and module was disabled, enable it
    if (remainingModRoutes.length > 0 && !enabledModules.includes(mod)) {
      setEnabledModules(prev => [...prev, mod])
    }
  }

  const toggleExpand = (mod: FeatureModule) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  const handleToggleCustomAccess = (checked: boolean) => {
    setUseCustomAccess(checked)
    if (!checked) {
      const defaultMods = ROLE_DEFAULT_ACCESS[role] || []
      setEnabledModules(defaultMods)
      const defaultRoutes = NAV_ROUTE_DEFS.filter(r => defaultMods.includes(r.module)).map(r => r.path)
      setEnabledRoutes(defaultRoutes)
      setExpandedModules(new Set())
    }
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updateProfile.mutateAsync({
        id: user.id,
        name: displayName.trim() || undefined,
        role,
        department: department ? (department as Department) : null,
        position: position || null,
        employmentTypes: employmentTypes.length ? (employmentTypes as EmploymentType[]) : null,
        contractStartDate: contractStartDate || null,
        contractEndDate: contractEndDate || null,
        hireDate: hireDate || null,
        isExternal,
        isPartner,
        canApproveOrders,
        canApproveLeave,
      })

      if (useCustomAccess) {
        // Strip admin-only routes for non-admin users
        const safeRoutes = role === 'admin'
          ? enabledRoutes
          : enabledRoutes.filter(r => !ADMIN_ONLY_ROUTES.includes(r))
        await updateFeatureAccess.mutateAsync({
          userId: user.id,
          enabledModules,
          enabledRoutes: safeRoutes,
        })
      }

      onOpenChange(false)
    } catch (err) {
      console.error('Failed to save:', err)
      const e = err as Record<string, unknown> | null
      const parts = [e?.message, e?.details, e?.hint, e?.code]
        .filter(Boolean)
        .map(String)
      const msg = parts.length ? parts.join('\n') : JSON.stringify(err)
      alert(
        `저장에 실패했습니다.\n\n${msg}\n\n` +
        `(컬럼 관련 오류라면 아래 마이그레이션을 Supabase에서 실행해 주세요:\n` +
        `· enabled_routes → migration-feature-access-routes.sql\n` +
        `· can_approve_orders → migration-coupang-approval.sql\n` +
        `· can_approve_leave / leave_requests → migration-leave-management.sql\n` +
        `· hire_date → migration-hire-date.sql)`
      )
    } finally {
      setSaving(false)
    }
  }, [user.id, displayName, role, department, position, employmentTypes, contractStartDate, contractEndDate, hireDate, isExternal, isPartner, canApproveOrders, canApproveLeave, useCustomAccess, enabledModules, enabledRoutes, updateProfile, updateFeatureAccess, onOpenChange])

  const selectedRoleLabel = ROLE_OPTIONS.find(o => o.value === role)?.label || role
  const selectedDeptLabel = department === '_none' || !department
    ? t('common.unassigned')
    : DEPT_OPTIONS.find(d => d.value === department)?.label || department

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="size-5" />
            {user.name} {t('access.accessSettings')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              {user.email}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('access.displayName')}</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('access.displayNamePlaceholder')}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.role')}</Label>
                <Select value={role} onValueChange={(v) => v && handleRoleChange(v as UserRole)}>
                  <SelectTrigger className="h-9">
                    <span>{selectedRoleLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.department')}</Label>
                <Select value={department || '_none'} onValueChange={(v) => setDepartment(!v || v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-9">
                    <span>{selectedDeptLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">{t('common.unassigned')}</SelectItem>
                    {DEPT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.position')}</Label>
                <Input
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder={t('access.positionPlaceholder')}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.externalStaff')}</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={isExternal} onCheckedChange={setIsExternal} />
                  <span className="text-xs text-muted-foreground">
                    {isExternal ? t('access.external') : t('access.internal')}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">파트너사</Label>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={isPartner} onCheckedChange={setIsPartner} />
                  <span className="text-xs text-muted-foreground">
                    {isPartner ? '파트너사 계정' : '아니오'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">고용형태 <span className="text-[10px] text-muted-foreground">(복수 선택 가능)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {EMPLOYMENT_TYPE_OPTIONS.map(opt => {
                    const on = employmentTypes.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleEmploymentType(opt.value)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">입사일 <span className="text-[10px] text-muted-foreground">(연차 기준)</span></Label>
                <Input
                  type="date"
                  value={hireDate}
                  onChange={e => setHireDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.contractStartDate')}</Label>
                <Input
                  type="date"
                  value={contractStartDate}
                  onChange={e => setContractStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('access.contractEndDate')}</Label>
                <Input
                  type="date"
                  value={contractEndDate}
                  onChange={e => setContractEndDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Feature Access — Package + Route */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('access.featureAccess')}</h3>
              <div className="flex items-center gap-2">
                <Switch
                  checked={useCustomAccess}
                  onCheckedChange={handleToggleCustomAccess}
                  id="custom-access"
                />
                <Label htmlFor="custom-access" className="text-xs text-muted-foreground cursor-pointer">
                  {t('access.customSettings')}
                </Label>
              </div>
            </div>

            {!useCustomAccess && (
              <div className="text-xs text-muted-foreground bg-blue-50 text-blue-700 rounded p-2">
                {t('access.defaultAccessNote').replace('{role}', ROLE_CONFIG[role]?.label || '')}
              </div>
            )}

            <div className="space-y-1.5">
              {FEATURE_MODULES.map(mod => {
                const isModEnabled = enabledModules.includes(mod.key)
                const isDefault = ROLE_DEFAULT_ACCESS[role]?.includes(mod.key)
                const isExpanded = expandedModules.has(mod.key)
                const modRoutes = NAV_ROUTE_DEFS.filter(r => r.module === mod.key)
                const enabledCount = modRoutes.filter(r => enabledRoutes.includes(r.path)).length

                return (
                  <div key={mod.key} className="rounded-lg border overflow-hidden">
                    {/* Module header */}
                    <div
                      className={`flex items-center justify-between p-2.5 ${
                        isModEnabled ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          className="p-0.5 rounded hover:bg-gray-100 transition-colors"
                          onClick={() => useCustomAccess && toggleExpand(mod.key)}
                          disabled={!useCustomAccess}
                        >
                          {isExpanded
                            ? <ChevronDown className="size-3.5 text-gray-500" />
                            : <ChevronRight className="size-3.5 text-gray-400" />}
                        </button>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isModEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            {t(mod.labelKey)}
                            {useCustomAccess && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                {enabledCount}/{modRoutes.length}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{t(mod.descriptionKey)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!useCustomAccess && isDefault && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-blue-50 text-blue-600 border-blue-200">
                            {t('access.default')}
                          </Badge>
                        )}
                        <Switch
                          checked={isModEnabled}
                          onCheckedChange={() => toggleModule(mod.key)}
                          disabled={!useCustomAccess}
                        />
                      </div>
                    </div>

                    {/* Expanded per-route toggles */}
                    {isExpanded && useCustomAccess && (
                      <div className="border-t bg-gray-50/30 px-3 py-1.5 space-y-0.5">
                        {modRoutes.map(route => {
                          const routeEnabled = enabledRoutes.includes(route.path)
                          const isAdminOnly = ADMIN_ONLY_ROUTES.includes(route.path)
                          const isTargetAdmin = role === 'admin'
                          const routeLocked = isAdminOnly && !isTargetAdmin
                          return (
                            <div
                              key={route.path}
                              className={`flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-100/60 ${routeLocked ? 'opacity-50' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${routeEnabled && !routeLocked ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                                <span className="text-xs">{t(route.labelKey)}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{route.path}</span>
                                {isAdminOnly && (
                                  <Badge variant="outline" className="text-[9px] h-3.5 bg-red-50 text-red-600 border-red-200">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                              <Switch
                                checked={routeEnabled && !routeLocked}
                                onCheckedChange={() => toggleRoute(route.path, mod.key)}
                                className="scale-75"
                                disabled={routeLocked}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Special permissions (not tied to a route/module) */}
            <div className="pt-1">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">특수 권한</div>
              <div className="space-y-1.5">
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between p-2.5 bg-white">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${canApproveOrders ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">주문승인 권한</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          쿠팡 주문 요청을 승인·반려하고 주문을 진행할 수 있습니다
                        </div>
                      </div>
                    </div>
                    <Switch checked={canApproveOrders} onCheckedChange={setCanApproveOrders} />
                  </div>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between p-2.5 bg-white">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${canApproveLeave ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">연차·휴가 승인 권한</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          직원의 연차·경조사 휴가 신청을 승인·반려할 수 있습니다
                        </div>
                      </div>
                    </div>
                    <Switch checked={canApproveLeave} onCheckedChange={setCanApproveLeave} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isSelf && (
            <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
              {t('access.selfEditWarning')}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite Dialog ─────────────────────────────────────────────────────────

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const ROLE_OPTIONS = useRoleOptions()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('external')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedRoleLabel = ROLE_OPTIONS.find(o => o.value === role)?.label || role

  const handleCopyCredentials = useCallback(() => {
    if (!tempPassword) return
    const text = `${t('access.emailLabel')}: ${email}\n${t('access.passwordLabel')}: ${tempPassword}\nLogin: ${window.location.origin}/login`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [email, tempPassword, t])

  const handleSend = useCallback(async () => {
    if (!email.trim()) return
    setSending(true)
    setResult(null)
    setTempPassword(null)
    setCopied(false)
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: email.trim(), name: name.trim() || undefined, role },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (data?.tempPassword) {
        setTempPassword(data.tempPassword)
        setResult({ type: 'success', message: t('access.accountCreated') })
      } else {
        setResult({ type: 'success', message: t('access.inviteSuccess') })
        setEmail('')
        setName('')
        setRole('external')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('access.inviteError')
      setResult({ type: 'error', message: msg })
    } finally {
      setSending(false)
    }
  }, [email, name, role, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            {t('access.inviteUser')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('access.inviteEmail')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('access.inviteEmailPlaceholder')}
                className="h-9 pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('access.inviteName')}</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('access.inviteNamePlaceholder')}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('access.inviteRole')}</Label>
            <Select value={role} onValueChange={v => v && setRole(v as UserRole)}>
              <SelectTrigger className="h-9">
                <span>{selectedRoleLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {result && (
            <div className={`text-sm rounded p-2 ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.message}
            </div>
          )}

          {tempPassword && (
            <div className="rounded-md border bg-amber-50 p-3 space-y-2">
              <div className="text-xs font-medium text-amber-800">{t('access.tempLoginInfo')}</div>
              <div className="text-sm font-mono bg-white rounded px-2 py-1.5 border text-gray-800">
                <div>{t('access.emailLabel')}: {email}</div>
                <div>{t('access.passwordLabel')}: {tempPassword}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 h-8 text-xs"
                onClick={handleCopyCredentials}
              >
                {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
                {copied ? t('access.copied') : t('access.copyLoginInfo')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSend} disabled={sending || !email.trim()} className="gap-1.5">
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
            {sending ? t('access.inviteSending') : t('access.inviteSend')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function AccessManagementPage() {
  const t = useT()
  const DEPT_OPTIONS = useDeptOptions()
  const ROLE_OPTIONS = useRoleOptions()
  const EMPLOYMENT_TYPE_OPTIONS = useEmploymentTypeOptions()
  const WORKER_TYPE_OPTIONS = useWorkerTypeOptions()
  const { user: currentUser } = useAuth()
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles()
  const { data: featureAccess = [], isLoading: accessLoading } = useFeatureAccess()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [workerTypeFilter, setWorkerTypeFilter] = useState<string>('all')
  const [editUser, setEditUser] = useState<User | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const isAdmin = currentUser?.role === 'admin'
  const isLoading = profilesLoading || accessLoading

  const filteredProfiles = useMemo(() => {
    let list = profiles
    if (workerTypeFilter !== 'all') {
      list = list.filter(p => p.workerType === workerTypeFilter)
    }
    if (roleFilter !== 'all') {
      list = list.filter(p => p.role === roleFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
      )
    }
    return list
  }, [profiles, workerTypeFilter, roleFilter, search])

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {}
    for (const p of profiles) {
      byRole[p.role] = (byRole[p.role] || 0) + 1
    }
    return {
      total: profiles.length,
      admins: byRole.admin || 0,
      managers: byRole.manager || 0,
      staff: byRole.staff || 0,
      external: profiles.filter(p => p.isExternal).length,
    }
  }, [profiles])

  const selectedRoleFilterLabel = roleFilter === 'all'
    ? t('access.allRoles')
    : ROLE_OPTIONS.find(o => o.value === roleFilter)?.label.split(' ')[0] || roleFilter

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <UserX className="size-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t('access.noPermission')}</p>
        <p className="text-xs text-muted-foreground">{t('access.requireAdminOrManager')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('planning.access')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('access.subtitle')}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-1.5">
          <UserPlus className="size-4" />
          {t('access.inviteUser')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">{t('access.totalUsers')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Shield className="size-5 text-red-500" />
            <div>
              <div className="text-lg font-bold">{stats.admins}</div>
              <div className="text-xs text-muted-foreground">Admin</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <ShieldCheck className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{stats.managers}</div>
              <div className="text-xs text-muted-foreground">Manager</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{stats.staff}</div>
              <div className="text-xs text-muted-foreground">Staff</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Briefcase className="size-5 text-purple-500" />
            <div>
              <div className="text-lg font-bold">{stats.external}</div>
              <div className="text-xs text-muted-foreground">{t('access.externalStaff')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role Default Access Matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="size-4" />
            {t('access.defaultAccessByRole')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">{t('access.role')}</TableHead>
                {FEATURE_MODULES.map(m => (
                  <TableHead key={m.key} className="text-center text-xs w-20">{t(m.labelKey)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_OPTIONS.map(opt => (
                <TableRow key={opt.value}>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${ROLE_CONFIG[opt.value]?.className}`}>
                      {opt.label.split(' ')[0]}
                    </Badge>
                  </TableCell>
                  {FEATURE_MODULES.map(m => {
                    const has = ROLE_DEFAULT_ACCESS[opt.value]?.includes(m.key)
                    return (
                      <TableCell key={m.key} className="text-center">
                        <div className={`mx-auto w-3 h-3 rounded-full ${has ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Worker Type Tabs */}
      <div className="flex gap-2">
        {[
          { value: 'all', label: t('access.workerAll') },
          ...WORKER_TYPE_OPTIONS,
        ].map(opt => (
          <Button
            key={opt.value}
            variant={workerTypeFilter === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setWorkerTypeFilter(opt.value)}
          >
            {opt.label}
            {opt.value !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                {profiles.filter(p => p.workerType === opt.value).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder={t('access.searchPlaceholder')}
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v || 'all')}>
              <SelectTrigger className="w-[160px] h-9">
                <span>{selectedRoleFilterLabel}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('access.allRoles')}</SelectItem>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label.split(' ')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('access.noUsers')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">{t('access.user')}</TableHead>
                  <TableHead className="w-[100px]">{t('access.role')}</TableHead>
                  <TableHead className="w-[100px]">{t('access.department')}</TableHead>
                  <TableHead className="w-[90px]">{t('access.position')}</TableHead>
                  <TableHead className="w-[80px]">{t('access.employmentType')}</TableHead>
                  <TableHead className="w-[100px]">입사일</TableHead>
                  <TableHead>{t('access.accessibleFeatures')}</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => {
                  const roleCfg = ROLE_CONFIG[profile.role] || ROLE_CONFIG.external
                  const modules = getEffectiveModules(profile, featureAccess)
                  const hasCustom = featureAccess.some(r => r.userId === profile.id)
                  const isSelf = currentUser?.id === profile.id
                  const deptLabel = DEPT_OPTIONS.find(d => d.value === profile.department)?.label

                  return (
                    <TableRow key={profile.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                              {profile.name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-1.5">
                              {profile.name}
                              {isSelf && (
                                <Badge variant="outline" className="text-[10px] h-4 bg-blue-50 text-blue-600 border-blue-200">
                                  {t('access.me')}
                                </Badge>
                              )}
                              {profile.isExternal && (
                                <Badge variant="outline" className="text-[10px] h-4 bg-purple-50 text-purple-600 border-purple-200">
                                  {t('access.externalBadge')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{profile.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${roleCfg.className}`}>
                          {roleCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {deptLabel || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {profile.position || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {profile.employmentTypes && profile.employmentTypes.length
                          ? <div className="flex flex-wrap gap-0.5">
                              {profile.employmentTypes.map(et => (
                                <Badge key={et} variant="outline" className="text-[10px] h-4">{EMPLOYMENT_TYPE_OPTIONS.find(o => o.value === et)?.label || et}</Badge>
                              ))}
                            </div>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {profile.hireDate || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {modules.map(mod => (
                            <Badge
                              key={mod}
                              variant="outline"
                              className="text-[10px] h-4 px-1.5 font-normal"
                            >
                              {t(FEATURE_MODULES.find(m => m.key === mod)?.labelKey || mod)}
                            </Badge>
                          ))}
                          {hasCustom && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal bg-amber-50 text-amber-600 border-amber-200">
                              {t('access.custom')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditUser(profile)}
                        >
                          <UserCog className="size-3.5 mr-1" />
                          {t('common.edit')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editUser && (
        <UserEditDialog
          user={editUser}
          featureAccess={featureAccess}
          open={!!editUser}
          onOpenChange={(open) => { if (!open) setEditUser(null) }}
        />
      )}

      {/* Invite Dialog */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
