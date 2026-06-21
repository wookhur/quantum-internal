import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, Search, Plus, Trash2, CheckCircle2, Clock, DollarSign,
  ExternalLink, HandCoins, Lock,
} from 'lucide-react'
import { useAllExtraInstallments, type ExtraInstallmentWithContext } from '@/hooks/useExternalFees'
import {
  useCreateRevenueShares, useUpdateRevenueShare, useDeleteRevenueShare,
} from '@/hooks/useRevenueShares'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuth } from '@/contexts/AuthContext'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'
import { Link } from 'react-router-dom'

// Only these people may configure fee recipients / percentages.
const FEE_MANAGERS = ['허욱', '한상범', '김지현', '이미미']

export function ExternalFeesPage() {
  const t = useT()
  const { user } = useAuth()
  const { data: extras = [], isLoading } = useAllExtraInstallments()
  const { data: profiles = [] } = useProfiles()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ExtraInstallmentWithContext | null>(null)

  const canManageFees = FEE_MANAGERS.includes(user?.name ?? '')
  const employees = useMemo(() => profiles.map(p => ({ id: p.id, name: p.name })), [profiles])

  const filtered = useMemo(() => {
    if (!search.trim()) return extras
    const q = search.toLowerCase()
    return extras.filter(e =>
      e.label.toLowerCase().includes(q) ||
      e.studentName.toLowerCase().includes(q) ||
      e.contractorName.toLowerCase().includes(q) ||
      e.revenueShares.some(s => s.recipientName.toLowerCase().includes(q)),
    )
  }, [extras, search])

  // Summary stats
  const totalFees = extras.reduce((s, e) => s + e.revenueShares.reduce((ss, rs) => ss + rs.amount, 0), 0)
  const paidFees = extras.reduce((s, e) => s + e.revenueShares.filter(rs => rs.isPaid).reduce((ss, rs) => ss + rs.amount, 0), 0)
  const unpaidFees = totalFees - paidFees
  const totalExtras = extras.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('externalFees.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('externalFees.description')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-[3px] border-l-purple-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('externalFees.totalItems')}</div>
            <div className="text-2xl font-bold mt-1">{totalExtras}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-orange-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('externalFees.totalFees')}</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(totalFees)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-emerald-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('externalFees.paidFees')}</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(paidFees)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-red-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('externalFees.unpaidFees')}</div>
            <div className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(unpaidFees)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t('externalFees.searchPlaceholder')}
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">{t('externalFees.noItems')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('externalFees.serviceItem')}</TableHead>
                  <TableHead>{t('externalFees.student')}</TableHead>
                  <TableHead className="text-right">{t('externalFees.chargeAmount')}</TableHead>
                  <TableHead>{t('externalFees.paymentStatus')}</TableHead>
                  <TableHead>{t('externalFees.feeRecipient')}</TableHead>
                  <TableHead className="text-right">{t('externalFees.feeAmount')}</TableHead>
                  <TableHead>{t('externalFees.feeStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(ext => {
                  const isPaid = ext.status === 'paid'
                  const totalShareAmt = ext.revenueShares.reduce((s, rs) => s + rs.amount, 0)
                  const allSharesPaid = ext.revenueShares.length > 0 && ext.revenueShares.every(rs => rs.isPaid)
                  return (
                    <TableRow
                      key={ext.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(ext)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HandCoins className="size-4 text-purple-500 shrink-0" />
                          <span className="font-medium text-sm">{ext.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{ext.studentName}</div>
                        <div className="text-xs text-muted-foreground">{ext.contractorName}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(ext.amount, ext.currency as 'KRW' | 'USD')}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <CheckCircle2 className="size-3" /> {t('externalFees.collected')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1">
                            <Clock className="size-3" /> {t('externalFees.pending')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {ext.revenueShares.length > 0 ? (
                          <div className="space-y-0.5">
                            {ext.revenueShares.map(rs => (
                              <div key={rs.id} className="text-sm">{rs.recipientName}
                                {rs.role && <span className="text-xs text-muted-foreground ml-1">({rs.role})</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('externalFees.noFeeSet')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {totalShareAmt > 0 ? formatCurrency(totalShareAmt, ext.currency as 'KRW' | 'USD') : '-'}
                      </TableCell>
                      <TableCell>
                        {ext.revenueShares.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : allSharesPaid ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 text-xs">
                            <CheckCircle2 className="size-3" /> {t('externalFees.feePaid')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-200 gap-1 text-xs">
                            <Clock className="size-3" /> {t('externalFees.feeUnpaid')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {selected && (
        <ExternalFeeDetailDialog
          item={selected}
          onClose={() => setSelected(null)}
          canManage={canManageFees}
          employees={employees}
        />
      )}
    </div>
  )
}

// ─── Detail Dialog ─────────────────────────────────────────────────

function ExternalFeeDetailDialog({
  item,
  onClose,
  canManage,
  employees,
}: {
  item: ExtraInstallmentWithContext
  onClose: () => void
  canManage: boolean
  employees: { id: string; name: string }[]
}) {
  const t = useT()
  const createShares = useCreateRevenueShares()
  const updateShare = useUpdateRevenueShare()
  const deleteShare = useDeleteRevenueShare()

  const [recipientId, setRecipientId] = useState('')
  const [percent, setPercent] = useState('')
  const isPaid = item.status === 'paid'

  // Incentive = 청구 금액 × 수수료 % (rounded)
  const computedAmount = percent ? Math.round((item.amount * Number(percent)) / 100) : 0

  const handleAddShare = () => {
    const emp = employees.find(e => e.id === recipientId)
    if (!emp || !percent) return
    createShares.mutate({
      installmentId: item.id,
      shares: [{
        recipientName: emp.name,
        recipientProfileId: emp.id,
        percentage: Number(percent),
        amount: computedAmount,
      }],
    }, {
      onSuccess: () => { setRecipientId(''); setPercent('') },
    })
  }

  const togglePaid = (share: ExtraInstallmentWithContext['revenueShares'][0]) => {
    updateShare.mutate({
      id: share.id,
      isPaid: !share.isPaid,
      paidDate: !share.isPaid ? new Date().toISOString().slice(0, 10) : undefined,
    })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-purple-500" />
            {item.label}
          </DialogTitle>
          <DialogDescription>
            {item.studentName} ({item.contractorName})
          </DialogDescription>
        </DialogHeader>

        {/* Installment Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t('externalFees.chargeAmount')}</div>
            <div className="font-mono font-semibold">{formatCurrency(item.amount, item.currency as 'KRW' | 'USD')}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('externalFees.paymentStatus')}</div>
            {isPaid ? (
              <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="size-3" /> {t('externalFees.collected')}</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 gap-1"><Clock className="size-3" /> {t('externalFees.pending')}</Badge>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('contracts.contractDate')}</div>
            <div>{item.contractDate || '-'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t('externalFees.contractLink')}</div>
            <Link
              to={`/consulting/clients/${item.contractId}`}
              className="text-blue-600 hover:underline inline-flex items-center gap-1 text-sm"
              onClick={onClose}
            >
              {t('externalFees.viewContract')} <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>

        {/* Revenue Shares / Fee Recipients */}
        <div className="space-y-3 pt-2 border-t">
          <div className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="size-4 text-orange-500" />
            {t('externalFees.feeRecipients')}
          </div>

          {item.revenueShares.length > 0 ? (
            <div className="space-y-2">
              {item.revenueShares.map(share => (
                <div
                  key={share.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${share.isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div>
                    <div className="text-sm font-medium">{share.recipientName}</div>
                    {share.role && <div className="text-xs text-muted-foreground">{share.role}</div>}
                    <div className="text-sm font-mono mt-0.5">
                      {share.percentage ? <span className="text-muted-foreground">{share.percentage}% · </span> : null}
                      {formatCurrency(share.amount, item.currency as 'KRW' | 'USD')}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={share.isPaid ? 'default' : 'outline'}
                        className={`h-7 text-xs gap-1 ${share.isPaid ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                        onClick={() => togglePaid(share)}
                        disabled={updateShare.isPending}
                      >
                        <CheckCircle2 className="size-3" />
                        {share.isPaid ? t('externalFees.feePaid') : t('externalFees.markPaid')}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-500"
                        onClick={() => deleteShare.mutate(share.id)}
                        disabled={deleteShare.isPending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-3">{t('externalFees.noFeeSet')}</p>
          )}

          <p className="text-[11px] text-muted-foreground">
            수수료는 해당 항목이 <b>수금 완료</b>된 후 재무 인센티브(급여산정)에 자동 반영됩니다.
          </p>

          {/* Add fee recipient — restricted to FEE_MANAGERS */}
          {canManage ? (
            <div className="space-y-2 pt-2 border-t">
              <div className="text-xs font-medium text-muted-foreground">수수료 대상 추가</div>
              <div className="flex gap-2 items-center">
                <Select value={recipientId} onValueChange={v => setRecipientId(v ?? '')}>
                  <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="직원 선택" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={percent} onValueChange={v => setPercent(v ?? '')}>
                  <SelectTrigger className="h-8 text-sm w-20"><SelectValue placeholder="%" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(p => (
                      <SelectItem key={p} value={p}>{p}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="w-28 text-right text-sm font-mono text-muted-foreground">
                  {percent ? formatCurrency(computedAmount, item.currency as 'KRW' | 'USD') : '—'}
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  disabled={!recipientId || !percent || createShares.isPending}
                  onClick={handleAddShare}
                >
                  {createShares.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                  {t('common.add')}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">금액 = 청구 금액 × 선택한 % (자동 계산)</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t">
              <Lock className="size-3" /> 수수료 설정 권한이 없습니다 (보기 전용)
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
