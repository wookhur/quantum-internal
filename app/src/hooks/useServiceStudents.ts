import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ServiceStudent,
  ServiceMeeting,
  ServiceReportStatus,
  ServiceDiaryEntry,
  MeetingStatus,
  MeetingCancelledBy,
} from '@/types'
import { createNotificationsForUsers } from './useUserNotifications'

// ─── Mappers ───
function mapStudent(row: Record<string, unknown>): ServiceStudent {
  return {
    id: row.id as string,
    name: row.name as string,
    koreanName: (row.korean_name as string) || undefined,
    email: (row.email as string) || undefined,
    parentEmail: (row.parent_email as string) || undefined,
    nationality: (row.nationality as string) || undefined,
    parentName: (row.parent_name as string) || undefined,
    contact: (row.contact as string) || undefined,
    region: (row.region as string) || undefined,
    grade: (row.grade as string) || undefined,
    school: (row.school as string) || undefined,
    assignedConsultant: (row.assigned_consultant as string) || undefined,
    essayEditor: (row.essay_editor as string) || undefined,
    partners: (row.partners as string) || undefined,
    majors: (row.majors as string) || undefined,
    contractType: (row.contract_type as string) || undefined,
    applicationCount: (row.application_count as number) || undefined,
    additionalServices: (row.additional_services as string) || undefined,
    communicationPlatform: (row.communication_platform as string) || undefined,
    preferredLanguage: (row.preferred_language as string) || undefined,
    startDate: (row.start_date as string) || undefined,
    endDate: (row.end_date as string) || undefined,
    status: (row.status as string) || undefined,
    notes: (row.notes as string) || undefined,
    acceptedUni: (row.accepted_uni as string) || undefined,
    address: (row.address as string) || undefined,
    regularMeetingSchedule: (row.regular_meeting_schedule as string) || undefined,
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
    prepUrl: (row.prep_url as string) || undefined,
    reportStatus: row.report_status as ServiceReportStatus,
    reportUrl: (row.report_url as string) || undefined,
    reportDate: (row.report_date as string) || undefined,
    status: (row.status as MeetingStatus) || 'held',
    cancellationReason: (row.cancellation_reason as string) || undefined,
    cancelledBy: (row.cancelled_by as MeetingCancelledBy) || undefined,
    rescheduledTo: (row.rescheduled_to as string) || undefined,
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
    prepUrl: (row.prep_url as string) || undefined,
    summaryUrl: (row.summary_url as string) || undefined,
    agendaItems: (row.agenda_items as string) || undefined,
    meetingSummary: (row.meeting_summary as string) || undefined,
    extracurricularNotes: (row.extracurricular_notes as string) || undefined,
    identityNarrativeNotes: (row.identity_narrative_notes as string) || undefined,
    questionsConcerns: (row.questions_concerns as string) || undefined,
    nextMeetingAgenda: (row.next_meeting_agenda as string) || undefined,
    followUpCommitments: (row.follow_up_commitments as string) || undefined,
    assignments: (row.assignments as string) || undefined,
    criticalDates: (row.critical_dates as string) || undefined,
    criticalIssue: (row.critical_issue as string) || undefined,
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
      koreanName?: string
      email?: string
      parentEmail?: string
      nationality?: string
      parentName?: string
      contact?: string
      region?: string
      grade?: string
      school?: string
      assignedConsultant?: string
      essayEditor?: string
      partners?: string
      majors?: string
      contractType?: string
      applicationCount?: number
      additionalServices?: string
      communicationPlatform?: string
      preferredLanguage?: string
      startDate?: string
      endDate?: string
      status?: string
      notes?: string
      acceptedUni?: string
      address?: string
      regularMeetingSchedule?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_students').insert({
        name: s.name,
        korean_name: s.koreanName,
        email: s.email,
        parent_email: s.parentEmail,
        nationality: s.nationality,
        parent_name: s.parentName,
        contact: s.contact,
        region: s.region,
        grade: s.grade,
        school: s.school,
        assigned_consultant: s.assignedConsultant || null,
        essay_editor: s.essayEditor,
        partners: s.partners,
        majors: s.majors,
        contract_type: s.contractType,
        application_count: s.applicationCount || null,
        additional_services: s.additionalServices || null,
        communication_platform: s.communicationPlatform,
        preferred_language: s.preferredLanguage,
        start_date: s.startDate || null,
        end_date: s.endDate || null,
        status: s.status || 'active',
        notes: s.notes,
        accepted_uni: s.acceptedUni,
        address: s.address,
        regular_meeting_schedule: s.regularMeetingSchedule,
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
      koreanName?: string
      email?: string
      parentEmail?: string
      nationality?: string
      parentName?: string
      contact?: string
      region?: string
      grade?: string
      school?: string
      assignedConsultant?: string | null
      essayEditor?: string
      partners?: string
      majors?: string
      contractType?: string
      applicationCount?: number
      additionalServices?: string
      communicationPlatform?: string
      preferredLanguage?: string
      startDate?: string | null
      endDate?: string | null
      status?: string
      notes?: string
      acceptedUni?: string
      address?: string
      regularMeetingSchedule?: string
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.name !== undefined) update.name = rest.name
      if (rest.koreanName !== undefined) update.korean_name = rest.koreanName
      if (rest.email !== undefined) update.email = rest.email
      if (rest.parentEmail !== undefined) update.parent_email = rest.parentEmail
      if (rest.nationality !== undefined) update.nationality = rest.nationality
      if (rest.parentName !== undefined) update.parent_name = rest.parentName
      if (rest.contact !== undefined) update.contact = rest.contact
      if (rest.region !== undefined) update.region = rest.region
      if (rest.grade !== undefined) update.grade = rest.grade
      if (rest.school !== undefined) update.school = rest.school
      if (rest.assignedConsultant !== undefined) update.assigned_consultant = rest.assignedConsultant
      if (rest.essayEditor !== undefined) update.essay_editor = rest.essayEditor
      if (rest.partners !== undefined) update.partners = rest.partners
      if (rest.majors !== undefined) update.majors = rest.majors
      if (rest.contractType !== undefined) update.contract_type = rest.contractType
      if (rest.applicationCount !== undefined) update.application_count = rest.applicationCount || null
      if (rest.additionalServices !== undefined) update.additional_services = rest.additionalServices || null
      if (rest.communicationPlatform !== undefined) update.communication_platform = rest.communicationPlatform
      if (rest.preferredLanguage !== undefined) update.preferred_language = rest.preferredLanguage
      if (rest.startDate !== undefined) update.start_date = rest.startDate
      if (rest.endDate !== undefined) update.end_date = rest.endDate
      if (rest.status !== undefined) update.status = rest.status
      if (rest.notes !== undefined) update.notes = rest.notes
      if (rest.acceptedUni !== undefined) update.accepted_uni = rest.acceptedUni
      if (rest.address !== undefined) update.address = rest.address
      if (rest.regularMeetingSchedule !== undefined) update.regular_meeting_schedule = rest.regularMeetingSchedule
      const { error } = await supabase.from('service_students').update(update).eq('id', id)
      if (error) throw error

      // If consultant was assigned, notify them
      if (rest.assignedConsultant) {
        // Look up the consultant's profile by name to get their user ID
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('name', rest.assignedConsultant)
          .limit(1)
        if (profiles && profiles.length > 0) {
          // Get student name for the notification
          const { data: student } = await supabase
            .from('service_students')
            .select('name')
            .eq('id', id)
            .single()
          const studentName = (student?.name as string) || '학생'
          createNotificationsForUsers([profiles[0].id as string], {
            type: 'consultant_assigned',
            title: '고객 배정 알림',
            message: `${studentName} 학생이 배정되었습니다.`,
            link: `/service/student-360?student=${id}`,
            metadata: { studentId: id, studentName, consultantName: rest.assignedConsultant },
          })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service_students'] })
      qc.invalidateQueries({ queryKey: ['user-notifications'] })
    },
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
      prepUrl?: string
      reportStatus?: ServiceReportStatus
      reportUrl?: string
      reportDate?: string
      status?: MeetingStatus
      cancellationReason?: string | null
      cancelledBy?: MeetingCancelledBy | null
      rescheduledTo?: string | null
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_meetings').insert({
        student_id: m.studentId,
        meeting_date: m.meetingDate || null,
        meeting_type: m.meetingType,
        consultant_id: m.consultantId || null,
        summary: m.summary,
        prep_url: m.prepUrl,
        report_status: m.reportStatus || 'none',
        report_url: m.reportUrl,
        report_date: m.reportDate || null,
        status: m.status || 'held',
        cancellation_reason: m.cancellationReason || null,
        cancelled_by: m.cancelledBy || null,
        rescheduled_to: m.rescheduledTo || null,
        created_by: m.createdBy || null,
      }).select().single()
      if (error) throw error
      return mapMeeting(data as Record<string, unknown>)
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] })
      qc.invalidateQueries({ queryKey: ['dashboard_meetings'] })
      qc.invalidateQueries({ queryKey: ['student_status_missing_reports'] })
    },
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
      prepUrl?: string
      reportStatus?: ServiceReportStatus
      reportUrl?: string
      reportDate?: string | null
      status?: MeetingStatus
      cancellationReason?: string | null
      cancelledBy?: MeetingCancelledBy | null
      rescheduledTo?: string | null
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.meetingDate !== undefined) update.meeting_date = rest.meetingDate
      if (rest.meetingType !== undefined) update.meeting_type = rest.meetingType
      if (rest.consultantId !== undefined) update.consultant_id = rest.consultantId
      if (rest.summary !== undefined) update.summary = rest.summary
      if (rest.prepUrl !== undefined) update.prep_url = rest.prepUrl
      if (rest.reportStatus !== undefined) update.report_status = rest.reportStatus
      if (rest.reportUrl !== undefined) update.report_url = rest.reportUrl
      if (rest.reportDate !== undefined) update.report_date = rest.reportDate
      if (rest.status !== undefined) update.status = rest.status
      if (rest.cancellationReason !== undefined) update.cancellation_reason = rest.cancellationReason
      if (rest.cancelledBy !== undefined) update.cancelled_by = rest.cancelledBy
      if (rest.rescheduledTo !== undefined) update.rescheduled_to = rest.rescheduledTo
      const { error } = await supabase.from('service_meetings').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] })
      qc.invalidateQueries({ queryKey: ['dashboard_meetings'] })
      qc.invalidateQueries({ queryKey: ['student_status_missing_reports'] })
    },
  })
}

