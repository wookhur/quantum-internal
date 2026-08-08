import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface NoticeAttachment { name: string; url: string }

export interface Notice {
  id: string
  title: string
  content: string
  pinned: boolean
  attachments: NoticeAttachment[]
  createdBy: string | null
  createdAt: string
  updatedAt: string
  authorName?: string
}

function mapRow(r: Record<string, unknown>): Notice {
  return {
    id: r.id as string,
    title: r.title as string,
    content: (r.content as string) || '',
    pinned: r.pinned as boolean,
    attachments: Array.isArray(r.attachments) ? (r.attachments as NoticeAttachment[]) : [],
    createdBy: r.created_by as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    authorName: (r.profiles as Record<string, unknown>)?.name as string | undefined,
  }
}

/** 공지 첨부파일 업로드 → {name, url} 반환 (notice-files 버킷). */
export async function uploadNoticeFile(file: File): Promise<NoticeAttachment> {
  const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
  const path = `${Date.now()}-${Math.floor(performance.now())}-${safe}`
  const { error } = await supabase.storage.from('notice-files').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('notice-files').getPublicUrl(path)
  return { name: file.name, url: publicUrl }
}

export function useNotices() {
  return useQuery({
    queryKey: ['notices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notices')
        .select('*, profiles:created_by(name)')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreateNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; content: string; pinned?: boolean; attachments?: NoticeAttachment[]; createdBy: string }) => {
      const { error } = await supabase.from('notices').insert({
        title: input.title,
        content: input.content,
        pinned: input.pinned || false,
        attachments: input.attachments || [],
        created_by: input.createdBy,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notices'] }),
  })
}

export function useUpdateNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; title?: string; content?: string; pinned?: boolean; attachments?: NoticeAttachment[] }) => {
      const { error } = await supabase.from('notices').update({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.pinned !== undefined && { pinned: input.pinned }),
        ...(input.attachments !== undefined && { attachments: input.attachments }),
        updated_at: new Date().toISOString(),
      }).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notices'] }),
  })
}

export function useDeleteNotice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notices'] }),
  })
}
