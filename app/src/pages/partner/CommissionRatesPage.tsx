import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Percent, Plus, Trash2, Pencil, X, Handshake, Briefcase } from 'lucide-react'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { EC_PARTNERS } from '@/lib/ecPartners'
import { useAuth } from '@/contexts/AuthContext'
import { canManageServiceFinance } from '@/hooks/useProfiles'
import {
  usePartnerRateList,
  useUpsertCommissionRate,
  useDeleteCommissionRate,
} from '@/hooks/usePartnerCommissionRates'

const RATE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function CommissionRatesPage() {
  const { user } = useAuth()
  const canEdit = canManageServiceFinance(user)
  const { list: partnerRates, isLoading } = usePartnerRateList()
  const { data: fees = [] } = useAllServiceProgramFees()
  const upsert = useUpsertCommissionRate()
  const del = useDeleteCommissionRate()

  const [partner, setPartner] = useState('')
  const [pSales, setPSales] = useState('4')
  const [pService, setPService] = useState('3')

  const partnerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of EC_PARTNERS) set.add(p)
    for (const f of fees) if (f.label?.trim()) set.add(f.label.trim())
    for (const r of partnerRates) if (r.partner?.trim()) set.add(r.partner.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [fees, partnerRates])

  const editing = partnerRates.some(r => r.partner === partner.trim())
  const resetForm = () => { setPartner(''); setPSales('4'); setPService('3') }
  const startEdit = (name: string, s: number, sv: number) => { setPartner(name); setPSales(String(s)); setPService(String(sv)) }

  const handleAddPartner = () => {
    if (!partner.trim()) return
    upsert.mutate(
      { partner: partner.trim(), salesRate: Number(pSales), serviceRate: Number(pService) },
      { onSuccess: resetForm, onError: showError },
    )
  }

  const rateSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={v => onChange(v || '1')}>
      <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
      </SelectContent>
    </Select>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">수수료 관리</h1>
        <p className="text-sm text-muted-foreground">
          파트너사별로 <b>세일즈팀 · 서비스팀</b> 수수료율을 각각 지정합니다. 서비스입금관리와 세일즈인센티브(인보이스)에서,
          그 파트너사의 프로그램을 세일즈한 사람의 <b>소속팀(인사관리 기준)</b>에 맞춰 수수료가 자동 계산·반영됩니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="size-4 text-purple-500" /> 파트너사별 수수료율 (세일즈 / 서비스)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {!canEdit && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              열람 전용입니다. 수수료율 수정은 대표·부대표·재무이사만 가능합니다.
            </p>
          )}
          {/* Add / edit a partner rate */}
          {canEdit && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_110px_auto] gap-3 items-end">
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
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Handshake className="size-3 text-blue-500" /> 세일즈</label>
              {rateSelect(pSales, setPSales)}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Briefcase className="size-3 text-emerald-500" /> 서비스</label>
              {rateSelect(pService, setPService)}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleAddPartner} disabled={!partner.trim() || upsert.isPending} className="h-9">
                {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : editing ? <Pencil className="size-4 mr-1" /> : <Plus className="size-4 mr-1" />}
                {editing ? '수정' : '추가'}
              </Button>
              {partner.trim() && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={resetForm} title="입력 취소"><X className="size-4" /></Button>
              )}
            </div>
          </div>
          )}
          {canEdit && (
          <p className="text-[11px] text-muted-foreground -mt-2">
            {editing
              ? `'${partner}'을(를) 수정 중입니다. 세일즈/서비스 율을 바꾸고 수정을 누르세요.`
              : '이미 등록한 파트너사를 다시 선택하면 수정할 수 있습니다.'}
          </p>
          )}

          {/* Partner rate table */}
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : partnerRates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              등록된 파트너사 수수료율이 없습니다.{canEdit ? ' 위에서 파트너사를 선택해 추가하세요.' : ''}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>파트너사</TableHead>
                  <TableHead className="w-28 text-center">세일즈</TableHead>
                  <TableHead className="w-28 text-center">서비스</TableHead>
                  {canEdit && <TableHead className="w-24 text-right">관리</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerRates.map(r => (
                  <TableRow key={r.id} className={editing && partner.trim() === r.partner ? 'bg-purple-50/60' : undefined}>
                    <TableCell className="font-medium text-sm">{r.partner}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-blue-600 border-blue-200">{r.salesRate}%</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200">{r.serviceRate}%</Badge>
                    </TableCell>
                    {canEdit && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-purple-600" title="수정" onClick={() => startEdit(r.partner, r.salesRate, r.serviceRate)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600" title="삭제"
                          onClick={() => { if (confirm(`'${r.partner}' 수수료율을 삭제할까요?`)) del.mutate(r.id) }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                    )}
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
