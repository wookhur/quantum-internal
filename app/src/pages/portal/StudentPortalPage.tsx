import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, GraduationCap, CalendarDays, FileText, NotebookPen, ShieldCheck, AlertTriangle,
} from 'lucide-react'
import { usePortalData } from '@/hooks/usePortalTokens'

// Consultant name lookup (matches Student360Page)
const CONSULTANTS: Record<string, string> = {
  sangbum: '한상범',
  jihyun: '김지현',
  eunyoung: '양은영',
  yeonse: '남연서',
  danny: 'Danny',
  liz: '유리즈',
}

const REPORT_BADGE: Record<string, { label: string; className: string }> = {
  none: { label: '리포트 없음', className: 'bg-gray-100 text-gray-600' },
  pending: { label: '리포트 대기', className: 'bg-amber-100 text-amber-700' },
  submitted: { label: '리포트 제출', className: 'bg-emerald-100 text-emerald-700' },
}

const DIARY_FIELDS = [
  { key: 'agenda_items', label: 'Agenda Items' },
  { key: 'meeting_summary', label: 'Meeting Summary' },
  { key: 'extracurricular_notes', label: 'Extracurricular Development Notes' },
  { key: 'identity_narrative_notes', label: 'Identity & Narrative Development Notes' },
  { key: 'questions_concerns', label: 'Questions & Concerns' },
  { key: 'next_meeting_agenda', label: 'Next Meeting Agenda' },
  { key: 'follow_up_commitments', label: 'Follow-Up Commitments' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'critical_dates', label: 'Critical Dates' },
]

export function StudentPortalPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = usePortalData(token)

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
              {isExpired ? '링크가 만료되었습니다' : isInvalid ? '유효하지 않은 링크입니다' : '오류가 발생했습니다'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isExpired
                ? '이 포털 링크의 유효기간이 지났습니다. 담당 컨설턴트에게 새 링크를 요청해주세요.'
                : isInvalid
                  ? '이 링크는 존재하지 않거나 비활성화되었습니다. 담당 컨설턴트에게 문의해주세요.'
                  : '데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const s = data.student
  const studentName = (s.name as string) || ''
  const koreanName = (s.korean_name as string) || ''

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
            보안 링크
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
              {s.status && <Badge variant="outline">{s.status as string}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <PortalField label="학교" value={s.school as string} />
              <PortalField label="학년" value={s.grade as string} />
              <PortalField label="담당 컨설턴트" value={CONSULTANTS[(s.assigned_consultant as string) || ''] || (s.assigned_consultant as string)} />
              <PortalField label="에세이 에디터" value={s.essay_editor as string} />
              <PortalField label="파트너" value={s.partners as string} />
              <PortalField label="전공" value={s.majors as string} />
              <PortalField label="계약 유형" value={s.contract_type as string} />
              <PortalField label="시작일" value={s.start_date as string} />
              <PortalField label="종료일" value={s.end_date as string} />
              {s.accepted_uni && <PortalField label="합격 대학" value={s.accepted_uni as string} />}
            </div>
          </CardContent>
        </Card>

        {/* Meetings & Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-5 text-blue-500" />
              미팅 · 리포트
              <span className="text-muted-foreground font-normal">({data.meetings.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.meetings.length === 0 && (
              <p className="text-sm text-muted-foreground">미팅 기록이 없습니다.</p>
            )}
            {data.meetings.map((m) => {
              const status = (m.report_status as string) || 'none'
              const reportMeta = REPORT_BADGE[status] || REPORT_BADGE.none
              return (
                <div key={m.id as string} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="font-mono">{(m.meeting_date as string) || '—'}</span>
                      {m.meeting_type && <Badge variant="outline">{m.meeting_type as string}</Badge>}
                      <span className="text-muted-foreground font-normal">
                        {CONSULTANTS[(m.consultant_id as string) || ''] || (m.consultant_id as string) || ''}
                      </span>
                    </div>
                    <Badge className={reportMeta.className}>
                      <FileText className="size-3 mr-1" />
                      {reportMeta.label}
                    </Badge>
                  </div>
                  {m.summary && (
                    <p className="text-sm mt-2 whitespace-pre-wrap text-gray-700">{m.summary as string}</p>
                  )}
                  {m.report_url && (
                    <a
                      href={m.report_url as string}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline mt-2 inline-block"
                    >
                      리포트 보기{m.report_date ? ` · ${m.report_date}` : ''}
                    </a>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Diary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <NotebookPen className="size-5 text-blue-500" />
              미팅 다이어리
              <span className="text-muted-foreground font-normal">({data.diary.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.diary.length === 0 && (
              <p className="text-sm text-muted-foreground">다이어리 기록이 없습니다.</p>
            )}
            {data.diary.map((d) => (
              <div key={d.id as string} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <span className="font-mono">{(d.entry_date as string) || '—'}</span>
                  {d.author_id && (
                    <span className="text-muted-foreground font-normal">{d.author_id as string}</span>
                  )}
                </div>
                <div className="space-y-3">
                  {DIARY_FIELDS.map((f) => {
                    const val = d[f.key] as string | undefined
                    if (!val) return null
                    return (
                      <div key={f.key}>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">{f.label}</p>
                        <p className="text-sm whitespace-pre-wrap">{val}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Quantum Admissions. All rights reserved.</p>
          <p className="mt-1">이 페이지는 보안 링크를 통해서만 접근 가능합니다.</p>
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
