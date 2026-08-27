import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type MeetingStatus = 'scheduled' | 'done' | 'cancelled'
export type ItemStatus = 'open' | 'in_progress' | 'done'
export type AttendeeResponse = 'yes' | 'no' | 'maybe'

export interface MeetingAgenda {
  id: string
  title: string
  meetingDate?: string
  meetingTime?: string
  location?: string
  attendeeIds: string[]
  status: MeetingStatus
  notes?: string
  decisions?: string
  attendeeResponses: Record<string, AttendeeResponse>
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface MeetingFile {
  id: string
  meetingId: string
  name: string
  url: string
  path?: string
  uploadedBy?: string
  createdAt: string
}

export interface MeetingItem {
  id: string
  meetingId: string
  position: number
  content: string
  ownerId?: string
  status: ItemStatus
  createdBy?: string
  createdAt: string
}

export interface MeetingComment {
  id: string
  meetingId: string
  itemId?: string
  authorId?: string
  content: string
  createdAt: string
}

function mapMeeting(r: Record<string, unknown>): MeetingAgenda {
  return {
    id: r.id as string,
    title: r.title as string,
    meetingDate: (r.meeting_date as string) || undefined,
    meetingTime: (r.meeting_time as string) || undefined,
    location: (r.location as string) || undefined,
    attendeeIds: (r.attendee_ids as string[]) || [],
    status: (r.status as MeetingStatus) || 'scheduled',
    notes: (r.notes as string) || undefined,
    decisions: (r.decisions as string) || undefined,
    attendeeResponses: (r.attendee_responses as Record<string, AttendeeResponse>) || {},
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}
function mapFile(r: Record<string, unknown>): MeetingFile {
  return {
    id: r.id as string,
    meetingId: r.meeting_id as string,
    name: r.name as string,
    url: r.url as string,
    path: (r.path as string) || undefined,
    uploadedBy: (r.uploaded_by as string) || undefined,
    createdAt: r.created_at as string,
  }
}
function mapItem(r: Record<string, unknown>): MeetingItem {
  return {
    id: r.id as string,
    meetingId: r.meeting_id as string,
    position: (r.position as number) || 0,
    content: r.content as string,
    ownerId: (r.owner_id as string) || undefined,
    status: (r.status as ItemStatus) || 'open',
    createdBy: (r.created_by as string) || undefined,
    createdAt: r.created_at as string,
  }
}
function mapComment(r: Record<string, unknown>): MeetingComment {
  return {
    id: r.id as string,
    meetingId: r.meeting_id as string,
    itemId: (r.item_id as string) || undefined,
    authorId: (r.author_id as string) || undefined,
    content: r.content as string,
    createdAt: r.created_at as string,
  }
}

// ── Meetings ──
export function useMeetingAgendas() {
  return useQuery({
    queryKey: ['meeting_agendas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_agendas')
        .select('*')
        .order('meeting_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapMeeting)
    },
  })
}

export function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { title: string; meetingDate?: string; meetingTime?: string; location?: string; attendeeIds?: string[]; notes?: string; createdBy?: string }) => {
      const { data, error } = await supabase.from('meeting_agendas').insert({
        title: m.title,
        meeting_date: m.meetingDate || null,
        meeting_time: m.meetingTime || null,
        location: m.location || null,
        attendee_ids: m.attendeeIds || [],
        notes: m.notes || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapMeeting(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting_agendas'] }),
  })
}

export function useUpdateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { id: string; title?: string; meetingDate?: string; meetingTime?: string; location?: string; attendeeIds?: string[]; status?: MeetingStatus; notes?: string; decisions?: string }) => {
      const row: Record<string, unknown> = {}
      if (m.title !== undefined) row.title = m.title
      if (m.meetingDate !== undefined) row.meeting_date = m.meetingDate || null
      if (m.meetingTime !== undefined) row.meeting_time = m.meetingTime || null
      if (m.location !== undefined) row.location = m.location || null
      if (m.attendeeIds !== undefined) row.attendee_ids = m.attendeeIds
      if (m.status !== undefined) row.status = m.status
      if (m.notes !== undefined) row.notes = m.notes || null
      if (m.decisions !== undefined) row.decisions = m.decisions || null
      const { error } = await supabase.from('meeting_agendas').update(row).eq('id', m.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting_agendas'] }),
  })
}

