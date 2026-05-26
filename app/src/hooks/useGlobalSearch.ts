import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/types'

export interface GlobalSearchResult {
  type: 'lead' | 'contract' | 'project' | 'student'
  id: string
  title: string
  subtitle: string
  meta?: string
  stage?: string
  navigateTo: string
  raw: unknown
  /** Names associated with this result for person-level grouping */
  personNames?: string[]
}

export interface PersonGroup {
  displayName: string
  records: GlobalSearchResult[]
}

/** Group results by person identity (matching names across types) */
export function groupByPerson(results: GlobalSearchResult[]): {
  personGroups: PersonGroup[]
  ungrouped: GlobalSearchResult[]
} {
  // Separate person-related results from non-person (projects)
  const personResults = results.filter(r => r.type !== 'project')
  const ungrouped = results.filter(r => r.type === 'project')

  // Build a union-find-like grouping by shared names
  const groups: GlobalSearchResult[][] = []
  const assigned = new Set<string>()

  for (let i = 0; i < personResults.length; i++) {
    if (assigned.has(personResults[i].id)) continue

    const group = [personResults[i]]
    assigned.add(personResults[i].id)
    const namesA = personResults[i].personNames || []

    for (let j = i + 1; j < personResults.length; j++) {
      if (assigned.has(personResults[j].id)) continue
      const namesB = personResults[j].personNames || []

      // Check if any name matches (case-insensitive, ignoring empty)
      const hasCommon = namesA.some(
        a => a && namesB.some(b => b && a.trim().toLowerCase() === b.trim().toLowerCase())
      )
      if (hasCommon) {
        group.push(personResults[j])
        assigned.add(personResults[j].id)
      }
    }
    groups.push(group)
  }

  // Only create person groups for results that actually merged (2+ records)
  // Single results stay in their type sections
  const personGroups: PersonGroup[] = []
  const singleResults: GlobalSearchResult[] = []

  for (const group of groups) {
    if (group.length > 1) {
      // Pick the most representative name
      const allNames = group.flatMap(r => r.personNames || []).filter(Boolean)
      const displayName = allNames[0] || group[0].title.split(' / ')[0]
      personGroups.push({ displayName, records: group })
    } else {
      singleResults.push(group[0])
    }
  }

  return { personGroups, ungrouped: [...singleResults, ...ungrouped] }
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

      // Search leads, contracts, students, and projects (todos) in parallel
      const [leadsRes, contractsRes, studentsRes, projectsRes] = await Promise.all([
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

        // 3) Service Students
        supabase
          .from('service_students')
          .select('id, name, korean_name, school, grade, status, assigned_consultant, preferred_language')
          .or(
            `name.ilike.%${trimmed}%,korean_name.ilike.%${trimmed}%,school.ilike.%${trimmed}%`,
          )
          .order('updated_at', { ascending: false })
          .limit(5),

        // 4) Projects (todos)
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
            personNames: [lead.parentName, lead.studentName].filter(Boolean),
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
            navigateTo: `/consulting/clients/${row.id}`,
            raw: row,
            personNames: [row.contractor_name as string, row.student_name as string].filter(Boolean),
          })
        }
      }

      // Map students
      if (studentsRes.data) {
        for (const row of studentsRes.data) {
          const displayName = [row.name, row.korean_name].filter(Boolean).join(' / ')
          results.push({
            type: 'student',
            id: row.id,
            title: displayName || '학생',
            subtitle: [row.school, row.grade, row.preferred_language ? `🗣 ${row.preferred_language}` : ''].filter(Boolean).join(' · '),
            meta: row.status || undefined,
            stage: row.assigned_consultant || undefined,
            navigateTo: `/service/student-360?student=${row.id}`,
            raw: row,
            personNames: [row.name as string, row.korean_name as string].filter(Boolean),
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
            navigateTo: `/todos`,
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
