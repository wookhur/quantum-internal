import { useState, useMemo } from 'react'
import { useT } from '@/i18n/LanguageContext'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  X,
  Loader2,
  Users,
  TrendingUp,
  CalendarDays,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { useLeads, useCreateLead, useLeadStats, useSyncGoogleSheetLeads } from '@/hooks/useLeads'
import { ColdCallView } from './ColdCallPage'
import type { Lead, PipelineStage } from '@/types'
import {
  PIPELINE_STAGES,
  SOURCE_CHANNELS,
  INTEREST_AREAS,
  REGIONS,
  GRADES,
  getStageConfig,
} from '@/types'

// ============ Constants ============

const ROWS_PER_PAGE = 25

const INITIAL_FORM = {
  parentName: '',
  studentName: '',
  phone: '',
  email: '',
  currentSchool: '',
  grade: '',
  region: '',
  interestArea: '',
  sourceChannel: '',
  memo: '',
}

// ============ Helpers ============

/** CSS class for a pipeline stage pill */
function stagePillClass(stage: PipelineStage): string {
  return `status-pill status-pill--${stage.replace(/_/g, '-')}`
}

/** Format a date string to a shorter Korean-friendly format */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${m}/${day}`
}

/** Get initials for avatar circle */
function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name.charAt(0)
}

// ============ Sub-components ============

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="monday-card flex items-center gap-3 px-4 py-3 min-w-0">
      <div
        className="flex items-center justify-center size-9 rounded-lg shrink-0"
        style={{ backgroundColor: accent ? `${accent}18` : '#F0F3FF' }}
      >
        <Icon
          className="size-4"
          style={{ color: accent || '#0073EA' }}
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  )
}

function StagePill({ stage }: { stage: PipelineStage }) {
  const config = getStageConfig(stage)
  return <span className={stagePillClass(stage)}>{config.label}</span>
}

function AssignedAvatar({ user }: { user: Lead['assignedUser'] }) {
  if (!user) return <span className="text-muted-foreground text-xs">-</span>
  return (
    <div className="flex items-center gap-1.5">
      <div className="size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
        {getInitials(user.name)}
      </div>
      <span className="text-sm truncate">{user.name}</span>
    </div>
  )
}

// ============ Main component ============

export function LeadsPage() {
  const [viewMode, setViewMode] = useState<'table' | 'coldcall'>('table')

  if (viewMode === 'coldcall') {
    return <ColdCallView onSwitchToTable={() => setViewMode('table')} />
  }

  return <LeadsTableView onSwitchToColdCall={() => setViewMode('coldcall')} />
}

function LeadsTableView({ onSwitchToColdCall }: { onSwitchToColdCall: () => void }) {
  const t = useT()
  // -- Filter state
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')

  // -- Pagination state
  const [page, setPage] = useState(1)

  // -- Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)

  // -- Data hooks
  const {
    data: allLeads = [],
    isLoading,
    error,
  } = useLeads({
    stage: stageFilter !== 'all' ? (stageFilter as PipelineStage) : undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    assignedTo: assignedFilter !== 'all' ? assignedFilter : undefined,
    search: search || undefined,
  })

  const { data: stats } = useLeadStats()
  const createLead = useCreateLead()
  const syncSheet = useSyncGoogleSheetLeads()

  // -- Dynamic source channels from stats (all leads, not filtered)
  const dynamicSourceChannels = useMemo(() => {
    if (!stats?.bySource) return SOURCE_CHANNELS as unknown as string[]
    return Object.keys(stats.bySource).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [stats])

  // -- Compute unique assigned users for the filter dropdown
  const assignedUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const lead of allLeads) {
      if (lead.assignedTo && lead.assignedUser) {
        map.set(lead.assignedTo, {
          id: lead.assignedTo,
          name: lead.assignedUser.name,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allLeads])

  // -- Active filter count (excluding defaults)
  const activeFilterCount = [
    stageFilter !== 'all',
    sourceFilter !== 'all',
    assignedFilter !== 'all',
    !!search,
  ].filter(Boolean).length

  // -- Client-side pagination
  const totalCount = allLeads.length
  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * ROWS_PER_PAGE
  const endIdx = startIdx + ROWS_PER_PAGE
  const paginatedLeads = allLeads.slice(startIdx, endIdx)

  // -- Active leads count (not contracted/lost/rejected)
  const activeLeadCount = useMemo(() => {
    if (!stats) return 0
    const inactiveStages: PipelineStage[] = ['contracted', 'lost', 'rejected']
    let count = 0
    for (const s of PIPELINE_STAGES) {
      if (!inactiveStages.includes(s.key)) {
        count += stats.byStage[s.key] || 0
      }
    }
    return count
  }, [stats])

  // -- Reset page when filters change
  const resetPage = () => setPage(1)

  // -- Filter reset
  const resetFilters = () => {
    setSearch('')
    setStageFilter('all')
    setSourceFilter('all')
    setAssignedFilter('all')
    resetPage()
  }

  // -- Form handlers
  const updateForm = <K extends keyof typeof INITIAL_FORM>(
    key: K,
    value: (typeof INITIAL_FORM)[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleCreateLead = () => {
    if (!form.parentName.trim() || !form.phone.trim() || !form.sourceChannel) return
    createLead.mutate(
      {
        ...form,
        leadDate: new Date().toISOString().slice(0, 10),
        pipelineStage: 'new_lead',
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_FORM)
        },
      },
    )
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) setForm(INITIAL_FORM)
  }

  const canSubmit =
    form.parentName.trim() !== '' &&
    form.phone.trim() !== '' &&
    form.sourceChannel !== '' &&
    !createLead.isPending

  // ============ Render ============

  return (
    <div className="space-y-5">
      {/* ---- Page Header ---- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">{t('leads.title')}</h1>
              <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
                <button
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white text-foreground shadow-sm"
                >
                  {t('leads.viewTable')}
                </button>
                <button
                  onClick={onSwitchToColdCall}
                  className="px-2.5 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('leads.viewColdCall')}
                </button>
              </div>
              {!isLoading && (
                <Badge variant="secondary" className="text-xs font-semibold">
                  {totalCount}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('leads.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => syncSheet.mutate(undefined, {
              onSuccess: (data) => {
                alert(`동기화 완료: ${data?.inserted ?? 0}건의 새 리드가 추가되었습니다.`)
              },
              onError: () => {
                alert('동기화 실패: Google API 키 설정을 확인해주세요.')
              },
            })}
            disabled={syncSheet.isPending}
          >
            <RefreshCw className={`size-4 ${syncSheet.isPending ? 'animate-spin' : ''}`} />
            {syncSheet.isPending ? '동기화 중...' : '시트 동기화'}
          </Button>
          <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            {t('leads.newLead')}
          </Button>
        </div>
      </div>

      {/* ---- Filter Bar ---- */}
      <div className="monday-card px-4 py-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('leads.searchPlaceholder')}
              className="pl-8 h-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPage()
              }}
            />
          </div>

          {/* Stage filter */}
          <Select
            value={stageFilter}
            onValueChange={(v) => {
              v && setStageFilter(v)
              resetPage()
            }}
          >
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue placeholder={t('leads.pipeline')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allStages')}</SelectItem>
              {PIPELINE_STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source filter */}
          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              v && setSourceFilter(v)
              resetPage()
            }}
          >
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue placeholder={t('leads.sourceChannel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allChannels')}</SelectItem>
              {dynamicSourceChannels.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Assigned to filter */}
          <Select
            value={assignedFilter}
            onValueChange={(v) => {
              v && setAssignedFilter(v)
              resetPage()
            }}
          >
            <SelectTrigger className="w-[130px]" size="sm">
              <SelectValue placeholder={t('leads.col.assignee')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allAssignees')}</SelectItem>
              {assignedUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Active filter count + Reset */}
          {activeFilterCount > 0 && (
            <>
              <Badge variant="secondary" className="text-xs gap-1">
                {t('leads.filtersActive', { n: activeFilterCount })}
              </Badge>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground gap-1"
                onClick={resetFilters}
              >
                <X className="size-3" />
                {t('common.filterReset')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---- Stats Summary ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label={t('leads.totalLeads')}
          value={stats?.total ?? '-'}
          accent="#0073EA"
        />
        <StatCard
          icon={CalendarDays}
          label={t('common.thisMonth')}
          value={stats?.thisMonth ?? '-'}
          accent="#A25DDC"
        />
        <StatCard
          icon={TrendingUp}
          label={t('leads.activeLeads')}
          value={activeLeadCount}
          accent="#00C875"
        />
        <StatCard
          icon={BarChart3}
          label={t('dashboard.conversionRate')}
          value={stats ? `${stats.conversionRate}%` : '-'}
          accent="#FF158A"
        />
      </div>

      {/* ---- Main Table ---- */}
      <div className="monday-card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="size-7 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">{t('leads.loadingLeads')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <p className="text-sm text-destructive font-medium">
              {t('common.error')}
            </p>
            <p className="text-xs text-muted-foreground">{t('common.tryAgainLater')}</p>
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center">
              <Users className="size-7 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t('leads.noLeads')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeFilterCount > 0
                  ? t('leads.noLeadsFiltered')
                  : t('leads.noLeadsEmpty')}
              </p>
            </div>
            {activeFilterCount === 0 && (
              <Button size="sm" className="gap-1.5 mt-1" onClick={() => setDialogOpen(true)}>
                <Plus className="size-3.5" />
                {t('leads.addNewLead')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="monday-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>{t('leads.col.status')}</th>
                  <th style={{ width: 80 }}>{t('leads.col.leadDate')}</th>
                  <th>{t('leads.col.parent')}</th>
                  <th>{t('leads.col.student')}</th>
                  <th className="hidden md:table-cell">{t('leads.col.school')}</th>
                  <th className="hidden lg:table-cell" style={{ width: 60 }}>{t('leads.col.grade')}</th>
                  <th className="hidden lg:table-cell">{t('leads.col.region')}</th>
                  <th>{t('leads.col.interest')}</th>
                  <th>{t('leads.col.channel')}</th>
                  <th>{t('leads.col.assignee')}</th>
                  <th className="hidden xl:table-cell" style={{ maxWidth: 200 }}>{t('leads.col.memo')}</th>
                  <th style={{ width: 70 }}>{t('leads.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map((lead) => (
                  <tr key={lead.id} className="group">
                    <td>
                      <StagePill stage={lead.pipelineStage} />
                    </td>
                    <td className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {formatDate(lead.leadDate)}
                    </td>
                    <td className="font-medium">
                      <Link
                        to={`/sales/leads/${lead.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {lead.parentName}
                      </Link>
                    </td>
                    <td className="text-sm">{lead.studentName || '-'}</td>
                    <td className="hidden md:table-cell text-sm text-muted-foreground">
                      {lead.currentSchool || '-'}
                    </td>
                    <td className="hidden lg:table-cell text-sm">{lead.grade || '-'}</td>
                    <td className="hidden lg:table-cell text-sm text-muted-foreground">
                      {lead.region || '-'}
                    </td>
                    <td className="text-sm">
                      {lead.interestArea ? (
                        <span className="text-xs text-muted-foreground truncate block max-w-[140px]">
                          {lead.interestArea.replace(/\s*\(.*?\)\s*/g, '')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {lead.sourceChannel ? (
                        <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">
                          {lead.sourceChannel}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <AssignedAvatar user={lead.assignedUser} />
                    </td>
                    <td className="hidden xl:table-cell">
                      <span
                        className="text-xs text-muted-foreground block truncate"
                        style={{ maxWidth: 200 }}
                        title={lead.memo}
                      >
                        {lead.memo || '-'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/sales/leads/${lead.id}`}>
                          <Button variant="ghost" size="icon-xs">
                            <Pencil className="size-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon-xs">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---- Pagination ---- */}
        {totalCount > ROWS_PER_PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {startIdx + 1}-{Math.min(endIdx, totalCount)} {t('common.of')} {totalCount}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---- New Lead Dialog ---- */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('leads.addNewLead')}</DialogTitle>
            <DialogDescription>{t('leads.addNewLeadDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Row 1: parent name + student name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('leads.parentName')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.parentName}
                  onChange={(e) => updateForm('parentName', e.target.value)}
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.studentName')}</Label>
                <Input
                  value={form.studentName}
                  onChange={(e) => updateForm('studentName', e.target.value)}
                  placeholder="홍길순"
                />
              </div>
            </div>

            {/* Row 2: phone + email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('leads.phone')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.email')}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {/* Row 3: school + grade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.currentSchool')}</Label>
                <Input
                  value={form.currentSchool}
                  onChange={(e) => updateForm('currentSchool', e.target.value)}
                  placeholder={t('leads.schoolPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.grade')}</Label>
                <Select
                  value={form.grade}
                  onValueChange={(v) => v && updateForm('grade', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: region + interest area */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.region')}</Label>
                <Select
                  value={form.region}
                  onValueChange={(v) => v && updateForm('region', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('leads.interestArea')}</Label>
                <Select
                  value={form.interestArea}
                  onValueChange={(v) => v && updateForm('interestArea', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEREST_AREAS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 5: source channel */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {t('leads.sourceChannel')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.sourceChannel}
                onValueChange={(v) => v && updateForm('sourceChannel', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('leads.sourceChannelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {dynamicSourceChannels.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {ch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 6: memo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('leads.memo')}</Label>
              <Textarea
                value={form.memo}
                onChange={(e) => updateForm('memo', e.target.value)}
                rows={3}
                placeholder={t('leads.memoPlaceholder')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateLead} disabled={!canSubmit}>
              {createLead.isPending && (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              )}
              {t('leads.addLead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
