import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Target,
  TrendingUp,
  Video,
  Megaphone,
  Clock,
  Plus,
  Pencil,
  CheckCircle2,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useKpiTargets,
  useUpsertKpiTarget,
  MARKETING_METRICS,
  SALES_METRICS,
  ATTENDANCE_METRICS,
  type KpiTarget,
} from '@/hooks/useKpiTargets'

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

function progressPercent(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(Math.round((actual / target) * 100), 999)
}

function progressColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 70) return 'bg-blue-500'
  if (pct >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function progressTextColor(pct: number): string {
  if (pct >= 100) return 'text-green-600'
  if (pct >= 70) return 'text-blue-600'
  if (pct >= 40) return 'text-amber-600'
  return 'text-red-600'
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  target,
  actual,
  unit,
  onEdit,
  isInverse,
}: {
  label: string
  target: number
  actual: number
  unit?: string
  onEdit: () => void
  isInverse?: boolean // lower is better (e.g. late count)
}) {
  const pct = isInverse
    ? (target > 0 ? Math.max(0, Math.round(((target - actual) / target) * 100)) : 100)
    : progressPercent(actual, target)
  const achieved = isInverse ? actual <= target : pct >= 100

  return (
    <div
      className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Pencil className="h-3 w-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className={`text-2xl font-bold ${achieved ? 'text-green-600' : 'text-gray-900'}`}>
          {actual}{unit}
        </span>
        <span className="text-sm text-muted-foreground mb-0.5">/ {target}{unit}</span>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progressColor(isInverse ? (achieved ? 100 : pct) : pct)}`}
          style={{ width: `${Math.min(isInverse ? (achieved ? 100 : pct) : pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-xs font-medium ${progressTextColor(isInverse ? (achieved ? 100 : pct) : pct)}`}>
          {isInverse ? (achieved ? '달성' : `${actual}회 초과`) : `${pct}%`}
        </span>
        {achieved && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function KpiTargetsPage() {
  const t = useT()
  const { data: profiles = [] } = useProfiles()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const { data: targets = [], isLoading } = useKpiTargets(currentMonth)
  const upsertMut = useUpsertKpiTarget()

  const [selectedProfile, setSelectedProfile] = useState<string>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    profileId: '',
    category: 'marketing' as KpiTarget['category'],
    metricKey: '',
    targetValue: 0,
    actualValue: 0,
  })

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)

  // Only internal employees
  const activeProfiles = useMemo(() => profiles.filter(p => !p.isExternal), [profiles])

  // Build lookup: profileId:metricKey -> KpiTarget
  const targetMap = useMemo(() => {
    const map = new Map<string, KpiTarget>()
    for (const t of targets) {
      map.set(`${t.profileId}:${t.metricKey}`, t)
    }
    return map
  }, [targets])

  // Get target for a specific profile and metric
  const getTarget = useCallback(
    (profileId: string, metricKey: string) => targetMap.get(`${profileId}:${metricKey}`),
    [targetMap],
  )

  // Summary by category
  const categorySummary = useMemo(() => {
    const result = { marketing: { total: 0, achieved: 0 }, sales: { total: 0, achieved: 0 }, attendance: { total: 0, achieved: 0 } }
    for (const t of targets) {
      if (t.targetValue <= 0) continue
      const cat = t.category as keyof typeof result
      if (!result[cat]) continue
      result[cat].total++
      const isInverse = t.metricKey === 'late_count'
      const achieved = isInverse ? t.actualValue <= t.targetValue : t.actualValue >= t.targetValue
      if (achieved) result[cat].achieved++
    }
    return result
  }, [targets])

  const openEdit = (profileId: string, category: KpiTarget['category'], metricKey: string) => {
    const existing = getTarget(profileId, metricKey)
    setEditForm({
      profileId,
      category,
      metricKey,
      targetValue: existing?.targetValue || 0,
      actualValue: existing?.actualValue || 0,
    })
    setEditOpen(true)
  }

  const handleSave = () => {
    if (!editForm.profileId || !editForm.metricKey) return
    upsertMut.mutate({
      profileId: editForm.profileId,
      month: currentMonth,
      category: editForm.category,
      metricKey: editForm.metricKey,
      targetValue: editForm.targetValue,
      actualValue: editForm.actualValue,
    })
    setEditOpen(false)
  }

  // Filter profiles for display
  const displayProfiles = useMemo(() => {
    if (selectedProfile === 'all') return activeProfiles
    return activeProfiles.filter(p => p.id === selectedProfile)
  }, [activeProfiles, selectedProfile])

  const profileName = useCallback(
    (id: string) => profiles.find(p => p.id === id)?.name || '?',
    [profiles],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('kpiTarget.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('kpiTarget.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold min-w-[120px] text-center">
          {year}{t('common.year')} {month}{t('common.month')}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setCurrentMonth(getCurrentMonth())}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            {t('common.thisMonth')}
          </Button>
        )}

        <div className="flex-1" />

        <Select value={selectedProfile} onValueChange={v => v && setSelectedProfile(v)}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <span>{selectedProfile === 'all' ? t('common.all') : profileName(selectedProfile)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {activeProfiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <Video className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('kpiTarget.marketingGoals')}</div>
              <div className="text-lg font-bold">
                {categorySummary.marketing.achieved}
                <span className="text-sm font-normal text-muted-foreground"> / {categorySummary.marketing.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('kpiTarget.salesGoals')}</div>
              <div className="text-lg font-bold">
                {categorySummary.sales.achieved}
                <span className="text-sm font-normal text-muted-foreground"> / {categorySummary.sales.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('kpiTarget.attendanceGoals')}</div>
              <div className="text-lg font-bold">
                {categorySummary.attendance.achieved}
                <span className="text-sm font-normal text-muted-foreground"> / {categorySummary.attendance.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-employee KPI sections */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : displayProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('common.noData')}
          </CardContent>
        </Card>
      ) : (
        displayProfiles.map(profile => {
          const hasAnyTarget = targets.some(t => t.profileId === profile.id)
          return (
            <Card key={profile.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                    {profile.name.charAt(0)}
                  </div>
                  {profile.name}
                  {profile.department && (
                    <Badge variant="outline" className="text-[10px] h-4">
                      {profile.department}
                    </Badge>
                  )}
                  {!hasAnyTarget && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs ml-auto"
                      onClick={() => openEdit(profile.id, 'marketing', MARKETING_METRICS[0].key)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {t('kpiTarget.setTarget')}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Marketing */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Megaphone className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-semibold text-purple-700">{t('kpiTarget.marketingGoals')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {MARKETING_METRICS.map(metric => {
                      const data = getTarget(profile.id, metric.key)
                      return (
                        <MetricCard
                          key={metric.key}
                          label={t(metric.labelKey)}
                          target={data?.targetValue || 0}
                          actual={data?.actualValue || 0}
                          onEdit={() => openEdit(profile.id, 'marketing', metric.key)}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Sales */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold text-blue-700">{t('kpiTarget.salesGoals')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {SALES_METRICS.map(metric => {
                      const data = getTarget(profile.id, metric.key)
                      const isRate = metric.key.includes('rate')
                      return (
                        <MetricCard
                          key={metric.key}
                          label={t(metric.labelKey)}
                          target={data?.targetValue || 0}
                          actual={data?.actualValue || 0}
                          unit={isRate ? '%' : undefined}
                          onEdit={() => openEdit(profile.id, 'sales', metric.key)}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Attendance */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-700">{t('kpiTarget.attendanceGoals')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ATTENDANCE_METRICS.map(metric => {
                      const data = getTarget(profile.id, metric.key)
                      const isInverse = metric.key === 'late_count'
                      return (
                        <MetricCard
                          key={metric.key}
                          label={t(metric.labelKey)}
                          target={data?.targetValue || 0}
                          actual={data?.actualValue || 0}
                          unit={isInverse ? t('kpiTarget.unitTimes') : t('kpiTarget.unitDays')}
                          onEdit={() => openEdit(profile.id, 'attendance', metric.key)}
                          isInverse={isInverse}
                        />
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-5" />
              {t('kpiTarget.editTarget')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <span className="font-medium">{profileName(editForm.profileId)}</span>
              {' · '}
              {currentMonth}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('kpiTarget.metricLabel')}</Label>
              <div className="text-sm font-medium">
                {t(
                  [...MARKETING_METRICS, ...SALES_METRICS, ...ATTENDANCE_METRICS].find(
                    m => m.key === editForm.metricKey,
                  )?.labelKey || editForm.metricKey,
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('kpiTarget.targetValue')}</Label>
                <Input
                  type="number"
                  value={editForm.targetValue}
                  onChange={e => setEditForm(f => ({ ...f, targetValue: Number(e.target.value) }))}
                  className="h-9"
                  min={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('kpiTarget.actualValue')}</Label>
                <Input
                  type="number"
                  value={editForm.actualValue}
                  onChange={e => setEditForm(f => ({ ...f, actualValue: Number(e.target.value) }))}
                  className="h-9"
                  min={0}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={upsertMut.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
