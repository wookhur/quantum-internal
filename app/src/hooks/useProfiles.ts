import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { User, UserRole, Department, EmploymentType, WorkerType } from '@/types'

function mapProfile(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as UserRole,
    department: (row.department as Department) || undefined,
    position: (row.position as string) || undefined,
    employmentType: (row.employment_type as EmploymentType) || undefined,
    employmentTypes: (() => {
      const arr = row.employment_types as EmploymentType[] | null
      if (arr && arr.length) return arr
      return row.employment_type ? [row.employment_type as EmploymentType] : []
    })(),
    contractStartDate: (row.contract_start_date as string) || undefined,
    contractEndDate: (row.contract_end_date as string) || undefined,
    hireDate: (row.hire_date as string) || undefined,
    isExternal: (row.is_external as boolean) || false,
    isPartner: (row.is_partner as boolean) || false,
    partnerAcademy: (row.partner_academy as string) || undefined,
    canApproveOrders: (row.can_approve_orders as boolean) || false,
    canApproveLeave: (row.can_approve_leave as boolean) || false,
    canEditAttendance: (row.can_edit_attendance as boolean) || false,
    workerType: (row.worker_type as WorkerType) || undefined,
    avatarUrl: (row.avatar_url as string) || undefined,
    createdAt: row.created_at as string,
  }
}

/** Fetch all user profiles */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    // Always refetch on mount so newly-added employees show up promptly
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapProfile(r as Record<string, unknown>))
    },
  })
}

