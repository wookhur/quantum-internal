import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, GraduationCap, CalendarDays, FileText, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import { usePortalData } from '@/hooks/usePortalTokens'
import { useT } from '@/i18n/LanguageContext'

// Consultant name lookup (matches Student360Page)
const CONSULTANTS: Record<string, string> = {
  sangbum: '한상범',
  jihyun: '김지현',
  eunyoung: '양은영',
  yeonse: '남연서',
  danny: 'Danny',
  liz: '유리즈',
}

const REPORT_BADGE_STYLE: Record<string, string> = {
  none: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  submitted: 'bg-emerald-100 text-emerald-700',
}

const REPORT_BADGE_KEY: Record<string, string> = {
  none: 'studentPortal.reportNone',
  pending: 'studentPortal.reportPending',
  submitted: 'studentPortal.reportSubmitted',
}

/** Safely extract string from unknown Supabase row value */
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function StudentPortalPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = usePortalData(token)
  const t = useT()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    const msg = (error as Error).message
    const isInvalid = msg === 'INVALID_TOKEN'
    const isExpired = msg === 'TOKEN_EXPIRED'
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="size-12 mx-auto mb-4 text-amber-500" />
            <h2 className="text-lg font-bold mb-2">
              {isExpired ? t('studentPortal.linkExpired') : isInvalid ? t('studentPortal.invalidLink') : t('studentPortal.errorOccurred')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isExpired
                ? t('studentPortal.linkExpiredDesc')
                : isInvalid
                  ? t('studentPortal.invalidLinkDesc')
                  : t('studentPortal.errorDesc')}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const s = data.student
  const studentName = str(s.name)
  const koreanName = str(s.korean_name)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Quantum Admissions" className="h-7 w-auto" />
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Student Portal
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            {t('studentPortal.secureLink')}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Student Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-5 text-blue-500" />
              {studentName}
              {koreanName && <span className="text-muted-foreground font-normal">· {koreanName}</span>}
              {str(s.status) && <Badge variant="outline">{str(s.status)}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <PortalField label={t('studentPortal.school')} value={str(s.school)} />
              <PortalField label={t('studentPortal.grade')} value={str(s.grade)} />
              <PortalField label={t('studentPortal.consultant')} value={CONSULTANTS[str(s.assigned_consultant)] || str(s.assigned_consultant)} />
              <PortalField label={t('studentPortal.essayEditor')} value={str(s.essay_editor)} />
              <PortalField label={t('studentPortal.partner')} value={str(s.partners)} />
              <PortalField label={t('studentPortal.major')} value={str(s.majors)} />
              <PortalField label={t('studentPortal.startDate')} value={str(s.start_date)} />
              {str(s.accepted_uni) && <PortalField label={t('studentPortal.acceptedUni')} value={str(s.accepted_uni)} />}
            </div>
          </CardContent>
        </Card>

        {/* Meetings & Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-5 text-blue-500" />
              {t('studentPortal.meetingsReports')}
              <span className="text-muted-foreground font-normal">({data.meetings.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.meetings.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('studentPortal.noMeetings')}</p>
            )}
            {data.meetings.map((m) => {
              const status = str(m.report_status) || 'none'
              const badgeStyle = REPORT_BADGE_STYLE[status] || REPORT_BADGE_STYLE.none
              const badgeKey = REPORT_BADGE_KEY[status] || REPORT_BADGE_KEY.none
              return (
                <div key={str(m.id)} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="font-mono">{str(m.meeting_date) || '—'}</span>
                      {str(m.meeting_type) && <Badge variant="outline">{str(m.meeting_type)}</Badge>}
                      <span className="text-muted-foreground font-normal">
                        {CONSULTANTS[str(m.consultant_id)] || str(m.consultant_id)}
                      </span>
                    </div>
                    <Badge className={badgeStyle}>
                      <FileText className="size-3 mr-1" />
                      {t(badgeKey)}
                    </Badge>
                  </div>
                  {str(m.summary) && (
                    <p className="text-sm mt-2 whitespace-pre-wrap text-gray-700">{str(m.summary)}</p>
                  )}
                  {str(m.report_url) && (
                    <a
                      href={str(m.report_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline mt-2 inline-block"
                    >
                      {t('studentPortal.viewReport')}{str(m.report_date) ? ` · ${str(m.report_date)}` : ''}
                    </a>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Quantum Admissions. All rights reserved.</p>
          <p className="mt-1">{t('studentPortal.securePageNote')}</p>
        </div>
      </main>
    </div>
  )
}

function PortalField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p>{value}</p>
    </div>
  )
}
