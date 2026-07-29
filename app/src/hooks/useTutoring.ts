import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type TutoringStatus = 'applied' | 'completed'

export interface TutoringReg {
  id: string
  studentId: string
  studentName?: string
  studentKoreanName?: string
  tutorName: string
  subject?: string
  startDate?: string
  status: TutoringStatus
  academicSupportId?: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** 신청완료 시 academic support 수업제목 = '{과외선생님} 1:1' */
export function tutoringLessonTitle(tutorName: string): string {
  return `${(tutorName || '').trim()} 1:1`
}

function mapRow(row: Record<string, unknown>): TutoringReg {
  const s = row.service_students as Record<string, unknown> | null
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentName: (s?.name as string) || undefined,
    studentKoreanName: (s?.korean_name as string) || undefined,
    tutorName: (row.tutor_name as string) || '',
    subject: (row.subject as string) || undefined,
    startDate: (row.start_date as string) || undefined,
    status: (row.status as TutoringStatus) || 'applied',
    academicSupportId: (row.academic_support_id as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useAllTutoring() {
  return useQuery({
    queryKey: ['tutoring_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tutoring_registrations')
        .select('*, service_students:student_id(name, korean_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

// academic support 레코드 생성(신청완료 연동): 수업제목='{과외선생님} 1:1', 시작일
async function createLinkedAcademicSupport(reg: Pick<TutoringReg, 'studentId' | 'tutorName' | 'subject' | 'startDate' | 'createdBy'>): Promise<string> {
  const { data, error } = await supabase.from('service_academic_support').insert({
    student_id: reg.studentId,
    academy_name: tutoringLessonTitle(reg.tutorName),   // 수업제목
    subject: reg.subject || null,
    period_start: reg.startDate || null,
    notes: '과외 (과외강사관리 연동)',
    created_by: reg.createdBy || null,
  }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export function useCreateTutoring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: Omit<TutoringReg, 'id' | 'createdAt' | 'updatedAt' | 'studentName' | 'studentKoreanName' | 'academicSupportId'>) => {
      const { data, error } = await supabase.from('tutoring_registrations').insert({
        student_id: r.studentId,
        tutor_name: r.tutorName,
        subject: r.subject || null,
        start_date: r.startDate || null,
        status: r.status || 'applied',
        notes: r.notes || null,
        created_by: r.createdBy || null,
      }).select().single()
      if (error) throw error
      const reg = mapRow(data as Record<string, unknown>)
      // 생성 시 이미 신청완료면 바로 연동
      if (reg.status === 'completed') {
        const asId = await createLinkedAcademicSupport(reg)
        await supabase.from('tutoring_registrations').update({ academic_support_id: asId }).eq('id', reg.id)
      }
      return reg
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tutoring_all'] })
      qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] })
      qc.invalidateQueries({ queryKey: ['service-program-fees'] })
    },
  })
}

/** 상태 변경: 신청완료 시 academic support 생성, 신청으로 되돌리면 연동 레코드 삭제 */
export function useSetTutoringStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ reg, status }: { reg: TutoringReg; status: TutoringStatus }) => {
      if (status === 'completed' && !reg.academicSupportId) {
        const asId = await createLinkedAcademicSupport(reg)
        const { error } = await supabase.from('tutoring_registrations')
          .update({ status, academic_support_id: asId, updated_at: new Date().toISOString() }).eq('id', reg.id)
        if (error) throw error
      } else if (status === 'applied' && reg.academicSupportId) {
        await supabase.from('service_academic_support').delete().eq('id', reg.academicSupportId)
        const { error } = await supabase.from('tutoring_registrations')
          .update({ status, academic_support_id: null, updated_at: new Date().toISOString() }).eq('id', reg.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tutoring_registrations')
          .update({ status, updated_at: new Date().toISOString() }).eq('id', reg.id)
        if (error) throw error
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tutoring_all'] })
      qc.invalidateQueries({ queryKey: ['academic_support', v.reg.studentId] })
      qc.invalidateQueries({ queryKey: ['service-program-fees'] })
    },
  })
}

export function useUpdateTutoring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: { id: string; studentId: string; academicSupportId?: string } & Partial<Pick<TutoringReg, 'tutorName' | 'subject' | 'startDate' | 'notes'>>) => {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (r.tutorName !== undefined) row.tutor_name = r.tutorName
      if (r.subject !== undefined) row.subject = r.subject || null
      if (r.startDate !== undefined) row.start_date = r.startDate || null
      if (r.notes !== undefined) row.notes = r.notes || null
      const { error } = await supabase.from('tutoring_registrations').update(row).eq('id', r.id)
      if (error) throw error
      // 이미 연동된 academic support가 있으면 함께 갱신(수업제목·과목·시작일)
      if (r.academicSupportId) {
        const asRow: Record<string, unknown> = {}
        if (r.tutorName !== undefined) asRow.academy_name = tutoringLessonTitle(r.tutorName)
        if (r.subject !== undefined) asRow.subject = r.subject || null
        if (r.startDate !== undefined) asRow.period_start = r.startDate || null
        if (Object.keys(asRow).length) await supabase.from('service_academic_support').update(asRow).eq('id', r.academicSupportId)
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tutoring_all'] })
      qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] })
      qc.invalidateQueries({ queryKey: ['service-program-fees'] })
    },
  })
}

export function useDeleteTutoring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, academicSupportId }: { id: string; studentId: string; academicSupportId?: string }) => {
      if (academicSupportId) await supabase.from('service_academic_support').delete().eq('id', academicSupportId)
      const { error } = await supabase.from('tutoring_registrations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tutoring_all'] })
      qc.invalidateQueries({ queryKey: ['academic_support', v.studentId] })
      qc.invalidateQueries({ queryKey: ['service-program-fees'] })
    },
  })
}