export function useDeleteServiceMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; studentId: string }) => {
      const { error } = await supabase.from('service_meetings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['service_meetings', v.studentId] })
      qc.invalidateQueries({ queryKey: ['dashboard_meetings'] })
      qc.invalidateQueries({ queryKey: ['student_status_missing_reports'] })
    },
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
      prepUrl?: string
      summaryUrl?: string
      agendaItems?: string
      meetingSummary?: string
      extracurricularNotes?: string
      identityNarrativeNotes?: string
      questionsConcerns?: string
      nextMeetingAgenda?: string
      followUpCommitments?: string
      assignments?: string
      criticalDates?: string
      criticalIssue?: string
      authorId?: string
      createdBy?: string
    }) => {
      const { data, error } = await supabase.from('service_diary').insert({
        student_id: d.studentId,
        entry_date: d.entryDate || null,
        prep_url: d.prepUrl,
        summary_url: d.summaryUrl,
        agenda_items: d.agendaItems,
        meeting_summary: d.meetingSummary,
        extracurricular_notes: d.extracurricularNotes,
        identity_narrative_notes: d.identityNarrativeNotes,
        questions_concerns: d.questionsConcerns,
        next_meeting_agenda: d.nextMeetingAgenda,
        follow_up_commitments: d.followUpCommitments,
        assignments: d.assignments,
        critical_dates: d.criticalDates,
        critical_issue: d.criticalIssue,
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
      prepUrl?: string
      summaryUrl?: string
      agendaItems?: string
      meetingSummary?: string
      extracurricularNotes?: string
      identityNarrativeNotes?: string
      questionsConcerns?: string
      nextMeetingAgenda?: string
      followUpCommitments?: string
      assignments?: string
      criticalDates?: string
      criticalIssue?: string
    }) => {
      const { id, studentId: _s, ...rest } = payload
      const update: Record<string, unknown> = {}
      if (rest.entryDate !== undefined) update.entry_date = rest.entryDate
      if (rest.prepUrl !== undefined) update.prep_url = rest.prepUrl
      if (rest.summaryUrl !== undefined) update.summary_url = rest.summaryUrl
      if (rest.agendaItems !== undefined) update.agenda_items = rest.agendaItems
      if (rest.meetingSummary !== undefined) update.meeting_summary = rest.meetingSummary
      if (rest.extracurricularNotes !== undefined) update.extracurricular_notes = rest.extracurricularNotes
      if (rest.identityNarrativeNotes !== undefined) update.identity_narrative_notes = rest.identityNarrativeNotes
      if (rest.questionsConcerns !== undefined) update.questions_concerns = rest.questionsConcerns
      if (rest.nextMeetingAgenda !== undefined) update.next_meeting_agenda = rest.nextMeetingAgenda
      if (rest.followUpCommitments !== undefined) update.follow_up_commitments = rest.followUpCommitments
      if (rest.assignments !== undefined) update.assignments = rest.assignments
      if (rest.criticalDates !== undefined) update.critical_dates = rest.criticalDates
      if (rest.criticalIssue !== undefined) update.critical_issue = rest.criticalIssue
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
