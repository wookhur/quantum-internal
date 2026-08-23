import { useState, useMemo } from 'react'
import { homepageOriginBadge, hasHomepageReinquiry, latestInquiryDate, parseHomepageInquiries } from '@/lib/homepageInquiry'
import { useT } from '@/i18n/LanguageContext'
import { Link, useLocation } from 'react-router-dom'
import { useCanEdit } from '@/hooks/usePermissions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/PhoneInput'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  GitMerge,
  X,
  Loader2,
  Users,
  TrendingUp,
  CalendarDays,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { useLeads, useCreateLead, useLeadStats, useSyncGoogleSheetLeads, useDeleteLead } from '@/hooks/useLeads'
import { LeadSeminarBadges } from '@/components/LeadSeminarBadges'
import { MergeLeadDialog } from '@/components/MergeLeadDialog'
import { leadLevelConfig } from '@/lib/leadLevels'
import { resolveInstant } from '@/lib/leadLocation'
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

type LeadLocFields = Pick<Lead, 'residenceCity' | 'currentSchool' | 'region' | 'phone' | 'residenceCountry'>

/** 리드의 실제 거주국가(한글명). 도시>전화>학교>지역 순으로 판정(LeadLocalTime과 동일 로직), 없으면 residenceCountry. */
function leadCountryName(lead: LeadLocFields): string {
  const resolved = resolveInstant({ city: lead.residenceCity, school: lead.currentSchool, region: lead.region, phone: lead.phone })
  return (resolved?.country || lead.residenceCountry || '').trim()
}

// region 필드(REGIONS)가 국가/지역을 직접 담음 → 1차 신호로 사용.
const KR_REGIONS = ['서울', '부산', '제주', '대구', '인천']
const FOREIGN_REGIONS = ['캐나다', '영국', '홍콩', '싱가폴', '싱가포르', '중국', '두바이', '일본', '멕시코', '발리']

/** 거주국가 분류: 국내 / 미국 / 기타국가.
 *  1) region 필드(미국·서울·캐나다 등)를 우선 사용. 2) region이 비었거나 '기타'면 도시·전화·학교로 보조 판정. */
function countryBucket(lead: LeadLocFields): 'domestic' | 'us' | 'other' {
  const r = (lead.region || '').trim()
  if (r === '미국') return 'us'
  if (KR_REGIONS.includes(r)) return 'domestic'
  if (FOREIGN_REGIONS.includes(r)) return 'other'
  // region 미기입/'기타' → 도시·전화·학교 기반 보조 판정
  const c = leadCountryName(lead).toLowerCase()
  if (['미국', 'us', 'usa', 'united states', 'united states of america', 'america'].includes(c)) return 'us'
  if (c && !['대한민국', '한국', 'korea', 'kr', 'south korea', 'republic of korea'].includes(c)) return 'other'
  return 'domestic'
}

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
  return <LeadsTableView />
}

