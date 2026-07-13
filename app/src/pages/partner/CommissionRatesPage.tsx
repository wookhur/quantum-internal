import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Percent, Trash2, Plus } from 'lucide-react'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import { EC_PARTNERS } from '@/lib/ecPartners'
import {
  usePartnerCommissionRates,
  useUpsertCommissionRate,
  useDeleteCommissionRate,
  normalizePartner,
} from '@/hooks/usePartnerCommissionRates'

const RATE_OPTIONS = [5, 10, 15, 20]

export function CommissionRatesPage() {
  const { data: rates = [], isLoading } = usePartnerCommissionRates()
  const { data: fees = [] } = useAllServiceProgramFees()
  const upsert = useUpsertCommissionRate()
  const del = useDeleteCommissionRate()

  const [partner, setPartner] = useState('')
  const [rate, setRate] = useState('10')
  const [notes, setNotes] = useState('')

  // Service partner options = master EC partner list + distinct labels used in
  // Student 360 EC/Academic + any partner already configured here.
  const partnerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of EC_PARTNERS) set.add(p)
    for (const f of fees) if (f.label?.trim()) set.add(f.label.trim())
    for (const r of rates) if (r.partner?.trim()) set.add(r.partner.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [fees, rates])

  const canSave = partner.trim() !== '' && !upsert.isPending

  const handleSave = () => {
    if (!canSave) return
    upsert.mutate(
      { partner: partner.trim(), rate: Number(rate), notes: notes.trim() || undefined },
      {
        onSuccess: () => { setPartner(''); setRate('10'); setNotes('') },
        onError: (e: unknown) => {
          const err = e as { message?: string; details?: string; hint?: string; code?: string }
          alert(`저장에 실패했습니다.\n${err?.message || ''}${err?.details ? `\n${err.details}` : ''}${err?.hint ? `\n${err.hint}` : ''}${err?.code ? `\n(${err.code})` : ''}`)
        },
      },
    )
  }

  // rows already configured; also show program count per partner for context
  const feeCountByPartner = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of fees) {
      const k = normalizePartner(f.label)
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [fees])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">수수료 관리</h1>
        <p className="text-sm text-muted-foreground">
          서비스 파트너사별 수수료율(인센티브율)을 설정합니다. 여기서 정한 율이 서비스입금관리에서 <b>수금 완료</b> 처리될 때
          인센티브 금액(청구금액 × 수수료율)으로 자동 반영됩니다.
        </p>
      </div>

      {/* Add / edit form */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_1.5fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">서비스 파트너사</label>
              <Select value={partner} onValueChange={v => setPartner(v || '')}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="파트너사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {partnerOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">등록된 파트너사가 없습니다</div>
                  ) : partnerOptions.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">수수료율</label>
              <Select value={rate} onValueChange={v => setRate(v || '10')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_OPTIONS.map(r => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">특이사항 (메모)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="예: 계약 조건, 정산 주기 등" className="h-9" />
            </div>
            <Button onClick={handleSave} disabled={!canSave} className="h-9">
              {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Plus className="size-4 mr-1" />}
              저장
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            이미 설정한 파트너사를 다시 선택해 저장하면 기존 수수료율이 덮어써집니다.
          </p>
        </CardContent>
      </Card>

      {/* Configured rates */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : rates.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              설정된 수수료율이 없습니다. 위에서 파트너사를 선택해 추가하세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>서비스 파트너사</TableHead>
                  <TableHead className="w-28 text-center">수수료율</TableHead>
                  <TableHead>특이사항</TableHead>
                  <TableHead className="w-32 text-center">연결된 프로그램</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Percent className="size-4 text-purple-500 shrink-0" />
                        <span className="font-medium text-sm">{r.partner}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200">{r.rate}%</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.notes || '-'}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {feeCountByPartner.get(normalizePartner(r.partner)) || 0}건
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-red-600"
                        onClick={() => { if (confirm(`'${r.partner}' 수수료율을 삭제할까요?`)) del.mutate(r.id) }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
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
