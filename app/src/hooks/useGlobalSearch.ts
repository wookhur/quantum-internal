import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/types'

export interface GlobalSearchResult {
  type: 'lead'
  id: string
  title: string
  subtitle: string
  meta?: string
  stage?: string
  raw: Lead
}

function mapLead(row: Record<string, unknown>): Lead {
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
    pipelineStage: row.pipeline_stage as Lead['pipelineStage'],
    assignedTo: row.assigned_to as string | undefined,
    contactChannel: row.contact_channel as string | undefined,
    googleMeetLink: row.google_meet_link as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useGlobalSearch(query: string) {
  const trimmed = query.trim()

  return useQuery<GlobalSearchResult[]>({
    queryKey: ['global-search', trimmed],
    queryFn: async () => {
      if (!trimmed) return []

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .or(
          `parent_name.ilike.%${trimmed}%,student_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,current_school.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
        )
        .order('updated_at', { ascending: false })
        .limit(10)

      if (error) throw error

      return (data || []).map((row) => {
        const lead = mapLead(row as Record<string, unknown>)
        const nameParts = [lead.parentName]
        if (lead.studentName) nameParts.push(lead.studentName)

        return {
          type: 'lead' as const,
          id: lead.id,
          title: nameParts.join(' / '),
          subtitle: [lead.currentSchool, lead.grade].filter(Boolean).join(' · '),
          meta: lead.region || undefined,
          stage: lead.pipelineStage,
          raw: lead,
        }
      })
    },
    enabled: trimmed.length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
