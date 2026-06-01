import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmployeeInfo {
  id: string
  profileId: string
  phone: string | null
  address: string | null
  birthDate: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelation: string | null
  bankName: string | null
  bankAccount: string | null
  bankHolder: string | null
  startDate: string | null
  notes: string | null
  updatedAt: string
}

function mapRow(r: Record<string, unknown>): EmployeeInfo {
  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    phone: r.phone as string | null,
    address: r.address as string | null,
    birthDate: r.birth_date as string | null,
    emergencyContactName: r.emergency_contact_name as string | null,
    emergencyContactPhone: r.emergency_contact_phone as string | null,
    emergencyContactRelation: r.emergency_contact_relation as string | null,
    bankName: r.bank_name as string | null,
    bankAccount: r.bank_account as string | null,
    bankHolder: r.bank_holder as string | null,
    startDate: r.start_date as string | null,
    notes: r.notes as string | null,
    updatedAt: r.updated_at as string,
  }
}

export function useAllEmployeeInfo() {
  return useQuery({
    queryKey: ['employee-info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_info')
        .select('*')
        .order('profile_id')
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useEmployeeInfoByToken(token: string) {
  return useQuery({
    queryKey: ['employee-info-token', token],
    enabled: !!token,
    queryFn: async () => {
      // Verify token
      const { data: tokenData, error: tokenError } = await supabase
        .from('employee_form_tokens')
        .select('*')
        .eq('token', token)
        .is('used_at', null)
        .single()
      if (tokenError || !tokenData) return { valid: false as const }
      if (new Date(tokenData.expires_at as string) < new Date()) return { valid: false as const }

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', tokenData.profile_id)
        .single()

      // Get existing info
      const { data: info } = await supabase
        .from('employee_info')
        .select('*')
        .eq('profile_id', tokenData.profile_id)
        .single()

      return {
        valid: true as const,
        profileId: tokenData.profile_id as string,
        profileName: (profile?.name || '') as string,
        profileEmail: (profile?.email || '') as string,
        info: info ? mapRow(info) : null,
      }
    },
  })
}

export function useUpsertEmployeeInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      profileId: string
      phone?: string | null
      address?: string | null
      birthDate?: string | null
      emergencyContactName?: string | null
      emergencyContactPhone?: string | null
      emergencyContactRelation?: string | null
      bankName?: string | null
      bankAccount?: string | null
      bankHolder?: string | null
      startDate?: string | null
      notes?: string | null
    }) => {
      const { error } = await supabase
        .from('employee_info')
        .upsert(
          {
            profile_id: input.profileId,
            phone: input.phone || null,
            address: input.address || null,
            birth_date: input.birthDate || null,
            emergency_contact_name: input.emergencyContactName || null,
            emergency_contact_phone: input.emergencyContactPhone || null,
            emergency_contact_relation: input.emergencyContactRelation || null,
            bank_name: input.bankName || null,
            bank_account: input.bankAccount || null,
            bank_holder: input.bankHolder || null,
            start_date: input.startDate || null,
            notes: input.notes || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'profile_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-info'] })
      qc.invalidateQueries({ queryKey: ['employee-info-token'] })
    },
  })
}

export function useCreateFormToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase
        .from('employee_form_tokens')
        .insert({ profile_id: profileId })
        .select('token')
        .single()
      if (error) throw error
      return data.token as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-tokens'] })
    },
  })
}

export function useMarkTokenUsed() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await supabase
        .from('employee_form_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token', token)
      if (error) throw error
    },
  })
}
