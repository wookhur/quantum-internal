import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, Search, CheckCircle2, Clock, HandCoins, Lock, Link as LinkIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAllServiceProgramFees, type ServiceProgramFee } from '@/hooks/useServiceProgramFees'
import { useUpdateECActivity } from '@/hooks/useECActivities'
import { useUpdateAcademicSupport } from '@/hooks/useAcademicSupport'
import { useDefaultRates, usePartnerRateMap, normalizePartner, rateForTeam, type ContributorTeam } from '@/hooks/usePartnerCommissionRates'
import { useProfiles, canManageServiceFinance } from '@/hooks/useProfiles'
import { consultantNameKey } from '@/lib/consultants'
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'
import { formatCurrency } from '@/types'

/** Resolve a contributor name → team from 인사관리 department. */
type TeamResolver = (name: string | undefined) => ContributorTeam | undefined

interface ContribRow {
  name: string
  slot: 0 | 1                  // which contributor slot (for saving the override)
  override?: ContributorTeam | null  // manually-set team (null/undefined = auto)
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
  const slots: { slot: 0 | 1; name?: string; override?: ContributorTeam | null }[] = [
    { slot: 0, name: f.contributor1, override: f.contributor1Team },
    { slot: 1, name: f.contributor2, override: f.contributor2Team },
  ]
  const out: ContribRow[] = []
  for (const s of slots) {
    if (!s.name?.trim()) continue
    const auto = autoTeam(s.name)
    const team = s.override ?? auto
    const source: ContribRow['source'] = s.override ? 'manual' : auto ? 'auto' : 'none'
    const rate = rateForTeam(team, salesRate, serviceRate)
    out.push({ name: s.name, slot: s.slot, override: s.override, team, source, rate, inc: rate ? Math.round((billed * rate) / 100) : 0 })
  }
  return out
}

/** Total incentive for an item across all contributors. */
function incentiveOf(f: ServiceProgramFee, autoTeam: TeamResolver, salesRate: number, serviceRate: number): number {
  return contributorRows(f, autoTeam, salesRate, serviceRate).reduce((s, c) => s + c.inc, 0)
}

const TEAM_LABEL: Record<ContributorTeam, string> = { sales: '세일즈', service: '서비스' }

