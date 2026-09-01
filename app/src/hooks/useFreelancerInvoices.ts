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
  kind?: string
  invoiceDate: string
  invoiceMonth: string
  clientName?: string   // 대리작성 수령인 이름 (있으면 표시에 우선)
  clientEmail?: string  // 수령인 이메일 (견적서 엑셀 표기용, 대리발행 시 입력)
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  paidDate?: string | null   // 지급완료일 (설정되면 지급완료로 표시)
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
  /** 이 인보이스가 정산하는 커미션 라인 키(`incentiveId-installmentId`) 목록 */
  coveredIncentiveKeys?: string[]
}

function mapInvoice(r: Record<string, unknown>): FreelancerInvoice {
  const profile = r.profiles as Record<string, unknown> | null
  return {
    id: r.id as string,
    freelancerId: r.freelancer_id as string,
    kind: (r.kind as string) || undefined,
    invoiceDate: r.invoice_date as string,
    invoiceMonth: r.invoice_month as string,
    clientName: (r.client_name as string) || undefined,
    clientEmail: (r.client_email as string) || undefined,
    status: r.status as FreelancerInvoice['status'],
    paidDate: (r.paid_date as string) || null,
    residentNumber: r.resident_number as string | null,
    phone: r.phone as string | null,
    bankAccount: r.bank_account as string | null,
    totalAmount: Number(r.total_amount) || 0,
    note: r.note as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    coveredIncentiveKeys: (r.covered_incentive_keys as string[]) || undefined,
    freelancerName: profile?.name as string | undefined,
    freelancerEmail: profile?.email as string | undefined,
  }
}

/** 표시용 이름: 대리작성 수령인(clientName)이 있으면 우선, 없으면 로그인 계정 이름. */
export function invoiceDisplayName(inv: Pick<FreelancerInvoice, 'clientName' | 'freelancerName' | 'freelancerEmail'>): string {
  return inv.clientName || inv.freelancerName || inv.freelancerEmail || '-'
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

/** 프리랜서 인보이스는 개인·사업자를 한 화면에서 다룬다. 저장은 여전히
 *  kind 로 나뉘어 있으므로(freelancer / freelancer_business) 조회할 때 둘을 함께 읽는다. */
type Kinds = string | string[]
const kindList = (k: Kinds) => (Array.isArray(k) ? k : [k])
const kindKey = (k: Kinds) => kindList(k).join(',')

/** 전원의 인보이스. 재무만 본다 — enabled 를 반드시 넘겨 막을 것.
 *  가려서 안 보여주는 것만으로는 부족하다. 조회 자체가 나가면 다른 사람의
 *  계좌·주민번호·금액이 그 사람 브라우저까지 내려온다. */
export function useFreelancerInvoices(month?: string, kind: Kinds = 'freelancer', enabled: boolean = true) {
  return useQuery({
    queryKey: ['freelancer-invoices', month, kindKey(kind)],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('freelancer_invoices')
        .select('*, profiles!freelancer_invoices_freelancer_id_fkey(name, email)')
        .in('kind', kindList(kind))
        .order('invoice_date', { ascending: false })
      if (month) q = q.eq('invoice_month', month)
      const { data, error } = await q
      if (error) throw error
      return (data || []).map(r => mapInvoice(r as Record<string, unknown>))
    },
  })
}

/** 모든 종류의 인보이스 (재무 대시보드용). month 미지정 시 전체. */
export function useAllInvoices(month?: string) {
  return useQuery({
    queryKey: ['all-invoices', month],
    queryFn: async () => {
      let q = supabase
        .from('freelancer_invoices')
        .select('*, profiles!freelancer_invoices_freelancer_id_fkey(name, email)')
        .order('invoice_date', { ascending: false })
      if (month) q = q.eq('invoice_month', month)
      const { data, error } = await q
      if (error) throw error
      return (data || []).map(r => mapInvoice(r as Record<string, unknown>))
    },
  })
}

export function useMyInvoices(userId?: string, kind: Kinds = 'freelancer') {
  return useQuery({
    queryKey: ['my-invoices', userId, kindKey(kind)],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancer_invoices')
        .select('*, profiles!freelancer_invoices_freelancer_id_fkey(name, email)')
        .eq('freelancer_id', userId!)
        .in('kind', kindList(kind))
        .order('invoice_date', { ascending: false })
      if (error) throw error
      return (data || []).map(r => mapInvoice(r as Record<string, unknown>))
    },
  })
}

