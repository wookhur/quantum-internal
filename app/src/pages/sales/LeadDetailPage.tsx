import { useParams, Link, useLocation } from 'react-router-dom'
import { useCanEdit } from '@/hooks/usePermissions'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowLeft, Loader2, Phone, Mail, MapPin, School, GraduationCap,
  Calendar, MessageSquare, Edit, Clock, CheckCircle2, Video, CalendarPlus,
  AlertTriangle, XCircle, RefreshCw, Pencil, Trash2, Save, X,
  FileText, Users, PhoneCall, Briefcase, User,
} from 'lucide-react'
import { useLead, useLeadActivities, useCreateActivity, useUpdateActivity, useDeleteActivity } from '@/hooks/useLeads'
import { useT } from '@/i18n/LanguageContext'
import { useConsultationCalendarSync } from '@/hooks/useGoogleCalendar'
import type { CalendarSyncStatus } from '@/hooks/useGoogleCalendar'
import { getStageConfig, formatCurrency } from '@/types'
import type { LeadActivity } from '@/types'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import ConsultationBookingDialog from '@/components/ConsultationBookingDialog'
import LeadEditDialog from '@/components/LeadEditDialog'
import { CreateContractFromLeadDialog } from '@/components/CreateContractFromLeadDialog'

// ─── Linked data hooks ────────────────────────────────────────────────────

function useLinkedContracts(leadId: string | undefined, studentName: string | undefined, parentName: string | undefined) {
  return useQuery({
    queryKey: ['linked-contracts', leadId, studentName, parentName],
    queryFn: async () => {
      // Search by lead_id FK first, then also by name match
      const conditions: string[] = []
      if (leadId) conditions.push(`lead_id.eq.${leadId}`)
      if (studentName) conditions.push(`student_name.ilike.%${studentName}%`)
      if (parentName) conditions.push(`contractor_name.ilike.%${parentName}%`)

      if (conditions.length === 0) return []

      const { data, error } = await supabase
        .from('contracts')
        .select('*, sales_profiles:profiles!contracts_sales_rep_fkey(id,name), service_profiles:profiles!contracts_service_rep_fkey(id,name)')
        .or(conditions.join(','))
        .order('contract_date', { ascending: false })

      if (error) throw error
      return (data || []) as (Record<string, unknown> & {
        sales_profiles: { id: string; name: string } | null
        service_profiles: { id: string; name: string } | null
      })[]
    },
    enabled: !!(leadId || studentName || parentName),
  })
}

function useLinkedMeetings(leadId: string | undefined, parentName: string | undefined) {
  return useQuery({
    queryKey: ['linked-meetings', leadId, parentName],
    queryFn: async () => {
      const conditions: string[] = []
      if (leadId) conditions.push(`lead_id.eq.${leadId}`)
      if (parentName) conditions.push(`parent_name.ilike.%${parentName}%`)

      if (conditions.length === 0) return []

      const { data, error } = await supabase
        .from('meetings')
        .select('*, profiles:profiles!meetings_created_by_fkey(id,name)')
        .or(conditions.join(','))
        .order('meeting_date', { ascending: false })

      if (error) throw error
      return (data || []) as (Record<string, unknown> & {
        profiles: { id: string; name: string } | null
      })[]
    },
    enabled: !!(leadId || parentName),
  })
}

// ─── Activity icon helper ─────────────────────────────────────────────────

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'consultation':
      return <Video className="size-4 text-green-500" />
    case 'stage_change':
      return <CheckCircle2 className="size-4 text-blue-500" />
    case 'call':
      return <PhoneCall className="size-4 text-orange-500" />
    case 'meeting':
      return <Users className="size-4 text-violet-500" />
    case 'katalk':
      return <MessageSquare className="size-4 text-yellow-600" />
    case 'email':
      return <Mail className="size-4 text-cyan-500" />
    case 'assignment_change':
      return <User className="size-4 text-indigo-500" />
    case 'system':
      return <Briefcase className="size-4 text-gray-400" />
    default:
      return <Clock className="size-4 text-gray-400" />
  }
}

// Activity type labels are now resolved via t() inside the component

// ─── Page ─────────────────────────────────────────────────────────────────