/** Update a user's profile (role, department, position, etc.) */
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      role?: UserRole
      department?: Department | null
      position?: string | null
      employmentType?: EmploymentType | null
      employmentTypes?: EmploymentType[] | null
      workerType?: WorkerType | null
      contractStartDate?: string | null
      contractEndDate?: string | null
      hireDate?: string | null
      name?: string
      isExternal?: boolean
      isPartner?: boolean
      partnerAcademy?: string | null
      canApproveOrders?: boolean
      canApproveLeave?: boolean
      canEditAttendance?: boolean
    }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.role !== undefined) row.role = updates.role
      if (updates.department !== undefined) row.department = updates.department
      if (updates.position !== undefined) row.position = updates.position
      if (updates.employmentType !== undefined) row.employment_type = updates.employmentType
      if (updates.employmentTypes !== undefined) {
        row.employment_types = updates.employmentTypes
        // keep single column in sync (first value) for backward compat
        row.employment_type = updates.employmentTypes?.[0] ?? null
      }
      if (updates.workerType !== undefined) row.worker_type = updates.workerType
      if (updates.contractStartDate !== undefined) row.contract_start_date = updates.contractStartDate
      if (updates.contractEndDate !== undefined) row.contract_end_date = updates.contractEndDate
      if (updates.hireDate !== undefined) row.hire_date = updates.hireDate
      if (updates.name !== undefined) row.name = updates.name
      if (updates.isExternal !== undefined) row.is_external = updates.isExternal
      if (updates.isPartner !== undefined) row.is_partner = updates.isPartner
      if (updates.partnerAcademy !== undefined) row.partner_academy = updates.partnerAcademy
      if (updates.canApproveOrders !== undefined) row.can_approve_orders = updates.canApproveOrders
      if (updates.canApproveLeave !== undefined) row.can_approve_leave = updates.canApproveLeave
      if (updates.canEditAttendance !== undefined) row.can_edit_attendance = updates.canEditAttendance

      const { data, error } = await supabase
        .from('profiles')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return mapProfile(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

// ============ FEATURE ACCESS ============

export type FeatureModule =
  | 'dashboard'
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'invoice'
  | 'service'
  | 'planning'
  | 'hr'
  | 'partner'
  | 'game'
  | 'my_incentive'

/** Every navigable route and which module (package) it belongs to */
export interface NavRouteDef {
  path: string
  labelKey: string
  module: FeatureModule
  /** True = 라우트는 살아있지만 현재 사이드바 메뉴에는 없는 페이지(직접 링크/리다이렉트로만 접근).
   *  접근 권한은 그대로 적용되지만 설정 UI에서는 '숨김'으로 구분 표시한다. */
  hidden?: boolean
}

export const NAV_ROUTE_DEFS: NavRouteDef[] = [
  // ── Common (dashboard package) ──
  { path: '/dashboard', labelKey: 'nav.dashboard', module: 'dashboard' },
  { path: '/calendar', labelKey: 'nav.calendar', module: 'dashboard', hidden: true },
  { path: '/tasks', labelKey: 'nav.taskBoard', module: 'dashboard' },
  { path: '/my-todos', labelKey: 'nav.myTodo', module: 'dashboard' },
  { path: '/messages', labelKey: 'nav.messages', module: 'dashboard' },
  { path: '/person', labelKey: 'nav.personProfile', module: 'dashboard', hidden: true },
  { path: '/common/coupang-orders', labelKey: 'nav.coupangOrders', module: 'dashboard' },
  // ── Sales ──
  { path: '/sales/leads', labelKey: 'nav.leadManagement', module: 'sales' },
  { path: '/sales/cold-call', labelKey: 'nav.coldCall', module: 'sales' },
  { path: '/sales/pipeline', labelKey: 'nav.pipeline', module: 'sales' },
  { path: '/sales/meetings', labelKey: 'nav.meetingRecords', module: 'sales' },
  { path: '/sales/funnel', labelKey: 'nav.salesFunnel', module: 'sales', hidden: true },
  { path: '/sales/performance', labelKey: 'nav.salesPerformance', module: 'sales' },
  // ── Marketing ──
  { path: '/marketing/metrics', labelKey: 'nav.marketingMetrics', module: 'marketing' },
  { path: '/marketing/ads', labelKey: 'nav.adPerformance', module: 'marketing' },
  { path: '/marketing/events', labelKey: 'nav.eventManagement', module: 'marketing', hidden: true },
  { path: '/marketing/videos', labelKey: 'nav.videoContent', module: 'marketing', hidden: true },
  { path: '/marketing/seminars', labelKey: 'nav.seminars', module: 'marketing' },
  // ── Service ──
  { path: '/service/dashboard', labelKey: 'nav.serviceDashboard', module: 'service' },
  { path: '/service/student-360', labelKey: 'nav.student360', module: 'service' },
  { path: '/service/weekly-report', labelKey: 'nav.weeklyReport', module: 'service' },
  { path: '/service/external-fees', labelKey: 'nav.externalFees', module: 'finance' },
  // ── Finance ──
  { path: '/finance/dashboard', labelKey: 'nav.financeDashboard', module: 'finance', hidden: true },
  { path: '/consulting/clients', labelKey: 'nav.contractManagement', module: 'finance' },
  { path: '/consulting/collections', labelKey: 'nav.monthlyCollection', module: 'finance' },
  { path: '/finance/invoices', labelKey: 'nav.invoices', module: 'finance' },
  { path: '/finance/receipts', labelKey: 'nav.receipts', module: 'finance' },
  { path: '/finance/wire-invoice', labelKey: 'nav.wireInvoice', module: 'finance' },
  { path: '/finance/incentives/by-contract', labelKey: 'nav.incentives', module: 'finance', hidden: true },
  { path: '/finance/incentives/by-person', labelKey: 'nav.incentives', module: 'finance', hidden: true },

  { path: '/invoices/freelancer-individual', labelKey: 'nav.invoiceFreelancerIndividual', module: 'invoice' },
  { path: '/invoices/freelancer-business', labelKey: 'nav.invoiceFreelancerBusiness', module: 'invoice' },
  { path: '/invoices/sales-incentive', labelKey: 'nav.invoiceSalesIncentive', module: 'invoice' },
  { path: '/invoices/partner-individual', labelKey: 'nav.invoicePartnerIndividual', module: 'invoice' },
  { path: '/invoices/partner-business', labelKey: 'nav.invoicePartnerBusiness', module: 'invoice' },
  // ── Planning ──
  { path: '/planning/overview', labelKey: 'nav.overview', module: 'planning' },
  { path: '/planning/projection', labelKey: 'nav.revenueProjection', module: 'planning' },
  { path: '/planning/employees', labelKey: 'nav.employeePerformance', module: 'planning', hidden: true },
  { path: '/planning/cashflow', labelKey: 'nav.cashflow', module: 'planning' },
  // ── HR ──
  { path: '/hr/attendance', labelKey: 'nav.attendance', module: 'hr' },
  { path: '/hr/leave', labelKey: 'nav.leaveManagement', module: 'hr' },
  { path: '/hr/kpi-targets', labelKey: 'nav.kpiTargets', module: 'hr' },
  { path: '/hr/employees', labelKey: 'nav.accessControl', module: 'hr' },
  { path: '/hr/personal-info', labelKey: 'nav.personalInfo', module: 'hr' },
  // ── Partner ──
  { path: '/partner/students', labelKey: 'nav.partnerStudents', module: 'partner' },
  { path: '/partner/instructors', labelKey: 'nav.partnerInstructors', module: 'partner' },
  { path: '/partner/companies', labelKey: 'nav.partnerCompanies', module: 'partner' },
  { path: '/partner/programs', labelKey: 'nav.partnerPrograms', module: 'partner' },
  { path: '/partner/contracts', labelKey: 'nav.partnerContracts', module: 'partner' },
  { path: '/partner/calendar', labelKey: 'nav.calendar', module: 'partner', hidden: true },
  // ── Game ──
  { path: '/game', labelKey: 'nav.trexRunner', module: 'game' },
]

/** Module (package) definitions for display */
export const FEATURE_MODULES: { key: FeatureModule; labelKey: string; descriptionKey: string }[] = [
  { key: 'dashboard', labelKey: 'access.pkg.dashboard', descriptionKey: 'access.pkg.dashboardDesc' },
  { key: 'sales', labelKey: 'access.pkg.sales', descriptionKey: 'access.pkg.salesDesc' },
  { key: 'marketing', labelKey: 'access.pkg.marketing', descriptionKey: 'access.pkg.marketingDesc' },
  { key: 'service', labelKey: 'access.pkg.service', descriptionKey: 'access.pkg.serviceDesc' },
  { key: 'finance', labelKey: 'access.pkg.finance', descriptionKey: 'access.pkg.financeDesc' },
  { key: 'invoice', labelKey: 'access.pkg.invoice', descriptionKey: 'access.pkg.invoiceDesc' },
  { key: 'planning', labelKey: 'access.pkg.planning', descriptionKey: 'access.pkg.planningDesc' },
  { key: 'hr', labelKey: 'access.pkg.hr', descriptionKey: 'access.pkg.hrDesc' },
  { key: 'partner', labelKey: 'access.pkg.partner', descriptionKey: 'access.pkg.partnerDesc' },
  { key: 'game', labelKey: 'access.pkg.game', descriptionKey: 'access.pkg.gameDesc' },
  { key: 'my_incentive', labelKey: 'access.pkg.myIncentive', descriptionKey: 'access.pkg.myIncentiveDesc' },
]

/** Routes that require admin role — non-admins are always blocked */
export const ADMIN_ONLY_ROUTES: string[] = ['/hr/employees', '/hr/personal-info', '/partner/instructors']

/** 서비스입금관리: 관리자(admin)만 열람/편집 */
export const SERVICE_FINANCE_ROUTES: string[] = ['/service/external-fees']

/** True for 관리자(admin)만 — 서비스입금관리 열람 및 수수료 수정 권한자. */
export function canManageServiceFinance(user: { role?: string; email?: string } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'admin'
}

/** 파트너 게시판 3종 — 서비스팀(department='service') 소속에게 열람 허용 */
export const PARTNER_BOARD_ROUTES: string[] = ['/partner/students', '/partner/companies', '/partner/contracts']

/** Get all route paths for a module */
export function getRoutesForModule(mod: FeatureModule): string[] {
  return NAV_ROUTE_DEFS.filter(r => r.module === mod).map(r => r.path)
}

/** Get all route paths for a list of modules */
function expandModulesToRoutes(modules: FeatureModule[]): string[] {
  return NAV_ROUTE_DEFS.filter(r => modules.includes(r.module)).map(r => r.path)
}

/** Default feature access per role (module-level) */
export const ROLE_DEFAULT_ACCESS: Record<UserRole, FeatureModule[]> = {
  admin: ['dashboard', 'sales', 'marketing', 'finance', 'invoice', 'service', 'planning', 'hr', 'partner', 'game', 'my_incentive'],
  c_level: ['dashboard', 'sales', 'marketing', 'finance', 'invoice', 'service', 'planning', 'hr', 'partner', 'game', 'my_incentive'],
  sales_manager: ['dashboard', 'sales', 'marketing', 'service', 'finance', 'invoice', 'planning', 'hr', 'partner', 'game', 'my_incentive'],
  service_manager: ['dashboard', 'sales', 'marketing', 'service', 'finance', 'hr', 'game'],
  marketing_manager: ['dashboard', 'marketing', 'game'],
  consultant: ['dashboard', 'sales', 'marketing', 'service', 'finance', 'invoice', 'hr', 'game', 'my_incentive'],
  freelancer: ['dashboard', 'service', 'finance', 'invoice', 'game', 'my_incentive'],
  external: ['dashboard', 'game'],
}

export interface FeatureAccessRecord {
  id: string
  userId: string
  enabledModules: FeatureModule[]
  /** Per-route overrides. If non-empty, used instead of module expansion. */
  enabledRoutes: string[]
  /** 편집(수정) 가능 라우트. `undefined` = 레거시(설정된 적 없음) → 열람 가능한 모든 게시판 편집 허용.
   *  배열이면 명시적 설정: 여기 포함된 게시판만 편집, 나머지는 뷰어(읽기전용). */
  editRoutes?: string[]
  updatedAt: string
}

/** Fetch feature access for all users */
export function useFeatureAccess() {
  return useQuery({
    queryKey: ['feature-access'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_access')
        .select('*')
      if (error) {
        console.warn('feature_access table not found, using role defaults:', error.message)
        return [] as FeatureAccessRecord[]
      }
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        userId: r.user_id as string,
        enabledModules: (r.enabled_modules as FeatureModule[]) || [],
        enabledRoutes: (r.enabled_routes as string[]) || [],
        // null/컬럼없음 → undefined(레거시, 전체 편집 허용). 배열이면 명시적 설정.
        editRoutes: (r.edit_routes as string[] | null) ?? undefined,
        updatedAt: r.updated_at as string,
      }))
    },
  })
}

