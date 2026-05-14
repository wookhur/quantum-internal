import { useState, useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Target, TrendingUp, BarChart3, FileText } from 'lucide-react'
import { useMonthlyPerformance } from '@/hooks/useMonthlyPerformance'
import { formatCurrency } from '@/types'

export function PlanningOverviewPage() {
  const t = useT()
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [regionFilter, setRegionFilter] = useState<string>('all')

  const { data: performances = [], isLoading, error } = useMonthlyPerformance({
    year: yearFilter !== 'all' ? Number(yearFilter) : undefined,
    region: regionFilter !== 'all' ? (regionFilter as 'KR' | 'US') : undefined,
  })

  // Extract unique years for the filter
  const years = useMemo(() => {
    const set = new Set(performances.map(p => p.year))
    return Array.from(set).sort((a, b) => b - a)
  }, [performances])

  // Summary calculations (current month or latest data)
  const latestMonth = performances.length > 0 ? performances[0] : null
  const totalTarget = performances.reduce((sum, p) => sum + p.target, 0)
  const totalActual = performances.reduce((sum, p) => sum + p.actual, 0)
  const avgAchievementRate = performances.length > 0
    ? performances.reduce((sum, p) => sum + p.achievementRate, 0) / performances.length
    : 0
  const totalNewContracts = performances.reduce((sum, p) => sum + (p.newContracts || 0), 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-red-500">{t('planOverview.loadError')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('planning.overview')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('planOverview.subtitle')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('planOverview.monthlyTarget')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {latestMonth ? formatCurrency(latestMonth.target, latestMonth.currency) : '-'}
                </p>
              </div>
              <div className="rounded-full bg-blue-50 p-2.5">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('planOverview.actual')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {latestMonth ? formatCurrency(latestMonth.actual, latestMonth.currency) : '-'}
                </p>
              </div>
              <div className="rounded-full bg-green-50 p-2.5">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('planOverview.achievementRate')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {latestMonth ? `${latestMonth.achievementRate.toFixed(1)}%` : '-'}
                </p>
              </div>
              <div className="rounded-full bg-purple-50 p-2.5">
                <BarChart3 className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('planOverview.newContracts')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {latestMonth?.newContracts ?? '-'}
                </p>
              </div>
              <div className="rounded-full bg-orange-50 p-2.5">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={yearFilter} onValueChange={v => setYearFilter(v || 'all')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('planOverview.year')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('planOverview.allYears')}</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={String(y)}>{y}{t('planOverview.yearSuffix')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={regionFilter} onValueChange={v => setRegionFilter(v || 'all')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('common.region')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('planOverview.allRegions')}</SelectItem>
            <SelectItem value="KR">{t('planOverview.korea')}</SelectItem>
            <SelectItem value="US">{t('planOverview.usa')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('planOverview.year')}</TableHead>
                <TableHead>{t('common.month')}</TableHead>
                <TableHead>{t('common.region')}</TableHead>
                <TableHead className="text-right">{t('planOverview.target')}</TableHead>
                <TableHead className="text-right">{t('planOverview.actual')}</TableHead>
                <TableHead className="text-right">{t('planOverview.achievementRate')}</TableHead>
                <TableHead className="text-right">{t('planOverview.newContracts')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                performances.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.year}</TableCell>
                    <TableCell>{p.month}{t('planOverview.monthSuffix')}</TableCell>
                    <TableCell>
                      <Badge variant={p.region === 'KR' ? 'default' : 'secondary'}>
                        {p.region === 'KR' ? t('planOverview.korea') : t('planOverview.usa')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(p.target, p.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.actual, p.currency)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.achievementRate >= 100 ? 'default' : p.achievementRate >= 80 ? 'secondary' : 'destructive'}>
                        {p.achievementRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.newContracts ?? '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary Footer */}
      {performances.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{t('planOverview.totalTarget')}: {formatCurrency(totalTarget, performances[0].currency)}</span>
          <span>{t('planOverview.totalActual')}: {formatCurrency(totalActual, performances[0].currency)}</span>
          <span>{t('planOverview.avgAchievementRate')}: {avgAchievementRate.toFixed(1)}%</span>
          <span>{t('planOverview.totalNewContracts')}: {totalNewContracts}{t('common.count')}</span>
        </div>
      )}
    </div>
  )
}