/** 참석 여부 응답 저장(본인 응답만 병합). */
export function useSetAttendeeResponse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ meetingId, profileId, response, current }: { meetingId: string; profileId: string; response: AttendeeResponse; current: Record<string, AttendeeResponse> }) => {
      const next = { ...current, [profileId]: response }
      const { error } = await supabase.from('meeting_agendas').update({ attendee_responses: next }).eq('id', meetingId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting_agendas'] }),
  })
}

export function useDeleteMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meeting_agendas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting_agendas'] }),
  })
}

// ── Items ──
export function useMeetingItems(meetingId?: string) {
  return useQuery({
    queryKey: ['meeting_agenda_items', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_agenda_items')
        .select('*')
        .eq('meeting_id', meetingId as string)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapItem)
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: { meetingId: string; content: string; ownerId?: string; position?: number; createdBy?: string }) => {
      const { error } = await supabase.from('meeting_agenda_items').insert({
        meeting_id: i.meetingId,
        content: i.content,
        owner_id: i.ownerId || null,
        position: i.position ?? 0,
        created_by: i.createdBy || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_items', v.meetingId] }),
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: { id: string; meetingId: string; content?: string; ownerId?: string | null; status?: ItemStatus; position?: number }) => {
      const row: Record<string, unknown> = {}
      if (i.content !== undefined) row.content = i.content
      if (i.ownerId !== undefined) row.owner_id = i.ownerId || null
      if (i.status !== undefined) row.status = i.status
      if (i.position !== undefined) row.position = i.position
      const { error } = await supabase.from('meeting_agenda_items').update(row).eq('id', i.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_items', v.meetingId] }),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (i: { id: string; meetingId: string }) => {
      const { error } = await supabase.from('meeting_agenda_items').delete().eq('id', i.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_items', v.meetingId] }),
  })
}

// ── Comments ──
export function useMeetingComments(meetingId?: string) {
  return useQuery({
    queryKey: ['meeting_agenda_comments', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_agenda_comments')
        .select('*')
        .eq('meeting_id', meetingId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapComment)
    },
  })
}

export function useCreateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { meetingId: string; itemId?: string; content: string; authorId?: string }) => {
      const { error } = await supabase.from('meeting_agenda_comments').insert({
        meeting_id: c.meetingId,
        item_id: c.itemId || null,
        content: c.content,
        author_id: c.authorId || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_comments', v.meetingId] }),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id: string; meetingId: string }) => {
      const { error } = await supabase.from('meeting_agenda_comments').delete().eq('id', c.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_comments', v.meetingId] }),
  })
}

// ── Files ──
export function useMeetingFiles(meetingId?: string) {
  return useQuery({
    queryKey: ['meeting_agenda_files', meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_agenda_files')
        .select('*')
        .eq('meeting_id', meetingId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapFile)
    },
  })
}

export function useUploadMeetingFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ meetingId, file, uploadedBy }: { meetingId: string; file: File; uploadedBy?: string }) => {
      const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
      const path = `${meetingId}/${Date.now()}-${safe}`
      const up = await supabase.storage.from('meeting-files').upload(path, file, { upsert: true })
      if (up.error) throw up.error
      const { data: { publicUrl } } = supabase.storage.from('meeting-files').getPublicUrl(path)
      const { error } = await supabase.from('meeting_agenda_files').insert({
        meeting_id: meetingId, name: file.name, url: publicUrl, path, uploaded_by: uploadedBy || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_files', v.meetingId] }),
  })
}

export function useDeleteMeetingFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (f: { id: string; meetingId: string; path?: string }) => {
      if (f.path) await supabase.storage.from('meeting-files').remove([f.path])
      const { error } = await supabase.from('meeting_agenda_files').delete().eq('id', f.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['meeting_agenda_files', v.meetingId] }),
  })
}
