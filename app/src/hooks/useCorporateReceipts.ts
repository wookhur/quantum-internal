import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { createNotificationsForUsers } from './useUserNotifications'

/** 재무이사(직책에 '이사' + '재무'/'finance') id 목록. 없으면 admin으로 폴백. */
async function fetchFinanceDirectorIds(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id, position, role')
  const rows = (data || []) as Record<string, unknown>[]
  const directors = rows.filter(p => {
    const pos = ((p.position as string) || '').toLowerCase()
    return pos.includes('이사') && (pos.includes('재무') || pos.includes('finance'))
  }).map(p => p.id as string)
  if (directors.length) return directors
  return rows.filter(p => p.role === 'admin').map(p => p.id as string)
}

export interface CorporateReceipt {
  id: string
  payer?: string        // 결제인
  reason?: string       // 결제사유
  paidDate?: string     // 결제일
  receiptUrl?: string   // 영수증 첨부
  receiptName?: string
  memo?: string         // 상세보고
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: Record<string, unknown>): CorporateReceipt {
  return {
    id: row.id as string,
    payer: (row.payer as string) || undefined,
    reason: (row.reason as string) || undefined,
    paidDate: (row.paid_date as string) || undefined,
    receiptUrl: (row.receipt_url as string) || undefined,
    receiptName: (row.receipt_name as string) || undefined,
    memo: (row.memo as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useCorporateReceipts() {
  return useQuery({
    queryKey: ['corporate-receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('corporate_receipts')
        .select('*')
        .order('paid_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapRow(r as Record<string, unknown>))
    },
  })
}

/** Upload a receipt image/file to storage, returning its public URL. */
async function uploadReceipt(userId: string, file: File): Promise<{ url: string; name: string }> {
  const MAX_SIZE = 10 * 1024 * 1024
  if (file.size > MAX_SIZE) throw new Error('파일 크기는 10MB 이하만 가능합니다.')
  const ext = file.name.split('.').pop() || 'bin'
  const path = `receipts/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('message-attachments').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('message-attachments').getPublicUrl(path)
  return { url: data.publicUrl, name: file.name }
}

export function useCreateCorporateReceipt() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { payer?: string; reason?: string; paidDate?: string; memo?: string; file?: File | null }) => {
      let receiptUrl: string | undefined
      let receiptName: string | undefined
      if (input.file) {
        const up = await uploadReceipt(user!.id, input.file)
        receiptUrl = up.url
        receiptName = up.name
      }
      const { error } = await supabase.from('corporate_receipts').insert({
        payer: input.payer?.trim() || null,
        reason: input.reason?.trim() || null,
        paid_date: input.paidDate || null,
        receipt_url: receiptUrl || null,
        receipt_name: receiptName || null,
        memo: input.memo?.trim() || null,
        created_by: user?.id || null,
      })
      if (error) throw error

      // 등록 완료 시 재무이사님께 알림 (본인 제외)
      const directorIds = (await fetchFinanceDirectorIds()).filter(id => id !== user?.id)
      await createNotificationsForUsers(directorIds, {
        type: 'corporate_receipt',
        title: '법인카드 영수증 등록',
        message: `${user?.name || '관리자'}님이 영수증을 등록했습니다.${input.reason?.trim() ? ` (${input.reason.trim()})` : ''}`,
        link: '/finance/corporate-receipts',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corporate-receipts'] }),
  })
}

export function useDeleteCorporateReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('corporate_receipts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corporate-receipts'] }),
  })
}