function LeadsTableView() {
  const t = useT()
  const canEdit = useCanEdit(useLocation().pathname)

  // -- 중복 병합 다이얼로그 대상 리드
  const [mergeSource, setMergeSource] = useState<Lead | null>(null)

  // -- 리드 삭제 (중복 정리용). 계약 연결 시 훅에서 차단됨.
  const deleteLead = useDeleteLead()
  const handleDeleteLead = (lead: Lead) => {
    const name = lead.studentName || lead.parentName || '이 리드'
    if (!confirm(`'${name}' 리드를 삭제할까요?\n연결된 세미나 출석·등록 등은 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.`)) return
    deleteLead.mutate(lead.id, {
      onError: (e: unknown) => alert(e instanceof Error ? e.message : '삭제에 실패했습니다.'),
    })
  }

  // -- Filter state
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [assignedFilter, setAssignedFilter] = useState<string>('all')
  const [residenceFilter, setResidenceFilter] = useState<string>('all')
  const [regionFilter, setRegionFilter] = useState<string>('all')
  const [gradeFilter, setGradeFilter] = useState<string>('all')

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
    region: regionFilter !== 'all' ? regionFilter : undefined,
    grade: gradeFilter !== 'all' ? gradeFilter : undefined,
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
    residenceFilter !== 'all',
    regionFilter !== 'all',
    gradeFilter !== 'all',
    !!search,
  ].filter(Boolean).length

  // 기존 고객이 홈페이지로 다시 문의하면 기존 리드에 병합되므로 유입일은 그대로다.
  // 그러면 목록 아래에 묻혀 "또 신청했다"는 사실을 놓치게 된다.
  // 유입일과 재문의일 중 최신값으로 다시 정렬해 신규 리드와 같이 위로 올린다.
  const sortedLeads = useMemo(() => {
    const filtered = residenceFilter === 'all'
      ? allLeads
      : allLeads.filter((l) => countryBucket(l) === residenceFilter)
    return [...filtered].sort((a, b) =>
      latestInquiryDate(b.leadDate, b.memo).localeCompare(latestInquiryDate(a.leadDate, a.memo)),
    )
  }, [allLeads, residenceFilter])

  // -- Client-side pagination
  const totalCount = sortedLeads.length
  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * ROWS_PER_PAGE
  const endIdx = startIdx + ROWS_PER_PAGE
  const paginatedLeads = sortedLeads.slice(startIdx, endIdx)

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
    setRegionFilter('all')
    setGradeFilter('all')
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
    if (!canEdit) return
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
        {canEdit && (
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
        )}
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
              <span className="truncate">{stageFilter === 'all' ? t('leads.allStages') : (PIPELINE_STAGES.find((s) => s.key === stageFilter)?.label ?? stageFilter)}</span>
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
              <span className="truncate">{sourceFilter === 'all' ? t('leads.allChannels') : sourceFilter}</span>
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
              <span className="truncate">{assignedFilter === 'all' ? t('leads.allAssignees') : (assignedUsers.find((u) => u.id === assignedFilter)?.name ?? assignedFilter)}</span>
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

          {/* Residence country filter (국내/미국/기타국가) */}
          <Select
            value={residenceFilter}
            onValueChange={(v) => { v && setResidenceFilter(v); resetPage() }}
          >
            <SelectTrigger className="w-[130px]" size="sm">
              <span className="truncate">
                {residenceFilter === 'all' ? '전체 거주국가'
                  : residenceFilter === 'domestic' ? '국내'
                  : residenceFilter === 'us' ? '미국' : '기타국가'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 거주국가</SelectItem>
              <SelectItem value="domestic">국내</SelectItem>
              <SelectItem value="us">미국</SelectItem>
              <SelectItem value="other">기타국가</SelectItem>
            </SelectContent>
          </Select>

          {/* Region filter */}
          <Select
            value={regionFilter}
            onValueChange={(v) => { v && setRegionFilter(v); resetPage() }}
          >
            <SelectTrigger className="w-[120px]" size="sm">
              <span className="truncate">{regionFilter === 'all' ? '전체 지역' : regionFilter}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 지역</SelectItem>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Grade filter */}
          <Select
            value={gradeFilter}
            onValueChange={(v) => { v && setGradeFilter(v); resetPage() }}
          >
            <SelectTrigger className="w-[110px]" size="sm">
              <span className="truncate">{gradeFilter === 'all' ? '전체 학년' : gradeFilter}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 학년</SelectItem>
              {GRADES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Active filter count + Reset */}
          {activeFilterCount > 0 && (
            <>
              <Badge className="text-xs gap-1">
                결과 {totalCount.toLocaleString()}명
              </Badge>
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
            {activeFilterCount === 0 && canEdit && (
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
                      <div className="flex items-center gap-1 flex-wrap">
                        <StagePill stage={lead.pipelineStage} />
                        {(() => {
                          const b = homepageOriginBadge(lead.sourceChannel)
                          return b ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${b.className}`}
                                  title={lead.sourceChannel || undefined}>
                              {b.label}
                            </span>
                          ) : null
                        })()}
                        {hasHomepageReinquiry(lead.sourceChannel, lead.memo) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-medium" title="다른 경로로 유입됐지만 홈페이지로 추가 문의한 리드">홈페이지 재문의</span>
                        )}
                      </div>
                    </td>
                    <td className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {formatDate(lead.leadDate)}
                      {hasHomepageReinquiry(lead.sourceChannel, lead.memo) && (
                        <span className="block text-[10px] text-blue-600" title="홈페이지로 다시 문의한 날">
                          ↻ {parseHomepageInquiries(lead.memo)[0].date.slice(5)}
                        </span>
                      )}
                    </td>
                    <td className="font-medium">
                      <Link
                        to={`/sales/leads/${lead.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {lead.parentName}
                      </Link>
                    </td>
                    <td className="text-sm">
                      {lead.nameAliases && (
                        <span className="block text-[11px] text-muted-foreground/80 truncate" title={lead.nameAliases}>🔤 {lead.nameAliases}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        {lead.studentName || '-'}
                        {(() => {
                          const lvl = leadLevelConfig(lead.leadLevel)
                          return lvl ? (
                            <Badge variant="outline" className={`${lvl.badge} text-[10px] px-1.5 py-0 h-4`} title={lvl.meaningKo}>
                              {lvl.emoji} {lvl.labelEn}
                            </Badge>
                          ) : null
                        })()}
                      </span>
                      <span className="block mt-0.5">
                        <LeadSeminarBadges lead={lead} compact max={2} />
                      </span>
                    </td>
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
                      {canEdit && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/sales/leads/${lead.id}`}>
                            <Button variant="ghost" size="icon-xs">
                              <Pencil className="size-3.5" />
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
                              <MoreHorizontal className="size-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setMergeSource(lead)}>
                                <GitMerge className="size-3.5 mr-2" />
                                병합
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteLead(lead)}
                              >
                                <Trash2 className="size-3.5 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
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
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => updateForm('phone', v)}
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

      <MergeLeadDialog sourceLead={mergeSource} onClose={() => setMergeSource(null)} />
    </div>
  )
}
