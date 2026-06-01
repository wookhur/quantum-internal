import { useState, useMemo, useCallback, useEffect } from 'react'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Target,
  TrendingUp,
  Video,
  Megaphone,
  Clock,
  Pencil,
  CheckCircle2,
  Settings2,
  Check,
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
import {
  useKpiAssignments,
  useUpdateKpiAssignments,
  type KpiAssignment,
  type KpiAssignmentMap,
} from '@/hooks/useKpiAssignments'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ['marketing', 'sales', 'attendance'] as const
type Category = (typeof ALL_CATEGORIES)[number]

const CATEGORY_CONFIG: Record<Category, {
  labelKey: string
  icon: typeof Video
  iconColor: string
  textColor: string
  bgColor: string
  metrics: readonly { key: string; labelKey: string }[]
}> = {
  marketing: {
    labelKey: 'kpiTarget.marketingGoals',
    icon: Megaphone,
    iconColor: 'text-purple-600',
    textColor: 'text-purple-700',
    bgColor: 'bg-purple-100',
    metrics: MARKETING_METRICS,
  },
  sales: {
    labelKey: 'kpiTarget.salesGoals',
    icon: TrendingUp,
    iconColor: 'text-blue-600',
    textColor: 'text-blue-700',
    bgColor: 'bg-blue-100',
    metrics: SALES_METRICS,
  },
  attendance: {
    labelKey: 'kpiTarget.attendanceGoals',
    icon: Clock,
    iconColor: 'text-emerald-600',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    metrics: ATTENDANCE_METRICS,
  },
}

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

