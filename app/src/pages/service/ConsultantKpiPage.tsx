import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useConsultantPool } from '@/lib/consultants'
import { kpiDotColor } from '@/lib/kpi'
import { useKpiData, KPI_MAX, type StudentKpi } from '@/hooks/useConsultantKpis'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import type { ServiceStudent } from '@/types'

const ATTENTION_THRESHOLD = 7  // score below this = red/black = needs attention

type Tier = 'green' | 'yellow' | 'red' | 'black' | 'none'
function tierOf(score: number | undefined): Tier {
  if (score === undefined) return 'none'
  if (score >= 9) return 'green'
  if (score >= 7) return 'yellow'
  if (score >= 5) return 'red'
  return 'black'
}

export function ConsultantKpiPage() {
  const t = useT()
  const consultantPool = useConsultantPool()
  const { data: kpiData, isLoading } = useKpiData()
  const { data: students = [] } = useServiceStudents()
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const studentsByConsultant = useMemo(() => {
    const map: Record<string, ServiceStudent[]> = {}
    students.forEach(s => {
      if (!s.assignedConsultant) return
      if (!map[s.assignedConsultant]) map[s.assignedConsultant] = []
      map[s.assignedConsultant].push(s)
    })
    // Sort each consultant's roster: lowest score first → high-risk surfaces
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
    <div className="p-3 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('nav.kpi')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('kpi.note')}</p>
      </div>

      {/* ── Overview / attention filter ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-4 text-sm">
            <div>
              {t('kpi.totalStudents')}:{' '}
              <strong className="text-foreground">{students.length}</strong>
            </div>
            <div className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="size-4" />
              {t('kpi.needsAttention')}:{' '}
              <strong>{overallAttentionCount}</strong>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={attentionOnly} onCheckedChange={setAttentionOnly} />
            {t('kpi.attentionOnly')}
          </label>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {/* ── Per-consultant cards ── */}
      <div className="space-y-3">
        {consultantPool.map(c => {
          const roster = studentsByConsultant[c.id] || []
          const filteredRoster = attentionOnly
            ? roster.filter(s => (kpiData?.byStudent[s.id]?.score ?? 0) < ATTENTION_THRESHOLD)
            : roster
          const ck = kpiData?.byConsultant[c.id]

          // Tier distribution across all assigned (not filtered)
          const dist: Record<Tier, number> = { green: 0, yellow: 0, red: 0, black: 0, none: 0 }
          roster.forEach(s => { dist[tierOf(kpiData?.byStudent[s.id]?.score)] += 1 })

          if (attentionOnly && filteredRoster.length === 0) return null

          return (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                  <span className={`inline-block size-3 rounded-full ${kpiDotColor(ck?.score)}`} />
                  <span>{c.name}</span>
                  <span className="text-muted-foreground font-normal text-sm">
                    {roster.length}{t('kpi.studentsSuffix')}
                  </span>
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
                        <Button
                          size="sm" variant="ghost"
                          className="size-7 p-0"
                          onClick={() => toggleExpand(s.id)}
                          aria-label={isOpen ? t('student360.collapse') : t('student360.expand')}
                        >
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
                          <p className="text-[11px] text-muted-foreground mb-2">{t('kpi.clickRowToOpen')}</p>
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.meetings')}  max={4} metricKey="meetingsScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.prep')}      max={1} metricKey="prepScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.summary')}   max={2} metricKey="summaryScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.reports')}   max={2} metricKey="reportsScore" />
                          <StudentMetricRow studentId={s.id} sk={sk} label={t('kpi.row.followup')}  max={2} metricKey="followupScore" />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('kpi.metricsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>{t('kpi.metricsIntro')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('kpi.metric1')}</li>
            <li>{t('kpi.metric2')}</li>
            <li>{t('kpi.metric3')}</li>
            <li>{t('kpi.metric4')}</li>
            <li>{t('kpi.metric5')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
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
  studentId: string
  sk: StudentKpi | undefined
  label: string
  max: number
  metricKey: keyof Pick<StudentKpi, 'meetingsScore' | 'prepScore' | 'summaryScore' | 'reportsScore' | 'followupScore'>
}) {
  const value = sk?.[metricKey]
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))
  const isMissing = value !== undefined && value < max * 0.7  // missing if <70% of max for this metric
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
      <span className="w-10 text-right tabular-nums text-foreground">
        {value !== undefined ? value.toFixed(1) : '—'}
      </span>
      <ExternalLink className="size-3 text-muted-foreground shrink-0" />
    </Link>
  )
}
