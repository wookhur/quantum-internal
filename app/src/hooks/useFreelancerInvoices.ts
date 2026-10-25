import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isValidDateInput, isValidMonthInput } from '@/lib/invoiceForm'
import { canonicalConsultantName } from '@/lib/consultants'

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
  /** 국내/해외 계좌 구분: 'domestic' | 'overseas' */
  accountRegion?: string
  /** 해외 송금 상세 (accountRegion='overseas'일 때) */
  overseasBank?: OverseasBank
}

export interface OverseasBank {
  country?: string
  bankName?: string
  bankAddress?: string
  swift?: string
  routing?: string
  iban?: string
  accountNumber?: string
  accountName?: string
  accountType?: string
  beneficiaryEmail?: string
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
    accountRegion: (r.account_region as string) || undefined,
    overseasBank: (r.overseas_bank as OverseasBank) || undefined,
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
      accountRegion?: string            // 'domestic' | 'overseas'
      overseasBank?: OverseasBank
      items: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      // 발행일이 비면 Postgres 가 'invalid input syntax for type date: ""' 로 막는다.
      // 폼에서도 걸러 주지만, 다른 경로로 들어와도 읽을 수 있는 말로 끝나게 한다.
      if (!isValidDateInput(input.invoiceDate)) {
        throw new Error('발행일이 비어 있습니다. 맨 위 발행일 칸의 날짜를 확인해 주세요.')
      }
      if (!isValidMonthInput(input.invoiceMonth)) {
        throw new Error('정산월이 비어 있습니다. 맨 위 정산월 칸을 확인해 주세요.')
      }
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
      // 해외계좌일 때만 컬럼 참조(국내=기본, 마이그레이션 전에도 국내 발행은 안 깨짐)
      if (input.accountRegion === 'overseas') {
        insertRow.account_region = 'overseas'
        if (input.overseasBank) insertRow.overseas_bank = input.overseasBank
      }
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
      accountRegion?: string
      overseasBank?: OverseasBank
      items?: { itemName: string; quantity: number; unitPrice: number; remark?: string }[]
    }) => {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.invoiceDate !== undefined) {
        if (!isValidDateInput(input.invoiceDate)) {
          throw new Error('발행일이 비어 있습니다. 맨 위 발행일 칸의 날짜를 확인해 주세요.')
        }
        updates.invoice_date = input.invoiceDate
      }
      if (input.clientName !== undefined) updates.client_name = input.clientName || null
      if (input.clientEmail) updates.client_email = input.clientEmail   // 값 있을 때만(마이그레이션 전 안전)
      if (input.accountRegion === 'overseas') {
        updates.account_region = 'overseas'
        if (input.overseasBank) updates.overseas_bank = input.overseasBank
      }
      if (input.residentNumber !== undefined) updates.resident_number = input.residentNumber || null
      if (input.phone !== undefined) updates.phone = input.phone || null
      if (input.bankAccount !== undefined) updates.bank_account = input.bankAccount || null
      if (input.note !== undefined) updates.note = input.note || null

      if (input.items) {
        updates.total_amount = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
      }

      // ── 순서가 중요하다 ──
      // 예전에는 항목을 먼저 지우고 다시 넣은 뒤 인보이스를 수정했는데,
      //  · 항목 insert 가 실패해도 에러를 보지 않아 항목만 통째로 사라졌고,
      //  · 인보이스 update 가 권한(RLS)으로 0행만 바꿔도 에러가 없어 금액만 그대로 남았다.
      // 그래서 ① 인보이스 수정이 실제로 되는지 먼저 확인하고 ② 그 다음에 항목을 교체한다.
      const { data: updated, error } = await supabase
        .from('freelancer_invoices')
        .update(updates)
        .eq('id', input.id)
        .select('id')
      if (error) throw error
      // RLS 로 막히면 에러 없이 0행이 바뀐다 — 저장된 것처럼 보이지 않게 여기서 끊는다.
      if (!updated || updated.length === 0) {
        throw new Error('이 인보이스를 수정할 권한이 없습니다. (저장된 내용 없음)')
      }

      if (input.items) {
        // 새로 넣다가 실패하면 되돌릴 수 있도록 기존 항목을 먼저 확보해 둔다.
        const { data: before, error: readErr } = await supabase
          .from('freelancer_invoice_items')
          .select('*')
          .eq('invoice_id', input.id)
          .order('item_order')
        if (readErr) throw readErr

        const { error: delErr } = await supabase
          .from('freelancer_invoice_items')
          .delete()
          .eq('invoice_id', input.id)
        if (delErr) throw delErr

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
          const { error: insErr } = await supabase.from('freelancer_invoice_items').insert(rows)
          if (insErr) {
            // 항목이 사라진 채로 두지 않는다 — 원래 항목을 되돌린 뒤 실패를 알린다.
            if (before && before.length > 0) {
              await supabase.from('freelancer_invoice_items').insert(before)
            }
            throw insErr
          }
        }
      }
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

