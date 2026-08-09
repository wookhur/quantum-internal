import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 홈페이지 상담신청(우리가 호스팅하는 공개 폼) 제출.
 * SECURITY DEFINER RPC(submit_homepage_lead)를 호출해 leads 생성 + 중복병합 + 세일즈 알림.
 * anon 권한으로 호출되므로 로그인 없이 동작한다.
 */
export function useSubmitConsultation() {
  return useMutation({
    mutationFn: async (p: {
      parentName: string
      studentName: string
      phone: string
      email?: string | null
      school?: string | null
      grade?: string | null
      region?: string | null
      interest?: string | null
      message?: string | null
    }) => {
      const { data, error } = await supabase.rpc('submit_homepage_lead', {
        p_parent_name: p.parentName,
        p_student_name: p.studentName,
        p_phone: p.phone,
        p_email: p.email ?? null,
        p_school: p.school ?? null,
        p_grade: p.grade ?? null,
        p_region: p.region ?? null,
        p_interest: p.interest ?? null,
        p_message: p.message ?? null,
      })
      if (error) throw error
      const res = data as { ok: boolean; leadId?: string; deduped?: boolean; error?: string }
      if (!res?.ok) throw new Error(res?.error || '신청 처리에 실패했습니다.')
      return res
    },
  })
}
