import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createNotificationsForUsers } from './useUserNotifications'

const KWAK_JISOO_ID = '1a80e844-703e-41d2-87e7-763a5ea06343'

export type OrderStatus = 'requested' | 'ordered' | 'delivered' | 'rejected'
export type OrderCategory = 'office' | 'snack' | 'equipment' | 'living' | 'other'

export const ORDER_CATEGORIES: { key: OrderCategory; label: string }[] = [
  { key: 'office', label: '사무용품' },
  { key: 'snack', label: '간식/음료' },
  { key: 'equipment', label: '장비/전자기기' },
  { key: 'living', label: '생활용품' },
  { key: 'other', label: '기타' },
]

export const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  requested: { label: '요청됨', className: 'bg-amber-100 text-amber-700' },
  ordered: { label: '주문완료', className: 'bg-blue-100 text-blue-700' },
  delivered: { label: '배송완료', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700' },
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
  status: OrderStatus
  orderedBy?: string
  orderedByName?: string
  orderedAt?: string
  createdAt: string
  updatedAt: string
}

function mapOrder(row: Record<string, unknown>): CoupangOrder {
  const requester = row.requester as Record<string, unknown> | null
  const orderer = row.orderer as Record<string, unknown> | null
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
    status: (row.status as OrderStatus) || 'requested',
    orderedBy: (row.ordered_by as string) || undefined,
    orderedByName: orderer?.name as string | undefined,
    orderedAt: (row.ordered_at as string) || undefined,
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
      return (data || []).map((r) => mapOrder(r as Record<string, unknown>))
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
    }) => {
      const { error } = await supabase.from('coupang_orders').insert({
        requester_id: order.requesterId,
        product_name: order.productName,
        product_url: order.productUrl || null,
        quantity: order.quantity,
        estimated_price: order.estimatedPrice || null,
        category: order.category,
        reason: order.reason || null,
      })
      if (error) throw error

      await createNotificationsForUsers([KWAK_JISOO_ID], {
        type: 'coupang_order',
        title: '쿠팡 주문 요청',
        message: `${order.requesterName}님이 "${order.productName}" 주문을 요청했습니다.`,
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
      orderedBy?: string
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (rest.status !== undefined) {
        update.status = rest.status
        if (rest.status === 'ordered') {
          update.ordered_by = rest.orderedBy || null
          update.ordered_at = new Date().toISOString()
        }
      }
      const { error } = await supabase.from('coupang_orders').update(update).eq('id', id)
      if (error) throw error
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
