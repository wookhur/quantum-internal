import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Package, ExternalLink, Loader2, Trash2, CalendarClock } from 'lucide-react'
import {
  useCoupangOrders,
  useCreateCoupangOrder,
  useUpdateCoupangOrder,
  useDeleteCoupangOrder,
  ORDER_CATEGORIES,
  ORDER_CATEGORY_LABELS,
  ORDER_STATUS_CONFIG,
  type OrderCategory,
  type OrderStatus,
  type CoupangOrder,
  type PaymentApproverRole,
} from '@/hooks/useCoupangOrders'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useT } from '@/i18n/LanguageContext'
import { daysFromTodayKST } from '@/lib/date'

/** Urgency from the needed-by date: ≤2 days → urgent(red), ≤7 days → normal(green). */
function urgencyOf(neededBy?: string): 'urgent' | 'normal' | 'none' {
  if (!neededBy) return 'none'
  const d = daysFromTodayKST(neededBy)
  if (d <= 2) return 'urgent'
  if (d <= 7) return 'normal'
  return 'none'
}

type Tab = 'all' | 'mine'

export function CoupangOrdersPage() {
  const t = useT()
  const { user } = useAuth()
  const { data: orders = [], isLoading } = useCoupangOrders()
  const { data: profiles = [] } = useProfiles()
  const createOrder = useCreateCoupangOrder()
  const updateOrder = useUpdateCoupangOrder()
  const deleteOrder = useDeleteCoupangOrder()

  const [tab, setTab] = useState<Tab>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    paymentApproverRole: '' as '' | PaymentApproverRole,
    productName: '',
    productUrl: '',
    quantity: '1',
    estimatedPrice: '',
    category: 'office' as OrderCategory,
    neededBy: '',
    reason: '',
  })

  // 세일즈이사/재무이사 = 직책(position)에 '이사' + 세일즈/재무 키워드가 있는 직원
  const findDirector = (kind: 'sales' | 'finance') => profiles.find((p) => {
    const pos = (p.position || '').toLowerCase()
    if (!pos.includes('이사')) return false
    return kind === 'sales'
      ? (pos.includes('세일즈') || pos.includes('영업') || pos.includes('sales'))
      : (pos.includes('재무') || pos.includes('finance'))
  })
  const approverIdFor = (role: '' | PaymentApproverRole): string | undefined => {
    if (role === 'sales_director') return findDirector('sales')?.id
    if (role === 'finance_director') return findDirector('finance')?.id
    return undefined
  }

  // '주문승인' permission holders (or admin) can approve and progress orders
  const isApprover = user?.role === 'admin' || !!user?.canApproveOrders

  const filtered = tab === 'mine'
    ? orders.filter((o) => o.requesterId === user?.id)
    : orders

  function resetForm() {
    setForm({ paymentApproverRole: '', productName: '', productUrl: '', quantity: '1', estimatedPrice: '', category: 'office', neededBy: '', reason: '' })
  }

  const canSubmit = !!form.productName.trim() && !!form.productUrl.trim() && !!form.paymentApproverRole && !createOrder.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !canSubmit) return
    await createOrder.mutateAsync({
      requesterId: user.id,
      requesterName: user.name,
      productName: form.productName.trim(),
      productUrl: form.productUrl.trim() || undefined,
      quantity: Number(form.quantity) || 1,
      estimatedPrice: Number(form.estimatedPrice) || undefined,
      category: form.category,
      reason: form.reason.trim() || undefined,
      neededBy: form.neededBy || undefined,
      paymentApproverRole: (form.paymentApproverRole || undefined) as PaymentApproverRole | undefined,
      paymentApproverId: approverIdFor(form.paymentApproverRole),
    })
    resetForm()
    setShowForm(false)
  }

  async function handleStatusChange(order: CoupangOrder, status: OrderStatus) {
    await updateOrder.mutateAsync({
      id: order.id,
      status,
      actorId: user?.id,
      requesterId: order.requesterId,
      productName: order.productName,
    })
  }

  async function handleDelete(id: string) {
    await deleteOrder.mutateAsync(id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('coupang.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('coupang.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('coupang.newOrder')}
        </Button>
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        <Button variant={tab === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTab('all')}>
          {t('coupang.all')} ({orders.length})
        </Button>
        <Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mine')}>
          {t('coupang.myRequests')} ({orders.filter((o) => o.requesterId === user?.id).length})
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>{t('coupang.noOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isApprover={isApprover}
              isOwner={order.requesterId === user?.id}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('coupang.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 결제요청자 (맨 위) */}
            <div>
              <Label>{t('coupang.paymentApprover')} <span className="text-red-500">*</span></Label>
              <Select value={form.paymentApproverRole || undefined} onValueChange={(v) => setForm({ ...form, paymentApproverRole: (v as PaymentApproverRole) })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('coupang.paymentApprover')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_director">{t('coupang.paymentApproverSales')}</SelectItem>
                  <SelectItem value="finance_director">{t('coupang.paymentApproverFinance')}</SelectItem>
                </SelectContent>
              </Select>
              {form.paymentApproverRole && !approverIdFor(form.paymentApproverRole) && (
                <p className="text-[11px] text-amber-600 mt-1">해당 직책(이사) 직원을 찾지 못해, 승인 권한자 전체에게 알림이 갑니다.</p>
              )}
            </div>
            <div>
              <Label>{t('coupang.productName')} <span className="text-red-500">*</span></Label>
              <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
            </div>
            <div>
              <Label>{t('coupang.productUrl')} <span className="text-red-500">*</span></Label>
              <Input value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="https://" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('coupang.quantity')}</Label>
                <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label>{t('coupang.estimatedPrice')}</Label>
                <Input type="number" value={form.estimatedPrice} onChange={(e) => setForm({ ...form, estimatedPrice: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{t('coupang.category')}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as OrderCategory })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('coupang.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{t(c.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 필요한 날짜 (사유 위) + 긴급도 표시 */}
            <div>
              <Label>{t('coupang.neededBy')}</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} className="flex-1" />
                {(() => {
                  const u = urgencyOf(form.neededBy)
                  if (u === 'urgent') return <span className="flex items-center gap-1 text-xs text-red-600"><span className="size-2.5 rounded-full bg-red-500 inline-block" /> {t('coupang.urgent')}</span>
                  if (u === 'normal') return <span className="flex items-center gap-1 text-xs text-emerald-600"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> {t('coupang.normal')}</span>
                  return null
                })()}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">2일 이내 필요 시 긴급(빨강), 일주일 이내 보통(초록)으로 표시됩니다.</p>
            </div>
            <div>
              <Label>{t('coupang.reason')}</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!canSubmit}>
                {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('coupang.submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OrderCard({
  order,
  isApprover,
  isOwner,
  onStatusChange,
  onDelete,
}: {
  order: CoupangOrder
  isApprover: boolean
  isOwner: boolean
  onStatusChange: (o: CoupangOrder, s: OrderStatus) => void
  onDelete: (id: string) => void
}) {
  const t = useT()
  const statusCfg = ORDER_STATUS_CONFIG[order.status]
  const categoryLabelKey = ORDER_CATEGORY_LABELS[order.category]
  const urgency = urgencyOf(order.neededBy)
  const approverLabel = order.paymentApproverRole === 'sales_director'
    ? t('coupang.paymentApproverSales')
    : order.paymentApproverRole === 'finance_director'
      ? t('coupang.paymentApproverFinance')
      : undefined

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {urgency === 'urgent' && <span className="size-2.5 rounded-full bg-red-500 inline-block shrink-0" title={t('coupang.urgent')} />}
              {urgency === 'normal' && <span className="size-2.5 rounded-full bg-emerald-500 inline-block shrink-0" title={t('coupang.normal')} />}
              <span className="font-medium text-sm truncate">{order.productName}</span>
              {order.productUrl && (
                <a href={order.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.requesterName} · {order.createdAt?.slice(0, 10)} · {categoryLabelKey ? t(categoryLabelKey) : order.category}
            </p>
          </div>
          <Badge className={`text-xs shrink-0 ${statusCfg.className}`}>{t(statusCfg.labelKey)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>{t('coupang.quantityLabel')}: {order.quantity}</span>
          {order.estimatedPrice && <span>{t('coupang.priceLabel')}: ₩{order.estimatedPrice.toLocaleString()}</span>}
          {order.neededBy && (
            <span className={`flex items-center gap-1 ${urgency === 'urgent' ? 'text-red-600' : urgency === 'normal' ? 'text-emerald-600' : ''}`}>
              <CalendarClock className="size-3" />{t('coupang.neededBy')}: {order.neededBy}
            </span>
          )}
          {approverLabel && <span>{t('coupang.paymentApprover')}: {approverLabel}</span>}
          {order.reason && <span className="truncate">{t('coupang.reasonLabel')}: {order.reason}</span>}
        </div>
        {/* Approval trail */}
        {(order.approvedByName || order.orderedByName) && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {order.approvedByName && <>{t('coupang.approvedBy')}: {order.approvedByName}</>}
            {order.approvedByName && order.orderedByName && ' · '}
            {order.orderedByName && <>{t('coupang.orderedBy')}: {order.orderedByName}</>}
          </p>
        )}
        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          {/* Step 1: approve / reject a new request */}
          {isApprover && order.status === 'requested' && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={() => onStatusChange(order, 'approved')}>
                {t('coupang.approve')}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onStatusChange(order, 'rejected')}>
                {t('coupang.reject')}
              </Button>
            </>
          )}
          {/* Step 2: only approved orders proceed to ordering */}
          {isApprover && order.status === 'approved' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(order, 'ordered')}>
                {t('coupang.markOrdered')}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onStatusChange(order, 'rejected')}>
                {t('coupang.reject')}
              </Button>
            </>
          )}
          {/* Step 3: mark delivered */}
          {isApprover && order.status === 'ordered' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(order, 'delivered')}>
              {t('coupang.markDelivered')}
            </Button>
          )}
          {(isApprover || (isOwner && order.status === 'requested')) && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onDelete(order.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
