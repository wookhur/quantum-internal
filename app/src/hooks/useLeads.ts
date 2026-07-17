import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Lead, LeadActivity, PipelineStage, ActivityType, ConsultationMethod, User } from '@/types'

// ============ FILTER TYPES ============

export interface LeadFilters {
  stage?: PipelineStage | 'all'
  source?: string | 'all'
  assignedTo?: string | 'all'
  search?: string
  dateRange?: { from: string; to: string }
}

export type LeadSortField = 'leadDate' | 'parentName' | 'studentName' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

export interface LeadSort {
  field: LeadSortField
  direction: SortDirection
}

// ============ STATS TYPE ============

export interface LeadStats {
  total: number
  byStage: Record<PipelineStage, number>
  bySource: Record<string, number>
  thisMonth: number
  conversionRate: number // contracted / total
}

// ============ MAPPERS ============

function mapUser(row: Record<string, unknown> | null): User | undefined {
  if (!row) return undefined
  return {
    id: row.id as string,
    email: (row.email as string) || '',
    name: (row.name as string) || '',
    role: row.role as User['role'],
    department: row.department as User['department'],
    position: row.position as string | undefined,
    isExternal: false,
    createdAt: row.created_at as string,
  }
}

function mapLead(row: Record<string, unknown>): Lead {
  // The profiles join comes back as a nested object under the foreign key alias
  const profileData = row.profiles as Record<string, unknown> | null

  return {
    id: row.id as string,
    leadDate: row.lead_date as string,
    parentName: row.parent_name as string,
    studentName: (row.student_name as string) || '',
    email: row.email as string | undefined,
    phone: row.phone as string,
    currentSchool: (row.current_school as string) || '',
    grade: (row.grade as string) || '',
    region: (row.region as string) || '',
    interestArea: (row.interest_area as string) || '',
    sourceChannel: row.source_channel as string,
    memo: (row.memo as string) || '',
    requiredAction: row.required_action as string | undefined,
    pipelineStage: row.pipeline_stage as PipelineStage,
    leadLevel: (row.lead_level as string) || undefined,
    leadLevelReason: (row.lead_level_reason as string) || undefined,
    assignedTo: row.assigned_to as string | undefined,
    assignedUser: mapUser(profileData),
    contactChannel: row.contact_channel as string | undefined,
    googleMeetLink: row.google_meet_link as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapActivity(row: Record<string, unknown>): LeadActivity {
  const profileData = row.profiles as Record<string, unknown> | null

  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    activityType: row.activity_type as ActivityType,
    title: row.title as string,
    content: row.content as string | undefined,
    consultationNumber: row.consultation_number as number | undefined,
    consultationMethod: row.consultation_method as ConsultationMethod | undefined,
    meetingDate: row.meeting_date as string | undefined,
    googleMeetLink: row.google_meet_link as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdBy: row.created_by as string | undefined,
    createdByUser: mapUser(profileData),
    createdAt: row.created_at as string,
  }
}

/** Map a camelCase Lead sort field to the snake_case DB column */
const SORT_FIELD_MAP: Record<LeadSortField, string> = {
  leadDate: 'lead_date',
  parentName: 'parent_name',
  studentName: 'student_name',
  updatedAt: 'updated_at',
}

// ============ Lead → DB payload (camelCase → snake_case) ============

function leadToRow(lead: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (lead.leadDate !== undefined) row.lead_date = lead.leadDate
  if (lead.parentName !== undefined) row.parent_name = lead.parentName
  if (lead.studentName !== undefined) row.student_name = lead.studentName
  if (lead.email !== undefined) row.email = lead.email
  if (lead.phone !== undefined) row.phone = lead.phone
  if (lead.currentSchool !== undefined) row.current_school = lead.currentSchool
  if (lead.grade !== undefined) row.grade = lead.grade
  if (lead.region !== undefined) row.region = lead.region
  if (lead.interestArea !== undefined) row.interest_area = lead.interestArea
  if (lead.sourceChannel !== undefined) row.source_channel = lead.sourceChannel
  if (lead.memo !== undefined) row.memo = lead.memo
  if (lead.requiredAction !== undefined) row.required_action = lead.requiredAction
  if (lead.pipelineStage !== undefined) row.pipeline_stage = lead.pipelineStage
  if (lead.leadLevel !== undefined) row.lead_level = lead.leadLevel || null
  if (lead.leadLevelReason !== undefined) row.lead_level_reason = lead.leadLevelReason || null
  if (lead.assignedTo !== undefined) row.assigned_to = lead.assignedTo
  if (lead.contactChannel !== undefined) row.contact_channel = lead.contactChannel
  if (lead.googleMeetLink !== undefined) row.google_meet_link = lead.googleMeetLink
  return row
}

// ============ HOOKS ============

/**
 * Fetch all leads with filtering, sorting, and assigned-user join.
 */
export function useLeads(
  filters?: LeadFilters,
  sort: LeadSort = { field: 'leadDate', direction: 'desc' },
) {
  return useQuery({
    queryKey: ['leads', filters, sort],
    queryFn: async () => {
      const PAGE_SIZE = 1000
      const allRows: Record<string, unknown>[] = []
      let from = 0

      while (true) {
        let query = supabase
          .from('leads')
          .select('*, profiles!leads_assigned_to_fkey(id, name, email)')
          .order(SORT_FIELD_MAP[sort.field], { ascending: sort.direction === 'asc' })
          .range(from, from + PAGE_SIZE - 1)

        if (filters?.stage && filters.stage !== 'all') {
          query = query.eq('pipeline_stage', filters.stage)
        }
        if (filters?.source && filters.source !== 'all') {
          query = query.eq('source_channel', filters.source)
        }
        if (filters?.assignedTo && filters.assignedTo !== 'all') {
          query = query.eq('assigned_to', filters.assignedTo)
        }
        if (filters?.dateRange) {
          if (filters.dateRange.from) {
            query = query.gte('lead_date', filters.dateRange.from)
          }
          if (filters.dateRange.to) {
            query = query.lte('lead_date', filters.dateRange.to)
          }
        }
        if (filters?.search) {
          const s = filters.search.trim()
          if (s) {
            query = query.or(
              `parent_name.ilike.%${s}%,student_name.ilike.%${s}%,phone.ilike.%${s}%,current_school.ilike.%${s}%`,
            )
          }
        }

        const { data, error } = await query
        if (error) throw error
        const rows = data || []
        allRows.push(...(rows as Record<string, unknown>[]))
        if (rows.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      return allRows.map((row) => mapLead(row))
    },
  })
}

/**
 * Fetch a single lead by ID with full details and activities count.
 */
export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, profiles!leads_assigned_to_fkey(id, name, email)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return mapLead(data as Record<string, unknown>)
    },
    enabled: !!id,
  })
}

