import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/types'

export interface GlobalSearchResult {
  type: 'lead' | 'contract' | 'project'
  id: string
  title: string
  subtitle: string
  meta?: string
  stage?: string
  navigateTo: string
  raw: unknown
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

      // Search leads, contracts, and projects (todos) in parallel
      const [leadsRes, contractsRes, projectsRes] = await Promise.all([
        // 1) Leads
        supabase
          .from('leads')
          .select('*')
          .or(
            `parent_name.ilike.%${trimmed}%,student_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,current_school.ilike.%${trimmed}%,email.ilike.%${trimmed}%`,
          )
          .order('updated_at', { ascending: false })
          .limit(5),

        // 2) Contracts
        supabase
          .from('contracts')
          .select('id, contractor_name, student_name, school_name, phone, status, contract_date, total_amount, currency')
          .or(
            `contractor_name.ilike.%${trimmed}%,student_name.ilike.%${trimmed}%,school_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`,
          )
          .order('updated_at', { ascending: false })
          .limit(5),

        // 3) Projects (todos)
        supabase
          .from('todos')
          .select('id, title, description, status, priority, due_date')
          .or(
            `title.ilike.%${trimmed}%,description.ilike.%${trimmed}%`,
          )
          .order('updated_at', { ascending: false })
          .limit(5),
      ])

      const results: GlobalSearchResult[] = []

      // Map leads
      if (leadsRes.data) {
        for (const row of leadsRes.data) {
          const lead = mapLead(row as Record<string, unknown>)
          const nameParts = [lead.parentName]
          if (lead.studentName) nameParts.push(lead.studentName)

          results.push({
            type: 'lead',
            id: lead.id,
            title: nameParts.join(' / '),
            subtitle: [lead.currentSchool, lead.grade].filter(Boolean).join(' · '),
            meta: lead.region || undefined,
            stage: lead.pipelineStage,
            navigateTo: `/sales/leads/${lead.id}`,
            raw: lead,
          })
        }
      }

      // Map contracts
      if (contractsRes.data) {
        for (const row of contractsRes.data) {
          const statusLabel: Record<string, string> = {
            active: '진행 중',
            expiring_soon: '만료 임박',
            expired: '만료',
            cancelled: '취소',
          }
          results.push({
            type: 'contract',
            id: row.id,
            title: `${row.contractor_name} / ${row.student_name}`,
            subtitle: [row.school_name, row.contract_date].filter(Boolean).join(' · '),
            meta: `${Number(row.total_amount).toLocaleString()} ${row.currency}`,
            stage: statusLabel[row.status] || row.status,
            navigateTo: `/consulting/contracts/${row.id}`,
            raw: row,
          })
        }
      }

      // Map projects
      if (projectsRes.data) {
        for (const row of projectsRes.data) {
          const statusLabel: Record<string, string> = {
            todo: '대기',
            in_progress: '진행 중',
            done: '완료',
            delayed: '지연',
          }
          results.push({
            type: 'project',
            id: row.id,
            title: row.title,
            subtitle: row.description ? (row.description.length > 50 ? row.description.slice(0, 50) + '…' : row.description) : '',
            meta: row.due_date || undefined,
            stage: statusLabel[row.status] || row.status,
            navigateTo: `/common/todos`,
            raw: row,
          })
        }
      }

      return results
    },
    enabled: trimmed.length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
