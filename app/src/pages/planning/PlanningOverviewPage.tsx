import { useState, useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Target, TrendingUp, BarChart3, FileText, Plus, Pencil, Trash2 } from 'lucide-react'
import {
  useMonthlyPerformance,
  useAutoPerformanceData,
  useCreateMonthlyPerformance,
  useUpdateMonthlyPerformance,
  useDeleteMonthlyPerformance,
} from '@/hooks/useMonthlyPerformance'
import { formatCurrency } from '@/types'
import type { MonthlyPerformance } from '@/types'

const INITIAL_FORM = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  region: 'KR' as 'KR' | 'US',
  target: 0,
  currency: 'KRW' as 'KRW' | 'USD',
}

interface MergedRow {
  id: string
  year: number
  month: number
  region: 'KR' | 'US'
  target: number
  actual: number
  achievementRate: number
  newContracts: number
  currency: 'KRW' | 'USD'
  source: MonthlyPerformance | null
}

export function PlanningOverviewPage() {
  const t = useT()
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [regionFilter, setRegionFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MergedRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MergedRow | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)

  const { data: performances = [], isLoading: loadingPerf, error: perfError } = useMonthlyPerformance({
    year: yearFilter !== 'all' ? Number(yearFilter) : undefined,
    region: regionFilter !== 'all' ? (regionFilter as 'KR' | 'US') : undefined,
  })
  const { data: autoData, isLoading: loadingAuto } = useAutoPerformanceData()

  const createPerf = useCreateMonthlyPerformance()
  const updatePerf = useUpdateMonthlyPerformance()
  const deletePerf = useDeleteMonthlyPerformance()

  const isLoading = loadingPerf || loadingAuto

  const mergedRows = useMemo(() => {
    const map = new Map<string, MergedRow>()

    for (const p of performances) {
      const key = `${p.year}-${p.month}-${p.region}`
      map.set(key, {
        id: p.id,
        year: p.year,
        month: p.month,
        region: p.region,
        target: p.target,
        actual: 0,
        achievementRate: 0,
        newContracts: 0,
        currency: p.currency,
        source: p,
      })
    }

    if (autoData) {
      for (const c of autoData.collected) {
        const [yStr, mStr] = c.yearMonth.split('-')
        const year = Number(yStr)
        const month = Number(mStr)
        if (yearFilter !== 'all' && year !== Number(yearFilter)) continue
        if (regionFilter !== 'all' && c.region !== regionFilter) continue
        const key = `${year}-${month}-${c.region}`
        const existing = map.get(key)
        if (existing) {
          existing.actual += c.amount
        } else {
          map.set(key, {
            id: `auto-${key}`,
            year,
            month,
            region: c.region,
            target: 0,
            actual: c.amount,
            achievementRate: 0,
            newContracts: 0,
            currency: c.region === 'US' ? 'USD' : 'KRW',
            source: null,
          })
        }
      }

      for (const nc of autoData.newContracts) {
        const [yStr, mStr] = nc.yearMonth.split('-')
        const year = Number(yStr)
        const month = Number(mStr)
        if (yearFilter !== 'all' && year !== Number(yearFilter)) continue
        if (regionFilter !== 'all' && nc.region !== regionFilter) continue
        const key = `${year}-${month}-${nc.region}`
        const existing = map.get(key)
        if (existing) {
          existing.newContracts += nc.count
        } else {
          map.set(key, {
            id: `auto-${key}`,
            year,
            month,
            region: nc.region,
            target: 0,
            actual: 0,
            achievementRate: 0,
            newContracts: nc.count,
            currency: nc.region === 'US' ? 'USD' : 'KRW',
            source: null,
          })
        }
      }
    }

    for (const row of map.values()) {
      row.achievementRate = row.target > 0 ? (row.actual / row.target * 100) : 0
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return b.month - a.month
    })
  }, [performances, autoData, yearFilter, regionFilter])

  const years = useMemo(() => {
    const set = new Set(mergedRows.map(p => p.year))
    return Array.from(set).sort((a, b) => b - a)
  }, [mergedRows])

  const latestMonth = mergedRows.length > 0 ? mergedRows[0] : null
  const hasMixedCurrency = regionFilter === 'all' && mergedRows.some(r => r.currency === 'KRW') && mergedRows.some(r => r.currency === 'USD')
  const krwRows = mergedRows.filter(r => r.currency === 'KRW')
  const usdRows = mergedRows.filter(r => r.currency === 'USD')
  const totalTargetKRW = krwRows.reduce((sum, p) => sum + p.target, 0)
  const totalActualKRW = krwRows.reduce((sum, p) => sum + p.actual, 0)
  const totalTargetUSD = usdRows.reduce((sum, p) => sum + p.target, 0)
  const totalActualUSD = usdRows.reduce((sum, p) => sum + p.actual, 0)
  const totalTarget = mergedRows.reduce((sum, p) => sum + p.target, 0)
  const totalActual = mergedRows.reduce((sum, p) => sum + p.actual, 0)
  const avgAchievementRate = mergedRows.filter(r => r.target > 0).length > 0
    ? mergedRows.filter(r => r.target > 0).reduce((sum, p) => sum + p.achievementRate, 0) / mergedRows.filter(r => r.target > 0).length
    : 0
  const totalNewContracts = mergedRows.reduce((sum, p) => sum + p.newContracts, 0)

  const openCreateDialog = () => {
    setEditingItem(null)
    setForm(INITIAL_FORM)
    setDialogOpen(true)
  }

  const openEditDialog = (row: MergedRow) => {
    setEditingItem(row)
    setForm({
      year: row.year,
      month: row.month,
      region: row.region,
      target: row.target,
      currency: row.currency,
    })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    const payload = {
      year: form.year,
      month: form.month,
      region: form.region,
      target: form.target,
      actual: 0,
      currency: form.currency,
    }
    const onSuccess = () => {
      setDialogOpen(false)
      setEditingItem(null)
      setForm(INITIAL_FORM)
    }
    if (editingItem?.source) {
      updatePerf.mutate({ id: editingItem.source.id, ...payload }, { onSuccess })
    } else {
      createPerf.mutate(payload, { onSuccess })
    }
  }

  const handleDelete = () => {
    if (!deleteTarget?.source) return
    deletePerf.mutate(deleteTarget.source.id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (perfError) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-red-500">{t('planOverview.loadError')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('planning.overview')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('planOverview.subtitle')}</p>
        </div>
        <Button className="gap-2" onClick={openCreateDialog}>
          <Plus className="size-4" /> {t('planOverview.addTarget')}
        </Button>
      </div>

      {/* Auto-sync notice */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
        {t('planOverview.autoSyncNotice')}
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
                  {latestMonth && latestMonth.target > 0 ? `${latestMonth.achievementRate.toFixed(1)}%` : '-'}
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
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                mergedRows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.year}</TableCell>
                    <TableCell>{row.month}{t('planOverview.monthSuffix')}</TableCell>
                    <TableCell>
                      <Badge variant={row.region === 'KR' ? 'default' : 'secondary'}>
                        {row.region === 'KR' ? t('planOverview.korea') : t('planOverview.usa')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.target > 0 ? formatCurrency(row.target, row.currency) : (
                        <span className="text-gray-400">{t('planOverview.noTarget')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.actual, row.currency)}</TableCell>
                    <TableCell className="text-right">
                      {row.target > 0 ? (
                        <Badge variant={row.achievementRate >= 100 ? 'default' : row.achievementRate >= 80 ? 'secondary' : 'destructive'}>
                          {row.achievementRate.toFixed(1)}%
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.newContracts || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditDialog(row)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        {row.source && (
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary Footer */}
      {mergedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          {hasMixedCurrency ? (
            <>
              <span>{t('planOverview.totalTarget')}: {formatCurrency(totalTargetKRW, 'KRW')} / {formatCurrency(totalTargetUSD, 'USD')}</span>
              <span>{t('planOverview.totalActual')}: {formatCurrency(totalActualKRW, 'KRW')} / {formatCurrency(totalActualUSD, 'USD')}</span>
            </>
          ) : (
            <>
              <span>{t('planOverview.totalTarget')}: {formatCurrency(totalTarget, mergedRows[0].currency)}</span>
              <span>{t('planOverview.totalActual')}: {formatCurrency(totalActual, mergedRows[0].currency)}</span>
            </>
          )}
          <span>{t('planOverview.avgAchievementRate')}: {avgAchievementRate.toFixed(1)}%</span>
          <span>{t('planOverview.totalNewContracts')}: {totalNewContracts}{t('common.count')}</span>
        </div>
      )}

      {/* Create / Edit Target Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingItem(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? t('planOverview.editTargetTitle') : t('planOverview.addTargetTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t('planOverview.year')} *</Label>
                <Input type="number" min={2020} max={2030} value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) || 2026 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.month')} *</Label>
                <Input type="number" min={1} max={12} value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.region')}</Label>
                <Select value={form.region} onValueChange={v => setForm(f => ({ ...f, region: (v as 'KR' | 'US') || 'KR', currency: v === 'US' ? 'USD' : 'KRW' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KR">{t('planOverview.korea')}</SelectItem>
                    <SelectItem value="US">{t('planOverview.usa')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('planOverview.target')} ({form.currency})</Label>
              <Input type="number" min={0} value={form.target} onChange={e => setForm(f => ({ ...f, target: parseInt(e.target.value) || 0 }))} />
            </div>
            <p className="text-xs text-muted-foreground">{t('planOverview.autoCalcNote')}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmit} disabled={createPerf.isPending || updatePerf.isPending}>
                {(createPerf.isPending || updatePerf.isPending) ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                {editingItem ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('planOverview.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{deleteTarget?.year}{t('planOverview.yearSuffix')} {deleteTarget?.month}{t('planOverview.monthSuffix')}</strong> ({deleteTarget?.region}) {t('planOverview.deleteConfirmMsg')}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletePerf.isPending}>
              {deletePerf.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
