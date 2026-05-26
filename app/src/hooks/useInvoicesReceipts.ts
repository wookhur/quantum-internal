import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type DocumentType = 'invoice' | 'receipt'
export type DocumentStatus = 'draft' | 'sent' | 'viewed'

export interface InvoiceReceipt {
  id: string
  contractId?: string
  installmentId?: string
  type: DocumentType
  docNumber: string
  studentName: string
  contractorName: string
  recipientEmail?: string
  amount: number
  currency: 'KRW' | 'USD'
  paymentMethod?: string
  issuedDate: string
  paidDate?: string
  description?: string
  items: { label: string; amount: number }[]
  status: DocumentStatus
  sentAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

function mapDoc(row: Record<string, unknown>): InvoiceReceipt {
  return {
    id: row.id as string,
    contractId: (row.contract_id as string) || undefined,
    installmentId: (row.installment_id as string) || undefined,
    type: row.type as DocumentType,
    docNumber: row.doc_number as string,
    studentName: row.student_name as string,
    contractorName: row.contractor_name as string,
    recipientEmail: (row.recipient_email as string) || undefined,
    amount: (row.amount as number) || 0,
    currency: (row.currency as 'KRW' | 'USD') || 'KRW',
    paymentMethod: (row.payment_method as string) || undefined,
    issuedDate: row.issued_date as string,
    paidDate: (row.paid_date as string) || undefined,
    description: (row.description as string) || undefined,
    items: (row.items as { label: string; amount: number }[]) || [],
    status: row.status as DocumentStatus,
    sentAt: (row.sent_at as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Fetch all invoices */
export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices_receipts')
        .select('*')
        .eq('type', 'invoice')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => mapDoc(r as Record<string, unknown>))
    },
  })
}

/** Fetch all receipts */
export function useReceipts() {
  return useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices_receipts')
        .select('*')
        .eq('type', 'receipt')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((r) => mapDoc(r as Record<string, unknown>))
    },
  })
}

/** Generate a new document number */
async function generateDocNumber(type: DocumentType): Promise<string> {
  const prefix = type === 'invoice' ? 'INV' : 'RCT'
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')

  // Count existing documents of this type this month for sequential numbering
  const startOfMonth = `${year}-${month}-01`
  const { count } = await supabase
    .from('invoices_receipts')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .gte('created_at', startOfMonth)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefix}-${year}${month}-${seq}`
}

/** Create an invoice or receipt */
export function useCreateDocument() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      type: DocumentType
      contractId?: string
      installmentId?: string
      studentName: string
      contractorName: string
      recipientEmail?: string
      amount: number
      currency?: 'KRW' | 'USD'
      paymentMethod?: string
      issuedDate?: string
      paidDate?: string
      description?: string
      items?: { label: string; amount: number }[]
      autoSend?: boolean
    }) => {
      const docNumber = await generateDocNumber(payload.type)

      const row = {
        type: payload.type,
        doc_number: docNumber,
        contract_id: payload.contractId || null,
        installment_id: payload.installmentId || null,
        student_name: payload.studentName,
        contractor_name: payload.contractorName,
        recipient_email: payload.recipientEmail || null,
        amount: payload.amount,
        currency: payload.currency || 'KRW',
        payment_method: payload.paymentMethod || null,
        issued_date: payload.issuedDate || new Date().toISOString().slice(0, 10),
        paid_date: payload.paidDate || null,
        description: payload.description || null,
        items: payload.items || [],
        status: 'draft' as const,
        created_by: user?.id || null,
      }

      const { data, error } = await supabase
        .from('invoices_receipts')
        .insert(row)
        .select()
        .single()
      if (error) throw error

      // Auto-send if requested and has email
      if (payload.autoSend && payload.recipientEmail && data) {
        try {
          await supabase.functions.invoke('send-document', {
            body: { documentId: data.id },
          })
        } catch (e) {
          console.error('Auto-send failed:', e)
          // Don't throw — document was created successfully
        }
      }

      return mapDoc(data as Record<string, unknown>)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
    },
  })
}

/** Send a document (email) */
export function useSendDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data, error } = await supabase.functions.invoke('send-document', {
        body: { documentId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
    },
  })
}

/** Delete a document */
export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices_receipts')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['receipts'] })
    },
  })
}

/**
 * Auto-issue receipt when payment is confirmed.
 * Called from the payment confirmation flow.
 */
export async function autoIssueReceipt(opts: {
  contractId: string
  installmentId: string
  studentName: string
  contractorName: string
  recipientEmail?: string
  amount: number
  currency: 'KRW' | 'USD'
  paymentMethod?: string
  paidDate: string
  label: string
  createdBy?: string
}) {
  const docNumber = await generateDocNumber('receipt')

  const row = {
    type: 'receipt',
    doc_number: docNumber,
    contract_id: opts.contractId,
    installment_id: opts.installmentId,
    student_name: opts.studentName,
    contractor_name: opts.contractorName,
    recipient_email: opts.recipientEmail || null,
    amount: opts.amount,
    currency: opts.currency,
    payment_method: opts.paymentMethod || null,
    issued_date: new Date().toISOString().slice(0, 10),
    paid_date: opts.paidDate,
    description: opts.label,
    items: [{ label: opts.label, amount: opts.amount }],
    status: 'draft' as const,
    created_by: opts.createdBy || null,
  }

  const { data, error } = await supabase
    .from('invoices_receipts')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Auto-issue receipt failed:', error.message)
    return null
  }

  // Auto-send if email available
  if (opts.recipientEmail && data) {
    try {
      await supabase.functions.invoke('send-document', {
        body: { documentId: data.id },
      })
    } catch (e) {
      console.error('Auto-send receipt failed:', e)
    }
  }

  return data
}

/**
 * Auto-issue invoice when installment is created (due date set).
 * Called from contract creation flow.
 */
export async function autoIssueInvoice(opts: {
  contractId: string
  installmentId: string
  studentName: string
  contractorName: string
  recipientEmail?: string
  amount: number
  currency: 'KRW' | 'USD'
  dueDate?: string
  label: string
  createdBy?: string
}) {
  const docNumber = await generateDocNumber('invoice')

  const row = {
    type: 'invoice',
    doc_number: docNumber,
    contract_id: opts.contractId,
    installment_id: opts.installmentId,
    student_name: opts.studentName,
    contractor_name: opts.contractorName,
    recipient_email: opts.recipientEmail || null,
    amount: opts.amount,
    currency: opts.currency,
    issued_date: new Date().toISOString().slice(0, 10),
    description: opts.label,
    items: [{ label: opts.label, amount: opts.amount }],
    status: 'draft' as const,
    created_by: opts.createdBy || null,
  }

  const { data, error } = await supabase
    .from('invoices_receipts')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('Auto-issue invoice failed:', error.message)
    return null
  }

  // Auto-send if email available
  if (opts.recipientEmail && data) {
    try {
      await supabase.functions.invoke('send-document', {
        body: { documentId: data.id },
      })
    } catch (e) {
      console.error('Auto-send invoice failed:', e)
    }
  }

  return data
}