/**
 * Create a new lead. Also inserts a system activity "리드 생성".
 */
export function useCreateLead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const row = leadToRow(lead)
      if (!row.pipeline_stage) row.pipeline_stage = 'new_lead'

      const { data, error } = await supabase
        .from('leads')
        .insert(row)
        .select('*, profiles!leads_assigned_to_fkey(id, name, email)')
        .single()
      if (error) throw error

      const created = mapLead(data as Record<string, unknown>)

      // Create system activity for lead creation
      await supabase.from('lead_activities').insert({
        lead_id: created.id,
        activity_type: 'system',
        title: '리드 생성',
        content: `${created.parentName} 리드가 생성되었습니다.`,
        created_by: user?.id ?? null,
      })

      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
}

/**
 * Update lead fields. If pipelineStage changes, also creates a stage_change activity.
 */
export function useUpdateLead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ id, data: updates, previousStage }: {
      id: string
      data: Partial<Lead>
      previousStage?: PipelineStage
    }) => {
      const row = leadToRow(updates)

      const { data, error } = await supabase
        .from('leads')
        .update(row)
        .eq('id', id)
        .select('*, profiles!leads_assigned_to_fkey(id, name, email)')
        .single()
      if (error) throw error

      const updated = mapLead(data as Record<string, unknown>)

      // If pipeline stage changed, record a stage_change activity
      if (
        updates.pipelineStage &&
        previousStage &&
        updates.pipelineStage !== previousStage
      ) {
        await supabase.from('lead_activities').insert({
          lead_id: id,
          activity_type: 'stage_change',
          title: '파이프라인 단계 변경',
          content: `${previousStage} → ${updates.pipelineStage}`,
          metadata: { from: previousStage, to: updates.pipelineStage },
          created_by: user?.id ?? null,
        })
      }

      return updated
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
}