/** Get effective metrics for a profile given assignments */
function getEffectiveMetrics(
  profileId: string,
  assignments: KpiAssignmentMap,
): { category: Category; key: string; labelKey: string }[] {
  const assignment = assignments[profileId]
  // No assignment, excluded, or no categories → show nothing
  if (!assignment || assignment.excluded || assignment.categories.length === 0) return []

  const result: { category: Category; key: string; labelKey: string }[] = []
  for (const cat of ALL_CATEGORIES) {
    if (!assignment.categories.includes(cat)) continue
    const config = CATEGORY_CONFIG[cat]
    for (const m of config.metrics) {
      // If specific metrics are selected, filter
      if (assignment.metrics.length > 0 && !assignment.metrics.includes(m.key)) continue
      result.push({ category: cat, key: m.key, labelKey: m.labelKey })
    }
  }
  return result
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
  isInverse?: boolean
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
// Assignment Settings Dialog
// ---------------------------------------------------------------------------

function AssignmentDialog({
  open,
  onOpenChange,
  profiles,
  currentAssignments,
  onSave,
  isPending,
  t,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  profiles: { id: string; name: string; department?: string }[]
  currentAssignments: KpiAssignmentMap
  onSave: (assignments: KpiAssignmentMap) => void
  isPending: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [local, setLocal] = useState<KpiAssignmentMap>({})
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setLocal({ ...currentAssignments })
      setExpandedProfile(null)
    }
  }, [open, currentAssignments])

  const toggleExcluded = (profileId: string) => {
    setLocal(prev => {
      const existing = prev[profileId] || { categories: [], metrics: [] }
      return { ...prev, [profileId]: { ...existing, excluded: !existing.excluded } }
    })
  }

  const toggleCategory = (profileId: string, cat: string) => {
    setLocal(prev => {
      const existing = prev[profileId] || { categories: [], metrics: [] }
      const cats = existing.categories.includes(cat)
        ? existing.categories.filter(c => c !== cat)
        : [...existing.categories, cat]
      // When removing a category, also remove its metrics from the metrics list
      const catConfig = CATEGORY_CONFIG[cat as Category]
      const catMetricKeys = catConfig ? catConfig.metrics.map(m => m.key) : []
      const filteredMetrics = existing.metrics.filter(m => !catMetricKeys.includes(m) || cats.includes(cat))
      return { ...prev, [profileId]: { ...existing, categories: cats, metrics: filteredMetrics, excluded: false } }
    })
  }

  const toggleMetric = (profileId: string, metricKey: string) => {
    setLocal(prev => {
      const existing = prev[profileId] || { categories: [], metrics: [] }
      const metrics = existing.metrics.includes(metricKey)
        ? existing.metrics.filter(m => m !== metricKey)
        : [...existing.metrics, metricKey]
      return { ...prev, [profileId]: { ...existing, metrics } }
    })
  }

  const getAssignment = (profileId: string): KpiAssignment => {
    return local[profileId] || { categories: [], metrics: [] }
  }

  /** Check if a specific metric is enabled for a profile */
  const isMetricEnabled = (profileId: string, metricKey: string, category: Category): boolean => {
    const a = getAssignment(profileId)
    if (!a.categories.includes(category)) return false
    // If no specific metrics selected → all in enabled categories are on
    if (a.metrics.length === 0) return true
    return a.metrics.includes(metricKey)
  }

  const handleSave = () => {
    onSave(local)
  }

  /** Quick-apply: copy one profile's settings to others in the same department */
  const applyToDepartment = (sourceId: string) => {
    const source = profiles.find(p => p.id === sourceId)
    if (!source?.department) return
    const assignment = getAssignment(sourceId)
    setLocal(prev => {
      const next = { ...prev }
      for (const p of profiles) {
        if (p.department === source.department) {
          next[p.id] = { ...assignment }
        }
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5" />
            {t('kpiTarget.assignSettings')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t('kpiTarget.assignSettingsDesc')}</p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">{t('common.name')}</TableHead>
                {ALL_CATEGORIES.map(cat => (
                  <TableHead key={cat} className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {(() => {
                        const Icon = CATEGORY_CONFIG[cat].icon
                        return <Icon className={`h-3.5 w-3.5 ${CATEGORY_CONFIG[cat].iconColor}`} />
                      })()}
                      <span className="text-xs">{t(CATEGORY_CONFIG[cat].labelKey)}</span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-center w-[80px]">
                  <span className="text-xs">{t('kpiTarget.excludeLabel')}</span>
                </TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(profile => {
                const a = getAssignment(profile.id)
                const isExcluded = !!a.excluded
                const isExpanded = expandedProfile === profile.id
                return (
                  <TableRow key={profile.id} className={`group ${isExcluded ? 'opacity-50' : ''}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isExcluded ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-600'}`}>
                          {profile.name.charAt(0)}
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${isExcluded ? 'line-through text-muted-foreground' : ''}`}>{profile.name}</div>
                          {profile.department && (
                            <div className="text-[10px] text-muted-foreground">{profile.department}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {ALL_CATEGORIES.map(cat => (
                      <TableCell key={cat} className="text-center">
                        <button
                          type="button"
                          disabled={isExcluded}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                            isExcluded
                              ? 'bg-gray-50 text-gray-200 cursor-not-allowed'
                              : a.categories.includes(cat)
                                ? `${CATEGORY_CONFIG[cat].bgColor} ${CATEGORY_CONFIG[cat].iconColor}`
                                : 'bg-gray-50 text-gray-300 hover:bg-gray-100'
                          }`}
                          onClick={() => toggleCategory(profile.id, cat)}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                          isExcluded
                            ? 'bg-red-100 text-red-600'
                            : 'bg-gray-50 text-gray-300 hover:bg-gray-100'
                        }`}
                        onClick={() => toggleExcluded(profile.id)}
                      >
                        {isExcluded ? <Check className="h-4 w-4" /> : <span className="text-xs">—</span>}
                      </button>
                    </TableCell>
                    <TableCell>
                      {!isExcluded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}
                        >
                          {t('kpiTarget.detail')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Expanded detail panel for selected profile */}
          {expandedProfile && (() => {
            const profile = profiles.find(p => p.id === expandedProfile)
            if (!profile) return null
            const a = getAssignment(expandedProfile)
            return (
              <div className="mt-3 p-4 bg-muted/30 rounded-lg border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{profile.name}</span>
                    <span className="text-xs text-muted-foreground">— {t('kpiTarget.detailMetrics')}</span>
                  </div>
                  {profile.department && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => applyToDepartment(expandedProfile)}
                    >
                      {t('kpiTarget.applyToDept', { dept: profile.department })}
                    </Button>
                  )}
                </div>

                {ALL_CATEGORIES.map(cat => {
                  if (!a.categories.includes(cat)) return null
                  const config = CATEGORY_CONFIG[cat]
                  return (
                    <div key={cat}>
                      <div className={`text-xs font-semibold mb-1.5 ${config.textColor}`}>
                        {t(config.labelKey)}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {config.metrics.map(m => {
                          const enabled = isMetricEnabled(expandedProfile, m.key, cat)
                          return (
                            <button
                              key={m.key}
                              type="button"
                              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                                enabled
                                  ? `${config.bgColor} ${config.textColor} border-transparent`
                                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => toggleMetric(expandedProfile, m.key)}
                            >
                              {enabled && <Check className="h-3 w-3 inline mr-1" />}
                              {t(m.labelKey)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {a.categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('kpiTarget.noCategorySelected')}</p>
                )}
              </div>
            )
          })()}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={isPending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const { data: assignments = {} } = useKpiAssignments()
  const updateAssignments = useUpdateKpiAssignments()

  const [selectedProfile, setSelectedProfile] = useState<string>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    profileId: '',
    category: 'marketing' as KpiTarget['category'],
    metricKey: '',
    targetValue: 0,
    actualValue: 0,
  })

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)

  const activeProfiles = useMemo(() => profiles.filter(p => !p.isExternal), [profiles])

  // Build lookup: profileId:metricKey -> KpiTarget
  const targetMap = useMemo(() => {
    const map = new Map<string, KpiTarget>()
    for (const t of targets) {
      map.set(`${t.profileId}:${t.metricKey}`, t)
    }
    return map
  }, [targets])

  const getTarget = useCallback(
    (profileId: string, metricKey: string) => targetMap.get(`${profileId}:${metricKey}`),
    [targetMap],
  )

  // Summary by category (only for assigned metrics)
  const categorySummary = useMemo(() => {
    const result = { marketing: { total: 0, achieved: 0 }, sales: { total: 0, achieved: 0 }, attendance: { total: 0, achieved: 0 } }
    for (const t of targets) {
      if (t.targetValue <= 0) continue
      // Only count if metric is assigned to this employee
      const effective = getEffectiveMetrics(t.profileId, assignments)
      if (!effective.some(e => e.key === t.metricKey)) continue
      const cat = t.category as keyof typeof result
      if (!result[cat]) continue
      result[cat].total++
      const isInverse = t.metricKey === 'late_count'
      const achieved = isInverse ? t.actualValue <= t.targetValue : t.actualValue >= t.targetValue
      if (achieved) result[cat].achieved++
    }
    return result
  }, [targets, assignments])

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

  // Filter profiles for display — hide excluded employees
  const displayProfiles = useMemo(() => {
    let filtered = activeProfiles.filter(p => !assignments[p.id]?.excluded)
    if (selectedProfile !== 'all') {
      filtered = filtered.filter(p => p.id === selectedProfile)
    }
    return filtered
  }, [activeProfiles, selectedProfile, assignments])

  const profileName = useCallback(
    (id: string) => profiles.find(p => p.id === id)?.name || '?',
    [profiles],
  )

  // Count assigned vs unassigned employees
  const assignedCount = useMemo(
    () => activeProfiles.filter(p => {
      const a = assignments[p.id]
      return a && a.categories.length > 0
    }).length,
    [activeProfiles, assignments],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('kpiTarget.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('kpiTarget.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setAssignOpen(true)}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {t('kpiTarget.assignSettings')}
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
            {assignedCount}/{activeProfiles.length}
          </Badge>
        </Button>
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
        {ALL_CATEGORIES.map(cat => {
          const config = CATEGORY_CONFIG[cat]
          const summary = categorySummary[cat]
          const Icon = config.icon
          return (
            <Card key={cat}>
              <CardContent className="py-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${config.iconColor}`} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t(config.labelKey)}</div>
                  <div className="text-lg font-bold">
                    {summary.achieved}
                    <span className="text-sm font-normal text-muted-foreground"> / {summary.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
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
          const effectiveMetrics = getEffectiveMetrics(profile.id, assignments)
          // No assigned metrics for this employee
          if (effectiveMetrics.length === 0) {
            return (
              <Card key={profile.id} className="opacity-60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                      {profile.name.charAt(0)}
                    </div>
                    {profile.name}
                    {profile.department && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {profile.department}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{t('kpiTarget.noMetricsAssigned')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setAssignOpen(true)}
                    >
                      <Settings2 className="h-3 w-3 mr-1" />
                      {t('kpiTarget.assignSettings')}
                    </Button>
                  </CardTitle>
                </CardHeader>
              </Card>
            )
          }

          // Group metrics by category
          const grouped = new Map<Category, typeof effectiveMetrics>()
          for (const m of effectiveMetrics) {
            const list = grouped.get(m.category) || []
            list.push(m)
            grouped.set(m.category, list)
          }

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
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from(grouped.entries()).map(([cat, metrics]) => {
                  const config = CATEGORY_CONFIG[cat]
                  const Icon = config.icon
                  const cols = metrics.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
                    metrics.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
                    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${config.iconColor}`} />
                        <span className={`text-sm font-semibold ${config.textColor}`}>{t(config.labelKey)}</span>
                      </div>
                      <div className={`grid ${cols} gap-2`}>
                        {metrics.map(metric => {
                          const data = getTarget(profile.id, metric.key)
                          const isRate = metric.key.includes('rate')
                          const isInverse = metric.key === 'late_count'
                          return (
                            <MetricCard
                              key={metric.key}
                              label={t(metric.labelKey)}
                              target={data?.targetValue || 0}
                              actual={data?.actualValue || 0}
                              unit={isInverse ? t('kpiTarget.unitTimes') : isRate ? '%' : undefined}
                              onEdit={() => openEdit(profile.id, cat, metric.key)}
                              isInverse={isInverse}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
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

      {/* Assignment Settings Dialog */}
      <AssignmentDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        profiles={activeProfiles}
        currentAssignments={assignments}
        onSave={a => {
          updateAssignments.mutate(a)
          setAssignOpen(false)
        }}
        isPending={updateAssignments.isPending}
        t={t}
      />
    </div>
  )
}