/**
 * 지급완료된 인보이스가 '누구의 · 어느 게시판 · 어느 정산월' 을 덮는지.
 *
 * 자동청구 줄이 언제 끝난 것인지는 이미 지급 원장이 알고 있다 — 'John Kim ·
 * 프리랜서(개인) · 2026-08 · 지급 2026-09-04' 가 적혀 있으면 John Kim 의 8월
 * 개인 파트너 줄은 그걸로 끝이다. 사람이 다시 선언할 일이 아니다.
 *
 * 종전에는 인보이스에 적힌 줄 키(covered_incentive_keys)로만 판정했는데, 게시판의
 * '인보이스 발행'이 그 키를 넘기지 않던 시절 건은 비어 있다. 그래서 지급이 끝난
 * 8·9월분이 10월에 다시 올라왔다. 키가 있으면 키로(정확), 없으면 이렇게
 * 사람·게시판·정산월로 판정한다.
 *
 * 게시판을 함께 보는 이유: 한 사람이 같은 달에 세일즈 인센티브와 관리비를 따로
 * 받을 수 있다. 사람·달만 보면 인센티브를 지급한 것으로 관리비까지 꺼진다.
 *
 * 한계: 한 달 치의 일부만 담은 인보이스라도 그 달 전체가 끝난 것으로 본다.
 * 발행이 미지급 목록 전체로 채워지므로 보통은 맞지만, 쪼개 지급했다면 남은 줄을
 * 손으로 되살려야 한다(줄을 눌러 미지급으로 되돌린다).
 */
export type InvoiceBoardGroup = 'incentive' | 'individual' | 'business'

export function invoiceBoardGroup(kind?: string): InvoiceBoardGroup {
  const k = (kind || '').toLowerCase()
  if (k === 'sales_incentive') return 'incentive'
  if (k.includes('business')) return 'business'
  return 'individual'      // freelancer · partner
}

/**
 * 직함·소속을 떼어 이름을 맞춘다 — '오현정대표' ↔ '오현정',
 * '남연서 (케이와이엔)' ↔ '남연서' 를 같은 사람으로 본다.
 *
 * 지급 원장은 '남연서' 로 적히는데 게시판은 '남연서 (케이와이엔)' 로 부르는 식으로
 * 두 쪽 표기가 다르다. 떼어내지 않으면 지급이 끝난 줄을 못 알아본다.
 * 상호가 통째로 괄호인 '(주)조이에듀케이션' 은 떼면 이름이 사라지므로 그대로 둔다.
 */