/**
 * Delete a lead by ID.
 */
export function useDeleteLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
}

/**
 * Fetch activities for a lead, ordered by created_at DESC.
 * Joins profiles for created_by user info.
 */
export function useLeadActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*, profiles!lead_activities_created_by_fkey(id, name, email)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((row) => mapActivity(row as Record<string, unknown>))
    },
    enabled: !!leadId,
  })
}

/**
 * Create a new activity on a lead.
 */
export function useCreateActivity() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (activity: {
      leadId: string
      activityType: ActivityType
      title: string
      content?: string
      consultationNumber?: number
      consultationMethod?: ConsultationMethod
      meetingDate?: string
      googleMeetLink?: string
      metadata?: Record<string, unknown>
    }) => {
      const { data, error } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: activity.leadId,
          activity_type: activity.activityType,
          title: activity.title,
          content: activity.content ?? null,
          consultation_number: activity.consultationNumber ?? null,
          consultation_method: activity.consultationMethod ?? null,
          meeting_date: activity.meetingDate ?? null,
          google_meet_link: activity.googleMeetLink ?? null,
          metadata: activity.metadata ?? null,
          created_by: user?.id ?? null,
        })
        .select('*, profiles!lead_activities_created_by_fkey(id, name, email)')
        .single()
      if (error) throw error
      return mapActivity(data as Record<string, unknown>)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads', variables.leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

export function useUpdateActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: {
      id: string
      leadId: string
      data: {
        title?: string
        content?: string | null
        meetingDate?: string | null
      }
    }) => {
      const row: Record<string, unknown> = {}
      if (data.title !== undefined) row.title = data.title
      if (data.content !== undefined) row.content = data.content
      if (data.meetingDate !== undefined) row.meeting_date = data.meetingDate

      const { data: updated, error } = await supabase
        .from('lead_activities')
        .update(row)
        .eq('id', id)
        .select('*, profiles!lead_activities_created_by_fkey(id, name, email)')
        .single()
      if (error) throw error
      return mapActivity(updated as Record<string, unknown>)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] })
    },
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string; leadId: string }) => {
      const { error } = await supabase
        .from('lead_activities')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', variables.leadId] })
    },
  })
}

/**
 * Aggregate stats for the leads dashboard.
 * Returns: total, byStage, bySource, thisMonth, conversionRate.
 */
export function useLeadStats() {
  return useQuery({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      const PAGE_SIZE = 1000
      const allRows: Record<string, unknown>[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('leads')
          .select('pipeline_stage, source_channel, lead_date')
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        const batch = data || []
        allRows.push(...(batch as Record<string, unknown>[]))
        if (batch.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      const rows = allRows
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const stats: LeadStats = {
        total: rows.length,
        byStage: {} as Record<PipelineStage, number>,
        bySource: {} as Record<string, number>,
        thisMonth: 0,
        conversionRate: 0,
      }

      let contractedCount = 0

      for (const row of rows) {
        const stage = row.pipeline_stage as PipelineStage
        const source = row.source_channel as string
        const leadDate = row.lead_date as string

        // By stage
        stats.byStage[stage] = (stats.byStage[stage] || 0) + 1

        // By source
        if (source) {
          stats.bySource[source] = (stats.bySource[source] || 0) + 1
        }

        // This month
        if (leadDate && leadDate >= monthStart) {
          stats.thisMonth++
        }

        // Contracted count for conversion rate
        if (stage === 'contracted') {
          contractedCount++
        }
      }

      stats.conversionRate = stats.total > 0
        ? Math.round((contractedCount / stats.total) * 10000) / 100
        : 0

      return stats
    },
  })
}

export function useSyncGoogleSheetLeads() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-google-sheet-leads')
      if (error) throw error
      return data as { success: boolean; inserted: number; tabs: number; totalFetched: number; errors?: string[] }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] })
    },
  })
}
