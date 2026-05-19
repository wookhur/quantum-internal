import { useState, useMemo, useCallback } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLeads, useUpdateLead } from '@/hooks/useLeads'
import {
  PIPELINE_STAGES,

  type Lead,
  type PipelineStage,
} from '@/types'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, RotateCcw, User, Pause, PhoneOff, XCircle, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTIVE_STAGES = PIPELINE_STAGES.filter(
  (s) => s.group === 'active' || s.group === 'won',
)
const INACTIVE_STAGES = PIPELINE_STAGES.filter((s) => s.group === 'inactive')

/** Map stage key -> hex color for inline styles */
const STAGE_COLOR_MAP: Record<string, string> = {
  new_lead: '#FDAB3D',
  contact_attempted: '#FFCB00',
  consultation_scheduled: '#00C875',
  first_consultation: '#0073EA',
  second_consultation: '#A25DDC',
  third_consultation: '#784BD1',
  contract_review: '#FF158A',
  contracted: '#00C875',
  on_hold: '#FDAB3D',
  no_response: '#C4C4C4',
  rejected: '#E2445C',
  lost: '#C4C4C4',
}

// ---------------------------------------------------------------------------
// timeAgo helper
// ---------------------------------------------------------------------------

function timeAgo(dateString: string | undefined, t: ReturnType<typeof useT>): string {
  if (!dateString) return ''
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return t('common.justNow')

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return t('common.justNow')

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('common.minutesAgo', { n: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('common.hoursAgo', { n: hours })

  const days = Math.floor(hours / 24)
  if (days < 7) return t('common.daysAgo', { n: days })

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return t('common.weeksAgo', { n: weeks })

  const months = Math.floor(days / 30)
  if (months < 12) return t('common.monthsAgo', { n: months })

  const years = Math.floor(days / 365)
  return t('common.yearsAgo', { n: years })
}

// ---------------------------------------------------------------------------
// Source channel emoji
// ---------------------------------------------------------------------------

function sourceEmoji(channel: string): string {
  if (channel.includes('Instagram')) return '📱'
  if (channel.includes('카카오')) return '💬'
  if (channel.includes('세미나') || channel.includes('Seminar')) return '🎤'
  if (channel.includes('웨비나')) return '💻'
  if (channel.includes('소개') || channel.includes('추천')) return '🤝'
  if (channel.includes('웹사이트')) return '🌐'
  return '📋'
}

// ---------------------------------------------------------------------------
// Sortable Lead Card
// ---------------------------------------------------------------------------

interface LeadCardProps {
  lead: Lead
  stageColor: string
  onClick: () => void
  isDragOverlay?: boolean
  t: ReturnType<typeof useT>
}

function LeadCardContent({ lead, stageColor, onClick, isDragOverlay, t }: LeadCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        monday-card cursor-pointer select-none
        transition-all duration-150
        ${isDragOverlay ? 'shadow-lg scale-[1.02] rotate-[1deg]' : 'hover:shadow-md'}
      `}
      style={{ borderLeft: `3px solid ${stageColor}` }}
    >
      <div className="p-3 space-y-1.5">
        {/* Parent name */}
        <p className="text-sm font-semibold text-foreground truncate">
          {lead.parentName}
          {lead.parentName && <span className="text-muted-foreground font-normal"> ({t('pipeline.parent')})</span>}
        </p>

        {/* Student + grade */}
        {(lead.studentName || lead.grade) && (
          <p className="text-xs text-muted-foreground truncate">
            {lead.studentName || ''}
            {lead.studentName && lead.grade ? '  ·  ' : ''}
            {lead.grade || ''}
          </p>
        )}

        {/* School + region */}
        {(lead.currentSchool || lead.region) && (
          <p className="text-xs text-muted-foreground truncate">
            {lead.currentSchool || ''}
            {lead.currentSchool && lead.region ? '  ·  ' : ''}
            {lead.region || ''}
          </p>
        )}

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Source channel */}
        {lead.sourceChannel && (
          <p className="text-xs text-muted-foreground">
            {sourceEmoji(lead.sourceChannel)} {lead.sourceChannel}
          </p>
        )}

        {/* Assigned to */}
        {lead.assignedUser?.name && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="size-3" />
            {lead.assignedUser.name}
          </p>
        )}

        {/* Memo preview */}
        {lead.memo && (
          <p className="text-xs text-muted-foreground/70 truncate italic">
            {lead.memo}
          </p>
        )}

        {/* Relative time */}
        <p className="text-[11px] text-muted-foreground/60">
          {timeAgo(lead.updatedAt || lead.createdAt, t)}
        </p>
      </div>
    </div>
  )
}

function SortableLeadCard({ lead, stageColor, onClick, t }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCardContent lead={lead} stageColor={stageColor} onClick={onClick} t={t} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Droppable Column
// ---------------------------------------------------------------------------

interface KanbanColumnProps {
  stage: (typeof PIPELINE_STAGES)[number]
  leads: Lead[]
  onCardClick: (id: string) => void
  t: ReturnType<typeof useT>
}

function KanbanColumn({ stage, leads, onCardClick, t }: KanbanColumnProps) {
  const stageColor = STAGE_COLOR_MAP[stage.key] || '#C4C4C4'

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col max-h-full">
      {/* Column header with color bar */}
      <div
        className="rounded-t-lg overflow-hidden bg-white border border-b-0 border-border"
        style={{ borderTop: `4px solid ${stageColor}` }}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">{t('stage.' + stage.key)}</h3>
          <Badge
            variant="secondary"
            className="text-xs font-mono tabular-nums px-2 py-0.5"
          >
            {leads.length}
          </Badge>
        </div>
      </div>

      {/* Cards container */}
      <div
        className="flex-1 overflow-y-auto rounded-b-lg border border-t-0 border-border p-2 space-y-2"
        style={{ background: '#F6F7FB', minHeight: 200, maxHeight: 'calc(100vh - 280px)' }}
      >
        <SortableContext
          items={leads.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <SortableLeadCard
              key={lead.id}
              lead={lead}
              stageColor={stageColor}
              onClick={() => onCardClick(lead.id)}
              t={t}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            {t('pipeline.noLeads')}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonColumns() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-[280px]">
          <div className="h-3 bg-muted rounded-t-lg animate-pulse" />
          <div className="bg-white border border-border rounded-b-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              <div className="h-5 w-8 bg-muted rounded-full animate-pulse" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="h-28 bg-muted/50 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inactive Drop Zone (visible only while dragging)
// ---------------------------------------------------------------------------

const INACTIVE_DROP_CONFIG: {
  key: PipelineStage
  labelKey: string
  icon: typeof Pause
  color: string
  bgColor: string
  hoverBg: string
  descriptionKey: string
}[] = [
  { key: 'on_hold', labelKey: 'stage.on_hold', icon: Pause, color: 'text-amber-600', bgColor: 'bg-amber-50', hoverBg: 'bg-amber-100', descriptionKey: 'pipeline.onHoldDesc' },
  { key: 'no_response', labelKey: 'stage.no_response', icon: PhoneOff, color: 'text-gray-500', bgColor: 'bg-gray-50', hoverBg: 'bg-gray-100', descriptionKey: 'pipeline.noResponseDesc' },
  { key: 'rejected', labelKey: 'stage.rejected', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50', hoverBg: 'bg-red-100', descriptionKey: 'pipeline.rejectedDesc' },
  { key: 'lost', labelKey: 'stage.lost', icon: UserX, color: 'text-gray-400', bgColor: 'bg-gray-50', hoverBg: 'bg-gray-100', descriptionKey: 'pipeline.lostDesc' },
]

function InactiveDropZoneItem({ stageKey, labelKey, icon: Icon, color, bgColor, hoverBg, descriptionKey, t }: {
  stageKey: PipelineStage
  labelKey: string
  icon: typeof Pause
  color: string
  bgColor: string
  hoverBg: string
  descriptionKey: string
  t: ReturnType<typeof useT>
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stageKey })

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-1 flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed
        py-4 px-3 transition-all duration-200 min-w-[140px]
        ${isOver
          ? `${hoverBg} border-current ${color} scale-[1.03] shadow-md`
          : `${bgColor} border-gray-200 ${color}`
        }
      `}
    >
      <Icon className={`size-5 ${color} ${isOver ? 'animate-pulse' : ''}`} />
      <div className="text-left">
        <p className={`text-sm font-semibold ${color}`}>{t(labelKey)}</p>
        <p className="text-[11px] text-muted-foreground">{t(descriptionKey)}</p>
      </div>
    </div>
  )
}

