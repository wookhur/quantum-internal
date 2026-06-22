import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Package, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import {
  useCoupangOrders,
  useCreateCoupangOrder,
  useUpdateCoupangOrder,
  useDeleteCoupangOrder,
  ORDER_CATEGORIES,
  ORDER_STATUS_CONFIG,
  type OrderCategory,
  type OrderStatus,
  type CoupangOrder,
} from '@/hooks/useCoupangOrders'
import { useAuth } from '@/contexts/AuthContext'

type Tab = 'all' | 'mine'

export function CoupangOrdersPage() {
  const { user } = useAuth()
  const { data: orders = [], isLoading } = useCoupangOrders()
  const createOrder = useCreateCoupangOrder()
  const updateOrder = useUpdateCoupangOrder()
  const deleteOrder = useDeleteCoupangOrder()

  const [tab, setTab] = useState<Tab>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    productName: '',
    productUrl: '',
    quantity: '1',
    estimatedPrice: '',
    category: 'office' as OrderCategory,
    reason: '',
  })

  const isManager = user?.role === 'admin' || user?.role === 'c_level'

  const filtered = tab === 'mine'
    ? orders.filter((o) => o.requesterId === user?.id)
    : orders

  function resetForm() {
    setForm({ productName: '', productUrl: '', quantity: '1', estimatedPrice: '', category: 'office', reason: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !form.productName.trim()) return
    await createOrder.mutateAsync({
      requesterId: user.id,
      requesterName: user.name,
      productName: form.productName.trim(),
      productUrl: form.productUrl.trim() || undefined,
      quantity: Number(form.quantity) || 1,
      estimatedPrice: Number(form.estimatedPrice) || undefined,
      category: form.category,
      reason: form.reason.trim() || undefined,
    })
    resetForm()
    setShowForm(false)
  }

  async function handleStatusChange(order: CoupangOrder, status: OrderStatus) {
    await updateOrder.mutateAsync({ id: order.id, status, orderedBy: user?.id })
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
          <h1 className="text-xl font-bold">쿠팡 주문 요청</h1>
          <p className="text-sm text-muted-foreground">필요한 물품을 요청하세요. 곽지수 이사님이 주문해 드립니다.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          주문 요청
        </Button>
      </div>

      {/* Tab */}
      <div className="flex gap-2">
        <Button variant={tab === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setTab('all')}>
          전체 ({orders.length})
        </Button>
        <Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mine')}>
          내 요청 ({orders.filter((o) => o.requesterId === user?.id).length})
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>주문 요청이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isManager={isManager}
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
            <DialogTitle>쿠팡 주문 요청</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>상품명 *</Label>
              <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
            </div>
            <div>
              <Label>상품 링크</Label>
              <Input value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>수량</Label>
                <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label>예상 가격 (원)</Label>
                <Input type="number" value={form.estimatedPrice} onChange={(e) => setForm({ ...form, estimatedPrice: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>카테고리</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as OrderCategory })}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>사유</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
              <Button type="submit" disabled={!form.productName.trim() || createOrder.isPending}>
                {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                요청하기
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
  isManager,
  isOwner,
  onStatusChange,
  onDelete,
}: {
  order: CoupangOrder
  isManager: boolean
  isOwner: boolean
  onStatusChange: (o: CoupangOrder, s: OrderStatus) => void
  onDelete: (id: string) => void
}) {
  const statusCfg = ORDER_STATUS_CONFIG[order.status]
  const categoryCfg = ORDER_CATEGORIES.find((c) => c.key === order.category)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{order.productName}</span>
              {order.productUrl && (
                <a href={order.productUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {order.requesterName} · {order.createdAt?.slice(0, 10)} · {categoryCfg?.label || order.category}
            </p>
          </div>
          <Badge className={`text-xs shrink-0 ${statusCfg.className}`}>{statusCfg.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>수량: {order.quantity}</span>
          {order.estimatedPrice && <span>예상가: ₩{order.estimatedPrice.toLocaleString()}</span>}
          {order.reason && <span className="truncate">사유: {order.reason}</span>}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          {isManager && order.status === 'requested' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(order, 'ordered')}>
                주문완료
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onStatusChange(order, 'rejected')}>
                반려
              </Button>
            </>
          )}
          {isManager && order.status === 'ordered' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(order, 'delivered')}>
              배송완료
            </Button>
          )}
          {(isManager || (isOwner && order.status === 'requested')) && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => onDelete(order.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