export function ExternalFeesPage() {
  const { user } = useAuth()
  const { data: fees = [], isLoading } = useAllServiceProgramFees()
  const { salesRate: defSales, serviceRate: defService } = useDefaultRates()
  const { map: partnerRateMap } = usePartnerRateMap()
  const { data: profiles = [] } = useProfiles()
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // set a contributor's team inline from the list (auto = clear override → null)
  const setTeam = (f: ServiceProgramFee, slot: 0 | 1, choice: 'auto' | ContributorTeam) => {
    const val = choice === 'auto' ? null : choice
    const base = { id: f.id, studentId: f.studentId }
    const payload = slot === 0 ? { ...base, contributor1Team: val } : { ...base, contributor2Team: val }
    ;(f.source === 'ec' ? updateEC : updateAC).mutate(payload)
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
  const collected = fees.filter(f => f.collectionStatus === 'paid').reduce((s, f) => s + (f.billedAmount || 0), 0)
  // 총 인센티브 = 수금 완료된 항목의 (기여자별 적용 수수료율 합계)
  const totalIncentive = fees
    .filter(f => f.collectionStatus === 'paid')
    .reduce((s, f) => { const r = ratesFor(f.label); return s + incentiveOf(f, autoTeam, r.salesRate, r.serviceRate) }, 0)

  const selected = selectedId ? fees.find(f => f.id === selectedId) ?? null : null

  // 열람 권한: 대표·부대표·재무이사만
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">서비스입금관리는 관리자만 열람할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">서비스입금관리</h1>
        <p className="text-sm text-muted-foreground">
          기존 고객에게 세일즈한 EC·Academic 서비스(Student 360 기준)의 금액·수금상태·기여자를 관리합니다. 인센티브는 기여자의 <b>소속팀(세일즈/서비스)</b>에 따라 <b>수수료관리</b>에서 정한 팀별 수수료율(청구금액 × 율)로 계산되며, 수금 완료 시 확정됩니다.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card className="border-l-[3px] border-l-purple-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">프로그램 항목</div>
            <div className="text-2xl font-bold mt-1">{fees.length}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-orange-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">총 청구금액</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(totalBilled)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-emerald-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">수금 완료</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(collected)}</div>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-blue-400">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-muted-foreground">총 인센티브</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totalIncentive)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="학생, 프로그램, 기여자 검색..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Student 360에서 입력된 EC·Academic 프로그램이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>프로그램</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>수수료 대상</TableHead>
                  <TableHead className="text-right">청구금액</TableHead>
                  <TableHead>수금상태</TableHead>
                  <TableHead className="text-right">인센티브</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => {
                  const er = ratesFor(f.label)
                  const rows = contributorRows(f, autoTeam, er.salesRate, er.serviceRate)
                  const inc = rows.reduce((s, c) => s + c.inc, 0)
                  const needsTeam = rows.some(c => !c.team)
                  const isPaid = f.collectionStatus === 'paid'
                  return (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(f.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HandCoins className="size-4 text-purple-500 shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{f.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {f.source === 'ec' ? 'EC' : 'Academic'}
                            </div>
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
                                {isAdmin ? (
                                  <>
                                    <Select value={c.override || 'auto'} onValueChange={v => setTeam(f, c.slot, (v as 'auto' | ContributorTeam) || 'auto')}>
                                      <SelectTrigger className={`h-6 w-[86px] text-xs px-2 ${!c.team ? 'text-amber-600 border-amber-300' : ''}`}><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="auto">{c.source === 'auto' && c.team ? `자동(${TEAM_LABEL[c.team]})` : '자동'}</SelectItem>
                                        <SelectItem value="sales">세일즈</SelectItem>
                                        <SelectItem value="service">서비스</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground w-8">{c.team ? `${c.rate}%` : ''}</span>
                                  </>
                                ) : c.team ? (
                                  <Badge variant="outline" className={c.team === 'sales' ? 'text-blue-600 border-blue-200 px-1 py-0 text-[10px]' : 'text-emerald-600 border-emerald-200 px-1 py-0 text-[10px]'}>
                                    {TEAM_LABEL[c.team]} {c.rate}%
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-amber-600 border-amber-200 px-1 py-0 text-[10px]">팀 미확인</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">미입력</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {f.billedAmount ? formatCurrency(f.billedAmount, f.currency as 'KRW' | 'USD') : '-'}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="size-3" /> 수금 완료</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1"><Clock className="size-3" /> 미수금</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inc <= 0 ? (
                          <span className="text-xs text-muted-foreground">{needsTeam ? '팀 지정 필요' : '-'}</span>
                        ) : isPaid ? (
                          <span className="text-emerald-600">{formatCurrency(inc, f.currency as 'KRW' | 'USD')}</span>
                        ) : (
                          <span className="text-muted-foreground">예정 {formatCurrency(inc, f.currency as 'KRW' | 'USD')}</span>
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

// ─── Detail / edit dialog ─────────────────────────────────────────────
type TeamChoice = 'auto' | 'sales' | 'service'

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
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()

  const [billed, setBilled] = useState(fee.billedAmount ? String(fee.billedAmount) : '')
  const [status, setStatus] = useState<'pending' | 'paid'>(fee.collectionStatus)
  const [name1, setName1] = useState(fee.contributor1 || '')
  const [name2, setName2] = useState(fee.contributor2 || '')
  const [team1, setTeam1] = useState<TeamChoice>(fee.contributor1Team || 'auto')
  const [team2, setTeam2] = useState<TeamChoice>(fee.contributor2Team || 'auto')

  const saving = updateEC.isPending || updateAC.isPending
  const billedNum = Number(billed) || 0

  const slots = [
    { name: name1, setName: setName1, team: team1, setTeam: setTeam1 },
    { name: name2, setName: setName2, team: team2, setTeam: setTeam2 },
  ]
  // effective team + rate + incentive per contributor (from current form state)
  const resolve = (name: string, choice: TeamChoice): { team?: ContributorTeam; rate: number; inc: number; auto?: ContributorTeam } => {
    const auto = autoTeam(name)
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
      collectionStatus: status,
      // stamp a collection date when paid; clear it ('' → null) when pending
      paidDate: status === 'paid' ? (fee.paidDate || todayKST()) : '',
      salesContributor1: name1.trim() || undefined,
      salesContributor2: name2.trim() || undefined,
      contributor1Team: team1 === 'auto' ? null : team1,
      contributor2Team: team2 === 'auto' ? null : team2,
    }
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
            {fee.studentName}{fee.studentKoreanName && fee.studentKoreanName !== fee.studentName ? ` · ${fee.studentKoreanName}` : ''} · {fee.source === 'ec' ? 'Extra Curricular' : 'Academic Support'}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LinkIcon className="size-3" />
          기여자는 Student 360에서 세일즈한 담당자입니다.
          <Link to={`/service/student-360?student=${fee.studentId}`} className="text-blue-600 hover:underline" onClick={onClose}>
            Student 360에서 보기
          </Link>
        </div>

        {/* Billing (admin editable) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">청구금액</label>
            {isAdmin ? (
              <Input type="number" value={billed} onChange={e => setBilled(e.target.value)} placeholder="0" className="h-8 text-sm" />
            ) : <div className="text-sm font-mono">{fee.billedAmount ? formatCurrency(fee.billedAmount, fee.currency as 'KRW' | 'USD') : '-'}</div>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">수금상태</label>
            {isAdmin ? (
              <Select value={status} onValueChange={v => setStatus((v as 'pending' | 'paid') ?? 'pending')}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">미수금</SelectItem>
                  <SelectItem value="paid">수금 완료</SelectItem>
                </SelectContent>
              </Select>
            ) : <div className="text-sm">{fee.collectionStatus === 'paid' ? '수금 완료' : '미수금'}</div>}
          </div>
        </div>

        <div className="rounded-md border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700">
          {hasPartnerRate
            ? <>이 파트너사({fee.label})는 개별 수수료율(세일즈 <b>{salesRate}%</b> / 서비스 <b>{serviceRate}%</b>)이 적용됩니다.</>
            : <>기본 수수료율(세일즈 <b>{salesRate}%</b> / 서비스 <b>{serviceRate}%</b>)이 적용됩니다.</>}
        </div>

        {/* Contributors + team + incentive */}
        <div className="space-y-2 pt-2 border-t">
          <div className="grid grid-cols-[1fr_130px_auto] items-center gap-2 text-[11px] text-muted-foreground px-1">
            <span>기여자 (세일즈 담당)</span><span className="text-center">소속팀</span><span className="w-24 text-right">인센티브</span>
          </div>
          {slots.map((c, i) => {
            const r = resolve(c.name, c.team)
            const detected = r.auto ? `자동 (${TEAM_LABEL[r.auto]})` : '자동 (미확인)'
            return (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                <Input
                  value={c.name}
                  onChange={e => c.setName(e.target.value)}
                  placeholder={i === 0 ? '기여자 이름' : '기여자 2 (선택)'}
                  className="h-8 text-sm"
                  disabled={!isAdmin}
                />
                <Select value={c.team} onValueChange={v => c.setTeam((v as TeamChoice) || 'auto')} disabled={!isAdmin || !c.name.trim()}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{detected}</SelectItem>
                    <SelectItem value="sales">세일즈 ({salesRate}%)</SelectItem>
                    <SelectItem value="service">서비스 ({serviceRate}%)</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm font-mono w-24 text-right">
                  {c.name.trim() && r.inc > 0 ? formatCurrency(r.inc, fee.currency as 'KRW' | 'USD') : '-'}
                </span>
              </div>
            )
          })}
          <div className="flex items-center justify-between text-sm pt-1 border-t">
            <span className="text-muted-foreground">총 인센티브</span>
            <span className="font-mono font-medium">{totalInc > 0 ? formatCurrency(totalInc, fee.currency as 'KRW' | 'USD') : '-'}</span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          수수료율은 <b>수수료관리</b>(파트너 &gt; 수수료관리)에서 설정합니다. 기본은 소속팀(세일즈/서비스) 기준이며 <b>인사관리</b>로 자동 판별됩니다.
          "자동 (미확인)"이면 여기서 팀을 직접 지정하세요. 파트너사에 개별 수수료율이 지정돼 있으면 그 율이 우선 적용됩니다.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
          {isAdmin ? (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}저장
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" /> admin만 편집할 수 있습니다</span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
