import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CompanyInfo {
  address?: string
  website?: string
  studentAppUrl?: string
  bankInfo?: string
  companyPhone?: string
  companyEmail?: string
  notes?: string
}

export function useCompanyInfo() {
  return useQuery({
    queryKey: ['company-info'],
    queryFn: async (): Promise<CompanyInfo> => {
      const { data, error } = await supabase.from('company_info').select('*').eq('id', 'main').maybeSingle()
      if (error) throw error
      const r = (data || {}) as Record<string, unknown>
      return {
        address: (r.address as string) || undefined,
        website: (r.website as string) || undefined,
        studentAppUrl: (r.student_app_url as string) || undefined,
        bankInfo: (r.bank_info as string) || undefined,
        companyPhone: (r.company_phone as string) || undefined,
        companyEmail: (r.company_email as string) || undefined,
        notes: (r.notes as string) || undefined,
      }
    },
  })
}

export function useUpdateCompanyInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (info: CompanyInfo) => {
      const { error } = await supabase.from('company_info').upsert({
        id: 'main',
        address: info.address || null,
        website: info.website || null,
        student_app_url: info.studentAppUrl || null,
        bank_info: info.bankInfo || null,
        company_phone: info.companyPhone || null,
        company_email: info.companyEmail || null,
        notes: info.notes || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-info'] }),
  })
}
