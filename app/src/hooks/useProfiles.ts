import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { User, UserRole, Department } from '@/types'

function mapProfile(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as UserRole,
    department: (row.department as Department) || undefined,
    position: (row.position as string) || undefined,
    isExternal: (row.is_external as boolean) || false,
    avatarUrl: (row.avatar_url as string) || undefined,
    createdAt: row.created_at as string,
  }
}

/** Fetch all user profiles */
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
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
      name?: string
      isExternal?: boolean
    }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (updates.role !== undefined) row.role = updates.role
      if (updates.department !== undefined) row.department = updates.department
      if (updates.position !== undefined) row.position = updates.position
      if (updates.name !== undefined) row.name = updates.name
      if (updates.isExternal !== undefined) row.is_external = updates.isExternal

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
  | 'calendar'
  | 'todos'
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'planning'
  | 'game'

export const FEATURE_MODULES: { key: FeatureModule; label: string; description: string }[] = [
  { key: 'dashboard', label: '대시보드', description: '메인 대시보드' },
  { key: 'calendar', label: '캘린더', description: '구글 캘린더 연동' },
  { key: 'todos', label: '할일', description: '할일 관리' },
  { key: 'sales', label: '세일즈', description: '콜드콜, 리드, 파이프라인, 미팅, 영업 현황' },
  { key: 'marketing', label: '마케팅', description: '마케팅 지표, 광고, 이벤트, 영상' },
  { key: 'finance', label: '재무', description: '계약 관리, 결제 관리' },
  { key: 'planning', label: '경영기획', description: '경영 현황, 매출 Projection, 접근 관리' },
  { key: 'game', label: '쉬는 시간', description: 'T-Rex 러너 게임' },
]

/** Default feature access per role */
export const ROLE_DEFAULT_ACCESS: Record<UserRole, FeatureModule[]> = {
  admin: ['dashboard', 'calendar', 'todos', 'sales', 'marketing', 'finance', 'planning', 'game'],
  manager: ['dashboard', 'calendar', 'todos', 'sales', 'marketing', 'finance', 'planning', 'game'],
  staff: ['dashboard', 'calendar', 'todos', 'sales', 'marketing', 'game'],
  freelancer: ['dashboard', 'calendar', 'todos', 'game'],
  viewer: ['dashboard', 'game'],
}

export interface FeatureAccessRecord {
  id: string
  userId: string
  enabledModules: FeatureModule[]
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
        // Table might not exist yet — return empty
        console.warn('feature_access table not found, using role defaults:', error.message)
        return [] as FeatureAccessRecord[]
      }
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        userId: r.user_id as string,
        enabledModules: (r.enabled_modules as FeatureModule[]) || [],
        updatedAt: r.updated_at as string,
      }))
    },
  })
}

/** Upsert feature access for a user */
export function useUpdateFeatureAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, enabledModules }: { userId: string; enabledModules: FeatureModule[] }) => {
      const { data, error } = await supabase
        .from('feature_access')
        .upsert({
          user_id: userId,
          enabled_modules: enabledModules,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
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
 * Get enabled modules for a specific user.
 * If the user has a custom feature_access record, use that.
 * Otherwise, fall back to role-based defaults.
 */
export function getEffectiveModules(
  user: User,
  featureAccessRecords: FeatureAccessRecord[],
): FeatureModule[] {
  const custom = featureAccessRecords.find(r => r.userId === user.id)
  if (custom) return custom.enabledModules
  return ROLE_DEFAULT_ACCESS[user.role] || ROLE_DEFAULT_ACCESS.viewer
}
