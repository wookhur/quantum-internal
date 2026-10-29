import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Loader2, Search, CheckCircle2, Clock, HandCoins, Lock, Link as LinkIcon, X,
  Plus, Trash2, PencilLine, Pencil, StickyNote, Ban,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  useAllServiceProgramFees, useCreateManualServiceFee, useUpdateManualServiceFee,
  useDeleteManualServiceFee, feeCollected, feeIncentivePayable, type ServiceProgramFee,
} from '@/hooks/useServiceProgramFees'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { compareStudentsKo, studentPickerLabel } from '@/lib/studentDisplay'
import { useUpdateECActivity } from '@/hooks/useECActivities'
import { useUpdateAcademicSupport } from '@/hooks/useAcademicSupport'
import { useDefaultRates, usePartnerRateMap, normalizePartner, rateForTeam, type ContributorTeam } from '@/hooks/usePartnerCommissionRates'
import { useProfiles, canManageServiceFinance } from '@/hooks/useProfiles'
import { consultantNameKey } from '@/lib/consultants'
import { useAuth } from '@/contexts/AuthContext'
import { useCreateClawbacks, useAllClawbacks, useSetClawbackStatus, useDeleteClawback, nextMonthKey, type ClawbackInput } from '@/hooks/useClawbacks'
import { useT } from '@/i18n/LanguageContext'
import { todayKST } from '@/lib/date'
import { formatCurrency, type CollectionStatus, type RefundStatus } from '@/types'

/** 교육비 처리 월 옵션 (Student360과 동일) */
const SERVICE_MONTH_OPTIONS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '여름특강', '겨울특강'] as const

/** Resolve a contributor name → team from 인사관리 department. */
type TeamResolver = (name: string | undefined) => ContributorTeam | undefined

interface ContribRow {
  name: string
  slot: 0 | 1                  // which contributor slot (for saving the override)
  override?: ContributorTeam | 'none' | null  // manually-set team (null/undefined = auto, 'none' = 인센티브 없음)
  team?: ContributorTeam       // effective team (override first, else auto)
  source: 'manual' | 'auto' | 'none'
  rate: number                 // % applied (from this partner's team rate)
  inc: number                  // 청구금액 × rate
}

/** One row per contributor with effective team, rate, and incentive.
 *  salesRate/serviceRate are the effective rates for this item's partner
 *  (partner-specific if configured, else the company default). */
function contributorRows(
  f: ServiceProgramFee,
  autoTeam: TeamResolver,
  salesRate: number,
  serviceRate: number,
): ContribRow[] {
  const billed = f.billedAmount || 0
  const slots: { slot: 0 | 1; name?: string; override?: ContributorTeam | 'none' | null }[] = [
    { slot: 0, name: f.contributor1, override: f.contributor1Team },
    { slot: 1, name: f.contributor2, override: f.contributor2Team },
  ]
  const out: ContribRow[] = []
  for (const s of slots) {
    if (!s.name?.trim()) continue
    // '없음' = 명시적으로 인센티브 없음 (팀 미지정 경고 대상 아님)
    if (s.override === 'none') {
      out.push({ name: s.name, slot: s.slot, override: 'none', team: undefined, source: 'manual', rate: 0, inc: 0 })
      continue
    }
    const auto = autoTeam(s.name)
    const team = (s.override as ContributorTeam | null | undefined) ?? auto
    const source: ContribRow['source'] = s.override ? 'manual' : auto ? 'auto' : 'none'
    // 수기 입금 건은 건별로 고른 요율을 쓴다 — 불규칙 정산이라 파트너사 기준율이
    // 맞지 않고, 애초에 걸린 파트너사도 없다. useServiceIncentiveLines 와 같은
    // 규칙이어야 한다: 여기서 3%로 보여 주고 인보이스는 10%로 지급하면,
    // 화면의 숫자와 실제 지급액이 어긋난다.
    const rate = f.incentiveRate ?? rateForTeam(team, salesRate, serviceRate)
    out.push({ name: s.name, slot: s.slot, override: s.override, team, source, rate, inc: rate ? Math.round((billed * rate) / 100) : 0 })
  }
  return out
}

/** Total incentive for an item across all contributors. */
function incentiveOf(f: ServiceProgramFee, autoTeam: TeamResolver, salesRate: number, serviceRate: number): number {
  return contributorRows(f, autoTeam, salesRate, serviceRate).reduce((s, c) => s + c.inc, 0)
}

/** 수금상태 배지 — 목록·수금처리 창·계약 상세가 같은 모양으로 보이게 한 군데서 만든다. */
export function CollectionStatusBadge({ status }: { status: CollectionStatus }) {
  const t = useT()
  if (status === 'paid') {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 hover:bg-emerald-100"><CheckCircle2 className="size-3" /> {t('svcpay.paid')}</Badge>
  }
  if (status === 'cancelled') {
    return <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50 gap-1" title={t('svcpay.cancelledHint')}><Ban className="size-3" /> {t('svcpay.cancelled')}</Badge>
  }
  return <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1"><Clock className="size-3" /> {t('svcpay.unpaid')}</Badge>
}

