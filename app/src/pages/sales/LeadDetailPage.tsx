import { useParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, Phone, Mail, MapPin, School, GraduationCap, Calendar, MessageSquare, Edit, Clock, CheckCircle2, Video, CalendarPlus, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { useLead, useLeadActivities, useCreateActivity } from '@/hooks/useLeads'
import { useConsultationCalendarSync } from '@/hooks/useGoogleCalendar'
import type { CalendarSyncStatus } from '@/hooks/useGoogleCalendar'
import { getStageConfig } from '@/types'
import type { LeadActivity } from '@/types'
import { useState } from 'react'
import ConsultationBookingDialog from '@/components/ConsultationBookingDialog'

export function LeadDetailPage() {
  const { id } = useParams()
  const { data: lead, isLoading, error } = useLead(id || '')
  const { data: activities } = useLeadActivities(id || '')
  const { data: syncStatus } = useConsultationCalendarSync(activities)
  const createActivity = useCreateActivity()
  const [noteText, setNoteText] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> 리드 목록
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          리드를 찾을 수 없습니다.
        </div>
      </div>
    )
  }

  const stage = getStageConfig(lead.pipelineStage)

  const handleAddNote = () => {
    if (!noteText.trim() || !id) return
    createActivity.mutate({
      leadId: id,
      activityType: 'note',
      title: '메모 추가',
      content: noteText,
    }, {
      onSuccess: () => setNoteText(''),
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> 리드 목록
        </Link>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5 bg-[#0073EA] hover:bg-[#0060C2]" onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="size-3.5" /> 상담 예약
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Edit className="size-3.5" /> 수정
          </Button>
        </div>
      </div>

      {/* Header Card */}
      <div className="monday-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold">{lead.studentName || lead.parentName}</h1>
              <span className={`status-pill status-pill--${stage.color.replace('stage-', '')}`}>{stage.label}</span>
            </div>
            {lead.studentName && (
              <p className="text-sm text-muted-foreground">{lead.parentName} (학부모)</p>
            )}
          </div>
          {lead.requiredAction && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              {lead.requiredAction}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" />
            <span>{lead.phone}</span>
          </div>
          {lead.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span>{lead.email}</span>
            </div>
          )}
          {lead.currentSchool && (
            <div className="flex items-center gap-2 text-sm">
              <School className="size-4 text-muted-foreground" />
              <span>{lead.currentSchool}</span>
            </div>
          )}
          {lead.grade && (
            <div className="flex items-center gap-2 text-sm">
              <GraduationCap className="size-4 text-muted-foreground" />
              <span>{lead.grade}</span>
            </div>
          )}
          {lead.region && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 text-muted-foreground" />
              <span>{lead.region}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span>유입: {lead.leadDate}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span>{lead.sourceChannel}</span>
          </div>
        </div>
      </div>

      {/* Memo */}
      {lead.memo && (
        <div className="monday-card p-6">
          <h3 className="text-sm font-semibold mb-2">메모</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{lead.memo}</p>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="monday-card p-6">
        <h3 className="text-sm font-semibold mb-4">활동 기록</h3>

        {/* Add note */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="메모를 입력하세요..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddNote()}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0073EA]/20 focus:border-[#0073EA]"
          />
          <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim()}>추가</Button>
        </div>

        {/* Activity list */}
        <div className="space-y-3">
          {activities && activities.length > 0 ? (
            activities.map((a: LeadActivity) => (
              <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className="mt-0.5">
                  {a.activityType === 'consultation' ? (
                    <Video className="size-4 text-green-500" />
                  ) : a.activityType === 'stage_change' ? (
                    <CheckCircle2 className="size-4 text-blue-500" />
                  ) : (
                    <Clock className="size-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.activityType === 'consultation' && syncStatus?.[a.id] && (
                      <SyncBadge status={syncStatus[a.id].status} />
                    )}
                  </div>
                  {a.content && <p className="text-xs text-muted-foreground mt-0.5">{a.content}</p>}
                  {a.activityType === 'consultation' && syncStatus?.[a.id]?.status === 'time_changed' && syncStatus[a.id].updatedStart && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <RefreshCw className="size-3" />
                      변경된 시간: {new Date(syncStatus[a.id].updatedStart!).toLocaleString('ko-KR')}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(a.createdAt).toLocaleString('ko-KR')}
                    {a.createdByUser && ` · ${a.createdByUser.name}`}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">활동 기록이 없습니다.</p>
          )}
        </div>
      </div>

      {/* Consultation Booking Dialog */}
      <ConsultationBookingDialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        lead={{
          id: lead.id,
          parentName: lead.parentName,
          studentName: lead.studentName,
          email: lead.email,
          phone: lead.phone,
          grade: lead.grade,
          currentSchool: lead.currentSchool,
        }}
        onBooked={() => {
          setBookingOpen(false)
        }}
      />
    </div>
  )
}

// ─── Sync Badge ─────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: CalendarSyncStatus }) {
  switch (status) {
    case 'synced':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600">
          <CheckCircle2 className="size-3" />
          동기화됨
        </span>
      )
    case 'time_changed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
          <AlertTriangle className="size-3" />
          시간 변경됨
        </span>
      )
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
          <XCircle className="size-3" />
          캘린더 삭제됨
        </span>
      )
    case 'no_event_id':
    case 'error':
    case 'loading':
    default:
      return null
  }
}
