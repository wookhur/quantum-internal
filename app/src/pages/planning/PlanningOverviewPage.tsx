import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Target, TrendingUp, BarChart3, FileText } from 'lucide-react'
import { useMonthlyPerformance } from '@/hooks/useMonthlyPerformance'
import { formatCurrency } from '@/types'

export function PlanningOverviewPage() {
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
        <p className="text-red-500">데이터를 불러오는데 실패했습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">경영 현황</h1>
        <p className="text-sm text-gray-500 mt-1">월별 매출 목표 및 실적 현황을 확인합니다.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">월 매출 목표</p>
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">실적</p>
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">달성률</p>
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">신규 계약</p>
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
            <SelectValue placeholder="연도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 연도</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={regionFilter} onValueChange={v => setRegionFilter(v || 'all')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="지역" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 지역</SelectItem>
            <SelectItem value="KR">한국</SelectItem>
            <SelectItem value="US">미국</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>연도</TableHead>
                <TableHead>월</TableHead>
                <TableHead>지역</TableHead>
                <TableHead className="text-right">목표</TableHead>
                <TableHead className="text-right">실적</TableHead>
                <TableHead className="text-right">달성률</TableHead>
                <TableHead className="text-right">신규 계약</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                performances.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.year}</TableCell>
                    <TableCell>{p.month}월</TableCell>
                    <TableCell>
                      <Badge variant={p.region === 'KR' ? 'default' : 'secondary'}>
                        {p.region === 'KR' ? '한국' : '미국'}
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
          <span>합계 목표: {formatCurrency(totalTarget, performances[0].currency)}</span>
          <span>합계 실적: {formatCurrency(totalActual, performances[0].currency)}</span>
          <span>평균 달성률: {avgAchievementRate.toFixed(1)}%</span>
          <span>총 신규 계약: {totalNewContracts}건</span>
        </div>
      )}
    </div>
  )
}
