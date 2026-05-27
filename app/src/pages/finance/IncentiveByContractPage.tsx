import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, ChevronLeft, ChevronRight, Calendar, DollarSign, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import {
  useIncentivesByInstallment,
  INCENTIVE_TYPES,
  type IncentiveByInstallment,
} from '@/hooks/useIncentives'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface ContractInstallmentGroup {
  /** contractId + installmentId */
  groupKey: string
  contractId: string
  contractDate: string
  contractorName: string
  studentName: string
  installmentLabel: string
  installmentOrder: number
  paidDate: string
  paidAmount: number
  currency: 'KRW' | 'USD'
  entries: IncentiveByInstallment[]
  totalPct: number
  incentiveAmount: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncentiveByContractPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: allEntries = [], isLoading } = useIncentivesByInstallment()

  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth)

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)

  // Filter entries whose paidDate falls in the selected month
  const filtered = useMemo(
    () =>
      allEntries.filter((entry) => {
        if (!entry.paidDate) return false
        return entry.paidDate.startsWith(currentMonth)
      }),
    [allEntries, currentMonth],
  )

  // Group by contractId + installmentId
  const groups = useMemo(() => {
    const map = new Map<string, ContractInstallmentGroup>()

    for (const entry of filtered) {
      const groupKey = `${entry.contractId}-${entry.installmentId}`
      let group = map.get(groupKey)
      if (!group) {
        group = {
          groupKey,
          contractId: entry.contractId,
          contractDate: entry.contractDate,
          contractorName: entry.contractorName,
          studentName: entry.studentName,
          installmentLabel: entry.installmentLabel,
          installmentOrder: entry.installmentOrder,
          paidDate: entry.paidDate,
          paidAmount: entry.paidAmount,
          currency: entry.currency,
          entries: [],
          totalPct: 0,
          incentiveAmount: 0,
        }
        map.set(groupKey, group)
      }
      group.entries.push(entry)
    }

    // Compute totals
    for (const group of map.values()) {
      group.totalPct = group.entries.reduce((sum, e) => sum + e.percentage, 0)
      group.incentiveAmount = group.entries.reduce((sum, e) => sum + e.incentiveAmount, 0)
    }

    // Sort by paid date descending, then installment order
    return Array.from(map.values()).sort((a, b) => {
      const dateCompare = (b.paidDate || '').localeCompare(a.paidDate || '')
      if (dateCompare !== 0) return dateCompare
      return a.installmentOrder - b.installmentOrder
    })
  }, [filtered])

  // Summaries
  const totalPayments = groups.length
  const totalPaidAmount = groups.reduce((s, g) => s + g.paidAmount, 0)
  const totalIncentiveAmount = groups.reduce((s, g) => s + g.incentiveAmount, 0)

  const isContractView = location.pathname.includes('by-contract')

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={isContractView ? 'default' : 'outline'}
          onClick={() => navigate('/finance/incentives/by-contract')}
        >
          {t('incentive.byContract')}
        </Button>
        <Button
          variant={!isContractView ? 'default' : 'outline'}
          onClick={() => navigate('/finance/incentives/by-person')}
        >
          {t('incentive.byPerson')}
        </Button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[140px] text-center">
          {year}{t('common.year')} {month}{t('common.month')}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(getCurrentMonth())}>
            <Calendar className="h-4 w-4 mr-1" />
            {t('incentive.thisMonth')}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.totalPayments')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPayments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.totalPaidAmount')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPaidAmount)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.totalIncentiveAmount')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalIncentiveAmount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-10 w-10 mb-2" />
              <p>{t('incentive.noData')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('incentive.paidDateShort')}</TableHead>
                  <TableHead>{t('incentive.contractorStudent')}</TableHead>
                  <TableHead>{t('incentive.installmentLabel')}</TableHead>
                  <TableHead className="text-right">{t('incentive.paidAmount')}</TableHead>
                  <TableHead>{t('incentive.recipients')}</TableHead>
                  <TableHead>{t('incentive.types')}</TableHead>
                  <TableHead className="text-right">{t('incentive.totalPct')}</TableHead>
                  <TableHead className="text-right">{t('incentive.incentiveAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.groupKey}>
                    <TableCell className="whitespace-nowrap">{group.paidDate}</TableCell>
                    <TableCell>
                      <div className="font-medium">{group.contractorName}</div>
                      <div className="text-sm text-muted-foreground">{group.studentName}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {group.installmentLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatCurrency(group.paidAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.entries.map((e) => (
                          <Badge key={e.key} variant="secondary" className="text-xs">
                            {e.displayName}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.entries.map((e) => (
                          <Badge key={e.key} variant="outline" className="text-xs">
                            {t(INCENTIVE_TYPES[e.incentiveType].labelKey)} {e.percentage}%
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{group.totalPct}%</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">
                      {formatCurrency(group.incentiveAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
