import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { VideoProject, VideoStatus } from '@/types'

function mapVideoProject(row: Record<string, unknown>): VideoProject {
  return {
    id: row.id as string,
    title: row.title as string,
    category: row.category as string | undefined,
    status: row.status as VideoStatus,
    assignedTo: row.assigned_to as string | undefined,
    dueDate: row.due_date as string | undefined,
    platform: row.platform as VideoProject['platform'],
    views: row.views as number | undefined,
    likes: row.likes as number | undefined,
    comments: row.comments as number | undefined,
    shares: row.shares as number | undefined,
    publishedUrl: row.published_url as string | undefined,
    checklist: row.checklist as Record<string, boolean> | undefined,
    notes: row.notes as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useVideoProjects(filters?: { status?: VideoStatus }) {
  return useQuery({
    queryKey: ['video_projects', filters],
    queryFn: async () => {
      let query = supabase
        .from('video_projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (filters?.status) query = query.eq('status', filters.status)

      const { data, error } = await query
      if (error) throw error
      return (data || []).map(mapVideoProject)
    },
  })
}

export function useCreateVideoProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      category?: string
      status?: VideoStatus
      assignedTo?: string
      dueDate?: string
      platform?: VideoProject['platform']
      notes?: string
      checklist?: Record<string, boolean>
    }) => {
      const { data, error } = await supabase
        .from('video_projects')
        .insert({
          title: input.title,
          category: input.category || null,
          status: input.status || 'idea',
          assigned_to: input.assignedTo || null,
          due_date: input.dueDate || null,
          platform: input.platform || null,
          notes: input.notes || null,
          checklist: input.checklist || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video_projects'] }),
  })
}

export function useUpdateVideoProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      title?: string
      category?: string | null
      status?: VideoStatus
      assignedTo?: string | null
      dueDate?: string | null
      platform?: VideoProject['platform'] | null
      views?: number
      likes?: number
      comments?: number
      shares?: number
      publishedUrl?: string | null
      checklist?: Record<string, boolean> | null
      notes?: string | null
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.title !== undefined) update.title = rest.title
      if (rest.category !== undefined) update.category = rest.category
      if (rest.status !== undefined) update.status = rest.status
      if (rest.assignedTo !== undefined) update.assigned_to = rest.assignedTo
      if (rest.dueDate !== undefined) update.due_date = rest.dueDate
      if (rest.platform !== undefined) update.platform = rest.platform
      if (rest.views !== undefined) update.views = rest.views
      if (rest.likes !== undefined) update.likes = rest.likes
      if (rest.comments !== undefined) update.comments = rest.comments
      if (rest.shares !== undefined) update.shares = rest.shares
      if (rest.publishedUrl !== undefined) update.published_url = rest.publishedUrl
      if (rest.checklist !== undefined) update.checklist = rest.checklist
      if (rest.notes !== undefined) update.notes = rest.notes

      const { error } = await supabase
        .from('video_projects')
        .update(update)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video_projects'] }),
  })
}

export function useDeleteVideoProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('video_projects')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video_projects'] }),
  })
}