/** Signatures ("itemName|unitPrice") of all items already on a worker's
 *  (non-rejected) invoices of a kind — used to avoid re-billing an incentive. */
export function useMyInvoiceItemSignatures(userId?: string, kind: Kinds = 'freelancer') {
  return useQuery({
    queryKey: ['my-invoice-item-sigs', userId, kindKey(kind)],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freelancer_invoice_items')
        .select('item_name, unit_price, freelancer_invoices!inner(freelancer_id, kind, status)')
        .eq('freelancer_invoices.freelancer_id', userId!)
        .in('freelancer_invoices.kind', kindList(kind))
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
      clientName?: string   // 대리작성 시 수령인(신청인) 이름 — 로그인 계정과 별개
      clientEmail?: string  // 수령인 이메일 (견적서 표기)
      residentNumber?: string
      phone?: string
      bankAccount?: string
      note?: string
      coveredIncentiveKeys?: string[]   // 이 인보이스가 정산하는 커미션 라인 키
      items: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      const totalAmount = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
      // covered_incentive_keys 는 마이그레이션 전이면 컬럼이 없으므로, 값이 있을 때만 넣는다.
      // (없을 땐 아예 참조하지 않아 기존 인보이스 생성이 깨지지 않게 한다.)
      const insertRow: Record<string, unknown> = {
        freelancer_id: input.freelancerId,
        invoice_date: input.invoiceDate,
        invoice_month: input.invoiceMonth,
        kind: input.kind || 'freelancer',
        status: 'submitted',
        client_name: input.clientName || null,
        resident_number: input.residentNumber || null,
        phone: input.phone || null,
        bank_account: input.bankAccount || null,
        total_amount: totalAmount,
        note: input.note || null,
      }
      if (input.coveredIncentiveKeys && input.coveredIncentiveKeys.length) {
        insertRow.covered_incentive_keys = input.coveredIncentiveKeys
      }
      if (input.clientEmail) insertRow.client_email = input.clientEmail   // 값 있을 때만(마이그레이션 전 안전)
      const { data: inv, error: invErr } = await supabase
        .from('freelancer_invoices')
        .insert(insertRow)
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
      qc.invalidateQueries({ queryKey: ['all-invoices'] })  // 재무대시보드 즉시 반영
    },
  })
}

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      invoiceDate?: string
      clientName?: string
      clientEmail?: string
      residentNumber?: string
      phone?: string
      bankAccount?: string
      note?: string
      items?: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.invoiceDate) updates.invoice_date = input.invoiceDate
      if (input.clientName !== undefined) updates.client_name = input.clientName || null
      if (input.clientEmail) updates.client_email = input.clientEmail   // 값 있을 때만(마이그레이션 전 안전)
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
      qc.invalidateQueries({ queryKey: ['all-invoices'] })  // 재무대시보드 즉시 반영
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
      qc.invalidateQueries({ queryKey: ['all-invoices'] })
    },
  })
}

/** 지급완료 처리(지급일 기록) / 지급취소(null). status는 그대로 approved 유지. */
export function useSetInvoicePaidDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, paidDate }: { id: string; paidDate: string | null }) => {
      const { error } = await supabase
        .from('freelancer_invoices')
        .update({ paid_date: paidDate, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['freelancer-invoices'] })
      qc.invalidateQueries({ queryKey: ['my-invoices'] })
      qc.invalidateQueries({ queryKey: ['all-invoices'] })
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
      qc.invalidateQueries({ queryKey: ['all-invoices'] })  // 재무대시보드 즉시 반영
    },
  })
}

/** 지급완료(paid_date 있음) 인보이스가 정산한 커미션 키 집합.
 *  재무대시보드 미지급 현황에서 '이미 지급된' 커미션을 빼는 데 쓴다(전월 포함 전체 조회). */
export function usePaidCoveredIncentiveKeys() {
  const { data } = useQuery({
    queryKey: ['paid-covered-incentive-keys'],
    queryFn: async () => {
      const set = new Set<string>()
      const { data, error } = await supabase
        .from('freelancer_invoices')
        .select('covered_incentive_keys, paid_date')
        .not('paid_date', 'is', null)
      if (error) { console.warn('covered_incentive_keys 조회 실패(마이그레이션 전?):', error.message); return set }
      for (const r of (data || []) as Record<string, unknown>[]) {
        for (const k of ((r.covered_incentive_keys as string[]) || [])) set.add(k)
      }
      return set
    },
    staleTime: 30_000,
  })
  return data || new Set<string>()
}