export function LeadDetailPage() {
  const t = useT()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canEdit = useCanEdit(useLocation().pathname)
  const { id } = useParams()
  const { data: lead, isLoading, error } = useLead(id || '')
  const { data: activities } = useLeadActivities(id || '')
  const { data: syncStatus } = useConsultationCalendarSync(activities)
  const { data: linkedContracts = [] } = useLinkedContracts(id, lead?.studentName, lead?.parentName)
  const { data: linkedMeetings = [] } = useLinkedMeetings(id, lead?.parentName)
  const createActivity = useCreateActivity()
  const updateActivity = useUpdateActivity()
  const deleteActivity = useDeleteActivity()
  const [noteText, setNoteText] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [contractDialogOpen, setContractDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const handleEditStart = (a: LeadActivity) => {
    if (!canEdit) return
    setEditingId(a.id)
    setEditTitle(a.title)
    setEditContent(a.content || '')
  }

  const handleEditSave = () => {
    if (!canEdit) return
    if (!editingId || !id) return
    updateActivity.mutate(
      { id: editingId, leadId: id, data: { title: editTitle, content: editContent || null } },
      { onSuccess: () => setEditingId(null) },
    )
  }

  const ACTIVITY_TYPE_LABELS: Record<string, string> = {
    note: t('common.memo'),
    call: t('leadDetail.call'),
    katalk: t('leadDetail.katalk'),
    email: t('common.email'),
    meeting: t('leadDetail.meetings'),
    consultation: t('leadDetail.consultations'),
    stage_change: t('leadDetail.stageChange'),
    assignment_change: t('leadDetail.assignmentChange'),
    system: t('leadDetail.system'),
  }

  const handleDelete = (activityId: string) => {
    if (!canEdit) return
    if (!id || !confirm(t('leadDetail.deleteActivityConfirm'))) return
    deleteActivity.mutate({ id: activityId, leadId: id })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t('leadDetail.leadList')}
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          {t('leadDetail.leadNotFound')}
        </div>
      </div>
    )
  }

  const stage = getStageConfig(lead.pipelineStage)

  const handleAddNote = () => {
    if (!canEdit) return
    if (!noteText.trim() || !id) return
    createActivity.mutate({
      leadId: id,
      activityType: 'note',
      title: t('leadDetail.addMemo'),
      content: noteText,
    }, {
      onSuccess: () => setNoteText(''),
    })
  }

  // ── Build unified journey timeline ─────────────────────────────────────
  // Merge activities + meetings + contract events into a single timeline
  type TimelineEvent = {
    id: string
    date: string
    category: 'activity' | 'meeting' | 'contract'
    icon: React.ReactNode
    badge: string
    badgeColor: string
    title: string
    description?: string
    person?: string
    raw?: LeadActivity
  }

  const timeline: TimelineEvent[] = []

  // Add activities
  if (activities) {
    for (const a of activities) {
      timeline.push({
        id: `act-${a.id}`,
        date: a.createdAt,
        category: 'activity',
        icon: <ActivityIcon type={a.activityType} />,
        badge: ACTIVITY_TYPE_LABELS[a.activityType] || a.activityType,
        badgeColor: a.activityType === 'call' ? 'bg-orange-100 text-orange-700'
          : a.activityType === 'consultation' ? 'bg-green-100 text-green-700'
          : a.activityType === 'stage_change' ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-600',
        title: a.title,
        description: a.content,
        person: a.createdByUser?.name,
        raw: a,
      })
    }
  }

  // Add meetings
  for (const m of linkedMeetings) {
    const profiles = m.profiles as { id: string; name: string } | null
    timeline.push({
      id: `mtg-${m.id}`,
      date: (m.meeting_date as string) || (m.created_at as string),
      category: 'meeting',
      icon: <Video className="size-4 text-green-500" />,
      badge: t('meetings.nthMeeting').replace('{n}', String(m.meeting_number || '')),
      badgeColor: 'bg-green-100 text-green-700',
      title: `${m.parent_name}${m.student_name ? ` / ${m.student_name}` : ''} ${t('leadDetail.meetings')}`,
      description: m.memo as string | undefined,
      person: profiles?.name,
    })
  }

  // Add contracts
  for (const c of linkedContracts) {
    const salesP = c.sales_profiles as { id: string; name: string } | null
    timeline.push({
      id: `con-${c.id}`,
      date: (c.contract_date as string) || (c.created_at as string),
      category: 'contract',
      icon: <FileText className="size-4 text-emerald-500" />,
      badge: t('leadDetail.contracts'),
      badgeColor: 'bg-emerald-100 text-emerald-700',
      title: `${t('leadDetail.contractSigned')} — ${c.student_name}`,
      description: `${formatCurrency(Number(c.total_amount) || 0, (c.currency as 'KRW' | 'USD') || 'KRW')} · ${c.school_name || ''}`,
      person: salesP?.name,
    })
  }

  // Sort by date descending
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // ── Customer Journey Summary ─────────────────────────────────────────
  const callCount = activities?.filter(a => a.activityType === 'call').length || 0
  const consultationCount = activities?.filter(a => a.activityType === 'consultation').length || 0
  const contractCount = linkedContracts.length
  const meetingCount = linkedMeetings.length

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t('leadDetail.leadList')}
        </Link>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setContractDialogOpen(true)}>
              <FileText className="size-3.5" /> {t('leadDetail.createContract')}
            </Button>
            <Button size="sm" className="gap-1.5 bg-[#0073EA] hover:bg-[#0060C2]" onClick={() => setBookingOpen(true)}>
              <CalendarPlus className="size-3.5" /> {t('leadDetail.bookConsultation')}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Edit className="size-3.5" /> {t('common.edit')}
            </Button>
          </div>
        )}
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
              <p className="text-sm text-muted-foreground">{lead.parentName} ({t('leadDetail.parent')})</p>
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
            <span>{t('leadDetail.leadDateLabel')}: {lead.leadDate}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span>{lead.sourceChannel}</span>
          </div>
          {lead.assignedUser && (
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span>{t('leadDetail.assignee')}: {lead.assignedUser.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Customer Journey Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={callCount > 0 ? 'border-orange-200 bg-orange-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-orange-50 p-2">
              <PhoneCall className="size-4 text-orange-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 font-medium">{t('leadDetail.coldCalls')}</p>
              <p className="text-lg font-bold text-gray-900">{callCount}{t('leadDetail.times')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={consultationCount > 0 ? 'border-green-200 bg-green-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-green-50 p-2">
              <Video className="size-4 text-green-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 font-medium">{t('leadDetail.consultations')}</p>
              <p className="text-lg font-bold text-gray-900">{consultationCount}{t('leadDetail.times')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={meetingCount > 0 ? 'border-violet-200 bg-violet-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-violet-50 p-2">
              <Users className="size-4 text-violet-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 font-medium">{t('leadDetail.meetings')}</p>
              <p className="text-lg font-bold text-gray-900">{meetingCount}{t('leadDetail.times')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={contractCount > 0 ? 'border-emerald-200 bg-emerald-50/30' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 p-2">
              <FileText className="size-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 font-medium">{t('leadDetail.contracts')}</p>
              <p className="text-lg font-bold text-gray-900">{contractCount}{t('common.count')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linked Contracts Detail */}
      {linkedContracts.length > 0 && (
        <div className="monday-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <FileText className="size-4 text-emerald-500" />
            {t('leadDetail.contractInfo')}
          </h3>
          <div className="space-y-3">
            {linkedContracts.map((c) => {
              const salesP = c.sales_profiles as { id: string; name: string } | null
              const serviceP = c.service_profiles as { id: string; name: string } | null
              const statusLabels: Record<string, { label: string; color: string }> = {
                active: { label: t('contracts.active'), color: 'bg-blue-100 text-blue-700' },
                expiring_soon: { label: t('contracts.expiringSoon'), color: 'bg-amber-100 text-amber-700' },
                expired: { label: t('contracts.expired'), color: 'bg-gray-100 text-gray-600' },
                cancelled: { label: t('contracts.cancelled'), color: 'bg-red-100 text-red-600' },
              }
              const st = statusLabels[(c.status as string)] || { label: c.status as string, color: 'bg-gray-100 text-gray-600' }

              return (
                <Link
                  key={c.id as string}
                  to={`/consulting/clients/${c.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{String(c.contractor_name)} / {String(c.student_name)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(c.total_amount) || 0, (c.currency as 'KRW' | 'USD') || 'KRW')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {c.school_name ? <span>{String(c.school_name)}</span> : null}
                    <span>{t('leadDetail.contractDate')}: {String(c.contract_date)}</span>
                    <span>{t('leadDetail.expiryDate')}: {String(c.expiry_date)}</span>
                    {salesP && <span>{t('leadDetail.salesRep')}: {salesP.name}</span>}
                    {serviceP && <span>{t('leadDetail.serviceRep')}: {serviceP.name}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Memo */}
      {lead.memo && (
        <div className="monday-card p-6">
          <h3 className="text-sm font-semibold mb-2">{t('common.memo')}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{lead.memo}</p>
        </div>
      )}

      {/* Unified Timeline */}
      <div className="monday-card p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Clock className="size-4 text-gray-500" />
          {t('leadDetail.journeyTimeline')}
        </h3>

        {/* Add note */}
        {canEdit && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder={t('leadDetail.memoPlaceholder')}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0073EA]/20 focus:border-[#0073EA]"
            />
            <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim()}>{t('common.add')}</Button>
          </div>
        )}

        {/* Timeline list */}
        <div className="relative">
          {/* Vertical line */}
          {timeline.length > 1 && (
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-gray-200" />
          )}

          <div className="space-y-0">
            {timeline.length > 0 ? (
              timeline.map((event) => {
                const isActivity = event.category === 'activity' && event.raw
                const a = event.raw

                return (
                  <div
                    key={event.id}
                    className="group relative flex items-start gap-3 py-3 pl-0"
                  >
                    {/* Icon dot */}
                    <div className="relative z-10 mt-0.5 shrink-0 rounded-full bg-white p-0.5">
                      {event.icon}
                    </div>

                    {/* Edit mode for activities */}
                    {isActivity && a && editingId === a.id ? (
                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="w-full px-2 py-1 text-sm font-medium border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0073EA]/20 focus:border-[#0073EA]"
                        />
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          placeholder={t('leadDetail.contentOptional')}
                          rows={2}
                          className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[#0073EA]/20 focus:border-[#0073EA]"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleEditSave}
                            disabled={!editTitle.trim() || updateActivity.isPending}
                            className="inline-flex items-center gap-1 rounded-md bg-[#0073EA] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#0060C2] disabled:opacity-40"
                          >
                            <Save className="size-3" /> {t('common.save')}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                          >
                            <X className="size-3" /> {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${event.badgeColor}`}>
                              {event.badge}
                            </span>
                            <p className="text-sm font-medium">{event.title}</p>
                            {/* Calendar sync badge for consultations */}
                            {isActivity && a && a.activityType === 'consultation' && syncStatus?.[a.id] && (
                              <SyncBadge status={syncStatus[a.id].status} />
                            )}
                          </div>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{event.description}</p>
                          )}
                          {/* Calendar time change */}
                          {isActivity && a && a.activityType === 'consultation' && syncStatus?.[a.id]?.status === 'time_changed' && syncStatus[a.id].updatedStart && (
                            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                              <RefreshCw className="size-3" />
                              {t('leadDetail.changedTime')}: {new Date(syncStatus[a.id].updatedStart!).toLocaleString('ko-KR')}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(event.date).toLocaleString('ko-KR')}
                            {event.person && ` · ${event.person}`}
                          </p>
                        </div>

                        {/* Edit/Delete buttons for activities only */}
                        {isActivity && a && canEdit && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => handleEditStart(a)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                              title={t('common.edit')}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(a.id)}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                title={t('common.delete')}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">{t('leadDetail.noActivities')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Lead Edit Dialog */}
      <LeadEditDialog open={editOpen} onClose={() => setEditOpen(false)} lead={lead} />

      {/* Contract Creation Dialog */}
      <CreateContractFromLeadDialog
        open={contractDialogOpen}
        onOpenChange={setContractDialogOpen}
        lead={{
          id: lead.id,
          parentName: lead.parentName,
          studentName: lead.studentName,
          phone: lead.phone,
          currentSchool: lead.currentSchool,
          grade: lead.grade,
          region: lead.region,
          email: lead.email,
        }}
      />

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
  const t = useT()
  switch (status) {
    case 'synced':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-600">
          <CheckCircle2 className="size-3" />
          {t('leadDetail.synced')}
        </span>
      )
    case 'time_changed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
          <AlertTriangle className="size-3" />
          {t('leadDetail.timeChanged')}
        </span>
      )
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
          <XCircle className="size-3" />
          {t('leadDetail.calendarDeleted')}
        </span>
      )
    case 'no_event_id':
    case 'error':
    case 'loading':
    default:
      return null
  }
}
