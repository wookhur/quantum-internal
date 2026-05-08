import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead, PipelineStage } from '@/types'

// Map DB row to Lead type
function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    leadDate: row.lead_date as string,
    parentName: row.parent_name as string,
    studentName: row.student_name as string || '',
    email: row.email as string,
    phone: row.phone as string,
    currentSchool: row.current_school as string || '',
    grade: row.grade as string || '',
    region: row.region as string || '',
    interestArea: row.interest_area as string || '',
    sourceChannel: row.source_channel as string,
    memo: row.memo as string || '',
    requiredAction: row.required_action as string,
    pipelineStage: row.pipeline_stage as PipelineStage,
    assignedTo: row.assigned_to as string,
    consultations: {
      first: { status: row.consult_1_status as 'pending' | 'completed', date: row.consult_1_date as string, method: row.consult_1_method as string },
      second: { status: row.consult_2_status as 'pending' | 'completed', date: row.consult_2_date as string, method: row.consult_2_method as string },
      third: { status: row.consult_3_status as 'pending' | 'completed', date: row.consult_3_date as string, method: row.consult_3_method as string },
    },
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useLeads(filters?: { stage?: PipelineStage; channel?: string; search?: string }) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .order('lead_date', { ascending: false })

      if (filters?.stage) query = query.eq('pipeline_stage', filters.stage)
      if (filters?.channel) query = query.eq('source_channel', filters.channel)
      if (filters?.search) {
        query = query.or(`parent_name.ilike.%${filters.search}%,student_name.ilike.%${filters.search}%,current_school.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapLead)
    },
  })
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return mapLead(data)
    },
    enabled: !!id,
  })
}

export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const { data, error } = await supabase.from('leads').insert({
        lead_date: lead.leadDate,
        parent_name: lead.parentName,
        student_name: lead.studentName,
        email: lead.email,
        phone: lead.phone,
        current_school: lead.currentSchool,
        grade: lead.grade,
        region: lead.region,
        interest_area: lead.interestArea,
        source_channel: lead.sourceChannel,
        memo: lead.memo,
        pipeline_stage: lead.pipelineStage || 'new_lead',
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: PipelineStage }) => {
      const { error } = await supabase
        .from('leads')
        .update({ pipeline_stage: stage })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}
