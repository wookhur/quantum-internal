import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n/LanguageContext'
import { CONSULTANTS } from '@/lib/consultants'
import { kpiDotColor } from '@/lib/kpi'
import { useConsultantKpis } from '@/hooks/useConsultantKpis'

export function ConsultantKpiPage() {
  const t = useT()
  const { data: kpis = {}, isLoading } = useConsultantKpis()

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('nav.kpi')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('kpi.note')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('kpi.byConsultant')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CONSULTANTS.map(c => {
              const k = kpis[c.id]
              const score = k?.score
              return (
                <div key={c.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block size-3 rounded-full ${kpiDotColor(score)}`} />
                      <span className="font-medium">{c.name}</span>
                    </div>
                    <Badge variant="outline">
                      {score !== undefined ? `${score.toFixed(1)} / 10` : '— / 10'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                    <div>
                      {t('kpi.assignedStudents')}:{' '}
                      <strong className="text-foreground">{k?.assigned ?? 0}</strong>
                    </div>
                    <div>
                      {t('kpi.meetings30d')}:{' '}
                      <strong className="text-foreground">{k?.meetings30d ?? 0}</strong> / {k?.expected ?? 0}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t space-y-1 text-xs">
                    <MetricRow label={t('kpi.row.followup')} weight="3" score={k?.followupScore} />
                    <MetricRow label={t('kpi.row.meetings')} weight="2" score={k?.meetingsScore} />
                    <MetricRow label={t('kpi.row.prepSummary')} weight="2" score={k?.prepSummaryScore} />
                    <MetricRow label={t('kpi.row.reports')} weight="2" score={k?.reportsScore} />
                    <MetricRow label={t('kpi.row.diary')} weight="1" score={k?.diaryScore} />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

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

function MetricRow({ label, weight, score }: { label: string; weight: string; score?: number }) {
  const pct = Math.max(0, Math.min(100, ((score ?? 0) / 10) * 100))
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="w-32 shrink-0">{label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground/70">×{weight}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums text-foreground">
        {score !== undefined ? score.toFixed(1) : '—'}
      </span>
    </div>
  )
}
