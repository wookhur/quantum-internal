import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Users, Receipt } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { formatCurrency } from '@/types'
import { useIncentivesByInstallment, type IncentiveType } from '@/hooks/useIncentives'
import { useAllExtraInstallments } from '@/hooks/useExternalFees'

// Freelancer commission types (partner/freelancer)
const FREELANCER_TYPES: IncentiveType[] = ['partner_sales', 'partner_fee']

interface PersonAmount {
  name: string
  amount: number
  details: { label: string; amount: number }[]
}

function groupByPerson(
  items: { displayName: string; incentiveAmount: number; incentiveType: IncentiveType; studentName: string }[],
): PersonAmount[] {
  const map = new Map<string, PersonAmount>()
  for (const item of items) {
    let entry = map.get(item.displayName)
    if (!entry) {
      entry = { name: item.displayName, amount: 0, details: [] }
      map.set(item.displayName, entry)
    }
    entry.amount += item.incentiveAmount
    entry.details.push({
      label: `${item.studentName} (${item.incentiveType})`,
      amount: item.incentiveAmount,
    })
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

export function FinanceDashboardPage() {
  const t = useT()

  const { data: allIncentives = [], isLoading: incLoading } = useIncentivesByInstallment()
  const { data: allExtras = [], isLoading: extLoading } = useAllExtraInstallments()

  const isLoading = incLoading || extLoading

  // ─── 1. 프리랜서 세일즈 커미션 미지급 ────────────────────────────
  const freelancerCommission = useMemo(() => {
    const unpaid = allIncentives.filter(e => !e.isPaid && FREELANCER_TYPES.includes(e.incentiveType))
    const total = unpaid.reduce((s, e) => s + e.incentiveAmount, 0)
    const byPerson = groupByPerson(unpaid)
    return { total, count: unpaid.length, byPerson }
  }, [allIncentives])

  // ─── 2. 서비스 수수료 미지급 ─────────────────────────────────────
  const serviceFees = useMemo(() => {
    const unpaidShares: { name: string; amount: number; studentName: string; label: string }[] = []
    for (const ext of allExtras) {
      for (const s of ext.revenueShares) {
        if (!s.isPaid) {
          unpaidShares.push({
            name: s.recipientName,
            amount: s.amount,
            studentName: ext.studentName,
            label: ext.label,
          })
        }
      }
    }
    const total = unpaidShares.reduce((s, e) => s + e.amount, 0)

    // Group by recipient
    const map = new Map<string, PersonAmount>()
    for (const item of unpaidShares) {
      let entry = map.get(item.name)
      if (!entry) {
        entry = { name: item.name, amount: 0, details: [] }
        map.set(item.name, entry)
      }
      entry.amount += item.amount
      entry.details.push({ label: `${item.studentName} - ${item.label}`, amount: item.amount })
    }
    const byPerson = [...map.values()].sort((a, b) => b.amount - a.amount)

    return { total, count: unpaidShares.length, byPerson }
  }, [allExtras])

  const grandTotal = freelancerCommission.total + serviceFees.total

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('financeDash.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('financeDash.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ─── Summary Cards ────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.freelancerCommission')}</CardTitle>
                <Users className="size-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(freelancerCommission.total)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{freelancerCommission.count}{t('financeDash.cases')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{t('financeDash.serviceFee')}</CardTitle>
                <Receipt className="size-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(serviceFees.total)}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{serviceFees.count}{t('financeDash.cases')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Grand total */}
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">{t('financeDash.totalToPay')}:</span>
            <span className="text-lg font-bold">{formatCurrency(grandTotal)}</span>
          </div>

          {/* ─── Detail Cards ─────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 프리랜서 세일즈 커미션 */}
            <PayoutCard
              title={t('financeDash.freelancerCommission')}
              color="purple"
              persons={freelancerCommission.byPerson}
              t={t}
            />

            {/* 서비스 수수료 */}
            <PayoutCard
              title={t('financeDash.serviceFee')}
              color="amber"
              persons={serviceFees.byPerson}
              t={t}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Payout detail card ──────────────────────────────────────────────────────

function PayoutCard({
  title,
  color,
  persons,
  t,
}: {
  title: string
  color: 'purple' | 'blue' | 'amber'
  persons: PersonAmount[]
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const colorMap = {
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700 border-purple-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  }
  const c = colorMap[color]

  if (persons.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">{t('financeDash.noPending')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {persons.map((p) => (
          <div key={p.name} className={`${c.bg} rounded-lg p-3`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-semibold ${c.text}`}>{p.name}</span>
              <span className={`text-sm font-bold ${c.text}`}>{formatCurrency(p.amount)}</span>
            </div>
            <div className="space-y-1">
              {p.details.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate mr-2">{d.label}</span>
                  <span className="shrink-0">{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
