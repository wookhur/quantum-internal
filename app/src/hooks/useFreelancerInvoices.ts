import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface InvoiceItem {
  id: string
  invoiceId: string
  itemOrder: number
  itemName: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  remark: string | null
}

export interface FreelancerInvoice {
  id: string
  freelancerId: string
  invoiceDate: string
  invoiceMonth: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  residentNumber: string | null
  phone: string | null
  bankAccount: string | null
  totalAmount: number
  note: string | null
  createdAt: string
  updatedAt: string
  freelancerName?: string
  freelancerEmail?: string
  items?: InvoiceItem[]
}

function mapInvoice(r: Record<string, unknown>): FreelancerInvoice {
  const profile = r.profiles as Record<string, unknown> | null
  return {
    id: r.id as string,
    freelancerId: r.freelancer_id as string,
    invoiceDate: r.invoice_date as string,
    invoiceMonth: r.invoice_month as string,
    status: r.status as FreelancerInvoice['status'],
    residentNumber: r.resident_number as string | null,
    phone: r.phone as string | null,
    bankAccount: r.bank_account as string | null,
    totalAmount: Number(r.total_amount) || 0,
    note: r.note as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    freelancerName: profile?.name as string | undefined,
    freelancerEmail: profile?.email as string | undefined,
  }
}

function mapItem(r: Record<string, unknown>): InvoiceItem {
  return {
    id: r.id as string,
    invoiceId: r.invoice_id as string,
    itemOrder: Number(r.item_order),
    itemName: r.item_name as string,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    supplyAmount: Number(r.supply_amount),
    remark: r.remark as string | null,
  }
}

export function useFreelancerInvoices(month?: string, kind: string = 'freelancer') {
  return useQuery({
    queryKey: ['freelancer-invoices', month, kind],
    queryFn: async () => {
      let q = supabase
        .from('freelancer_invoices')
        .select('*, profiles!freelancer_invoices_freelancer_id_fkey(name, email)')
        .eq('kind', kind)
        .order('invoice_date', { ascending: false })
      if (month) q = q.eq('invoice_month', month)
      const { data, error } = await q
      if (error) throw error
      return (data || []).map(r => mapInvoice(r as Record<string, unknown>))
    },
  })
}

export function useMyInvoices(userId?: string, kind: string = 'freelancer') {
  return useQuery({
    queryKey: ['my-invoices', userId, kind],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancer_invoices')
        .select('*, profiles!freelancer_invoices_freelancer_id_fkey(name, email)')
        .eq('freelancer_id', userId!)
        .eq('kind', kind)
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapInvoice(r as Record<string, unknown>))
    },
  })
}

/** Signatures ("itemName|unitPrice") of all items already on a worker's
 *  (non-rejected) invoices of a kind — used to avoid re-billing an incentive. */
export function useMyInvoiceItemSignatures(userId?: string, kind: string = 'freelancer') {
  return useQuery({
    queryKey: ['my-invoice-item-sigs', userId, kind],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancer_invoice_items')
        .select('item_name, unit_price, freelancer_invoices!inner(freelancer_id, kind, status)')
        .eq('freelancer_invoices.freelancer_id', userId!)
        .eq('freelancer_invoices.kind', kind)
      const set = new Set<string>()
      if (error) return set
      ;(data || []).forEach((r: Record<string, unknown>) => {
        const inv = r.freelancer_invoices as Record<string, unknown> | null
        if (inv?.status === 'rejected') return
        set.add(`${(r.item_name as string) || ''}|${Number(r.unit_price) || 0}`)
      })
      return set
    },
  })
}

export function useInvoiceItems(invoiceId?: string) {
  return useQuery({
    queryKey: ['invoice-items', invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancer_invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId!)
        .order('item_order')
      if (error) throw error
      return (data || []).map(r => mapItem(r as Record<string, unknown>))
    },
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      freelancerId: string
      invoiceDate: string
      invoiceMonth: string
      kind?: string
      residentNumber?: string
      phone?: string
      bankAccount?: string
      note?: string
      items: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      const totalAmount = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
      const { data: inv, error: invErr } = await supabase
        .from('freelancer_invoices')
        .insert({
          freelancer_id: input.freelancerId,
          invoice_date: input.invoiceDate,
          invoice_month: input.invoiceMonth,
          kind: input.kind || 'freelancer',
          status: 'submitted',
          resident_number: input.residentNumber || null,
          phone: input.phone || null,
          bank_account: input.bankAccount || null,
          total_amount: totalAmount,
          note: input.note || null,
        })
        .select()
        .single()
      if (invErr) throw invErr

      if (input.items.length > 0) {
        const rows = input.items.map((it, i) => ({
          invoice_id: inv.id,
          item_order: i + 1,
          item_name: it.itemName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          supply_amount: it.quantity * it.unitPrice,
          remark: it.remark || null,
        }))
        const { error: itemErr } = await supabase
          .from('freelancer_invoice_items')
          .insert(rows)
        if (itemErr) throw itemErr
      }
      return inv
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelancer-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoice-item-sigs'] })
    },
  })
}

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      invoiceDate?: string
      residentNumber?: string
      phone?: string
      bankAccount?: string
      note?: string
      items?: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.invoiceDate) updates.invoice_date = input.invoiceDate
      if (input.residentNumber !== undefined) updates.resident_number = input.residentNumber || null
      if (input.phone !== undefined) updates.phone = input.phone || null
      if (input.bankAccount !== undefined) updates.bank_account = input.bankAccount || null
      if (input.note !== undefined) updates.note = input.note || null

      if (input.items) {
        updates.total_amount = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
        await supabase.from('freelancer_invoice_items').delete().eq('invoice_id', input.id)
        const rows = input.items.map((it, i) => ({
          invoice_id: input.id,
          item_order: i + 1,
          item_name: it.itemName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          supply_amount: it.quantity * it.unitPrice,
          remark: it.remark || null,
        }))
        if (rows.length > 0) {
          await supabase.from('freelancer_invoice_items').insert(rows)
        }
      }

      const { error } = await supabase
        .from('freelancer_invoices')
        .update(updates)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelancer-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoice-item-sigs'] })
      qc.invalidateQueries({ queryKey: ['invoice-items'] })
    },
  })
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FreelancerInvoice['status'] }) => {
      const { error } = await supabase
        .from('freelancer_invoices')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelancer-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoice-item-sigs'] })
    },
  })
}

export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('freelancer_invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelancer-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoice-item-sigs'] })
    },
  })
}
