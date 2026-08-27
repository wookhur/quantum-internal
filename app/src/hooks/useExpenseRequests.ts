import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type ExpenseFileKind = 'quote' | 'proof'

export interface ExpenseRequest {
  id: string
  title: string
  category?: string
  amount: number
  currency: string
  vendor?: string
  paymentMethod?: string
  description?: string
  neededBy?: string
  status: ExpenseStatus
  requestedBy?: string
  approverId?: string
  approvedAt?: string
  approvalNote?: string
  paidAt?: string
  paidBy?: string
  createdAt: string
  updatedAt: string
}
export interface ExpenseFile {
  id: string
  requestId: string
  kind: ExpenseFileKind
  name: string
  url: string
  path?: string
  uploadedBy?: string
  createdAt: string
}
export interface ExpenseComment {
  id: string
  requestId: string
  authorId?: string
  content: string
  createdAt: string
}

function mapReq(r: Record<string, unknown>): ExpenseRequest {
  return {
    id: r.id as string,
    title: r.title as string,
    category: (r.category as string) || undefined,
    amount: Number(r.amount) || 0,
    currency: (r.currency as string) || 'KRW',
    vendor: (r.vendor as string) || undefined,
    paymentMethod: (r.payment_method as string) || undefined,
    description: (r.description as string) || undefined,
    neededBy: (r.needed_by as string) || undefined,
    status: (r.status as ExpenseStatus) || 'pending',
    requestedBy: (r.requested_by as string) || undefined,
    approverId: (r.approver_id as string) || undefined,
    approvedAt: (r.approved_at as string) || undefined,
    approvalNote: (r.approval_note as string) || undefined,
    paidAt: (r.paid_at as string) || undefined,
    paidBy: (r.paid_by as string) || undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}
function mapFile(r: Record<string, unknown>): ExpenseFile {
  return {
    id: r.id as string, requestId: r.request_id as string, kind: (r.kind as ExpenseFileKind) || 'quote',
    name: r.name as string, url: r.url as string, path: (r.path as string) || undefined,
    uploadedBy: (r.uploaded_by as string) || undefined, createdAt: r.created_at as string,
  }
}
function mapComment(r: Record<string, unknown>): ExpenseComment {
  return { id: r.id as string, requestId: r.request_id as string, authorId: (r.author_id as string) || undefined, content: r.content as string, createdAt: r.created_at as string }
}

export function useExpenseRequests() {
  return useQuery({
    queryKey: ['expense_requests'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_requests').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapReq)
    },
  })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: { title: string; category?: string; amount: number; currency?: string; vendor?: string; paymentMethod?: string; description?: string; neededBy?: string; requestedBy?: string }) => {
      const { data, error } = await supabase.from('expense_requests').insert({
        title: e.title, category: e.category || null, amount: e.amount, currency: e.currency || 'KRW',
        vendor: e.vendor || null, payment_method: e.paymentMethod || null, description: e.description || null,
        needed_by: e.neededBy || null, requested_by: e.requestedBy || null,
      }).select().single()
      if (error) throw error
      return mapReq(data as Record<string, unknown>)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense_requests'] }),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: { id: string; title?: string; category?: string; amount?: number; currency?: string; vendor?: string; paymentMethod?: string; description?: string; neededBy?: string }) => {
      const row: Record<string, unknown> = {}
      if (e.title !== undefined) row.title = e.title
      if (e.category !== undefined) row.category = e.category || null
      if (e.amount !== undefined) row.amount = e.amount
      if (e.currency !== undefined) row.currency = e.currency
      if (e.vendor !== undefined) row.vendor = e.vendor || null
      if (e.paymentMethod !== undefined) row.payment_method = e.paymentMethod || null
      if (e.description !== undefined) row.description = e.description || null
      if (e.neededBy !== undefined) row.needed_by = e.neededBy || null
      const { error } = await supabase.from('expense_requests').update(row).eq('id', e.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense_requests'] }),
  })
}

/** 승인/반려/지급 처리 (재무·관리자). */
export function useSetExpenseStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: { id: string; status: ExpenseStatus; approverId?: string; approvalNote?: string; paidBy?: string; paidAt?: string }) => {
      const row: Record<string, unknown> = { status: e.status }
      if (e.status === 'approved' || e.status === 'rejected') {
        row.approver_id = e.approverId || null
        row.approved_at = new Date().toISOString()
        if (e.approvalNote !== undefined) row.approval_note = e.approvalNote || null
      }
      if (e.status === 'paid') {
        row.paid_by = e.paidBy || null
        row.paid_at = e.paidAt || new Date().toISOString().slice(0, 10)
      }
      const { error } = await supabase.from('expense_requests').update(row).eq('id', e.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense_requests'] }),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expense_requests').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense_requests'] }),
  })
}

// ── Files ──
export function useExpenseFiles(requestId?: string) {
  return useQuery({
    queryKey: ['expense_request_files', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_request_files').select('*').eq('request_id', requestId as string).order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map(mapFile)
    },
  })
}
export function useUploadExpenseFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, file, kind, uploadedBy }: { requestId: string; file: File; kind: ExpenseFileKind; uploadedBy?: string }) => {
      const safe = file.name.replace(/[^\w.\-가-힣]/g, '_')
      const path = `${requestId}/${Date.now()}-${safe}`
      const up = await supabase.storage.from('expense-files').upload(path, file, { upsert: true })
      if (up.error) throw up.error
      const { data: { publicUrl } } = supabase.storage.from('expense-files').getPublicUrl(path)
      const { error } = await supabase.from('expense_request_files').insert({ request_id: requestId, kind, name: file.name, url: publicUrl, path, uploaded_by: uploadedBy || null })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['expense_request_files', v.requestId] }),
  })
}
export function useDeleteExpenseFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (f: { id: string; requestId: string; path?: string }) => {
      if (f.path) await supabase.storage.from('expense-files').remove([f.path])
      const { error } = await supabase.from('expense_request_files').delete().eq('id', f.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['expense_request_files', v.requestId] }),
  })
}

// ── Comments ──
export function useExpenseComments(requestId?: string) {
  return useQuery({
    queryKey: ['expense_request_comments', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_request_comments').select('*').eq('request_id', requestId as string).order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(mapComment)
    },
  })
}
export function useCreateExpenseComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { requestId: string; content: string; authorId?: string }) => {
      const { error } = await supabase.from('expense_request_comments').insert({ request_id: c.requestId, content: c.content, author_id: c.authorId || null })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['expense_request_comments', v.requestId] }),
  })
}
export function useDeleteExpenseComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id: string; requestId: string }) => {
      const { error } = await supabase.from('expense_request_comments').delete().eq('id', c.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['expense_request_comments', v.requestId] }),
  })
}

// ── 카테고리 월 예산 ──
export interface CategoryBudget { category: string; monthlyBudget: number }

export function useCategoryBudgets() {
  return useQuery({
    queryKey: ['expense_category_budgets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_category_budgets').select('category, monthly_budget')
      if (error) return [] as CategoryBudget[] // 테이블 미생성 시 조용히 빈 값
      return (data || []).map(r => ({ category: r.category as string, monthlyBudget: Number(r.monthly_budget) || 0 }))
    },
  })
}

export function useSetCategoryBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ category, monthlyBudget, updatedBy }: { category: string; monthlyBudget: number; updatedBy?: string }) => {
      const { error } = await supabase.from('expense_category_budgets').upsert(
        { category, monthly_budget: monthlyBudget, updated_by: updatedBy || null, updated_at: new Date().toISOString() },
        { onConflict: 'category' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense_category_budgets'] }),
  })
}
