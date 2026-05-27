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
  useAllIncentives,
  INCENTIVE_TYPES,
  type IncentiveWithContract,
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

interface ContractGroup {
  contractId: string
  contractDate: string
  contractorName: string
  studentName: string
  totalAmount: number
  paidAmount: number
  currency: 'KRW' | 'USD'
  incentives: IncentiveWithContract[]
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
  const { data: allIncentives = [], isLoading } = useAllIncentives()

  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth)

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)

  // Filter incentives whose contract_date falls in the selected month
  const filtered = useMemo(
    () =>
      allIncentives.filter((inc) => {
        if (!inc.contractDate) return false
        return inc.contractDate.startsWith(currentMonth)
      }),
    [allIncentives, currentMonth],
  )

  // Group by contractId
  const contractGroups = useMemo(() => {
    const map = new Map<string, ContractGroup>()

    for (const inc of filtered) {
      let group = map.get(inc.contractId)
      if (!group) {
        group = {
          contractId: inc.contractId,
          contractDate: inc.contractDate,
          contractorName: inc.contractorName,
          studentName: inc.studentName,
          totalAmount: inc.totalAmount,
          paidAmount: inc.paidAmount,
          currency: inc.currency,
          incentives: [],
          totalPct: 0,
          incentiveAmount: 0,
        }
        map.set(inc.contractId, group)
      }
      group.incentives.push(inc)
    }

    // Compute totals — incentive is based on PAID amount, not total contract
    for (const group of map.values()) {
      group.totalPct = group.incentives.reduce((sum, inc) => sum + inc.percentage, 0)
      group.incentiveAmount = Math.round(group.paidAmount * group.totalPct / 100)
    }

    // Sort by contract date descending
    return Array.from(map.values()).sort((a, b) =>
      (b.contractDate || '').localeCompare(a.contractDate || ''),
    )
  }, [filtered])

  // Summaries
  const totalContracts = contractGroups.length
  const totalPaidAmount = contractGroups.reduce((s, g) => s + g.paidAmount, 0)
  const totalIncentiveAmount = contractGroups.reduce((s, g) => s + g.incentiveAmount, 0)

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
            <CardTitle className="text-sm font-medium">{t('incentive.totalContracts')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalContracts}</div>
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
          ) : contractGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-10 w-10 mb-2" />
              <p>{t('incentive.noData')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('incentive.contractDate')}</TableHead>
                  <TableHead>{t('incentive.contractorStudent')}</TableHead>
                  <TableHead className="text-right">{t('incentive.paidAmount')}</TableHead>
                  <TableHead>{t('incentive.recipients')}</TableHead>
                  <TableHead>{t('incentive.types')}</TableHead>
                  <TableHead className="text-right">{t('incentive.totalPct')}</TableHead>
                  <TableHead className="text-right">{t('incentive.incentiveAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractGroups.map((group) => (
                  <TableRow key={group.contractId}>
                    <TableCell className="whitespace-nowrap">{group.contractDate}</TableCell>
                    <TableCell>
                      <div className="font-medium">{group.contractorName}</div>
                      <div className="text-sm text-muted-foreground">{group.studentName}</div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatCurrency(group.paidAmount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.incentives.map((inc) => (
                          <Badge key={inc.id} variant="secondary" className="text-xs">
                            {inc.displayName}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.incentives.map((inc) => (
                          <Badge key={inc.id} variant="outline" className="text-xs">
                            {t(INCENTIVE_TYPES[inc.incentiveType].labelKey)} {inc.percentage}%
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