const NAME_TITLES = /(대표님|대표|이사님|이사|부대표|부장|과장|차장|팀장|실장|원장|선생님|선생|사장님|사장|님|씨)$/
export function invoicePersonKey(s?: string): string {
  // 먼저 별칭 표를 거친다 — 'Julie Kim' → '김지현' 처럼 한 사람이 두 표기로
  // 저장된 건을 모은다(lib/consultants 의 CONSULTANT_NAME_ALIASES)
  let v = canonicalConsultantName((s || '').trim()).trim()
  // 뒤에 붙은 괄호(소속·회사)를 떼되, 떼고 나서 아무것도 안 남으면 두고 쓴다
  const stripped = v.replace(/[(（][^)）]*[)）]\s*$/, '').trim()
  if (stripped) v = stripped
  v = v.replace(/\s+/g, '').toLowerCase()
  let prev = ''
  while (v && v !== prev) { prev = v; v = v.replace(NAME_TITLES, '') }
  return v
}

export interface InvoiceSlotState {
  /** 지급일이 찍힌 인보이스가 하나라도 있는가 — 줄을 내릴지 가르는 기준 */
  paid: boolean
  /** 지급되지 않은 인보이스 중 가장 최근 것의 상태. 왜 안 내려가는지 알려 준다. */
  pendingStatus?: 'draft' | 'submitted' | 'approved' | 'rejected'
  pendingAmount?: number
}

/**
 * 자동청구로 담긴 항목인지. '미팅 2026-08-30 · 8월 발생 · 2개월 이월(소급)' 처럼
 * 발행 화면이 비고에 적어 둔 흔적을 본다. 손으로 적거나 양식으로 올린 항목에는 없다.
 */
const AUTO_ITEM_REMARK = /미팅 \d{4}-\d{2}-\d{2}|\d{1,2}월 발생/
/** 항목명 앞머리의 '(8월분)' — 소급돼 담긴 항목이 어느 달 치인지 */
const CARRIED_ITEM_MONTH = /^\((\d{1,2})월분\)/

/** 'YYYY-MM' 에서 N월을 찾는다. N이 그 달보다 크면 지난해다(소급은 길어야 몇 달). */
function monthOfNumber(n: number, invoiceMonth: string): string {
  const [y, m] = invoiceMonth.split('-').map(Number)
  const year = n <= m ? y : y - 1
  return `${year}-${String(n).padStart(2, '0')}`
}

/**
 * Map<이름키, Map<`${게시판}:${정산월}`, 상태>>.
 *
 * 지급 여부만 보면 '왜 이 달이 안 내려가지' 에 답할 수 없다. 김지현님의 9월
 * 관리비 인보이스가 반려된 채 남아 있던 건이 그 예다 — 게시판에는 반려됐다는
 * 사실이 전혀 안 보여, 지급은 받았는데 줄은 계속 올라오는 것으로만 보였다.
 * 그래서 지급되지 않은 인보이스의 상태도 함께 들고 온다.
 *
 * 누구 것인지·어느 달 치인지를 '인보이스 안의 항목' 에서 읽는다
 * ------------------------------------------------------------------
 * 이름만으로 맞추면 틀린다. 이준형님 관리비는 이상민님 이름으로, 김지현님 관리비는
 * (주)조이에듀케이션 이름으로 청구·수령하기 때문이다. 지급은 끝났는데 청구 목록은
 * 영영 미지급으로 남았다.
 *
 * 그런데 인보이스 항목에 이미 다 적혀 있다 — '(8월분) 8월 1회차 · 박태현' 과
 * 비고의 '미팅 2026-08-30 · 8월 발생 · 2개월 이월(소급)'. 이건 발행 화면이 직접
 * 쓴 문구라, 그 인보이스가 '발행한 사람의 자동청구 줄' 을 담고 있다는 증거다.
 * 그래서 그런 인보이스는
 *   · 받는 사람 이름이 아니라 '발행한 계정' 의 줄을 정산한 것으로 보고,
 *   · 항목의 '(N월분)' 을 모아 그 달들까지 함께 덮는다.
 * 손으로 적거나 양식으로 올린 대리발행에는 그 흔적이 없으므로 종전대로 수령인 이름을
 * 쓴다 — 재무가 남의 것을 대신 발행한 게 본인 줄을 끄면 안 된다.
 *
 * 앞으로 발행하는 건은 줄 번호(covered_incentive_keys)가 함께 저장되므로 이 추론이
 * 필요 없다. 이건 그 연결이 없던 시절 건을 이어 주기 위한 것이다.
 */
