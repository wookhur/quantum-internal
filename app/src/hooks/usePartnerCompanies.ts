import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PartnerCompany {
  id: string
  name: string
  businessNumber?: string
  businessName?: string
  ceoName?: string
  contact?: string
  address?: string
  bankAccount?: string
  feePolicy?: string
  infoScope: string[]
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface PartnerCompanyInput {
  name: string
  businessNumber?: string
  businessName?: string
  ceoName?: string
  contact?: string
  address?: string
  bankAccount?: string
  feePolicy?: string
  infoScope?: string[]
  notes?: string
  createdBy?: string
}

function mapRow(row: Record<string, unknown>): PartnerCompany {
  return {
    id: row.id as string,
    name: row.name as string,
    businessNumber: (row.business_number as string) || undefined,
    businessName: (row.business_name as string) || undefined,
    ceoName: (row.ceo_name as string) || undefined,
    contact: (row.contact as string) || undefined,
    address: (row.address as string) || undefined,
    bankAccount: (row.bank_account as string) || undefined,
    feePolicy: (row.fee_policy as string) || undefined,
    infoScope: (row.info_scope as string[]) || [],
    notes: (row.notes as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function toRow(input: Partial<PartnerCompanyInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (input.name !== undefined) row.name = input.name
  if (input.businessNumber !== undefined) row.business_number = input.businessNumber || null
  if (input.businessName !== undefined) row.business_name = input.businessName || null
  if (input.ceoName !== undefined) row.ceo_name = input.ceoName || null
  if (input.contact !== undefined) row.contact = input.contact || null
  if (input.address !== undefined) row.address = input.address || null
  if (input.bankAccount !== undefined) row.bank_account = input.bankAccount || null
  if (input.feePolicy !== undefined) row.fee_policy = input.feePolicy || null
  if (input.infoScope !== undefined) row.info_scope = input.infoScope
  if (input.notes !== undefined) row.notes = input.notes || null
  return row
}

export function usePartnerCompanies() {
  return useQuery({
    queryKey: ['partner_companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partner_companies')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []).map(mapRow)
    },
  })
}

export function useCreatePartnerCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PartnerCompanyInput) => {
      const { data, error } = await supabase
        .from('partner_companies')
        .insert({ ...toRow(input), created_by: input.createdBy || null })
        .select().single()
      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_companies'] }),
  })
}

export function useUpdatePartnerCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<PartnerCompanyInput> & { id: string }) => {
      const { error } = await supabase.from('partner_companies').update(toRow(input)).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_companies'] }),
  })
}

export function useDeletePartnerCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('partner_companies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner_companies'] }),
  })
}
