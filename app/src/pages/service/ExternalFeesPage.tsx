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
import { useT } from '@/i18n/LanguageContext'
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
                                        <SelectItem value="auto">{c.source === 'auto' && c.team ? t('svcpay.autoDetected', { team: teamLabel(c.team) }) : t('svcpay.auto')}</SelectItem>
                                        <SelectItem value="sales">{teamLabel('sales')}</SelectItem>
                                        <SelectItem value="service">{teamLabel('service')}</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground w-8">{c.team ? `${c.rate}%` : ''}</span>
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
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="size-3" /> {t('svcpay.paid')}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1"><Clock className="size-3" /> {t('svcpay.unpaid')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inc <= 0 ? (
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
  const t = useT()
  const teamLabel = (team: ContributorTeam) => t(team === 'sales' ? 'svcpay.teamSales' : 'svcpay.teamService')
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
          {t('svcpay.contributorsNote')}
          <Link to={`/service/student-360?student=${fee.studentId}`} className="text-blue-600 hover:underline" onClick={onClose}>
            {t('svcpay.viewStudent360')}
          </Link>
        </div>

        {/* Billing (admin editable) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('svcpay.colBilled')}</label>
            {isAdmin ? (
              <Input type="number" value={billed} onChange={e => setBilled(e.target.value)} placeholder="0" className="h-8 text-sm" />
            ) : <div className="text-sm font-mono">{fee.billedAmount ? formatCurrency(fee.billedAmount, fee.currency as 'KRW' | 'USD') : '-'}</div>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('svcpay.status')}</label>
            {isAdmin ? (
              <Select value={status} onValueChange={v => setStatus((v as 'pending' | 'paid') ?? 'pending')}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('svcpay.unpaid')}</SelectItem>
                  <SelectItem value="paid">{t('svcpay.paid')}</SelectItem>
                </SelectContent>
              </Select>
            ) : <div className="text-sm">{fee.collectionStatus === 'paid' ? t('svcpay.paid') : t('svcpay.unpaid')}</div>}
          </div>
        </div>

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
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{detected}</SelectItem>
                    <SelectItem value="sales">{teamLabel('sales')} ({salesRate}%)</SelectItem>
                    <SelectItem value="service">{teamLabel('service')} ({serviceRate}%)</SelectItem>
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
            <span className="font-mono font-medium">{totalInc > 0 ? formatCurrency(totalInc, fee.currency as 'KRW' | 'USD') : '-'}</span>
          </div>
        </div>

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