export function useInvoiceCoverage() {
  const { data } = useQuery({
    queryKey: ['invoice-coverage'],
    queryFn: async () => {
      const map = new Map<string, Map<string, InvoiceSlotState>>()
      const { data, error } = await supabase
        .from('freelancer_invoices')
        .select('id, kind, invoice_month, client_name, paid_date, status, total_amount, created_at, profiles!freelancer_invoices_freelancer_id_fkey(name)')
        .order('created_at', { ascending: true })
      if (error) { console.warn('인보이스 조회 실패:', error.message); return map }

      // 항목을 따로 받아 인보이스별로 묶는다(중첩 select 는 관계 이름에 의존해 깨지기 쉽다)
      const itemsByInvoice = new Map<string, { name: string; remark: string }[]>()
      const itemRes = await supabase.from('freelancer_invoice_items').select('invoice_id, item_name, remark')
      if (itemRes.error) {
        console.warn('인보이스 항목 조회 실패:', itemRes.error.message)
      } else {
        for (const it of (itemRes.data || []) as Record<string, unknown>[]) {
          const id = it.invoice_id as string
          const arr = itemsByInvoice.get(id) || []
          arr.push({ name: (it.item_name as string) || '', remark: (it.remark as string) || '' })
          itemsByInvoice.set(id, arr)
        }
      }

      for (const r of (data || []) as Record<string, unknown>[]) {
        const month = (r.invoice_month as string) || ''
        if (!/^\d{4}-\d{2}$/.test(month)) continue
        const group = invoiceBoardGroup(r.kind as string)
        const isPaid = !!r.paid_date
        const prof = r.profiles as Record<string, unknown> | null
        const items = itemsByInvoice.get(r.id as string) || []
        // 자동청구 흔적이 있으면 '발행한 계정' 의 줄을 담은 것이다 — 수령인 이름이
        // 달라도(이상민·(주)조이에듀케이션) 그 줄의 주인은 발행자다.
        const fromAutoBilling = items.some(it => AUTO_ITEM_REMARK.test(it.remark) || CARRIED_ITEM_MONTH.test(it.name))
        const owner = fromAutoBilling
          ? ((prof?.name as string) || (r.client_name as string))
          : ((r.client_name as string) || (prof?.name as string))
        const key = invoicePersonKey(owner)
        if (!key) continue

        // 덮는 달: 인보이스의 정산월 + 항목에 '(N월분)' 으로 적힌 소급분의 달.
        // 한 장에 8월분과 9월분이 함께 담기므로 정산월만 보면 8월이 영영 안 내려간다.
        const months = new Set<string>([month])
        if (fromAutoBilling) {
          for (const it of items) {
            const m = CARRIED_ITEM_MONTH.exec(it.name)
            if (m) months.add(monthOfNumber(Number(m[1]), month))
          }
        }

        const slots = map.get(key) || new Map<string, InvoiceSlotState>()
        for (const om of months) {
          const slot = `${group}:${om}`
          const cur = slots.get(slot) || { paid: false }
          if (isPaid) {
            cur.paid = true
          } else {
            // created_at 오름차순이라 뒤에 오는 것이 더 최근 — 그대로 덮는다
            cur.pendingStatus = r.status as InvoiceSlotState['pendingStatus']
            cur.pendingAmount = Number(r.total_amount) || 0
          }
          slots.set(slot, cur)
        }
        map.set(key, slots)
      }
      return map
    },
    staleTime: 30_000,
  })
  return data || new Map<string, Map<string, InvoiceSlotState>>()
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
