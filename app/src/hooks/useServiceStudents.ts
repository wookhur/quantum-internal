import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ServiceStudent,
  ServiceStudentStatus,
  ServiceMeeting,
  ServiceReportStatus,
  ServiceDiaryEntry,
} from '@/types'

// ─── Mappers ───
function mapStudent(row: Record<string, unknown>): ServiceStudent {
  return {
    id: row.id as string,
    name: row.name as string,
    englishName: (row.english_name as string) || undefined,
    school: (row.school as string) || undefined,
    grade: (row.grade as string) || undefined,
    parentName: (row.parent_name as string) || undefined,
    contact: (row.contact as string) || undefined,
    assignedConsultant: (row.assigned_consultant as string) || undefined,
    status: row.status as ServiceStudentStatus,
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapMeeting(row: Record<string, unknown>): ServiceMeeting {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    meetingDate: (row.meeting_date as string) || undefined,
    meetingType: (row.meeting_type as string) || undefined,
    consultantId: (row.consultant_id as string) || undefined,
    summary: (row.summary as string) || undefined,
    reportStatus: row.report_status as ServiceReportStatus,
    reportUrl: (row.report_url as string) || undefined,
    reportDate: (row.report_date as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapDiary(row: Record<string, unknown>): ServiceDiaryEntry {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    entryDate: (row.entry_date as string) || undefined,
    category: (row.category as string) || undefined,
    content: (row.content as string) || undefined,
    authorId: (row.author_id as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// ─── Students ───
export function useServiceStudents() {
  return useQuery({
    queryKey: ['service_students'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_students')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []).map(mapStudent)
    },
  })
}

export function useCreateServiceStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: {
      name: string
      englishName?: string
      school?: string
      grade?: string
      parentName?: string
      contact?: string
      assignedConsultant?: string
      status?: ServiceStudentStatus
      notes?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_students').insert({
        name: s.name,
        english_name: s.englishName,
        school: s.school,
        grade: s.grade,
        parent_name: s.parentName,
        contact: s.contact,
        assigned_consultant: s.assignedConsultant || null,
        status: s.status || 'active',
        notes: s.notes,
        created_by: s.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapStudent(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_students'] }),
  })
}

export function useUpdateServiceStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      name?: string
      englishName?: string
      school?: string
      grade?: string
      parentName?: string
      contact?: string
      assignedConsultant?: string | null
      status?: ServiceStudentStatus
      notes?: string
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.name !== undefined) update.name = rest.name
      if (rest.englishName !== undefined) update.english_name = rest.englishName
      if (rest.school !== undefined) update.school = rest.school
      if (rest.grade !== undefined) update.grade = rest.grade
      if (rest.parentName !== undefined) update.parent_name = rest.parentName
      if (rest.contact !== undefined) update.contact = rest.contact
      if (rest.assignedConsultant !== undefined) update.assigned_consultant = rest.assignedConsultant
      if (rest.status !== undefined) update.status = rest.status
      if (rest.notes !== undefined) update.notes = rest.notes
      const { error } = await supabase.from('service_students').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service_students'] }),
  })
}

export function useDeleteServiceStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_students').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_students'] })
      qc.invalidateQueries({ queryKey: ['service_meetings'] })
      qc.invalidateQueries({ queryKey: ['service_diary'] })
    },
  })
}

// ─── Meetings ───
export function useServiceMeetings(studentId?: string) {
  return useQuery({
    queryKey: ['service_meetings', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_meetings')
        .select('*')
        .eq('student_id', studentId as string)
        .order('meeting_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(mapMeeting)
    },
  })
}

export function useCreateServiceMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: {
      studentId: string
      meetingDate?: string
      meetingType?: string
      consultantId?: string
      summary?: string
      reportStatus?: ServiceReportStatus
      reportUrl?: string
      reportDate?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_meetings').insert({
        student_id: m.studentId,
        meeting_date: m.meetingDate || null,
        meeting_type: m.meetingType,
        consultant_id: m.consultantId || null,
        summary: m.summary,
        report_status: m.reportStatus || 'none',
        report_url: m.reportUrl,
        report_date: m.reportDate || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapMeeting(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] }),
  })
}

export function useUpdateServiceMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      studentId: string
      meetingDate?: string | null
      meetingType?: string
      consultantId?: string | null
      summary?: string
      reportStatus?: ServiceReportStatus
      reportUrl?: string
      reportDate?: string | null
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.meetingDate !== undefined) update.meeting_date = rest.meetingDate
      if (rest.meetingType !== undefined) update.meeting_type = rest.meetingType
      if (rest.consultantId !== undefined) update.consultant_id = rest.consultantId
      if (rest.summary !== undefined) update.summary = rest.summary
      if (rest.reportStatus !== undefined) update.report_status = rest.reportStatus
      if (rest.reportUrl !== undefined) update.report_url = rest.reportUrl
      if (rest.reportDate !== undefined) update.report_date = rest.reportDate
      const { error } = await supabase.from('service_meetings').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] }),
  })
}

export function useDeleteServiceMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] }),
  })
}

// ─── Diary ───
export function useServiceDiary(studentId?: string) {
  return useQuery({
    queryKey: ['service_diary', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_diary')
        .select('*')
        .eq('student_id', studentId as string)
        .order('entry_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).map(mapDiary)
    },
  })
}

export function useCreateServiceDiary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: {
      studentId: string
      entryDate?: string
      category?: string
      content?: string
      authorId?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_diary').insert({
        student_id: d.studentId,
        entry_date: d.entryDate || null,
        category: d.category,
        content: d.content,
        author_id: d.authorId || null,
        created_by: d.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapDiary(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_diary', v.studentId] }),
  })
}

export function useUpdateServiceDiary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      studentId: string
      entryDate?: string | null
      category?: string
      content?: string
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.entryDate !== undefined) update.entry_date = rest.entryDate
      if (rest.category !== undefined) update.category = rest.category
      if (rest.content !== undefined) update.content = rest.content
      const { error } = await supabase.from('service_diary').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_diary', v.studentId] }),
  })
}

export function useDeleteServiceDiary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_diary').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['service_diary', v.studentId] }),
  })
}
