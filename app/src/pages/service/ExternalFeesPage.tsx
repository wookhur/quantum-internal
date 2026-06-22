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
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'
import { formatCurrency } from '@/types'

function contributorsOf(f: ServiceProgramFee): { name: string; pct?: number }[] {
  const out: { name: string; pct?: number }[] = []
  if (f.contributor1) out.push({ name: f.contributor1, pct: f.contributor1Percentage })
  if (f.contributor2) out.push({ name: f.contributor2, pct: f.contributor2Percentage })
  return out
}

/** Total incentive for an item = billed × each contributor's % (rounded). */
function incentiveOf(f: ServiceProgramFee): number {
  const b = f.billedAmount || 0
  return contributorsOf(f).reduce((s, c) => s + (c.pct ? Math.round((b * c.pct) / 100) : 0), 0)
}

export function ExternalFeesPage() {
  const { user } = useAuth()
  const { data: fees = [], isLoading } = useAllServiceProgramFees()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'

  const filtered = useMemo(() => {
    if (!search.trim()) return fees
    const q = search.toLowerCase()
    return fees.filter(f =>
      f.label.toLowerCase().includes(q) ||
      (f.detail || '').toLowerCase().includes(q) ||
      f.studentName.toLowerCase().includes(q) ||
      (f.contributor1 || '').toLowerCase().includes(q) ||
      (f.contributor2 || '').toLowerCase().includes(q),
    )
  }, [fees, search])

  const totalBilled = fees.reduce((s, f) => s + (f.billedAmount || 0), 0)
  const collected = fees.filter(f => f.collectionStatus === 'paid').reduce((s, f) => s + (f.billedAmount || 0), 0)
  const totalIncentive = fees.reduce((s, f) => s + incentiveOf(f), 0)

  const selected = selectedId ? fees.find(f => f.id === selectedId) ?? null : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">외부서비스 수수료 관리</h1>
        <p className="text-sm text-muted-foreground">
          Student 360의 EC·Academic 프로그램을 기준으로, 청구금액·수금상태·기여자 수수료를 관리합니다.
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
                  const inc = incentiveOf(f)
                  const conts = contributorsOf(f)
                  return (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(f.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <HandCoins className="size-4 text-purple-500 shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{f.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {f.source === 'ec' ? 'EC' : 'Academic'}{f.detail ? ` · ${f.detail}` : ''}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{f.studentName}</TableCell>
                      <TableCell>
                        {conts.length > 0 ? (
                          <div className="space-y-0.5">
                            {conts.map((c, i) => (
                              <div key={i} className="text-sm">
                                {c.name}{c.pct ? <span className="text-xs text-muted-foreground ml-1">({c.pct}%)</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">미입력</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {f.billedAmount ? formatCurrency(f.billedAmount, f.currency as 'KRW' | 'USD') : '-'}
                      </TableCell>
                      <TableCell>
                        {f.collectionStatus === 'paid' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="size-3" /> 수금 완료</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 gap-1"><Clock className="size-3" /> 미수금</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {inc > 0 ? formatCurrency(inc, f.currency as 'KRW' | 'USD') : '-'}
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
  isAdmin,
  onClose,
}: {
  fee: ServiceProgramFee
  isAdmin: boolean
  onClose: () => void
}) {
  const updateEC = useUpdateECActivity()
  const updateAC = useUpdateAcademicSupport()

  const [billed, setBilled] = useState(fee.billedAmount ? String(fee.billedAmount) : '')
  const [status, setStatus] = useState<'pending' | 'paid'>(fee.collectionStatus)
  const [pct1, setPct1] = useState(fee.contributor1Percentage ? String(fee.contributor1Percentage) : '')
  const [pct2, setPct2] = useState(fee.contributor2Percentage ? String(fee.contributor2Percentage) : '')

  const saving = updateEC.isPending || updateAC.isPending
  const billedNum = Number(billed) || 0
  const inc1 = pct1 ? Math.round((billedNum * Number(pct1)) / 100) : 0
  const inc2 = pct2 ? Math.round((billedNum * Number(pct2)) / 100) : 0

  const handleSave = () => {
    const payload = {
      id: fee.id,
      studentId: fee.studentId,
      billedAmount: billed ? Number(billed) : undefined,
      collectionStatus: status,
      // stamp a collection date when paid; clear it ('' → null) when pending
      paidDate: status === 'paid' ? (fee.paidDate || todayKST()) : '',
      contributor1Percentage: pct1 ? Number(pct1) : undefined,
      contributor2Percentage: pct2 ? Number(pct2) : undefined,
    }
    const mut = fee.source === 'ec' ? updateEC : updateAC
    mut.mutate(payload, { onSuccess: onClose })
  }

  const pctOptions = Array.from({ length: 10 }, (_, i) => String(i + 1))

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-purple-500" />
            {fee.label}{fee.detail ? ` · ${fee.detail}` : ''}
          </DialogTitle>
          <DialogDescription>
            {fee.studentName} · {fee.source === 'ec' ? 'Extra Curricular' : 'Academic Support'}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <LinkIcon className="size-3" />
          기여자는 Student 360에서 입력됩니다.
          <Link to={`/service/student-360?student=${fee.studentId}`} className="text-blue-600 hover:underline" onClick={onClose}>
            Student 360에서 보기
          </Link>
        </div>

        {/* Contributors (from Student 360, read-only) */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">수수료 대상 (Student 360 입력)</div>
          {contributorsOf(fee).length === 0 ? (
            <p className="text-sm text-muted-foreground">Student 360에 기여자가 입력되지 않았습니다.</p>
          ) : (
            <div className="space-y-2">
              {fee.contributor1 && (
                <div className="flex items-center justify-between gap-3 p-2 rounded-md border bg-gray-50">
                  <span className="text-sm font-medium">{fee.contributor1}</span>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Select value={pct1} onValueChange={v => setPct1(v ?? '')}>
                        <SelectTrigger className="h-7 w-20 text-sm"><SelectValue placeholder="%" /></SelectTrigger>
                        <SelectContent>{pctOptions.map(p => <SelectItem key={p} value={p}>{p}%</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-sm text-muted-foreground">{pct1 ? `${pct1}%` : '-'}</span>}
                    <span className="text-sm font-mono w-28 text-right">{inc1 ? formatCurrency(inc1, fee.currency as 'KRW' | 'USD') : '-'}</span>
                  </div>
                </div>
              )}
              {fee.contributor2 && (
                <div className="flex items-center justify-between gap-3 p-2 rounded-md border bg-gray-50">
                  <span className="text-sm font-medium">{fee.contributor2}</span>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Select value={pct2} onValueChange={v => setPct2(v ?? '')}>
                        <SelectTrigger className="h-7 w-20 text-sm"><SelectValue placeholder="%" /></SelectTrigger>
                        <SelectContent>{pctOptions.map(p => <SelectItem key={p} value={p}>{p}%</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-sm text-muted-foreground">{pct2 ? `${pct2}%` : '-'}</span>}
                    <span className="text-sm font-mono w-28 text-right">{inc2 ? formatCurrency(inc2, fee.currency as 'KRW' | 'USD') : '-'}</span>
                  </div>
                </div>
              )}
            </div>
          )}
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

        <p className="text-[11px] text-muted-foreground">
          수금 완료 시 각 기여자의 인센티브가 세일즈 인센티브(인원별)에 자동 반영됩니다.
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
