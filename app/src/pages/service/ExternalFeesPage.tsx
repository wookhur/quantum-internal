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
import { useCommissionRateMap, normalizePartner } from '@/hooks/usePartnerCommissionRates'
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'
import { formatCurrency } from '@/types'

/** Sales contributor names for an item (from Student 360). */
function contributorsOf(f: ServiceProgramFee): string[] {
  const out: string[] = []
  if (f.contributor1) out.push(f.contributor1)
  if (f.contributor2) out.push(f.contributor2)
  return out
}

/** Incentive for an item = 청구금액 × 파트너사 수수료율 (수수료관리에서 설정). */
function incentiveOf(f: ServiceProgramFee, rate: number): number {
  const b = f.billedAmount || 0
  return rate ? Math.round((b * rate) / 100) : 0
}

export function ExternalFeesPage() {
  const { user } = useAuth()
  const { data: fees = [], isLoading } = useAllServiceProgramFees()
  const { map: rateMap } = useCommissionRateMap()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rateFor = (label: string) => rateMap.get(normalizePartner(label)) || 0

  // 재무담당자(회계 계정)·경영진도 금액·수금상태를 편집할 수 있게 허용
  const isAdmin = user?.role === 'admin'
    || user?.role === 'c_level'
    || (user?.email || '').toLowerCase() === 'accounting@quantumadmissions.com'

  const filtered = useMemo(() => {
    if (!search.trim()) return fees
    const q = search.toLowerCase()
    return fees.filter(f =>
      f.label.toLowerCase().includes(q) ||
      f.studentName.toLowerCase().includes(q) ||
      (f.contributor1 || '').toLowerCase().includes(q) ||
      (f.contributor2 || '').toLowerCase().includes(q),
    )
  }, [fees, search])

  const totalBilled = fees.reduce((s, f) => s + (f.billedAmount || 0), 0)
  const collected = fees.filter(f => f.collectionStatus === 'paid').reduce((s, f) => s + (f.billedAmount || 0), 0)
  // 총 인센티브 = 수금 완료된 항목의 (청구금액 × 파트너 수수료율) 합계
  const totalIncentive = fees
    .filter(f => f.collectionStatus === 'paid')
    .reduce((s, f) => s + incentiveOf(f, rateFor(f.label)), 0)

  const selected = selectedId ? fees.find(f => f.id === selectedId) ?? null : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">서비스입금관리</h1>
        <p className="text-sm text-muted-foreground">
          기존 고객에게 세일즈한 EC·Academic 서비스(Student 360 기준)의 금액·수금상태·기여자를 관리합니다. 인센티브는 <b>수수료관리</b>에서 설정한 파트너사 수수료율(청구금액 × 율)로 계산되며, 수금 완료 시 확정됩니다.
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
                  const rate = rateFor(f.label)
                  const inc = incentiveOf(f, rate)
                  const conts = contributorsOf(f)
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
                      <TableCell className="text-sm">{f.studentName}</TableCell>
                      <TableCell>
                        {conts.length > 0 ? (
                          <div className="space-y-0.5">
                            {conts.map((name, i) => (
                              <div key={i} className="text-sm">{name}</div>
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
                        {rate === 0 ? (
                          <span className="text-xs text-muted-foreground">수수료율 미설정</span>
                        ) : inc <= 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : isPaid ? (
                          <span className="text-emerald-600">
                            {formatCurrency(inc, f.currency as 'KRW' | 'USD')}
                            <span className="text-[10px] text-muted-foreground ml-1">({rate}%)</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            예정 {formatCurrency(inc, f.currency as 'KRW' | 'USD')}
                            <span className="text-[10px] ml-1">({rate}%)</span>
                          </span>
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
          rate={rateFor(selected.label)}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ─── Detail / edit dialog ─────────────────────────────────────────────
function ProgramFeeDialog({
  fee,
  rate,
  isAdmin,
  onClose,
}: {
  fee: ServiceProgramFee
  rate: number
  isAdmin: boolean
  onClose: () => void
}) {
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()

  const [billed, setBilled] = useState(fee.billedAmount ? String(fee.billedAmount) : '')
  const [status, setStatus] = useState<'pending' | 'paid'>(fee.collectionStatus)
  const [name1, setName1] = useState(fee.contributor1 || '')
  const [name2, setName2] = useState(fee.contributor2 || '')

  const saving = updateEC.isPending || updateAC.isPending
  const billedNum = Number(billed) || 0
  const inc = rate ? Math.round((billedNum * rate) / 100) : 0

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
            {fee.studentName} · {fee.source === 'ec' ? 'Extra Curricular' : 'Academic Support'}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LinkIcon className="size-3" />
          기여자는 Student 360에서 세일즈한 담당자입니다.
          <Link to={`/service/student-360?student=${fee.studentId}`} className="text-blue-600 hover:underline" onClick={onClose}>
            Student 360에서 보기
          </Link>
        </div>

        {/* Contributors (name only) */}
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground px-1">기여자 (세일즈 담당)</div>
          {([
            { name: name1, setName: setName1 },
            { name: name2, setName: setName2 },
          ]).map((c, i) => (
            <Input
              key={i}
              value={c.name}
              onChange={e => c.setName(e.target.value)}
              placeholder={i === 0 ? '기여자 이름' : '기여자 2 (선택)'}
              className="h-8 text-sm"
              disabled={!isAdmin}
            />
          ))}
        </div>

        {/* Billing (admin editable) */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
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

        {/* Commission rate (read-only — set in 수수료관리) + computed incentive */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">파트너사 수수료율</span>
            {rate > 0 ? (
              <Badge className="bg-purple-100 text-purple-700 border-purple-200">{rate}%</Badge>
            ) : (
              <Link to="/partner/contracts" className="text-blue-600 hover:underline text-xs" onClick={onClose}>
                수수료관리에서 설정하기
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">인센티브 (청구금액 × 율)</span>
            <span className="font-mono font-medium">
              {inc > 0 ? formatCurrency(inc, fee.currency as 'KRW' | 'USD') : '-'}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          인센티브율은 <b>수수료관리</b>(파트너 &gt; 수수료관리)에서 파트너사별로 설정합니다. 인센티브 = 청구금액 × 수수료율.
          수금 완료로 처리하면 해당 인센티브가 확정됩니다.
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