/** 이미 지급완료된 기존 인보이스에 커미션 키를 연결한다(이시형처럼 발행 전 지급된 건 정리용).
 *  대상 = 이름이 일치하는 지급완료 인보이스 중 가장 최근 것. 없으면 NO_PAID_INVOICE 던짐. */
export function useAttachIncentivesToPaidInvoice() {
  const qc = useQueryClient()
  // 직함/공백 제거 후 비교 — "오현정대표" ↔ "오현정" 같은 표기차를 흡수한다.
  const TITLES = /(대표님|대표|이사님|이사|부대표|부장|과장|차장|팀장|실장|원장|선생님|선생|사장님|사장|님|씨)$/
  const norm = (s?: string) => {
    let v = (s || '').replace(/\s+/g, '').toLowerCase()
    let prev = ''
    while (v && v !== prev) { prev = v; v = v.replace(TITLES, '') }  // 직함 반복 제거
    return v
  }
  const nameMatch = (a?: string, b?: string) => {
    const na = norm(a), nb = norm(b)
    if (!na || !nb) return false
    return na === nb || (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na)))
  }
  return useMutation({
    mutationFn: async ({ personName, keys }: { personName: string; keys: string[] }) => {
      if (!keys.length) throw new Error('연결할 커미션이 없습니다.')
      const { data, error } = await supabase
        .from('freelancer_invoices')
        .select('id, covered_incentive_keys, client_name, invoice_date, paid_date, profiles!freelancer_invoices_freelancer_id_fkey(name)')
        .not('paid_date', 'is', null)
        .order('invoice_date', { ascending: false })
      if (error) throw error
      const target = (data || []).find((r: Record<string, unknown>) => {
        const prof = r.profiles as Record<string, unknown> | null
        return nameMatch(r.client_name as string, personName) || nameMatch(prof?.name as string, personName)
      })
      if (!target) throw new Error('NO_PAID_INVOICE')
      const merged = [...new Set([...(((target as Record<string, unknown>).covered_incentive_keys as string[]) || []), ...keys])]
      const { error: upErr } = await supabase
        .from('freelancer_invoices')
        .update({ covered_incentive_keys: merged, updated_at: new Date().toISOString() })
        .eq('id', (target as Record<string, unknown>).id as string)
      if (upErr) throw upErr
      return { invoiceId: (target as Record<string, unknown>).id as string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paid-covered-incentive-keys'] })
      qc.invalidateQueries({ queryKey: ['all-invoices'] })
    },
  })
}

/** 지급완료된 인보이스의 (수령인 이름 + 항목 금액) 멀티셋.
 *  재무대시보드 미지급 현황에서, 이미 지급원장에 지급완료로 잡힌 커미션을
 *  이름+금액으로 자동 대조해 빼는 데 쓴다. key = `${이름정규화}|${금액}` → 개수.
 *  (기존 인보이스에 커미션 연결 정보가 없어도 자동 인식되게) */
export function usePaidCommissionMatches() {
  const norm = (s?: string) => (s || '').replace(/\s+/g, '').toLowerCase()
  const { data } = useQuery({
    queryKey: ['paid-commission-matches'],
    queryFn: async () => {
      const m = new Map<string, number>()
      const { data, error } = await supabase
        .from('freelancer_invoice_items')
        .select('supply_amount, freelancer_invoices!inner(client_name, paid_date, profiles!freelancer_invoices_freelancer_id_fkey(name))')
        .not('freelancer_invoices.paid_date', 'is', null)
      if (error) { console.warn('지급완료 인보이스 항목 조회 실패:', error.message); return m }
      for (const r of (data || []) as Record<string, unknown>[]) {
        const inv = r.freelancer_invoices as Record<string, unknown> | null
        const prof = inv?.profiles as Record<string, unknown> | null
        const name = (inv?.client_name as string) || (prof?.name as string) || ''
        const amt = Math.round(Number(r.supply_amount) || 0)
        if (!name || !amt) continue
        const key = `${norm(name)}|${amt}`
        m.set(key, (m.get(key) || 0) + 1)
      }
      return m
    },
    staleTime: 30_000,
  })
  return data || new Map<string, number>()
}
