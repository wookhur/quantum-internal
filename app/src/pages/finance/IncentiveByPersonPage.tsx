import { useState, useMemo, useCallback } from 'react'
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
  Download,
} from 'lucide-react'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import {
  useIncentivesByInstallment,
  INCENTIVE_TYPES,
  type IncentiveType,
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

/**
 * Canonicalize a display name for incentive grouping.
 * Strips ALL whitespace + zero-width chars + control chars + ASCII punctuation,
 * NFKC-normalizes (collapses fullwidth/compatibility variants), and lowercases.
 * This ensures "김지현", " 김지현 ", "김 지현", "김지현​" all collapse to
 * the same key, so the same person never appears twice.
 */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .normalize('NFKC')
    // Strip whitespace + invisible chars: standard ws, NBSP, zero-width
    // space/non-joiner/joiner, word joiner, Hangul filler, BOM, controls.
    .replace(/[\s\u00A0\u200B-\u200D\u2060\u3164\uFEFF\u0000-\u001F]+/gu, '')
    .toLowerCase()
}

interface InstallmentDetail {
  key: string
  contractId: string
  contractDate: string
  contractorName: string
  studentName: string
  installmentLabel: string
  paidDate: string
  dueDate: string
  paidAmount: number
  installmentAmount: number
  isPaid: boolean
  currency: 'KRW' | 'USD'
  incentiveType: IncentiveType
  percentage: number
  incentiveAmount: number
}

interface PersonGroup {
  groupKey: string
  displayName: string
  details: InstallmentDetail[]
  /** Unique payment count */
  paymentCount: number
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
  const { data: allEntries = [], isLoading } = useIncentivesByInstallment()

  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth)
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null)

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)

  // Filter entries: paid by paidDate, unpaid by dueDate or contractDate
  const filtered = useMemo(
    () =>
      allEntries.filter((entry) => {
        if (entry.isPaid) {
          return entry.paidDate && entry.paidDate.startsWith(currentMonth)
        }
        const dateRef = entry.dueDate || entry.contractDate
        return dateRef && dateRef.startsWith(currentMonth)
      }),
    [allEntries, currentMonth],
  )

  // Group by person — dedupe by normalized display name so the same person
  // entered under both a legacy slug profileId and a new UUID (or as a custom
  // recipient) collapses into one row.
  const personGroups = useMemo(() => {
    const map = new Map<string, PersonGroup>()

    for (const entry of filtered) {
      const groupKey = `name:${normalizeName(entry.displayName)}`
      let group = map.get(groupKey)
      if (!group) {
        group = {
          groupKey,
          displayName: entry.displayName,
          details: [],
          paymentCount: 0,
          amountByType: {} as Record<IncentiveType, number>,
          totalIncentiveAmount: 0,
        }
        for (const key of Object.keys(INCENTIVE_TYPES) as IncentiveType[]) {
          group.amountByType[key] = 0
        }
        map.set(groupKey, group)
      }

      group.details.push({
        key: entry.key,
        contractId: entry.contractId,
        contractDate: entry.contractDate,
        contractorName: entry.contractorName,
        studentName: entry.studentName,
        installmentLabel: entry.installmentLabel,
        paidDate: entry.paidDate,
        dueDate: entry.dueDate,
        paidAmount: entry.paidAmount,
        installmentAmount: entry.installmentAmount,
        isPaid: entry.isPaid,
        currency: entry.currency,
        incentiveType: entry.incentiveType,
        percentage: entry.percentage,
        incentiveAmount: entry.incentiveAmount,
      })

      group.amountByType[entry.incentiveType] = (group.amountByType[entry.incentiveType] || 0) + entry.incentiveAmount
      group.totalIncentiveAmount += entry.incentiveAmount
    }

    // Compute unique payment count per person
    for (const group of map.values()) {
      const uniqueInstallments = new Set(group.details.map((d) => `${d.contractId}-${d.installmentLabel}`))
      group.paymentCount = uniqueInstallments.size
      // Sort details by date descending
      group.details.sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''))
    }

    // Sort persons by total incentive amount descending
    return Array.from(map.values()).sort((a, b) => b.totalIncentiveAmount - a.totalIncentiveAmount)
  }, [filtered])

  // Summaries
  const totalPersons = personGroups.length
  const totalIncentiveAmount = personGroups.reduce((s, g) => s + g.totalIncentiveAmount, 0)

  const isPersonView = location.pathname.includes('by-person')

  const [exportOpen, setExportOpen] = useState(false)

  const handleExport = useCallback(
    (params: { format: ExportFormat; scope: ExportScope; startMonth: string; endMonth: string }) => {
      const rangeEntries = allEntries.filter((entry) => {
        const dateRef = entry.isPaid ? entry.paidDate : (entry.dueDate || entry.contractDate)
        if (!dateRef) return false
        const ym = dateRef.slice(0, 7)
        return ym >= params.startMonth && ym <= params.endMonth
      })

      if (params.scope === 'by-contract') {
        const map = new Map<string, { entries: typeof rangeEntries; paidDate: string; contractorName: string; studentName: string; installmentLabel: string; paidAmount: number; currency: 'KRW' | 'USD'; isPaid: boolean; installmentAmount: number }>()
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
        const map = new Map<string, ExportPersonRow & { installments: Set<string> }>()
        for (const entry of rangeEntries) {
          const gk = `name:${normalizeName(entry.displayName)}`
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

  const toggleExpand = (key: string) => {
    setExpandedPerson((prev) => (prev === key ? null : key))
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
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4 mr-1.5" />
          {t('incentive.export')}
        </Button>
      </div>

      <IncentiveExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultScope="by-person"
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
                  <TableHead className="text-right">{t('incentive.paymentCount')}</TableHead>
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
                      <TableCell className="text-right">{group.paymentCount}</TableCell>
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

                    {/* Expanded installment details */}
                    {expandedPerson === group.groupKey &&
                      group.details.map((d) => (
                        <TableRow
                          key={d.key}
                          className={d.isPaid ? 'bg-muted/30' : 'bg-amber-50/40'}
                        >
                          <TableCell />
                          <TableCell className="pl-8">
                            <div className="text-sm">
                              <span className={d.isPaid ? 'text-muted-foreground' : 'text-amber-600'}>
                                {d.isPaid ? d.paidDate : (d.dueDate || '-')}
                              </span>
                              {' '}
                              {d.contractorName} / {d.studentName}
                              <Badge variant="outline" className="ml-2 text-xs">
                                {d.installmentLabel}
                              </Badge>
                              {!d.isPaid && (
                                <Badge variant="outline" className="ml-1 text-[10px] h-4 bg-amber-50 text-amber-600 border-amber-200">
                                  {t('incentive.expected')}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right text-sm ${d.isPaid ? 'text-muted-foreground' : 'text-amber-600'}`}>
                            {formatCurrency(d.isPaid ? d.paidAmount : d.installmentAmount)}
                          </TableCell>
                          {activeTypes.map((type) => (
                            <TableCell key={type} className="text-right text-sm">
                              {d.incentiveType === type ? (
                                <Badge variant="outline" className={`text-xs ${d.isPaid ? '' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                  {d.percentage}% = {formatCurrency(d.incentiveAmount)}
                                </Badge>
                              ) : (
                                ''
                              )}
                            </TableCell>
                          ))}
                          <TableCell className={`text-right text-sm whitespace-nowrap ${d.isPaid ? '' : 'text-amber-600'}`}>
                            {formatCurrency(d.incentiveAmount)}
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
