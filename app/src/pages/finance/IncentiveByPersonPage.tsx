import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  Users,
} from 'lucide-react'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import {
  useAllIncentives,
  INCENTIVE_TYPES,
  type IncentiveType,
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

interface ContractDetail {
  contractId: string
  contractDate: string
  contractorName: string
  studentName: string
  totalAmount: number
  paidAmount: number
  currency: 'KRW' | 'USD'
  incentiveType: IncentiveType
  percentage: number
  incentiveAmount: number
}

interface PersonGroup {
  /** Unique key: profileId or custom name */
  groupKey: string
  displayName: string
  contracts: ContractDetail[]
  contractCount: number
  /** Amount breakdown per incentive type */
  amountByType: Record<IncentiveType, number>
  totalIncentiveAmount: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncentiveByPersonPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: allIncentives = [], isLoading } = useAllIncentives()

  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)

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

  // Group by person (profileId or custom_name)
  const personGroups = useMemo(() => {
    const map = new Map<string, PersonGroup>()

    for (const inc of filtered) {
      const groupKey = inc.profileId || `custom:${inc.displayName}`
      let group = map.get(groupKey)
      if (!group) {
        group = {
          groupKey,
          displayName: inc.displayName,
          contracts: [],
          contractCount: 0,
          amountByType: {} as Record<IncentiveType, number>,
          totalIncentiveAmount: 0,
        }
        // Initialize all type amounts to 0
        for (const key of Object.keys(INCENTIVE_TYPES) as IncentiveType[]) {
          group.amountByType[key] = 0
        }
        map.set(groupKey, group)
      }

      const incentiveAmount = Math.round(inc.paidAmount * inc.percentage / 100)

      group.contracts.push({
        contractId: inc.contractId,
        contractDate: inc.contractDate,
        contractorName: inc.contractorName,
        studentName: inc.studentName,
        totalAmount: inc.totalAmount,
        paidAmount: inc.paidAmount,
        currency: inc.currency,
        incentiveType: inc.incentiveType,
        percentage: inc.percentage,
        incentiveAmount,
      })

      group.amountByType[inc.incentiveType] = (group.amountByType[inc.incentiveType] || 0) + incentiveAmount
      group.totalIncentiveAmount += incentiveAmount
    }

    // Compute unique contract count per person
    for (const group of map.values()) {
      const uniqueContracts = new Set(group.contracts.map((c) => c.contractId))
      group.contractCount = uniqueContracts.size
      // Sort contracts by date descending
      group.contracts.sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''))
    }

    // Sort persons by total incentive amount descending
    return Array.from(map.values()).sort((a, b) => b.totalIncentiveAmount - a.totalIncentiveAmount)
  }, [filtered])

  // Summaries
  const totalPersons = personGroups.length
  const totalIncentiveAmount = personGroups.reduce((s, g) => s + g.totalIncentiveAmount, 0)

  const isPersonView = location.pathname.includes('by-person')

  const toggleExpand = (profileId: string) => {
    setExpandedPerson((prev) => (prev === profileId ? null : profileId))
  }

  // Collect which incentive types are actually present this month
  const activeTypes = useMemo(() => {
    const types = new Set<IncentiveType>()
    for (const group of personGroups) {
      for (const key of Object.keys(INCENTIVE_TYPES) as IncentiveType[]) {
        if (group.amountByType[key] > 0) types.add(key)
      }
    }
    return Array.from(types)
  }, [personGroups])

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={!isPersonView ? 'default' : 'outline'}
          onClick={() => navigate('/finance/incentives/by-contract')}
        >
          {t('incentive.byContract')}
        </Button>
        <Button
          variant={isPersonView ? 'default' : 'outline'}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.targetCount')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPersons}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.totalIncentiveAmount')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
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
          ) : personGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mb-2" />
              <p>{t('incentive.noData')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>{t('incentive.personName')}</TableHead>
                  <TableHead className="text-right">{t('incentive.relatedContracts')}</TableHead>
                  {activeTypes.map((type) => (
                    <TableHead key={type} className="text-right">
                      {t(INCENTIVE_TYPES[type].labelKey)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">{t('incentive.totalIncentiveAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personGroups.map((group) => (
                  <>
                    <TableRow
                      key={group.groupKey}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(group.groupKey)}
                    >
                      <TableCell>
                        {expandedPerson === group.groupKey ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{group.displayName}</TableCell>
                      <TableCell className="text-right">{group.contractCount}</TableCell>
                      {activeTypes.map((type) => (
                        <TableCell key={type} className="text-right whitespace-nowrap">
                          {group.amountByType[type] > 0
                            ? formatCurrency(group.amountByType[type])
                            : '-'}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {formatCurrency(group.totalIncentiveAmount)}
                      </TableCell>
                    </TableRow>

                    {/* Expanded contract details */}
                    {expandedPerson === group.groupKey &&
                      group.contracts.map((c, idx) => (
                        <TableRow
                          key={`${group.groupKey}-${c.contractId}-${idx}`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell className="pl-8">
                            <div className="text-sm">
                              <span className="text-muted-foreground">{c.contractDate}</span>
                              {' '}
                              {c.contractorName} / {c.studentName}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatCurrency(c.paidAmount)}
                          </TableCell>
                          {activeTypes.map((type) => (
                            <TableCell key={type} className="text-right text-sm">
                              {c.incentiveType === type ? (
                                <Badge variant="outline" className="text-xs">
                                  {c.percentage}% = {formatCurrency(c.incentiveAmount)}
                                </Badge>
                              ) : (
                                ''
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-right text-sm whitespace-nowrap">
                            {formatCurrency(c.incentiveAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