/** Upsert feature access for a user */
export function useUpdateFeatureAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, enabledModules, enabledRoutes, editRoutes }: {
      userId: string
      enabledModules: FeatureModule[]
      enabledRoutes: string[]
      editRoutes?: string[]
    }) => {
      const row: Record<string, unknown> = {
        user_id: userId,
        enabled_modules: enabledModules,
        enabled_routes: enabledRoutes,
        updated_at: new Date().toISOString(),
      }
      if (editRoutes !== undefined) row.edit_routes = editRoutes
      const { data, error } = await supabase
        .from('feature_access')
        .upsert(row, { onConflict: 'user_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-access'] })
    },
  })
}

/**
 * Get the set of enabled route paths for a user.
 * Admin always gets ALL routes (never blocked by stale custom records).
 * Others: custom enabledRoutes > custom enabledModules (expand) > role defaults (expand).
 */
export function getEffectiveRoutes(
  user: User,
  featureAccessRecords: FeatureAccessRecord[],
): string[] {
  // Admin always has full access to every defined route
  if (user.role === 'admin') {
    return NAV_ROUTE_DEFS.map(r => r.path)
  }
  let routes: string[]
  const custom = featureAccessRecords.find(r => r.userId === user.id)
  if (custom) {
    // enabledRoutes(있으면)는 게시판별로 명시 저장된 권위 있는 목록이다.
    // 모듈 확장과 병합하면 '없음'으로 끈 게시판이 모듈 확장으로 되살아나므로(뷰어로 복원되는 버그)
    // 병합하지 않고 enabledRoutes를 그대로 사용한다. (없을 때만 모듈 확장으로 폴백)
    if (custom.enabledRoutes.length > 0) {
      routes = custom.enabledRoutes
    } else {
      routes = expandModulesToRoutes(custom.enabledModules)
    }
  } else {
    // Role defaults
    const defaultModules = ROLE_DEFAULT_ACCESS[user.role] || ROLE_DEFAULT_ACCESS.external
    routes = expandModulesToRoutes(defaultModules)
  }
  // Non-admin users are always blocked from admin-only routes
  let result = routes.filter(r => !ADMIN_ONLY_ROUTES.includes(r))
  // 서비스입금관리는 재무 권한자(대표·부대표·재무이사)만 열람
  if (!canManageServiceFinance(user)) {
    result = result.filter(r => !SERVICE_FINANCE_ROUTES.includes(r))
  }
  // 서비스팀(department='service') 소속은 파트너 게시판 3종을 열람
  if (user.department === 'service') {
    const set = new Set(result)
    for (const r of PARTNER_BOARD_ROUTES) set.add(r)
    result = [...set]
  }
  return result
}