export function ExternalFeesPage() {
  const t = useT()
  const teamLabel = (team: ContributorTeam) => t(team === 'sales' ? 'svcpay.teamSales' : 'svcpay.teamService')
  const { user } = useAuth()
  const { data: fees = [], isLoading } = useAllServiceProgramFees()
  const { salesRate: defSales, serviceRate: defService } = useDefaultRates()
  const { map: partnerRateMap } = usePartnerRateMap()
  const { data: profiles = [] } = useProfiles()
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()
  const updateMF = useUpdateManualServiceFee()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // set a contributor's team inline from the list (auto = clear override → null)
  const setTeam = (f: ServiceProgramFee, slot: 0 | 1, choice: 'auto' | ContributorTeam | 'none') => {
    // 수기 입금 건은 EC·학습지원 테이블에 없다. 팀이 아니라 건별 요율로 계산하므로
    // 팀을 바꿀 일도 없다 — 엉뚱한 테이블에 쓰지 않도록 여기서 멈춘다.
    if (f.source === 'manual') return
    const val = choice === 'auto' ? null : choice
    const base = { id: f.id, studentId: f.studentId }
    const payload = slot === 0 ? { ...base, contributor1Team: val } : { ...base, contributor2Team: val }
    ;(f.source === 'ec' ? updateEC : updateAC).mutate(payload)
  }

  /**
   * 수금상태를 목록에서 바로 바꾼다. 세 단계다.
   * - 수금 완료: 입금 기록이 없으면 청구금액·오늘 날짜로 채운다(그래야 그 달에 인센티브가 잡힌다)
   * - 미수금: 입금 기록을 지운다. 남겨 두면 '안 들어온 돈'에 입금일이 붙는다
   * - 발생취소: 입금 기록은 그대로 둔다. 돈은 들어왔고 인센티브만 접은 건이다
   */
  const setCollectionStatus = (f: ServiceProgramFee, next: CollectionStatus) => {
    if (f.collectionStatus === next) return
    // 수기 건은 들어온 돈을 적는 칸이라 미수금이 없다. 요율 칸이 0을 받지 않으므로
    // 인센티브만 접는 길이 발생취소뿐이다.
    if (f.source === 'manual') {
      updateMF.mutate({ id: f.id, collectionStatus: next === 'cancelled' ? 'cancelled' : 'paid' })
      return
    }
    const base = { id: f.id, studentId: f.studentId }
    const mut = f.source === 'ec' ? updateEC : updateAC
    if (next === 'paid') {
      mut.mutate({ ...base, collectionStatus: 'paid', paidDate: f.paidDate || todayKST(), paidAmount: f.paidAmount ?? f.billedAmount ?? null })
    } else if (next === 'pending') {
      mut.mutate({ ...base, collectionStatus: 'pending', paidDate: '', paidAmount: null })
    } else {
      mut.mutate({ ...base, collectionStatus: 'cancelled' })
    }
  }

  // set '몇월 교육비' inline from the list
  const setServiceMonth = (f: ServiceProgramFee, month: string) => {
    // 수기 건의 월은 정산월에서 만들어 쓰는 값이라 여기서 따로 바꾸지 않는다
    // (바꾸면 인센티브가 잡히는 달과 어긋난다). 수기 행의 [수정]에서 바꾼다.
    if (f.source === 'manual') return
    ;(f.source === 'ec' ? updateEC : updateAC).mutate({ id: f.id, studentId: f.studentId, serviceMonth: month || undefined })
  }

  // effective {salesRate, serviceRate} for an item's partner (specific → else default)
  const ratesFor = (label: string) => partnerRateMap.get(normalizePartner(label)) || { salesRate: defSales, serviceRate: defService }

  // name (canonical) → team, from 인사관리 소속팀 (sales/service only)
  const autoTeam = useMemo<TeamResolver>(() => {
    const byName = new Map<string, ContributorTeam>()
    for (const p of profiles) {
      if (p.department === 'sales' || p.department === 'service') {
        byName.set(consultantNameKey(p.name), p.department)
      }
    }
    return (name?: string) => (name ? byName.get(consultantNameKey(name)) : undefined)
  }, [profiles])

  // 서비스입금관리는 대표·부대표·재무이사만 열람/편집 (열람 가능 = 편집 가능)
  const isAdmin = canManageServiceFinance(user)

  const filtered = useMemo(() => {
    if (!search.trim()) return fees
    const q = search.toLowerCase()
    return fees.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.studentName.toLowerCase().includes(q) ||
      (f.studentKoreanName || '').toLowerCase().includes(q) ||
      (f.contributor1 || '').toLowerCase().includes(q) ||
      (f.contributor2 || '').toLowerCase().includes(q),
    )
  }, [fees, search])

  const totalBilled = fees.reduce((s, f) => s + (f.billedAmount || 0), 0)
  // 발생취소도 입금일이 있으면 돈은 들어온 것이다 — 수금액에서 빼면 장부가 비어 보인다
  const collected = fees.filter(feeCollected).reduce((s, f) => s + (f.billedAmount || 0), 0)
  // 총 인센티브 = 수금 완료된 항목의 (기여자별 적용 수수료율 합계). 발생취소는 제외.
  const totalIncentive = fees
    .filter(feeIncentivePayable)
    .reduce((s, f) => { const r = ratesFor(f.label); return s + incentiveOf(f, autoTeam, r.salesRate, r.serviceRate) }, 0)

  const selected = selectedId ? fees.find(f => f.id === selectedId) ?? null : null

  // 열람 권한: 대표·부대표·재무이사만
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">{t('svcpay.accessDeniedTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('svcpay.accessDeniedDesc')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('svcpay.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('svcpay.desc')}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-[3px] border-l-purple-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('svcpay.statItems')}</div>
            <div className="text-2xl font-bold mt-1">{fees.length}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-orange-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('svcpay.statBilled')}</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(totalBilled)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-emerald-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('svcpay.statCollected')}</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(collected)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-blue-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">{t('svcpay.statIncentive')}</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalIncentive)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={t('svcpay.searchPlaceholder')}
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 수기 입금 — 정기 수업이 아니라 달마다 불규칙하게 정산되는 건.
          360 에 걸 프로그램이 없어 어디에도 안 남던 돈을 여기서 직접 적는다. */}
      {isAdmin && <ManualFeeEntry />}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t('svcpay.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('svcpay.colProgram')}</TableHead>
                  <TableHead>{t('svcpay.colStudent')}</TableHead>
                  <TableHead>{t('svcpay.colContributor')}</TableHead>
                  <TableHead className="text-right">{t('svcpay.colBilled')}</TableHead>
                  <TableHead>{t('svcpay.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('svcpay.colIncentive')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => {
                  const er = ratesFor(f.label)
                  const rows = contributorRows(f, autoTeam, er.salesRate, er.serviceRate)
                  const inc = rows.reduce((s, c) => s + c.inc, 0)
                  // 수기 건은 요율이 건별로 정해져 있어 팀을 몰라도 인센티브가 잡힌다
                  const needsTeam = f.source !== 'manual' && rows.some(c => !c.team && c.override !== 'none')
                  const isPaid = f.collectionStatus === 'paid'
                  const isCancelled = f.collectionStatus === 'cancelled'
                  return (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(f.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HandCoins className="size-4 text-purple-500 shrink-0" />
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              {f.label}
                              {/* 수기 건의 월은 정산월에서 나온 값이라 여기서 못 바꾼다 —
                                  바꾸면 인센티브가 잡히는 달과 어긋난다. 칩으로만 보여 준다. */}
                              {f.source === 'manual' ? (
                                <span className="h-5 rounded border border-purple-200 bg-purple-50 px-1 text-[10px] leading-5 text-purple-700">
                                  {f.serviceMonth || '월 미지정'}
                                </span>
                              ) : (
                                <select
                                  value={f.serviceMonth || ''}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => { e.stopPropagation(); setServiceMonth(f, e.target.value) }}
                                  title="몇월 교육비"
                                  className={`h-5 rounded border px-1 text-[10px] ${f.serviceMonth ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-muted/40 text-muted-foreground border-border'}`}
                                >
                                  <option value="">월 미지정</option>
                                  {SERVICE_MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              )}
                              {f.source === 'manual' && isAdmin && <ManualFeeRowActions fee={f} />}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {f.source === 'manual' ? '수기' : f.source === 'ec' ? 'EC' : 'Academic'}
                            </div>
                            {/* 메모는 리마인더다 — 열어 봐야 알면 리마인더가 아니다 */}
                            {f.collectionMemo && (
                              <div className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700" title={f.collectionMemo}>
                                <StickyNote className="mt-px size-3 shrink-0" />
                                <span className="line-clamp-2">{f.collectionMemo}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {f.studentName}{f.studentKoreanName && f.studentKoreanName !== f.studentName ? ` · ${f.studentKoreanName}` : ''}
                      </TableCell>
                      <TableCell>
                        {rows.length > 0 ? (
                          <div className="space-y-1" onClick={e => e.stopPropagation()}>
                            {rows.map((c, i) => (
                              <div key={i} className="text-sm flex items-center gap-1.5">
                                <span className="min-w-[64px]">{c.name}</span>
                                {/* 수기 입금 건은 요율을 건별로 적어 두므로 팀과 무관하다.
                                    드롭다운을 두면 눌러도 아무 일이 없어(setTeam 에서 막음)
                                    팀을 바꾸면 요율이 바뀌는 것처럼 오해를 부른다. */}
                                {f.source === 'manual' ? (
                                  <Badge variant="outline" className="border-purple-200 bg-purple-50 px-1 py-0 text-[10px] text-purple-700">
                                    건별 {c.rate}%
                                  </Badge>
                                ) : isAdmin ? (
                                  <>
                                    <Select value={c.override || 'auto'} onValueChange={v => setTeam(f, c.slot, (v as 'auto' | ContributorTeam | 'none') || 'auto')}>
                                      <SelectTrigger className={`h-6 w-[86px] text-xs px-2 ${!c.team && c.override !== 'none' ? 'text-amber-600 border-amber-300' : ''}`}>
                                        <span className="truncate text-left">{c.override === 'none' ? '없음' : c.team ? teamLabel(c.team) : (c.source === 'auto' && c.team ? teamLabel(c.team) : t('svcpay.auto'))}</span>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto">{c.source === 'auto' && c.team ? t('svcpay.autoDetected', { team: teamLabel(c.team) }) : t('svcpay.auto')}</SelectItem>
                                        <SelectItem value="sales">{teamLabel('sales')}</SelectItem>
                                        <SelectItem value="service">{teamLabel('service')}</SelectItem>
                                        <SelectItem value="none">없음</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground w-8">{c.override === 'none' ? '없음' : c.team ? `${c.rate}%` : ''}</span>
                                  </>
                                ) : c.team ? (
                                  <Badge variant="outline" className={c.team === 'sales' ? 'text-blue-600 border-blue-200 px-1 py-0 text-[10px]' : 'text-emerald-600 border-emerald-200 px-1 py-0 text-[10px]'}>
                                    {teamLabel(c.team)} {c.rate}%
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-amber-600 border-amber-200 px-1 py-0 text-[10px]">{t('svcpay.teamUnknown')}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">{t('svcpay.notEntered')}</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {f.billedAmount ? formatCurrency(f.billedAmount, f.currency as 'KRW' | 'USD') : '-'}
                        {f.paidAmount != null && f.paidAmount !== f.billedAmount && (
                          <div className="text-[10px] text-muted-foreground font-normal" title="실제 입금금액(페이백 반영)">
                            실입금 {formatCurrency(f.paidAmount, f.currency as 'KRW' | 'USD')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {/* 수금완료·미수금은 입금금액·입금일에서 자동으로 잡히지만,
                              '인센티브가 발생해야 하나 취소된' 건은 자동으로 알 수 없다.
                              그래서 여기서 직접 고른다. */}
                          {isAdmin ? (
                            <Select value={f.collectionStatus} onValueChange={v => setCollectionStatus(f, v as CollectionStatus)}>
                              <SelectTrigger
                                className={`h-7 w-[108px] px-2 text-xs ${
                                  isPaid ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : isCancelled ? 'border-slate-300 bg-slate-50 text-slate-500'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                }`}
                                title={isCancelled ? t('svcpay.cancelledHint') : undefined}
                              >
                                <span className="truncate text-left">{t(isPaid ? 'svcpay.paid' : isCancelled ? 'svcpay.cancelled' : 'svcpay.unpaid')}</span>
                              </SelectTrigger>
                              <SelectContent>
                                {/* 수기 건은 들어온 돈을 적는 칸이라 미수금이 없다 */}
                                {f.source !== 'manual' && <SelectItem value="pending">{t('svcpay.unpaid')}</SelectItem>}
                                <SelectItem value="paid">{t('svcpay.paid')}</SelectItem>
                                <SelectItem value="cancelled">{t('svcpay.cancelled')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <CollectionStatusBadge status={f.collectionStatus} />
                          )}
                          <RefundCell fee={f} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {isCancelled ? (
                          // 숫자를 지우지 않고 그어서 보여 준다 — 얼마가 취소된 건지가 남아야 한다
                          <span className="text-xs text-slate-400 line-through" title={t('svcpay.cancelledHint')}>
                            {inc > 0 ? formatCurrency(inc, f.currency as 'KRW' | 'USD') : '-'}
                          </span>
                        ) : inc <= 0 ? (
                          <span className="text-xs text-muted-foreground">{needsTeam ? t('svcpay.needTeam') : '-'}</span>
                        ) : isPaid ? (
                          <span className="text-emerald-600">{formatCurrency(inc, f.currency as 'KRW' | 'USD')}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('svcpay.expected')} {formatCurrency(inc, f.currency as 'KRW' | 'USD')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <ProgramFeeDialog
          fee={selected}
          autoTeam={autoTeam}
          salesRate={ratesFor(selected.label).salesRate}
          serviceRate={ratesFor(selected.label).serviceRate}
          hasPartnerRate={partnerRateMap.has(normalizePartner(selected.label))}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ─── 환불 셀 (Student360에서 들어온 환불신청만 표시 · 재무는 완료 처리) ────────
function RefundCell({ fee }: { fee: ServiceProgramFee }) {
  const { user } = useAuth()
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()
  const createClawbacks = useCreateClawbacks()
  const saving = updateEC.isPending || updateAC.isPending
  const mut = fee.source === 'ec' ? updateEC : updateAC
  const [open, setOpen] = useState(false)
  // 수기 입금 건은 환불 처리 대상이 아니다 (EC·학습지원 테이블에 행이 없다)
  const isManual = fee.source === 'manual'
  const [amt, setAmt] = useState(fee.refundAmount ? String(fee.refundAmount) : (fee.billedAmount ? String(fee.billedAmount) : ''))
  const [dt, setDt] = useState(todayKST())
  const [cb1, setCb1] = useState('')
  const [cb2, setCb2] = useState('')
  const [deductM, setDeductM] = useState(nextMonthKey(todayKST()))
  const sName = fee.studentKoreanName || fee.studentName

  const save = (patch: { refundStatus: RefundStatus | null; refundAmount?: number | null; refundDate?: string | null; refundReason?: string | null }) =>
    mut.mutate({ id: fee.id, studentId: fee.studentId, ...patch }, { onSuccess: () => setOpen(false) })
  const submitComplete = () => {
    const n = Number(amt)
    if (!n || n <= 0) return
    mut.mutate(
      { id: fee.id, studentId: fee.studentId, refundStatus: 'completed', refundAmount: n, refundDate: dt || todayKST() },
      { onSuccess: () => {
          const items: ClawbackInput[] = []
          if (fee.contributor1?.trim() && Number(cb1) > 0) items.push({ source: 'service', sourceId: fee.id, studentName: sName, contributorName: fee.contributor1, amount: Number(cb1), reason: fee.refundReason, deductMonth: deductM })
          if (fee.contributor2?.trim() && Number(cb2) > 0) items.push({ source: 'service', sourceId: fee.id, studentName: sName, contributorName: fee.contributor2, amount: Number(cb2), reason: fee.refundReason, deductMonth: deductM })
          if (items.length) createClawbacks.mutate({ items, createdBy: user?.id })
          setOpen(false)
        } },
    )
  }
  const rs = fee.refundStatus

  // 수기 입금 건은 EC·학습지원 테이블에 행이 없어 환불 처리를 걸 데가 없다
  if (isManual) return <span className="text-muted-foreground">—</span>

  if (rs === 'completed') {
    return (
      <div className="flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
        <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">
          환불완료{fee.refundAmount != null ? ` · ${formatCurrency(fee.refundAmount, fee.currency as 'KRW' | 'USD')}` : ''}
        </Badge>
        {fee.refundDate && <Badge variant="outline" className="text-rose-500 border-rose-200">완료일 {fee.refundDate}</Badge>}
        <button disabled={saving} onClick={() => { if (confirm('환불 내역을 삭제할까요?')) save({ refundStatus: null, refundAmount: null, refundDate: null, refundReason: null }) }} className="text-gray-300 hover:text-gray-500" title="환불 내역 삭제"><X className="size-3" /></button>
      </div>
    )
  }
  if (rs === 'requested') {
    // Student360(컨설턴트)에서 들어온 환불신청 — 재무가 금액 확인·입력 후 완료 처리
    return (
      <div className="flex flex-wrap items-center gap-1" onClick={e => e.stopPropagation()}>
        <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">환불신청중</Badge>
        {fee.refundDate && <Badge variant="outline" className="text-orange-500 border-orange-200">신청일 {fee.refundDate}</Badge>}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="inline-flex h-6 items-center rounded-md border border-rose-300 bg-transparent px-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50">
            완료 처리
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2" align="start" onClick={e => e.stopPropagation()}>
            <div className="text-xs font-medium">환불 완료 처리 · {fee.label}</div>
            {fee.refundReason && (
              <div className="rounded-md bg-orange-50 border border-orange-200 px-2 py-1.5 text-[11px] text-orange-700 whitespace-pre-wrap">
                <span className="font-medium">신청 사유</span><br />{fee.refundReason}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">환불 금액 (실지급액)</label>
              <Input type="number" value={amt} onChange={e => setAmt(e.target.value)} className="h-8 text-sm" placeholder="0" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">환불 완료일</label>
              <Input type="date" value={dt} onChange={e => setDt(e.target.value)} className="h-8 text-sm" />
            </div>
            {(fee.contributor1 || fee.contributor2) && (
              <div className="space-y-1.5 border-t pt-2">
                <div className="text-[11px] font-medium text-violet-700">세일즈 인센티브 환급 (다음달 급여 차감)</div>
                {fee.contributor1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-14 truncate" title={fee.contributor1}>{fee.contributor1}</span>
                    <Input type="number" value={cb1} onChange={e => setCb1(e.target.value)} placeholder="차감액" className="h-7 text-xs" />
                  </div>
                )}
                {fee.contributor2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-14 truncate" title={fee.contributor2}>{fee.contributor2}</span>
                    <Input type="number" value={cb2} onChange={e => setCb2(e.target.value)} placeholder="차감액" className="h-7 text-xs" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] w-14 text-muted-foreground">차감월</span>
                  <Input type="month" value={deductM} onChange={e => setDeductM(e.target.value)} className="h-7 text-xs" />
                </div>
                <p className="text-[10px] text-muted-foreground">입력 시 담당자 알림 + 인보이스·지급원장에 (−) 자동 반영. 사유에 따라 차등 입력하세요.</p>
              </div>
            )}
            <Button size="sm" className="w-full h-8" disabled={saving || !Number(amt)} onClick={submitComplete}>환불완료 처리</Button>
            <button disabled={saving} onClick={() => { if (confirm('환불신청을 취소(삭제)할까요?')) save({ refundStatus: null, refundAmount: null, refundDate: null, refundReason: null }) }} className="w-full text-[11px] text-muted-foreground hover:text-destructive">환불신청 취소</button>
          </PopoverContent>
        </Popover>
      </div>
    )
  }
  // 환불 신청은 Student360(EC/학습지원 수정창)에서만 — 재무는 개시하지 않음
  return null
}

// ─── Detail / edit dialog ─────────────────────────────────────────────
type TeamChoice = 'auto' | 'sales' | 'service' | 'none'

function ProgramFeeDialog({
  fee,
  autoTeam,
  salesRate,
  serviceRate,
  hasPartnerRate,
  isAdmin,
  onClose,
}: {
  fee: ServiceProgramFee
  autoTeam: TeamResolver
  salesRate: number
  serviceRate: number
  hasPartnerRate: boolean
  isAdmin: boolean
  onClose: () => void
}) {
  const t = useT()
  const { user } = useAuth()
  const teamLabel = (team: ContributorTeam) => t(team === 'sales' ? 'svcpay.teamSales' : 'svcpay.teamService')
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()
  // 인센티브 환급(신청→완료)
  const createClawbacks = useCreateClawbacks()
  const { data: allClawbacks = [] } = useAllClawbacks()
  const setClawbackStatus = useSetClawbackStatus()
  const deleteClawback = useDeleteClawback()
  const feeClawbacks = allClawbacks.filter(c => c.source === 'service' && c.sourceId === fee.id)
  const [refundOpen, setRefundOpen] = useState(false)
  const [rcb1, setRcb1] = useState('')
  const [rcb2, setRcb2] = useState('')
  const [rMonth, setRMonth] = useState(nextMonthKey())
  const [rReason, setRReason] = useState('')
  const sName = fee.studentKoreanName || fee.studentName
  const submitFeeClawbacks = () => {
    const items: ClawbackInput[] = []
    if (fee.contributor1?.trim() && Number(rcb1) > 0) items.push({ source: 'service', sourceId: fee.id, studentName: sName, contributorName: fee.contributor1, amount: Number(rcb1), reason: rReason.trim() || undefined, deductMonth: rMonth })
    if (fee.contributor2?.trim() && Number(rcb2) > 0) items.push({ source: 'service', sourceId: fee.id, studentName: sName, contributorName: fee.contributor2, amount: Number(rcb2), reason: rReason.trim() || undefined, deductMonth: rMonth })
    if (!items.length) return
    createClawbacks.mutate({ items, createdBy: user?.id }, { onSuccess: () => { setRefundOpen(false); setRcb1(''); setRcb2(''); setRReason('') } })
  }

  const [billed, setBilled] = useState(fee.billedAmount ? String(fee.billedAmount) : '')
  const [paidAmt, setPaidAmt] = useState(fee.paidAmount != null ? String(fee.paidAmount) : '')
  const [paidDt, setPaidDt] = useState(fee.paidDate || '')
  const [name1, setName1] = useState(fee.contributor1 || '')
  const [name2, setName2] = useState(fee.contributor2 || '')
  const [team1, setTeam1] = useState<TeamChoice>(fee.contributor1Team || 'auto')
  const [team2, setTeam2] = useState<TeamChoice>(fee.contributor2Team || 'auto')
  // 수금 특이사항. Student 360 에 보이는 프로그램 메모와 섞이면 안 돼 따로 둔 칸이다.
  const [memo, setMemo] = useState(fee.collectionMemo || '')
  // 발생취소 — 인센티브가 발생해야 하나 취소된 건. 입금 기록으로는 알 수 없어 직접 고른다.
  const [cancelled, setCancelled] = useState(fee.collectionStatus === 'cancelled')

  const saving = updateEC.isPending || updateAC.isPending
  const billedNum = Number(billed) || 0
  const paidAmtNum = Number(paidAmt) || 0
  // 입금금액 + 입금일이 모두 기록되면 자동 수금완료. 인센티브는 청구금액(billedNum) 기준.
  // 발생취소를 고르면 입금 기록이 있어도 수금완료로 올리지 않는다.
  const autoPaid = paidAmtNum > 0 && !!paidDt
  const status: CollectionStatus = cancelled ? 'cancelled' : autoPaid ? 'paid' : 'pending'
  const isPaid = status === 'paid'

  /** 수금상태를 직접 고를 때 입금 칸도 함께 맞춘다 (발생취소는 입금 기록을 건드리지 않는다). */
  const pickStatus = (v: CollectionStatus) => {
    if (v === 'cancelled') { setCancelled(true); return }
    setCancelled(false)
    if (v === 'paid') {
      if (!paidDt) setPaidDt(todayKST())
      if (!paidAmtNum) setPaidAmt(billed || '')
    } else {
      setPaidAmt('')
      setPaidDt('')
    }
  }

  const slots = [
    { name: name1, setName: setName1, team: team1, setTeam: setTeam1 },
    { name: name2, setName: setName2, team: team2, setTeam: setTeam2 },
  ]
  // effective team + rate + incentive per contributor (from current form state)
  const resolve = (name: string, choice: TeamChoice): { team?: ContributorTeam; rate: number; inc: number; auto?: ContributorTeam } => {
    const auto = autoTeam(name)
    if (choice === 'none') return { team: undefined, rate: 0, inc: 0, auto }  // 인센티브 없음
    const team = choice === 'auto' ? auto : choice
    const rate = rateForTeam(team, salesRate, serviceRate)
    return { team, rate, inc: rate ? Math.round((billedNum * rate) / 100) : 0, auto }
  }
  const totalInc = slots.reduce((s, c) => s + (c.name.trim() ? resolve(c.name, c.team).inc : 0), 0)

  const handleSave = () => {
    const payload = {
      id: fee.id,
      studentId: fee.studentId,
      billedAmount: billed ? Number(billed) : undefined,
      paidAmount: paidAmt ? paidAmtNum : null,
      // 입금금액·입금일이 모두 있으면 수금완료로 자동 처리(그 달 인센티브 반영).
      // 발생취소는 직접 고른 값이라 자동 판정보다 우선한다.
      collectionStatus: status,
      // 발생취소는 돈이 들어온 건일 수 있어 입금일을 지우지 않는다
      paidDate: cancelled || isPaid ? paidDt : '',
      salesContributor1: name1.trim() || undefined,
      salesContributor2: name2.trim() || undefined,
      contributor1Team: team1 === 'auto' ? null : team1,
      contributor2Team: team2 === 'auto' ? null : team2,
      collectionMemo: memo.trim() || undefined,
    }
    if (fee.source === 'manual') { onClose(); return }
    const mut = fee.source === 'ec' ? updateEC : updateAC
    mut.mutate(payload, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-purple-500" />
            {fee.label}
          </DialogTitle>
          <DialogDescription>
            {fee.studentName}{fee.studentKoreanName && fee.studentKoreanName !== fee.studentName ? ` · ${fee.studentKoreanName}` : ''} · {fee.source === 'manual' ? '수기 입금' : fee.source === 'ec' ? 'Extra Curricular' : 'Academic Support'}{fee.serviceMonth ? ` · ${fee.serviceMonth} 교육비` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LinkIcon className="size-3" />
          {t('svcpay.contributorsNote')}
          <Link to={`/service/student-360?student=${fee.studentId}`} className="text-blue-600 hover:underline" onClick={onClose}>
            {t('svcpay.viewStudent360')}
          </Link>
        </div>

        {/* Billing (admin editable): 청구금액 + 입금금액 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t('svcpay.colBilled')} <span className="text-[10px] font-normal text-purple-600">(인센티브 기준)</span>
            </label>
            {isAdmin ? (
              <Input type="number" value={billed} onChange={e => setBilled(e.target.value)} placeholder="0" className="h-8 text-sm" />
            ) : <div className="text-sm font-mono">{fee.billedAmount ? formatCurrency(fee.billedAmount, fee.currency as 'KRW' | 'USD') : '-'}</div>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              입금금액 <span className="text-[10px] font-normal">(실입금·페이백 반영)</span>
            </label>
            {isAdmin ? (
              <Input type="number" value={paidAmt} onChange={e => setPaidAmt(e.target.value)} placeholder="0" className="h-8 text-sm" />
            ) : <div className="text-sm font-mono">{fee.paidAmount != null ? formatCurrency(fee.paidAmount, fee.currency as 'KRW' | 'USD') : '-'}</div>}
          </div>
        </div>

        {/* 입금일 + 자동 수금상태 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">입금일</label>
            {isAdmin ? (
              <Input type="date" value={paidDt} onChange={e => setPaidDt(e.target.value)} className="h-8 text-sm" />
            ) : <div className="text-sm">{fee.paidDate || '-'}</div>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('svcpay.status')}</label>
            {isAdmin && fee.source !== 'manual' ? (
              <Select value={status} onValueChange={v => pickStatus(v as CollectionStatus)}>
                <SelectTrigger className={`h-8 text-sm ${cancelled ? 'border-slate-300 bg-slate-50 text-slate-500' : isPaid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                  <span className="truncate text-left">{t(isPaid ? 'svcpay.paid' : cancelled ? 'svcpay.cancelled' : 'svcpay.unpaid')}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('svcpay.unpaid')}</SelectItem>
                  <SelectItem value="paid">{t('svcpay.paid')}</SelectItem>
                  <SelectItem value="cancelled">{t('svcpay.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="h-8 flex items-center"><CollectionStatusBadge status={status} /></div>
            )}
            {isAdmin && (
              <p className="text-[10px] text-muted-foreground">
                {cancelled ? t('svcpay.cancelledHint') : '입금금액·입금일 입력 시 자동 수금완료'}
              </p>
            )}
          </div>
        </div>

        {/* 환불 상태 (읽기전용 · 환불신청은 Student360에서, 완료 처리는 표의 배지에서) */}
        {fee.refundStatus && (
          <div className={`rounded-md border px-3 py-2 text-xs ${fee.refundStatus === 'completed' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
            {fee.refundStatus === 'completed' ? '환불완료' : '환불신청중'}
            {fee.refundAmount != null && <> · <span className="font-mono">{formatCurrency(fee.refundAmount, fee.currency as 'KRW' | 'USD')}</span></>}
            {fee.refundDate && <> · {fee.refundStatus === 'completed' ? '완료일' : '신청일'} {fee.refundDate}</>}
            {fee.refundReason && <div className="mt-1 whitespace-pre-wrap">사유: {fee.refundReason}</div>}
          </div>
        )}

        {/* 세일즈 인센티브 환급 (신청→완료) */}
        {isAdmin && (fee.contributor1 || fee.contributor2) && (
          <div className="rounded-md border border-rose-200 bg-rose-50/40 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700">세일즈 인센티브 환급</span>
              <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1 text-rose-700 border-rose-200 hover:bg-rose-100"
                onClick={() => { if (!refundOpen) { setRMonth(nextMonthKey(fee.refundDate || undefined)); setRcb1(''); setRcb2(''); setRReason('') } setRefundOpen(v => !v) }}>
                {refundOpen ? '닫기' : '환급금 신청'}
              </Button>
            </div>
            {refundOpen && (
              <div className="space-y-1.5">
                {fee.contributor1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-16 truncate" title={fee.contributor1}>{fee.contributor1}</span>
                    <Input type="number" value={rcb1} onChange={e => setRcb1(e.target.value)} placeholder="환급액" className="h-7 text-xs" />
                  </div>
                )}
                {fee.contributor2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] w-16 truncate" title={fee.contributor2}>{fee.contributor2}</span>
                    <Input type="number" value={rcb2} onChange={e => setRcb2(e.target.value)} placeholder="환급액" className="h-7 text-xs" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">반영월</label>
                    <Input type="month" value={rMonth} onChange={e => setRMonth(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">사유</label>
                    <Input value={rReason} onChange={e => setRReason(e.target.value)} placeholder="차등 근거" className="h-7 text-xs" />
                  </div>
                </div>
                <Button size="sm" className="w-full h-7 bg-rose-600 hover:bg-rose-700" disabled={createClawbacks.isPending} onClick={submitFeeClawbacks}>환급 신청 저장 · 알림</Button>
              </div>
            )}
            {/* 환급 현황 */}
            {feeClawbacks.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1.5 text-[11px] flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className={c.status === 'deducted' ? 'text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px] h-4' : 'text-rose-700 border-rose-200 bg-rose-50 text-[10px] h-4'}>{c.status === 'deducted' ? '환급완료' : '환급신청'}</Badge>
                  <span className="font-medium">{c.contributorName}</span>
                  <span className="font-mono text-rose-600">−{formatCurrency(c.amount, 'KRW')}</span>
                  <span className="text-muted-foreground">· {c.deductMonth}</span>
                </div>
                <div className="flex items-center gap-1">
                  <select value={c.status} onChange={e => setClawbackStatus.mutate({ id: c.id, status: e.target.value as 'pending' | 'deducted' })} disabled={setClawbackStatus.isPending}
                    className="h-6 rounded border border-input bg-transparent px-1 text-[11px] outline-none">
                    <option value="pending">환급신청</option>
                    <option value="deducted">환급완료</option>
                  </select>
                  <button onClick={() => { if (confirm('이 환급 건을 삭제할까요?')) deleteClawback.mutate(c.id) }} className="text-gray-300 hover:text-destructive"><X className="size-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700">
          {hasPartnerRate
            ? t('svcpay.partnerRateBanner', { partner: fee.label, sales: salesRate, service: serviceRate })
            : t('svcpay.defaultRateBanner', { sales: salesRate, service: serviceRate })}
        </div>

        {/* Contributors + team + incentive */}
        <div className="space-y-2 pt-2 border-t">
          <div className="grid grid-cols-[1fr_130px_auto] items-center gap-2 text-[11px] text-muted-foreground px-1">
            <span>{t('svcpay.contributorsHead')}</span><span className="text-center">{t('svcpay.teamHead')}</span><span className="w-24 text-right">{t('svcpay.colIncentive')}</span>
          </div>
          {slots.map((c, i) => {
            const r = resolve(c.name, c.team)
            const detected = r.auto ? t('svcpay.autoDetected', { team: teamLabel(r.auto) }) : t('svcpay.autoUnknown')
            return (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                <Input
                  value={c.name}
                  onChange={e => c.setName(e.target.value)}
                  placeholder={i === 0 ? t('svcpay.contribName1') : t('svcpay.contribName2')}
                  className="h-8 text-sm"
                  disabled={!isAdmin}
                />
                <Select value={c.team} onValueChange={v => c.setTeam((v as TeamChoice) || 'auto')} disabled={!isAdmin || !c.name.trim()}>
                  <SelectTrigger className="h-8 text-xs">
                    <span className="truncate text-left">{c.team === 'none' ? '없음' : c.team === 'sales' ? teamLabel('sales') : c.team === 'service' ? teamLabel('service') : detected}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{detected}</SelectItem>
                    <SelectItem value="sales">{teamLabel('sales')} ({salesRate}%)</SelectItem>
                    <SelectItem value="service">{teamLabel('service')} ({serviceRate}%)</SelectItem>
                    <SelectItem value="none">없음</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm font-mono w-24 text-right">
                  {c.name.trim() && r.inc > 0 ? formatCurrency(r.inc, fee.currency as 'KRW' | 'USD') : '-'}
                </span>
              </div>
            )
          })}
          <div className="flex items-center justify-between text-sm pt-1 border-t">
            <span className="text-muted-foreground">{t('svcpay.totalIncentive')}</span>
            <span className={`font-mono font-medium ${cancelled ? 'text-slate-400 line-through' : ''}`} title={cancelled ? t('svcpay.cancelledHint') : undefined}>
              {totalInc > 0 ? formatCurrency(totalInc, fee.currency as 'KRW' | 'USD') : '-'}
            </span>
          </div>
        </div>

        {/* 수금 특이사항 — 리마인더로 쓰는 칸이라 목록의 행에도 함께 보여 준다.
            수기 입금 건은 이 창에서 저장하지 않으므로(제 창이 따로 있다) 내보내지 않는다. */}
        {fee.source !== 'manual' && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              메모 <span className="font-normal">· 특이사항·다음에 확인할 것</span>
            </label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              disabled={!isAdmin}
              rows={2}
              placeholder="예: 11월 입금 예정 · 페이백 5% 별도 정산 · 담당자 변경 확인 필요"
              className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted/40"
            />
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">{t('svcpay.footerNote')}</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('svcpay.close')}</Button>
          {isAdmin ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}{t('svcpay.save')}
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" /> {t('svcpay.adminOnly')}</span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────── 수기 입금 입력 ───────────────────
/**
 * 정기 수업이 아니라 달마다 불규칙하게 수업하고 그때그때 정산금이 들어오는 건을 적는다.
 * Student 360 에 걸 프로그램이 없어 어디에도 기록되지 않던 돈이다.
 *
 * 적는 순간 수금 완료로 보고, 고른 정산월이 곧 인센티브가 잡히는 달이 된다.
 * 인센티브 = 입금액 × 요율. 요율은 파트너사 수수료표가 아니라 건별로 직접 고른다
 * (불규칙 정산이라 기준율이 맞지 않고, 걸린 파트너사도 없다).
 */
function ManualFeeForm({ fee, onDone }: { fee?: ServiceProgramFee; onDone: () => void }) {
  const { user } = useAuth()
  const create = useCreateManualServiceFee()
  const update = useUpdateManualServiceFee()
  const { data: students = [] } = useServiceStudents()
  const { data: profiles = [] } = useProfiles()
  const editing = !!fee

  const [form, setForm] = useState(() => ({
    studentId: fee?.studentId || '',
    month: fee?.settlementMonth || todayKST().slice(0, 7),
    title: fee?.manualTitle || '',
    amount: fee?.billedAmount != null ? String(fee.billedAmount) : '',
    rate: String(fee?.incentiveRate ?? 3),
    contributor: fee?.contributor1 || '',
  }))
  const [error, setError] = useState('')

  const studentOptions = useMemo(
    () => [...students].filter(s => s.name || s.koreanName).sort(compareStudentsKo),
    [students],
  )
  // 부서로 거르지 않는다 — 어느 팀이든 담당자가 될 수 있다.
  // 퇴사자도 남긴다: 옛 건을 수정할 때 이름이 목록에 없으면 담당자가 지워져 버린다.
  const staff = useMemo(
    () => [...profiles].filter(p => !p.isExternal && p.name)
      .sort((a, b) => Number(a.resigned) - Number(b.resigned) || a.name.localeCompare(b.name, 'ko')),
    [profiles],
  )

  const amount = Number(form.amount) || 0
  const rate = Number(form.rate) || 0
  const incentive = Math.round((amount * rate) / 100)
  const studentName = (id: string) => {
    const s = studentOptions.find(x => x.id === id)
    return s ? studentPickerLabel(s) : ''
  }

  const pending = create.isPending || update.isPending
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : '저장하지 못했습니다.')

  const submit = () => {
    setError('')
    if (!form.studentId) return setError('학생을 골라 주세요.')
    if (!/^\d{4}-\d{2}$/.test(form.month)) return setError('정산월을 골라 주세요.')
    if (amount <= 0) return setError('입금액을 적어 주세요.')
    if (!form.contributor) return setError('담당자를 골라 주세요. 담당자가 없으면 인센티브가 잡히지 않습니다.')
    const values = {
      studentId: form.studentId,
      settlementMonth: form.month,
      title: form.title,
      billedAmount: amount,
      incentiveRate: rate,
      contributor1: form.contributor,
    }
    if (fee) {
      update.mutate({ id: fee.id, ...values }, { onSuccess: onDone, onError: fail })
    } else {
      // 적은 사람은 처음 적을 때만 남긴다 — 나중에 고친 사람으로 덮어쓰지 않는다
      create.mutate(
        { ...values, createdBy: user?.id, authorName: user?.name },
        { onSuccess: onDone, onError: fail },
      )
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div className="space-y-1 col-span-2">
          <label className="text-[11px] text-muted-foreground">학생</label>
          <Select value={form.studentId} onValueChange={v => setForm(f => ({ ...f, studentId: v ?? '' }))}>
            <SelectTrigger className="h-8 w-full text-sm">
              <span className="truncate">{studentName(form.studentId) || '선택'}</span>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {studentOptions.map(s => (
                // 동명이인이 많아 이름만으로는 고르기 어렵다 — 담당 컨설턴트를 함께 보여 준다
                <SelectItem key={s.id} value={s.id}>
                  {studentPickerLabel(s)}
                  {s.assignedConsultant && (
                    <span className="text-muted-foreground"> — {s.assignedConsultant}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">정산월</label>
          <Input
            type="month" value={form.month} className="h-8 text-sm"
            onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">입금액</label>
          <Input
            type="number" value={form.amount} placeholder="0" className="h-8 text-sm"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">인센티브 율</label>
          <Select value={form.rate} onValueChange={v => setForm(f => ({ ...f, rate: v ?? '3' }))}>
            <SelectTrigger className="h-8 w-full text-sm">
              <span>{form.rate}%</span>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(r => (
                <SelectItem key={r} value={r}>{r}%</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Sales Contributor</label>
          <Select value={form.contributor} onValueChange={v => setForm(f => ({ ...f, contributor: v ?? '' }))}>
            <SelectTrigger className="h-8 w-full text-sm">
              <span className="truncate">{form.contributor || '선택'}</span>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {staff.map(p => (
                <SelectItem key={p.id} value={p.name}>{p.name}{p.resigned ? ' (퇴사)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">내용 (선택)</label>
          <Input
            value={form.title} className="h-8 text-sm"
            placeholder="예: 10월 비정기 수업 4회 정산"
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">인센티브 (입금액 × {rate}%)</div>
            <div className="text-base font-bold tabular-nums text-blue-600">{formatCurrency(incentive)}</div>
          </div>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : editing ? '저장' : '추가'}
          </Button>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        적는 순간 <b>수금 완료</b>로 들어가고, 고른 <b>정산월</b>이 그대로 인센티브가 잡히는 달이 됩니다
        (재무 대시보드 인센티브 원장 · 담당자 개인 인센티브 인보이스).
      </p>
    </div>
  )
}

/** 목록 위의 접힌 [수기 입금 추가] 버튼과 펼친 입력 칸. */
function ManualFeeEntry() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> 수기 입금 추가
      </Button>
    )
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <PencilLine className="size-4 text-purple-600" />
          <h3 className="text-sm font-semibold">수기 입금 추가</h3>
          <span className="text-[11px] text-muted-foreground ml-1">
            불규칙 수업 정산처럼 Student 360 프로그램에 걸 수 없는 입금을 직접 적습니다
          </span>
          <Button size="sm" variant="ghost" className="size-7 ml-auto" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </Button>
        </div>
        {/* 닫으면 폼이 사라져 입력값도 함께 비워진다 */}
        <ManualFeeForm onDone={() => setOpen(false)} />
      </CardContent>
    </Card>
  )
}

/**
 * 수기 입금 행의 수정·삭제. EC·학습지원 행은 Student 360 이 원본이라 여기서 고칠 수
 * 없지만, 수기 건은 이 줄이 원본이므로 여기서만 고치고 지울 수 있다.
 */
function ManualFeeRowActions({ fee }: { fee: ServiceProgramFee }) {
  const del = useDeleteManualServiceFee()
  const [editing, setEditing] = useState(false)

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        className="text-gray-300 hover:text-blue-600"
        title="수기 입금 수정"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        onClick={e => {
          e.stopPropagation()
          if (confirm('이 수기 입금 내역을 삭제할까요? 인센티브에서도 빠집니다.')) del.mutate(fee.id)
        }}
        className="text-gray-300 hover:text-red-500"
        title="수기 입금 삭제"
      >
        <Trash2 className="size-3.5" />
      </button>

      {/* 행 클릭(상세 열기)과 겹치지 않게 입력 칸은 창으로 띄운다 */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-3xl" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <PencilLine className="size-4 text-purple-600" /> 수기 입금 수정
            </DialogTitle>
            <DialogDescription>
              {fee.studentName}
              {fee.studentKoreanName && fee.studentKoreanName !== fee.studentName ? ` · ${fee.studentKoreanName}` : ''}
              {fee.settlementMonth ? ` · ${fee.settlementMonth} 정산` : ''}
            </DialogDescription>
          </DialogHeader>
          <ManualFeeForm fee={fee} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