function InactiveDropZones({ isDragging, t }: { isDragging: boolean; t: ReturnType<typeof useT> }) {
  if (!isDragging) return null

  return (
    <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 flex gap-3">
      {INACTIVE_DROP_CONFIG.map((config) => (
        <InactiveDropZoneItem
          key={config.key}
          stageKey={config.key}
          labelKey={config.labelKey}
          icon={config.icon}
          color={config.color}
          bgColor={config.bgColor}
          hoverBg={config.hoverBg}
          descriptionKey={config.descriptionKey}
          t={t}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inactive Leads Section
// ---------------------------------------------------------------------------

interface InactiveSectionProps {
  leads: Lead[]
  onReactivate: (lead: Lead) => void
  t: ReturnType<typeof useT>
}

function InactiveLeadsSection({ leads, onReactivate, t }: InactiveSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (leads.length === 0) return null

  return (
    <div className="monday-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {t('pipeline.inactiveLeads')}
          </span>
          <Badge variant="secondary" className="text-xs font-mono">
            {leads.length}
          </Badge>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          <table className="monday-table">
            <thead>
              <tr>
                <th>{t('leads.col.parent')}</th>
                <th>{t('leads.col.student')}</th>
                <th>{t('leads.col.status')}</th>
                <th>{t('leads.col.sourceChannel')}</th>
                <th>{t('leads.col.assignee')}</th>
                <th>{t('common.updated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                return (
                  <tr key={lead.id}>
                    <td className="font-medium">{lead.parentName}</td>
                    <td>
                      {lead.studentName}
                      {lead.grade ? ` (${lead.grade})` : ''}
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          backgroundColor: STAGE_COLOR_MAP[lead.pipelineStage],
                          color:
                            lead.pipelineStage === 'no_response' ||
                            lead.pipelineStage === 'lost'
                              ? '#323338'
                              : '#FFFFFF',
                        }}
                      >
                        {t('stage.' + lead.pipelineStage)}
                      </span>
                    </td>
                    <td className="text-muted-foreground">
                      {lead.sourceChannel}
                    </td>
                    <td className="text-muted-foreground">
                      {lead.assignedUser?.name || '-'}
                    </td>
                    <td className="text-muted-foreground text-xs">
                      {timeAgo(lead.updatedAt, t)}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 text-primary hover:text-primary"
                        onClick={() => onReactivate(lead)}
                      >
                        <RotateCcw className="size-3" />
                        {t('pipeline.reactivate')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PipelinePage() {
  const t = useT()
  const navigate = useNavigate()
  const { data: leads = [], isLoading } = useLeads()
  const updateLead = useUpdateLead()

  const [activeId, setActiveId] = useState<string | null>(null)

  // Pointer sensor with activation distance to allow clicks without triggering drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  // Group leads by pipeline stage
  const groupedLeads = useMemo(() => {
    const groups: Record<PipelineStage, Lead[]> = {} as Record<PipelineStage, Lead[]>
    for (const stage of PIPELINE_STAGES) {
      groups[stage.key] = []
    }
    for (const lead of leads) {
      if (groups[lead.pipelineStage]) {
        groups[lead.pipelineStage].push(lead)
      }
    }
    return groups
  }, [leads])

  // Active leads (grouped by active/won stages)
  const activeStageLeads = useMemo(
    () => ACTIVE_STAGES.map((s) => ({ stage: s, leads: groupedLeads[s.key] || [] })),
    [groupedLeads],
  )

  // Inactive leads (all inactive stages combined)
  const inactiveLeads = useMemo(
    () => INACTIVE_STAGES.flatMap((s) => groupedLeads[s.key] || []),
    [groupedLeads],
  )

  // The currently dragged lead (for DragOverlay)
  const activeLead = useMemo(
    () => (activeId ? leads.find((l) => l.id === activeId) : null),
    [activeId, leads],
  )

  // ---- Drag handlers ----

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)

      const { active, over } = event
      if (!over) return

      const draggedLead = leads.find((l) => l.id === active.id)
      if (!draggedLead) return

      // Determine the target stage
      // "over" can be another card or a column container
      let targetStage: PipelineStage | null = null

      // Check if we dropped over a card -> use that card's stage
      const overLead = leads.find((l) => l.id === over.id)
      if (overLead) {
        targetStage = overLead.pipelineStage
      }

      // Check if we dropped over a column directly (id = stage key)
      if (!targetStage && ACTIVE_STAGES.some((s) => s.key === over.id)) {
        targetStage = over.id as PipelineStage
      }

      // Check if we dropped over an inactive drop zone
      if (!targetStage && INACTIVE_STAGES.some((s) => s.key === over.id)) {
        targetStage = over.id as PipelineStage
      }

      if (!targetStage || targetStage === draggedLead.pipelineStage) return

      const isContractStage = targetStage === 'contract_review' || targetStage === 'contracted'

      updateLead.mutate(
        {
          id: draggedLead.id,
          data: { pipelineStage: targetStage },
          previousStage: draggedLead.pipelineStage,
        },
        {
          onSuccess: () => {
            if (isContractStage) {
              const params = new URLSearchParams({
                leadId: draggedLead.id,
                contractorName: draggedLead.parentName || '',
                studentName: draggedLead.studentName || '',
                schoolName: draggedLead.currentSchool || '',
                grade: draggedLead.grade || '',
                phone: draggedLead.phone || '',
              })
              navigate(`/consulting/clients?${params.toString()}`)
            }
          },
        },
      )
    },
    [leads, updateLead, navigate],
  )

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Could be used for real-time column highlighting; kept simple for now
  }, [])

  const handleCardClick = useCallback(
    (id: string) => {
      navigate(`/sales/leads/${id}`)
    },
    [navigate],
  )

  const handleReactivate = useCallback(
    (lead: Lead) => {
      updateLead.mutate({
        id: lead.id,
        data: { pipelineStage: 'new_lead' },
        previousStage: lead.pipelineStage,
      })
    },
    [updateLead],
  )

  // ---- Render ----

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pipeline.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('pipeline.subtitle')}
          </p>
        </div>
        <SkeletonColumns />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pipeline.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('pipeline.subtitle')}
          </p>
        </div>

        {/* Stage legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {ACTIVE_STAGES.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: STAGE_COLOR_MAP[s.key] }}
              />
              <span className="text-xs text-muted-foreground">{t('stage.' + s.key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Kanban Board ---- */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activeStageLeads.map(({ stage, leads: columnLeads }) => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              leads={columnLeads}
              onCardClick={handleCardClick}
              t={t}
            />
          ))}
        </div>

        {/* ---- Inactive Drop Zones (appear while dragging) ---- */}
        <InactiveDropZones isDragging={!!activeId} t={t} />

        {/* Drag overlay - renders the card being dragged */}
        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <div className="w-[280px]">
              <LeadCardContent
                lead={activeLead}
                stageColor={
                  STAGE_COLOR_MAP[activeLead.pipelineStage] || '#C4C4C4'
                }
                onClick={() => {}}
                isDragOverlay
                t={t}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ---- Inactive Leads ---- */}
      <InactiveLeadsSection
        leads={inactiveLeads}
        onReactivate={handleReactivate}
        t={t}
      />
    </div>
  )
}