/**
 * 편집(수정) 가능한 라우트 집합.
 * - admin: 모든 라우트 편집 가능.
 * - 커스텀 접근 기록의 editRoutes가 배열이면 그 목록만 편집(열람 가능 범위 내로 제한).
 * - editRoutes가 없거나(레거시) 커스텀 기록이 없으면 → 열람 가능한 모든 라우트를 편집 허용
 *   (기존 동작 보존: 보이는 게시판은 수정 가능).
 */
export function getEffectiveEditRoutes(
  user: User,
  featureAccessRecords: FeatureAccessRecord[],
): string[] {
  if (user.role === 'admin') return NAV_ROUTE_DEFS.map(r => r.path)
  const viewable = getEffectiveRoutes(user, featureAccessRecords)
  const custom = featureAccessRecords.find(r => r.userId === user.id)
  if (custom && custom.editRoutes !== undefined) {
    const editable = new Set(custom.editRoutes)
    return viewable.filter(r => editable.has(r))
  }
  // 레거시/기본: 보이는 게시판 전부 편집 허용
  return viewable
}

/**
 * Get enabled modules (for sidebar section-level visibility).
 * Kept for backward compatibility.
 */
export function getEffectiveModules(
  user: User,
  featureAccessRecords: FeatureAccessRecord[],
): FeatureModule[] {
  const routes = getEffectiveRoutes(user, featureAccessRecords)
  // Derive modules from routes
  const modules = new Set<FeatureModule>()
  for (const r of routes) {
    const def = NAV_ROUTE_DEFS.find(d => d.path === r)
    if (def) modules.add(def.module)
  }
  return [...modules]
}
