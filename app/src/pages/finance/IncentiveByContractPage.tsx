import { useState, useMemo, useCallback } from 'react'
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
import { Loader2, ChevronLeft, ChevronRight, Calendar, DollarSign, TrendingUp, Clock, Download } from 'lucide-react'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import {
  useIncentivesByInstallment,
  INCENTIVE_TYPES,
  type IncentiveByInstallment,
} from '@/hooks/useIncentives'
import { IncentiveExportDialog } from '@/components/IncentiveExportDialog'
import {
  exportContractExcel,
  exportContractPdf,
  exportPersonExcel,
  exportPersonPdf,
  type ExportFormat,
  type ExportScope,
  type ExportContractRow,
  type ExportPersonRow,
} from '@/utils/incentiveExport'

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
  dueDate: string
  paidAmount: number
  installmentAmount: number
  isPaid: boolean
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

  // Filter entries: paid by paidDate month, unpaid by dueDate month OR contractDate month
  const filtered = useMemo(
    () =>
      allEntries.filter((entry) => {
        if (entry.isPaid) {
          return entry.paidDate && entry.paidDate.startsWith(currentMonth)
        }
        // 미입금: 납기일 기준, 없으면 계약일 기준
        const dateRef = entry.dueDate || entry.contractDate
        return dateRef && dateRef.startsWith(currentMonth)
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
          dueDate: entry.dueDate,
          paidAmount: entry.paidAmount,
          installmentAmount: entry.installmentAmount,
          isPaid: entry.isPaid,
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

    // Sort: paid first (by paidDate desc), then unpaid (by dueDate asc)
    return Array.from(map.values()).sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1
      if (a.isPaid) {
        const dateCompare = (b.paidDate || '').localeCompare(a.paidDate || '')
        if (dateCompare !== 0) return dateCompare
      } else {
        const dateCompare = (a.dueDate || '').localeCompare(b.dueDate || '')
        if (dateCompare !== 0) return dateCompare
      }
      return a.installmentOrder - b.installmentOrder
    })
  }, [filtered])

  // Summaries
  const paidGroups = groups.filter(g => g.isPaid)
  const unpaidGroups = groups.filter(g => !g.isPaid)
  const totalPayments = paidGroups.length
  const totalPaidAmount = paidGroups.reduce((s, g) => s + g.paidAmount, 0)
  const totalIncentiveAmount = paidGroups.reduce((s, g) => s + g.incentiveAmount, 0)
  const expectedCount = unpaidGroups.length
  const expectedIncentiveAmount = unpaidGroups.reduce((s, g) => s + g.incentiveAmount, 0)

  const isContractView = location.pathname.includes('by-contract')

  const [exportOpen, setExportOpen] = useState(false)

  const handleExport = useCallback(
    (params: { format: ExportFormat; scope: ExportScope; startMonth: string; endMonth: string }) => {
      // Filter allEntries by the chosen date range
      const rangeEntries = allEntries.filter((entry) => {
        const dateRef = entry.isPaid ? entry.paidDate : (entry.dueDate || entry.contractDate)
        if (!dateRef) return false
        const ym = dateRef.slice(0, 7)
        return ym >= params.startMonth && ym <= params.endMonth
      })

      if (params.scope === 'by-contract') {
        // Build contract rows
        const map = new Map<string, { entries: IncentiveByInstallment[]; paidDate: string; contractorName: string; studentName: string; installmentLabel: string; paidAmount: number; currency: 'KRW' | 'USD'; isPaid: boolean; installmentAmount: number }>()
        for (const entry of rangeEntries) {
          const gk = `${entry.contractId}-${entry.installmentId}`
          if (!map.has(gk)) {
            map.set(gk, { entries: [], paidDate: entry.paidDate || entry.dueDate, contractorName: entry.contractorName, studentName: entry.studentName, installmentLabel: entry.installmentLabel, paidAmount: entry.paidAmount, currency: entry.currency, isPaid: entry.isPaid, installmentAmount: entry.installmentAmount })
          }
          map.get(gk)!.entries.push(entry)
        }
        const rows: ExportContractRow[] = Array.from(map.values()).map(g => ({
          paidDate: g.paidDate,
          contractorName: g.contractorName,
          studentName: g.studentName,
          installmentLabel: g.installmentLabel,
          paidAmount: g.isPaid ? g.paidAmount : g.installmentAmount,
          currency: g.currency,
          recipients: g.entries.map(e => e.displayName).join(', '),
          types: g.entries.map(e => `${t(INCENTIVE_TYPES[e.incentiveType].labelKey)} ${e.percentage}%`).join(', '),
          totalPct: g.entries.reduce((s, e) => s + e.percentage, 0),
          incentiveAmount: g.entries.reduce((s, e) => s + e.incentiveAmount, 0),
          isPaid: g.isPaid,
        }))
        if (params.format === 'excel') exportContractExcel(rows, { ...params, t })
        else exportContractPdf(rows, { ...params, t })
      } else {
        // Build person rows
        const map = new Map<string, ExportPersonRow & { installments: Set<string> }>()
        for (const entry of rangeEntries) {
          const gk = entry.profileId || `custom:${entry.displayName}`
          if (!map.has(gk)) {
            map.set(gk, { displayName: entry.displayName, paymentCount: 0, amountByType: {}, totalIncentiveAmount: 0, installments: new Set() })
          }
          const g = map.get(gk)!
          g.amountByType[entry.incentiveType] = (g.amountByType[entry.incentiveType] || 0) + entry.incentiveAmount
          g.totalIncentiveAmount += entry.incentiveAmount
          g.installments.add(`${entry.contractId}-${entry.installmentLabel}`)
        }
        const activeTypeKeys = new Set<string>()
        const rows: ExportPersonRow[] = Array.from(map.values()).map(g => {
          Object.entries(g.amountByType).forEach(([k, v]) => { if (v > 0) activeTypeKeys.add(k) })
          return { displayName: g.displayName, paymentCount: g.installments.size, amountByType: g.amountByType, totalIncentiveAmount: g.totalIncentiveAmount }
        })
        const activeTypes = Array.from(activeTypeKeys).map(k => ({ key: k, label: t(INCENTIVE_TYPES[k as keyof typeof INCENTIVE_TYPES].labelKey) }))
        if (params.format === 'excel') exportPersonExcel(rows, activeTypes, { ...params, t })
        else exportPersonPdf(rows, activeTypes, { ...params, t })
      }
    },
    [allEntries, t],
  )

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
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4 mr-1.5" />
          {t('incentive.export')}
        </Button>
      </div>

      <IncentiveExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultScope="by-contract"
        onExport={handleExport}
      />

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <Card className={expectedCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('incentive.expectedIncentive')}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(expectedIncentiveAmount)}</div>
            {expectedCount > 0 && (
              <p className="text-xs text-amber-500 mt-0.5">{expectedCount}{t('common.count')} {t('incentive.pendingPayment')}</p>
            )}
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
                  <TableRow
                    key={group.groupKey}
                    className={group.isPaid ? '' : 'bg-amber-50/40'}
                  >
                    <TableCell className="whitespace-nowrap">
                      {group.isPaid ? (
                        group.paidDate
                      ) : (
                        <div className="flex items-center gap-1">
                          <Clock className="size-3 text-amber-500" />
                          <span className="text-amber-600">{group.dueDate || '-'}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{group.contractorName}</div>
                      <div className="text-sm text-muted-foreground">{group.studentName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {group.installmentLabel}
                        </Badge>
                        {!group.isPaid && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-amber-50 text-amber-600 border-amber-200">
                            {t('incentive.expected')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {group.isPaid ? (
                        formatCurrency(group.paidAmount)
                      ) : (
                        <span className="text-amber-600">{formatCurrency(group.installmentAmount)}</span>
                      )}
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
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${group.isPaid ? '' : 'text-amber-600'}`}>
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
