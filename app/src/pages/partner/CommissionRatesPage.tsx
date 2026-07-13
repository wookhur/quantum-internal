import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Percent, Briefcase, Handshake, CheckCircle2, Plus, Trash2, Pencil, X } from 'lucide-react'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { EC_PARTNERS } from '@/lib/ecPartners'
import {
  useTeamCommissionRates,
  usePartnerRateList,
  useUpsertCommissionRate,
  useDeleteCommissionRate,
  TEAM_SALES_KEY,
  TEAM_SERVICE_KEY,
} from '@/hooks/usePartnerCommissionRates'

const RATE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function CommissionRatesPage() {
  const { salesRate, serviceRate, isLoading: teamLoading } = useTeamCommissionRates()
  const { list: partnerRates, isLoading: listLoading } = usePartnerRateList()
  const { data: fees = [] } = useAllServiceProgramFees()
  const upsert = useUpsertCommissionRate()
  const del = useDeleteCommissionRate()

  // ── Team rates ──
  const [sales, setSales] = useState('4')
  const [service, setService] = useState('3')
  const [savedTeam, setSavedTeam] = useState(false)

  useEffect(() => {
    if (!teamLoading) {
      setSales(String(salesRate))
      setService(String(serviceRate))
    }
  }, [teamLoading, salesRate, serviceRate])

  const handleSaveTeam = () => {
    setSavedTeam(false)
    Promise.all([
      upsert.mutateAsync({ partner: TEAM_SALES_KEY, rate: Number(sales) }),
      upsert.mutateAsync({ partner: TEAM_SERVICE_KEY, rate: Number(service) }),
    ])
      .then(() => { setSavedTeam(true); setTimeout(() => setSavedTeam(false), 2500) })
      .catch(showError)
  }

  // ── Per-partner overrides ──
  const [partner, setPartner] = useState('')
  const [pRate, setPRate] = useState('5')

  const partnerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of EC_PARTNERS) set.add(p)
    for (const f of fees) if (f.label?.trim()) set.add(f.label.trim())
    for (const r of partnerRates) if (r.partner?.trim()) set.add(r.partner.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [fees, partnerRates])

  // editing an existing partner = the selected partner already has a saved rate
  const editing = partnerRates.some(r => r.partner === partner.trim())

  const resetForm = () => { setPartner(''); setPRate('5') }

  const startEdit = (partnerName: string, rate: number) => {
    setPartner(partnerName)
    setPRate(String(rate))
  }

  const handleAddPartner = () => {
    if (!partner.trim()) return
    upsert.mutate(
      { partner: partner.trim(), rate: Number(pRate) },
      { onSuccess: resetForm, onError: showError },
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">수수료 관리</h1>
        <p className="text-sm text-muted-foreground">
          기본은 <b>팀별 수수료율</b>(세일즈맨/서비스맨)이 인사관리 소속팀 기준으로 적용됩니다. 특정 파트너사에 별도 조건이 있으면
          아래 <b>파트너사별 수수료</b>에서 지정하며, 지정된 파트너사는 그 율이 팀 수수료율보다 <b>우선 적용</b>됩니다.
        </p>
      </div>

      {/* ── Team rates ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="size-4 text-purple-500" /> 팀별 수수료율 (기본)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {teamLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Handshake className="size-4 text-blue-500" /> 세일즈맨 수수료율
                  </div>
                  <p className="text-xs text-muted-foreground">소속팀이 <b>세일즈팀</b>인 기여자에게 적용 (기본 4%)</p>
                  <Select value={sales} onValueChange={v => setSales(v || '4')}>
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Briefcase className="size-4 text-emerald-500" /> 서비스맨 수수료율
                  </div>
                  <p className="text-xs text-muted-foreground">소속팀이 <b>서비스팀</b>인 기여자에게 적용 (기본 3%)</p>
                  <Select value={service} onValueChange={v => setService(v || '3')}>
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={handleSaveTeam} disabled={upsert.isPending} className="h-9">
                  {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}저장
                </Button>
                {savedTeam && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" /> 저장되었습니다
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Per-partner overrides ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Handshake className="size-4 text-purple-500" /> 파트너사별 수수료 (개별 조건)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">파트너사</label>
              <Select value={partner} onValueChange={v => setPartner(v || '')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="파트너사 선택" /></SelectTrigger>
                <SelectContent>
                  {partnerOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">등록된 파트너사가 없습니다</div>
                  ) : partnerOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">수수료율</label>
              <Select value={pRate} onValueChange={v => setPRate(v || '5')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleAddPartner} disabled={!partner.trim() || upsert.isPending} className="h-9">
                {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : editing ? <Pencil className="size-4 mr-1" /> : <Plus className="size-4 mr-1" />}
                {editing ? '수정' : '추가'}
              </Button>
              {partner.trim() && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={resetForm} title="입력 취소">
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {editing
              ? `'${partner}'을(를) 수정 중입니다. 수수료율을 바꾸고 수정을 누르세요.`
              : '이미 등록한 파트너사를 다시 선택하면 수정할 수 있습니다. 별도 지정이 없는 파트너사는 위 팀별 수수료율이 적용됩니다.'}
          </p>

          {listLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : partnerRates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              개별 지정된 파트너사가 없습니다. (모든 파트너사에 팀별 수수료율이 적용됩니다.)
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>파트너사</TableHead>
                  <TableHead className="w-28 text-center">수수료율</TableHead>
                  <TableHead className="w-24 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerRates.map(r => (
                  <TableRow key={r.id} className={editing && partner.trim() === r.partner ? 'bg-purple-50/60' : undefined}>
                    <TableCell className="font-medium text-sm">{r.partner}</TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200">{r.rate}%</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-purple-600"
                          title="수정"
                          onClick={() => startEdit(r.partner, r.rate)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-red-600"
                          title="삭제"
                          onClick={() => { if (confirm(`'${r.partner}' 개별 수수료율을 삭제할까요? (팀별 수수료율로 되돌아갑니다)`)) del.mutate(r.id) }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function showError(e: unknown) {
  const err = e as { message?: string; details?: string; hint?: string; code?: string }
  alert(`저장에 실패했습니다.\n${err?.message || ''}${err?.details ? `\n${err.details}` : ''}${err?.hint ? `\n${err.hint}` : ''}${err?.code ? `\n(${err.code})` : ''}`)
}
