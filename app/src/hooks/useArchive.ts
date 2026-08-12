import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ArchiveAttachment { name: string; url: string }

export type ArchiveTeam = 'marketing' | 'service' | 'planning' | 'sales'

export interface ArchiveItem {
  id: string
  title: string
  content: string
  attachments: ArchiveAttachment[]
  team: ArchiveTeam | null
  /** 접근 허가 profiles.id 배열. 빈 배열 = 전체(내부직원) 공개 */
  allowedUserIds: string[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
  authorName?: string
}

function mapRow(r: Record<string, unknown>): ArchiveItem {
  return {
    id: r.id as string,
    title: r.title as string,
    content: (r.content as string) || '',
    attachments: Array.isArray(r.attachments) ? (r.attachments as ArchiveAttachment[]) : [],
    team: (r.team as ArchiveTeam) || null,
    allowedUserIds: Array.isArray(r.allowed_user_ids) ? (r.allowed_user_ids as string[]) : [],
    createdBy: (r.created_by as string) || null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    authorName: (r.profiles as Record<string, unknown> | null)?.name as string | undefined,
  }
}

/** Archive 첨부 업로드 → {name, url} (archive-files 버킷). */
export async function uploadArchiveFile(file: File): Promise<ArchiveAttachment> {
  const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
  const path = `${Date.now()}-${Math.floor(performance.now())}-${safe}`
  const { error } = await supabase.storage.from('archive-files').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('archive-files').getPublicUrl(path)
  return { name: file.name, url: publicUrl }
}

export function useArchiveItems() {
  return useQuery({
    queryKey: ['archive_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('archive_items')
        .select('*, profiles:created_by(name)')
        .order('created_at', { ascending: false })
      if (error) {
        // profiles 조인 실패 시 폴백
        const { data: d2, error: e2 } = await supabase.from('archive_items').select('*').order('created_at', { ascending: false })
        if (e2) throw e2
        return (d2 || []).map(r => mapRow(r as Record<string, unknown>))
      }
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

export function useCreateArchiveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; content: string; attachments: ArchiveAttachment[]; team: ArchiveTeam; allowedUserIds: string[]; createdBy: string }) => {
      const { error } = await supabase.from('archive_items').insert({
        title: input.title,
        content: input.content || '',
        attachments: input.attachments || [],
        team: input.team,
        allowed_user_ids: input.allowedUserIds || [],
        created_by: input.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive_items'] }),
  })
}

export function useUpdateArchiveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; title?: string; content?: string; attachments?: ArchiveAttachment[]; team?: ArchiveTeam; allowedUserIds?: string[] }) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.title !== undefined) row.title = input.title
      if (input.content !== undefined) row.content = input.content
      if (input.attachments !== undefined) row.attachments = input.attachments
      if (input.team !== undefined) row.team = input.team
      if (input.allowedUserIds !== undefined) row.allowed_user_ids = input.allowedUserIds
      const { error } = await supabase.from('archive_items').update(row).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive_items'] }),
  })
}

export function useDeleteArchiveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('archive_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive_items'] }),
  })
}
