import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from './useUserNotifications'

const KWAK_JISOO_ID = '1a80e844-703e-41d2-87e7-763a5ea06343'

export type OrderStatus = 'requested' | 'approved' | 'ordered' | 'delivered' | 'rejected'
export type OrderCategory = 'office' | 'snack' | 'equipment' | 'living' | 'staff_other' | 'customer_other' | 'other'
export type PaymentApproverRole = 'sales_director' | 'finance_director'

/** IDs of users who can approve orders (admin or the '주문승인' permission). */
async function fetchApproverIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .or('role.eq.admin,can_approve_orders.eq.true')
  return (data || []).map((r: Record<string, unknown>) => r.id as string)
}

export const ORDER_CATEGORIES: { key: OrderCategory; labelKey: string }[] = [
  { key: 'office', labelKey: 'coupang.categoryOffice' },
  { key: 'snack', labelKey: 'coupang.categorySnack' },
  { key: 'equipment', labelKey: 'coupang.categoryEquipment' },
  { key: 'living', labelKey: 'coupang.categoryLiving' },
  { key: 'staff_other', labelKey: 'coupang.categoryStaffOther' },
  { key: 'customer_other', labelKey: 'coupang.categoryCustomerOther' },
]

/** Label lookup incl. legacy 'other' (removed from the dropdown but kept for old rows). */
export const ORDER_CATEGORY_LABELS: Record<string, string> = {
  office: 'coupang.categoryOffice',
  snack: 'coupang.categorySnack',
  equipment: 'coupang.categoryEquipment',
  living: 'coupang.categoryLiving',
  staff_other: 'coupang.categoryStaffOther',
  customer_other: 'coupang.categoryCustomerOther',
  other: 'coupang.categoryOther',
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, { labelKey: string; className: string }> = {
  requested: { labelKey: 'coupang.statusRequested', className: 'bg-amber-100 text-amber-700' },
  approved: { labelKey: 'coupang.statusApproved', className: 'bg-violet-100 text-violet-700' },
  ordered: { labelKey: 'coupang.statusOrdered', className: 'bg-blue-100 text-blue-700' },
  delivered: { labelKey: 'coupang.statusDelivered', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { labelKey: 'coupang.statusRejected', className: 'bg-red-100 text-red-700' },
}

export interface CoupangOrder {
  id: string
  requesterId: string
  requesterName?: string
  productName: string
  productUrl?: string
  quantity: number
  estimatedPrice?: number
  category: OrderCategory
  reason?: string
  neededBy?: string
  paymentApproverId?: string
  paymentApproverRole?: PaymentApproverRole
  status: OrderStatus
  orderedBy?: string
  orderedByName?: string
  orderedAt?: string
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

function mapOrder(row: Record<string, unknown>): CoupangOrder {
  const requester = row.requester as Record<string, unknown> | null
  const orderer = row.orderer as Record<string, unknown> | null
  const approver = row.approver as Record<string, unknown> | null
  return {
    id: row.id as string,
    requesterId: row.requester_id as string,
    requesterName: requester?.name as string | undefined,
    productName: row.product_name as string,
    productUrl: (row.product_url as string) || undefined,
    quantity: (row.quantity as number) || 1,
    estimatedPrice: (row.estimated_price as number) || undefined,
    category: (row.category as OrderCategory) || 'office',
    reason: (row.reason as string) || undefined,
    neededBy: (row.needed_by as string) || undefined,
    paymentApproverId: (row.payment_approver_id as string) || undefined,
    paymentApproverRole: (row.payment_approver_role as PaymentApproverRole) || undefined,
    status: (row.status as OrderStatus) || 'requested',
    orderedBy: (row.ordered_by as string) || undefined,
    orderedByName: orderer?.name as string | undefined,
    orderedAt: (row.ordered_at as string) || undefined,
    approvedBy: (row.approved_by as string) || undefined,
    approvedByName: approver?.name as string | undefined,
    approvedAt: (row.approved_at as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useCoupangOrders() {
  return useQuery({
    queryKey: ['coupang-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coupang_orders')
        .select('*, requester:requester_id(name), orderer:ordered_by(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const orders = (data || []).map((r) => mapOrder(r as Record<string, unknown>))
      // approved_by has no FK relationship, so resolve names separately
      const approverIds = [...new Set(orders.map(o => o.approvedBy).filter(Boolean))] as string[]
      if (approverIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', approverIds)
        const nameMap = new Map((profs || []).map((p: Record<string, unknown>) => [p.id as string, p.name as string]))
        orders.forEach(o => { if (o.approvedBy) o.approvedByName = nameMap.get(o.approvedBy) })
      }
      return orders
    },
  })
}

export function useCreateCoupangOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (order: {
      requesterId: string
      requesterName: string
      productName: string
      productUrl?: string
      quantity: number
      estimatedPrice?: number
      category: OrderCategory
      reason?: string
      neededBy?: string
      paymentApproverId?: string
      paymentApproverRole?: PaymentApproverRole
    }) => {
      const { error } = await supabase.from('coupang_orders').insert({
        requester_id: order.requesterId,
        product_name: order.productName,
        product_url: order.productUrl || null,
        quantity: order.quantity,
        estimated_price: order.estimatedPrice || null,
        category: order.category,
        reason: order.reason || null,
        needed_by: order.neededBy || null,
        payment_approver_id: order.paymentApproverId || null,
        payment_approver_role: order.paymentApproverRole || null,
      })
      if (error) throw error

      // Notify the selected 결제요청자 (세일즈이사/재무이사); fall back to all approvers
      const approverIds = await fetchApproverIds()
      const targets = order.paymentApproverId
        ? [order.paymentApproverId]
        : (approverIds.length > 0 ? approverIds : [KWAK_JISOO_ID])
      const urgentTag = order.neededBy ? ` (필요일: ${order.neededBy})` : ''
      await createNotificationsForUsers(targets, {
        type: 'coupang_order',
        title: '주문요청 승인 요청',
        message: `${order.requesterName}님이 "${order.productName}" 주문요청을 보냈습니다.${urgentTag}`,
        link: '/common/coupang-orders',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupang-orders'] }),
  })
}

export function useUpdateCoupangOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      status?: OrderStatus
      actorId?: string
      // for notifying the requester on approve/reject
      requesterId?: string
      productName?: string
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.status !== undefined) {
        update.status = rest.status
        if (rest.status === 'approved') {
          update.approved_by = rest.actorId || null
          update.approved_at = new Date().toISOString()
        }
        if (rest.status === 'ordered') {
          update.ordered_by = rest.actorId || null
          update.ordered_at = new Date().toISOString()
        }
      }
      const { error } = await supabase.from('coupang_orders').update(update).eq('id', id)
      if (error) throw error

      // Let the requester know the approval outcome
      if ((rest.status === 'approved' || rest.status === 'rejected') && rest.requesterId) {
        const approved = rest.status === 'approved'
        await createNotificationsForUsers([rest.requesterId], {
          type: 'coupang_order',
          title: approved ? '주문요청 승인됨' : '주문요청 반려됨',
          message: `"${rest.productName || '요청하신'}" 주문요청이 ${approved ? '승인되었습니다. 곧 주문이 진행됩니다.' : '반려되었습니다.'}`,
          link: '/common/coupang-orders',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupang-orders'] }),
  })
}

export function useDeleteCoupangOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coupang_orders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupang-orders'] }),
  })
}
