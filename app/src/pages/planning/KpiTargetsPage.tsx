import { useState, useMemo, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  ChevronDown,
  Calendar,
  Target,
  TrendingUp,
  Megaphone,
  Clock,
  Pencil,
  CheckCircle2,
  Settings2,
  Check,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import {
  useKpiTargets,
  useUpsertKpiTarget,
  MARKETING_METRICS,
  SALES_METRICS,
  SERVICE_METRICS,
  ATTENDANCE_METRICS,
  type KpiTarget,
} from '@/hooks/useKpiTargets'
import {
  useKpiAssignments,
  useUpdateKpiAssignments,
  type KpiAssignment,
  type KpiAssignmentMap,
} from '@/hooks/useKpiAssignments'
import { useKpiData, KPI_MAX, type StudentKpi } from '@/hooks/useConsultantKpis'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { CONSULTANTS } from '@/lib/consultants'
import { kpiDotColor } from '@/lib/kpi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ['marketing', 'sales', 'service', 'attendance'] as const
type Category = (typeof ALL_CATEGORIES)[number]

const CATEGORY_CONFIG: Record<Category, {
  labelKey: string
  icon: typeof TrendingUp
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
  service: {
    labelKey: 'kpiTarget.serviceGoals',
    icon: Target,
    iconColor: 'text-orange-600',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-100',
    metrics: SERVICE_METRICS,
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
  if (!assignment || assignment.excluded || assignment.categories.length === 0) return []

  const result: { category: Category; key: string; labelKey: string }[] = []
  for (const cat of ALL_CATEGORIES) {
    if (!assignment.categories.includes(cat)) continue
    const config = CATEGORY_CONFIG[cat]
    for (const m of config.metrics) {
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
  label, target, actual, unit, onEdit, isInverse,
}: {
  label: string; target: number; actual: number; unit?: string; onEdit: () => void; isInverse?: boolean
}) {
  const pct = isInverse
    ? (target > 0 ? Math.max(0, Math.round(((target - actual) / target) * 100)) : 100)
    : progressPercent(actual, target)
  const achieved = isInverse ? actual <= target : pct >= 100

  return (
    <div className="p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow cursor-pointer group" onClick={onEdit}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Pencil className="h-3 w-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className={`text-2xl font-bold ${achieved ? 'text-green-600' : 'text-gray-900'}`}>{actual}{unit}</span>
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
// Service KPI Tab (moved from ConsultantKpiPage)
// ---------------------------------------------------------------------------

const ATTENTION_THRESHOLD = 7

type Tier = 'green' | 'yellow' | 'red' | 'black' | 'none'
function tierOf(score: number | undefined): Tier {
  if (score === undefined) return 'none'
  if (score >= 9) return 'green'
  if (score >= 7) return 'yellow'
  if (score >= 5) return 'red'
  return 'black'
}

function TierChip({ color, count }: { color: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block size-2 rounded-full ${color}`} />
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

function StudentMetricRow({
  studentId, sk, label, max, metricKey,
}: {
  studentId: string; sk: StudentKpi | undefined; label: string; max: number
  metricKey: keyof Pick<StudentKpi, 'meetingsScore' | 'prepScore' | 'summaryScore' | 'reportsScore' | 'followupScore'>
}) {
  const value = sk?.[metricKey]
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))
  const isMissing = value !== undefined && value < max * 0.7
  return (
    <Link
      to={`/service/student-360?student=${studentId}`}
      className="flex items-center gap-2 text-xs hover:bg-background/70 rounded px-1 py-0.5 -mx-1 transition-colors"
    >
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground/70">/ {max}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full ${isMissing ? 'bg-red-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums text-foreground">{value !== undefined ? value.toFixed(1) : '—'}</span>
      <ExternalLink className="size-3 text-muted-foreground shrink-0" />
    </Link>
  )
}

function ServiceKpiTab({ t }: { t: (key: string) => string }) {
  const { data: kpiData, isLoading } = useKpiData()
  const { data: students = [] } = useServiceStudents()
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const studentsByConsultant = useMemo(() => {
    const map: Record<string, typeof students> = {}
    students.forEach(s => {
      if (!s.assignedConsultant) return
      if (!map[s.assignedConsultant]) map[s.assignedConsultant] = []
      map[s.assignedConsultant].push(s)
    })
    Object.keys(map).forEach(c => {
      map[c].sort((a, b) => {
        const sa = kpiData?.byStudent[a.id]?.score ?? -1
        const sb = kpiData?.byStudent[b.id]?.score ?? -1
        return sa - sb
      })
    })
    return map
  }, [students, kpiData])

  const overallAttentionCount = students.filter(
    s => (kpiData?.byStudent[s.id]?.score ?? 0) < ATTENTION_THRESHOLD,
  ).length

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-4 text-sm">
            <div>
              {t('kpi.totalStudents')}: <strong>{students.length}</strong>
            </div>
            <div className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="size-4" />
              {t('kpi.needsAttention')}: <strong>{overallAttentionCount}</strong>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={attentionOnly} onCheckedChange={setAttentionOnly} />
            {t('kpi.attentionOnly')}
          </label>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      <div className="space-y-3">
        {CONSULTANTS.map(c => {
          const roster = studentsByConsultant[c.id] || []
          const filteredRoster = attentionOnly
            ? roster.filter(s => (kpiData?.byStudent[s.id]?.score ?? 0) < ATTENTION_THRESHOLD)
            : roster
          const ck = kpiData?.byConsultant[c.id]
          const dist: Record<Tier, number> = { green: 0, yellow: 0, red: 0, black: 0, none: 0 }
          roster.forEach(s => { dist[tierOf(kpiData?.byStudent[s.id]?.score)] += 1 })
          if (attentionOnly && filteredRoster.length === 0) return null

          return (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                  <span className={`inline-block size-3 rounded-full ${kpiDotColor(ck?.score)}`} />
                  <span>{c.name}</span>
                  <span className="text-muted-foreground font-normal text-sm">{roster.length}{t('kpi.studentsSuffix')}</span>
                  <Badge variant="outline" className="ml-auto">
                    {ck?.score !== undefined ? `${ck.score.toFixed(1)} / ${KPI_MAX}` : `— / ${KPI_MAX}`}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <TierChip color="bg-emerald-500" count={dist.green} />
                  <TierChip color="bg-yellow-400" count={dist.yellow} />
                  <TierChip color="bg-red-500" count={dist.red} />
                  <TierChip color="bg-black" count={dist.black} />
                  {dist.none > 0 && <TierChip color="bg-gray-300" count={dist.none} />}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {filteredRoster.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">{t('kpi.noStudentsAssigned')}</p>
                )}
                {filteredRoster.map(s => {
                  const sk = kpiData?.byStudent[s.id]
                  const isOpen = expanded.has(s.id)
                  return (
                    <div key={s.id} className="rounded-md border">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => toggleExpand(s.id)}>
                          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </Button>
                        <span className={`inline-block size-2 rounded-full shrink-0 ${kpiDotColor(sk?.score)}`} />
                        <Link
                          to={`/service/student-360?student=${s.id}`}
                          className="flex-1 min-w-0 text-sm font-medium hover:underline truncate"
                        >
                          {s.name}{s.koreanName ? ` · ${s.koreanName}` : ''}
                        </Link>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {sk ? `${sk.score.toFixed(1)} / ${KPI_MAX}` : '—'}
                        </span>
                      </div>
                      {isOpen && (
                        <div className="border-t bg-muted/30 px-3 py-3 space-y-1">
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.meetings')} max={4} metricKey="meetingsScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.prep')} max={1} metricKey="prepScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.summary')} max={2} metricKey="summaryScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.reports')} max={2} metricKey="reportsScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.followup')} max={2} metricKey="followupScore" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assignment Settings Dialog
// ---------------------------------------------------------------------------

function AssignmentDialog({
  open, onOpenChange, profiles, currentAssignments, onSave, isPending, t,
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

  const isMetricEnabled = (profileId: string, metricKey: string, category: Category): boolean => {
    const a = getAssignment(profileId)
    if (!a.categories.includes(category)) return false
    if (a.metrics.length === 0) return true
    return a.metrics.includes(metricKey)
  }

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
                          isExcluded ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'
                        }`}
                        onClick={() => toggleExcluded(profile.id)}
                      >
                        {isExcluded ? <Check className="h-4 w-4" /> : <span className="text-xs">—</span>}
                      </button>
                    </TableCell>
                    <TableCell>
                      {!isExcluded && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}>
                          {t('kpiTarget.detail')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

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
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => applyToDepartment(expandedProfile)}>
                      {t('kpiTarget.applyToDept', { dept: profile.department })}
                    </Button>
                  )}
                </div>
                {ALL_CATEGORIES.map(cat => {
                  if (!a.categories.includes(cat)) return null
                  const config = CATEGORY_CONFIG[cat]
                  return (
                    <div key={cat}>
                      <div className={`text-xs font-semibold mb-1.5 ${config.textColor}`}>{t(config.labelKey)}</div>
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
          <Button onClick={() => onSave(local)} disabled={isPending}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Target-based KPI Content (for marketing, sales, attendance tabs)
// ---------------------------------------------------------------------------

function TargetKpiContent({
  category, targetMap, assignments, activeProfiles, selectedProfile, t, openEdit,
}: {
  category: Category
  targetMap: Map<string, KpiTarget>
  assignments: KpiAssignmentMap
  activeProfiles: { id: string; name: string; department?: string }[]
  selectedProfile: string
  t: (key: string) => string
  openEdit: (profileId: string, category: KpiTarget['category'], metricKey: string) => void
}) {
  // Filter to profiles that have this category assigned
  const relevantProfiles = useMemo(() => {
    let filtered = activeProfiles.filter(p => {
      const a = assignments[p.id]
      if (!a || a.excluded) return false
      return a.categories.includes(category)
    })
    if (selectedProfile !== 'all') {
      filtered = filtered.filter(p => p.id === selectedProfile)
    }
    return filtered
  }, [activeProfiles, assignments, category, selectedProfile])

  if (relevantProfiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('kpiTarget.noMetricsAssigned')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {relevantProfiles.map(profile => {
        const effectiveMetrics = getEffectiveMetrics(profile.id, assignments)
        const metricsForCat = effectiveMetrics.filter(m => m.category === category)
        if (metricsForCat.length === 0) return null

        const cols = metricsForCat.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
          metricsForCat.length === 3 ? 'grid-cols-1 sm:grid-cols-3' :
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

        return (
          <Card key={profile.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                  {profile.name.charAt(0)}
                </div>
                {profile.name}
                {profile.department && (
                  <Badge variant="outline" className="text-[10px] h-4">{profile.department}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid ${cols} gap-2`}>
                {metricsForCat.map(metric => {
                  const data = targetMap.get(`${profile.id}:${metric.key}`)
                  const isRate = metric.key.includes('rate')
                  const isInverse = metric.key === 'late_count'
                  return (
                    <MetricCard
                      key={metric.key}
                      label={t(metric.labelKey)}
                      target={data?.targetValue || 0}
                      actual={data?.actualValue || 0}
                      unit={isInverse ? t('kpiTarget.unitTimes') : isRate ? '%' : undefined}
                      onEdit={() => openEdit(profile.id, category, metric.key)}
                      isInverse={isInverse}
                    />
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// All departments overview (per employee, all assigned categories)
// ---------------------------------------------------------------------------

function AllKpiContent({
  targetMap, assignments, activeProfiles, selectedProfile, t, openEdit,
}: {
  targetMap: Map<string, KpiTarget>
  assignments: KpiAssignmentMap
  activeProfiles: { id: string; name: string; department?: string }[]
  selectedProfile: string
  t: (key: string) => string
  openEdit: (profileId: string, category: KpiTarget['category'], metricKey: string) => void
}) {
  const displayProfiles = useMemo(() => {
    let filtered = activeProfiles.filter(p => {
      const a = assignments[p.id]
      return a && !a.excluded && a.categories.length > 0
    })
    if (selectedProfile !== 'all') {
      filtered = filtered.filter(p => p.id === selectedProfile)
    }
    return filtered
  }, [activeProfiles, assignments, selectedProfile])

  if (displayProfiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('kpiTarget.noMetricsAssigned')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {displayProfiles.map(profile => {
        const effectiveMetrics = getEffectiveMetrics(profile.id, assignments)
        if (effectiveMetrics.length === 0) return null

        // Group by category
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
                  <Badge variant="outline" className="text-[10px] h-4">{profile.department}</Badge>
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
                        const data = targetMap.get(`${profile.id}:${metric.key}`)
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
      })}
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
  const { data: assignments = {} } = useKpiAssignments()
  const updateAssignments = useUpdateKpiAssignments()

  const [selectedProfile, setSelectedProfile] = useState<string>('all')
  const [tab, setTab] = useState('all')
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

  const targetMap = useMemo(() => {
    const map = new Map<string, KpiTarget>()
    for (const t of targets) map.set(`${t.profileId}:${t.metricKey}`, t)
    return map
  }, [targets])

  const openEdit = (profileId: string, category: KpiTarget['category'], metricKey: string) => {
    const existing = targetMap.get(`${profileId}:${metricKey}`)
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

  const profileName = useCallback(
    (id: string) => profiles.find(p => p.id === id)?.name || '?',
    [profiles],
  )

  const assignedCount = useMemo(
    () => activeProfiles.filter(p => {
      const a = assignments[p.id]
      return a && a.categories.length > 0 && !a.excluded
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAssignOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" />
          {t('kpiTarget.assignSettings')}
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">
            {assignedCount}/{activeProfiles.length}
          </Badge>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => v && setTab(v)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="all">
              {t('kpiTarget.tabAll')}
            </TabsTrigger>
            <TabsTrigger value="marketing">
              <Megaphone className="h-3.5 w-3.5 mr-1" />
              {t('kpiTarget.tabMarketing')}
            </TabsTrigger>
            <TabsTrigger value="sales">
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              {t('kpiTarget.tabSales')}
            </TabsTrigger>
            <TabsTrigger value="service">
              <Target className="h-3.5 w-3.5 mr-1" />
              {t('kpiTarget.tabService')}
            </TabsTrigger>
            <TabsTrigger value="attendance">
              <Clock className="h-3.5 w-3.5 mr-1" />
              {t('kpiTarget.tabAttendance')}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[100px] text-center">
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

              <Select value={selectedProfile} onValueChange={v => v && setSelectedProfile(v)}>
                <SelectTrigger className="w-[140px] h-8 text-sm">
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
        </div>

        {/* Tab Contents */}
        <TabsContent value="all">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <AllKpiContent
              targetMap={targetMap}
              assignments={assignments}
              activeProfiles={activeProfiles}
              selectedProfile={selectedProfile}
              t={t}
              openEdit={openEdit}
            />
          )}
        </TabsContent>

        <TabsContent value="marketing">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <TargetKpiContent
              category="marketing"
              targetMap={targetMap}
              assignments={assignments}
              activeProfiles={activeProfiles}
              selectedProfile={selectedProfile}
              t={t}
              openEdit={openEdit}
            />
          )}
        </TabsContent>

        <TabsContent value="sales">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <TargetKpiContent
              category="sales"
              targetMap={targetMap}
              assignments={assignments}
              activeProfiles={activeProfiles}
              selectedProfile={selectedProfile}
              t={t}
              openEdit={openEdit}
            />
          )}
        </TabsContent>

        <TabsContent value="service">
          <div className="space-y-6">
            {!isLoading && (
              <TargetKpiContent
                category="service"
                targetMap={targetMap}
                assignments={assignments}
                activeProfiles={activeProfiles}
                selectedProfile={selectedProfile}
                t={t}
                openEdit={openEdit}
              />
            )}
            <ServiceKpiTab t={t} />
          </div>
        </TabsContent>

        <TabsContent value="attendance">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <TargetKpiContent
              category="attendance"
              targetMap={targetMap}
              assignments={assignments}
              activeProfiles={activeProfiles}
              selectedProfile={selectedProfile}
              t={t}
              openEdit={openEdit}
            />
          )}
        </TabsContent>
      </Tabs>

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
                  [...MARKETING_METRICS, ...SALES_METRICS, ...SERVICE_METRICS, ...ATTENDANCE_METRICS].find(
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
            <Button onClick={handleSave} disabled={upsertMut.isPending}>{t('common.save')}</Button>
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
