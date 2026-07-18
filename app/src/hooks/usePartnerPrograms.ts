import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Types ───────────────────────────────────────────────────────
export type ProgramStage = 'inquiry' | 'interest' | 'application' | 'completed'
export type ProgramCommentMethod = 'call' | 'katalk' | 'sms' | 'other'

export const PROGRAM_STAGES: { key: ProgramStage; ko: string; en: string; badge: string }[] = [
  { key: 'inquiry',     ko: '문의', en: 'Inquiry',     badge: 'bg-gray-100 text-gray-600 border-gray-200' },
  { key: 'interest',    ko: '관심', en: 'Interest',    badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'application', ko: '신청', en: 'Application', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'completed',   ko: '완료', en: 'Completed',   badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
]

export const PROGRAM_COMMENT_METHODS: { key: ProgramCommentMethod; ko: string; en: string }[] = [
  { key: 'call',   ko: '통화',  en: 'Call' },
  { key: 'katalk', ko: '카톡',  en: 'KakaoTalk' },
  { key: 'sms',    ko: '문자',  en: 'SMS' },
  { key: 'other',  ko: '기타',  en: 'Other' },
]

export interface PartnerProgram {
  id: string
  /** 파트너사(소속학원) 라벨 — EC_PARTNERS + 서비스 프로그램 학원명과 동일 소스 */
  partnerName: string | null
  name: string
  guide: string | null
  brochureUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ProgramEntry {
  id: string
  programId: string
  leadId: string
  stage: ProgramStage
  note: string | null
  createdAt: string
  // joined lead fields
  parentName: string | null
  studentName: string | null
  phone: string | null
  currentSchool: string | null
  grade: string | null
  sourceChannel: string | null
  leadLevel: string | null
  pipelineStage: string | null
}

export interface ProgramComment {
  id: string
  entryId: string
  method: ProgramCommentMethod
  content: string
  createdBy: string | null
  createdByName: string | null
  createdAt: string
}

// ── Programs ────────────────────────────────────────────────────
function mapProgram(row: Record<string, unknown>): PartnerProgram {
  return {
    id: row.id as string,
    partnerName: (row.partner_name as string) ?? null,
    name: row.name as string,
    guide: (row.guide as string) ?? null,
    brochureUrl: (row.brochure_url as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function usePartnerPrograms() {
  return useQuery({
    queryKey: ['partner-programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_programs')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => mapProgram(r as Record<string, unknown>))
    },
  })
}

export function useCreateProgram() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; partnerName: string | null; guide?: string | null }) => {
      const { data, error } = await supabase
        .from('partner_programs')
        .insert({
          name: input.name,
          partner_name: input.partnerName,
          guide: input.guide ?? null,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return mapProgram(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-programs'] }),
  })
}

export function useUpdateProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; partnerName?: string | null; guide?: string | null; brochureUrl?: string | null }) => {
      const row: Record<string, unknown> = {}
      if (input.name !== undefined) row.name = input.name
      if (input.partnerName !== undefined) row.partner_name = input.partnerName
      if (input.guide !== undefined) row.guide = input.guide
      if (input.brochureUrl !== undefined) row.brochure_url = input.brochureUrl
      const { error } = await supabase.from('partner_programs').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-programs'] }),
  })
}

export function useDeleteProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('partner_programs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-programs'] }),
  })
}

/** Upload a brochure image to storage and save its URL on the program. */
export function useUploadBrochure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ programId, file }: { programId: string; file: File }) => {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${programId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('partner-brochures')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('partner-brochures').getPublicUrl(path)
      const { error: updErr } = await supabase
        .from('partner_programs')
        .update({ brochure_url: publicUrl })
        .eq('id', programId)
      if (updErr) throw updErr
      return publicUrl
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-programs'] }),
  })
}

// ── Program entries (linked leads) ──────────────────────────────
function mapEntry(row: Record<string, unknown>): ProgramEntry {
  const lead = row.leads as Record<string, unknown> | null
  return {
    id: row.id as string,
    programId: row.program_id as string,
    leadId: row.lead_id as string,
    stage: (row.stage as ProgramStage) || 'inquiry',
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
    parentName: (lead?.parent_name as string) ?? null,
    studentName: (lead?.student_name as string) ?? null,
    phone: (lead?.phone as string) ?? null,
    currentSchool: (lead?.current_school as string) ?? null,
    grade: (lead?.grade as string) ?? null,
    sourceChannel: (lead?.source_channel as string) ?? null,
    leadLevel: (lead?.lead_level as string) ?? null,
    pipelineStage: (lead?.pipeline_stage as string) ?? null,
  }
}

export function useProgramEntries(programId: string | undefined) {
  return useQuery({
    queryKey: ['partner-program-entries', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_program_entries')
        .select('*, leads(parent_name, student_name, phone, current_school, grade, source_channel, lead_level, pipeline_stage)')
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map((r) => mapEntry(r as Record<string, unknown>))
    },
  })
}

export function useAddProgramEntry() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { programId: string; leadId: string; stage?: ProgramStage; note?: string }) => {
      const { error } = await supabase.from('partner_program_entries').insert({
        program_id: input.programId,
        lead_id: input.leadId,
        stage: input.stage ?? 'inquiry',
        note: input.note ?? null,
        created_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner-program-entries', v.programId] }),
  })
}

export function useUpdateProgramEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; programId: string; stage?: ProgramStage; note?: string | null }) => {
      const row: Record<string, unknown> = {}
      if (input.stage !== undefined) row.stage = input.stage
      if (input.note !== undefined) row.note = input.note
      const { error } = await supabase.from('partner_program_entries').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner-program-entries', v.programId] }),
  })
}

export function useRemoveProgramEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; programId: string }) => {
      const { error } = await supabase.from('partner_program_entries').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner-program-entries', v.programId] }),
  })
}

// ── Comments (communication log) ────────────────────────────────
function mapComment(row: Record<string, unknown>): ProgramComment {
  const profile = row.profiles as Record<string, unknown> | null
  return {
    id: row.id as string,
    entryId: row.entry_id as string,
    method: (row.method as ProgramCommentMethod) || 'call',
    content: row.content as string,
    createdBy: (row.created_by as string) ?? null,
    createdByName: (profile?.name as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export function useProgramComments(entryId: string | undefined) {
  return useQuery({
    queryKey: ['partner-program-comments', entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_program_comments')
        .select('*, profiles!partner_program_comments_created_by_fkey(name)')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false })
      if (error) {
        // FK-embed may fail if the constraint name differs; fall back without join
        const { data: d2 } = await supabase
          .from('partner_program_comments')
          .select('*')
          .eq('entry_id', entryId)
          .order('created_at', { ascending: false })
        return (d2 || []).map((r) => mapComment(r as Record<string, unknown>))
      }
      return (data || []).map((r) => mapComment(r as Record<string, unknown>))
    },
  })
}

export function useAddProgramComment() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { entryId: string; method: ProgramCommentMethod; content: string }) => {
      const { error } = await supabase.from('partner_program_comments').insert({
        entry_id: input.entryId,
        method: input.method,
        content: input.content,
        created_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner-program-comments', v.entryId] }),
  })
}

export function useDeleteProgramComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; entryId: string }) => {
      const { error } = await supabase.from('partner_program_comments').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['partner-program-comments', v.entryId] }),
  })
}
