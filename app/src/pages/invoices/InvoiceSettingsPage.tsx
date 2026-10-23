import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, Search, Settings, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles, canManageInvoiceSettings } from '@/hooks/useProfiles'
import { useMentors } from '@/hooks/useMentors'
import {
  useConsultantAnnualFees, useSetConsultantAnnualFee, useDeleteConsultantAnnualFee,
} from '@/hooks/useConsultantAnnualFees'
import {
  usePartnerInvoiceTypes, useSetPartnerInvoiceType,
  type PartnerInvoiceType, type PartnerAccountRegion,
} from '@/hooks/usePartnerInvoiceTypes'
import { canonicalConsultantName, consultantNameKey } from '@/lib/consultants'

const formatKRW = (n: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n)

/**
 * 인보이스설정 — '얼마를, 어느 양식으로 받는가'를 한 곳에서 정한다.
 *
 * 종전에는 연 관리비와 발행유형을 개인 파트너 게시판 한구석에서, 미리보기 대상을
 * 한 사람씩 바꿔 가며 설정했다. 사업자 파트너인 사람의 연 관리비를 개인 게시판에서
 * 고쳐야 했고, 전체가 어떻게 설정돼 있는지는 어디서도 볼 수 없었다.
 *
 * 권한은 대표·부대표·재무이사뿐이다(canManageInvoiceSettings). 컨설턴트가 제
 * 연 관리비를 스스로 정하면 안 되기 때문에, 접근권한 관리에서 인보이스 게시판을
 * 열어 준 사람에게도 이 메뉴만은 따로 막혀 있다.
 */
export default function InvoiceSettingsPage() {
  const { user } = useAuth()
  const allowed = canManageInvoiceSettings(user)

  if (!allowed) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Lock className="size-4" />
            인보이스설정은 대표·부대표·재무이사만 볼 수 있습니다.
          </CardContent>
        </Card>
      </div>
    )
  }
  return <SettingsBody />
}

interface Row {
  name: string
  nameKey: string
  resigned: boolean
  annualAmount?: number
  sessions?: number
  invoiceType: PartnerInvoiceType
  accountRegion: PartnerAccountRegion
}

function SettingsBody() {
  const { data: profiles = [] } = useProfiles()
  const { data: mentors = [] } = useMentors()
  const annualFees = useConsultantAnnualFees()
  const { data: partnerTypes } = usePartnerInvoiceTypes()
  const [q, setQ] = useState('')
  const [onlySet, setOnlySet] = useState(false)

  const rows = useMemo<Row[]>(() => {
    // 이름(정규화)으로 모은다 — 연 관리비·발행유형 모두 이름을 키로 저장하기 때문이다
    const byKey = new Map<string, Row>()
    const put = (rawName: string, resigned: boolean) => {
      const name = canonicalConsultantName(rawName)
      // 이름 자리에 uuid 가 들어간 레코드가 있어 걸러낸다
      if (!name || /^[0-9a-f-]{36}$/i.test(name)) return
      const nameKey = consultantNameKey(name)
      if (!nameKey || byKey.has(nameKey)) return
      const fee = annualFees.get(nameKey)
      const pt = partnerTypes?.get(nameKey)
      byKey.set(nameKey, {
        name, nameKey, resigned,
        annualAmount: fee?.annualAmount,
        sessions: fee?.sessions,
        invoiceType: pt?.invoiceType || 'individual',
        accountRegion: pt?.accountRegion || 'domestic',
      })
    }
    for (const p of profiles) if (!p.isExternal || p.role === 'freelancer') put(p.name, !!p.resigned)
    for (const m of mentors) put(m.koreanName || m.englishName || '', false)
    // 명단에 없는데 설정만 남아 있는 사람도 보여 준다 — 안 보이면 지울 수도 없다
    annualFees.forEach(f => put(f.displayName, false))
    return [...byKey.values()].sort(
      (a, b) => Number(a.resigned) - Number(b.resigned) || a.name.localeCompare(b.name, 'ko'),
    )
  }, [profiles, mentors, annualFees, partnerTypes])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (onlySet && !r.annualAmount) return false
      return !needle || r.name.toLowerCase().includes(needle)
    })
  }, [rows, q, onlySet])

  const setCount = rows.filter(r => !!r.annualAmount).length

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">인보이스설정</h1>
        <span className="text-xs text-muted-foreground">대표 · 부대표 · 재무이사만</span>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">연 관리비 · 발행유형</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              연 관리비를 적어 두면 <b>회당 방식</b>이 됩니다 — 1회분(연액 ÷ 횟수) × 그 달에 진행한 미팅 수로
              금액이 저절로 나오고, 인보이스에는 <b>학생마다</b> ‘현시우 1회차·2회차·3회차’처럼 적힙니다.
              비워 두면 종전 <b>미팅 2회 = 1개월분</b> 방식이고 금액은 발행할 때 손으로 적습니다.
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              발행유형은 그 사람의 <b>자동 청구가 어느 게시판에 뜨는지</b>를 정합니다(개인 / 사업자).
              계좌구분은 발행 양식을 가릅니다 — 국내계좌는 견적서, 해외계좌는 해외 인보이스.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="이름 검색" className="h-8 w-56 pl-7 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlySet(v => !v)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                onlySet
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              연 관리비 설정됨 {setCount}명{onlySet ? ' ✕' : ''}
            </button>
            <span className="text-[11px] text-muted-foreground">전체 {rows.length}명</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">이름</TableHead>
                  <TableHead className="w-72">연 관리비</TableHead>
                  <TableHead className="w-32">1회분</TableHead>
                  <TableHead className="w-40">발행유형</TableHead>
                  <TableHead className="w-40">계좌구분</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      해당하는 사람이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : filtered.map(r => <SettingRow key={r.nameKey} row={r} />)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingRow({ row }: { row: Row }) {
  const setFee = useSetConsultantAnnualFee()
  const clearFee = useDeleteConsultantAnnualFee()
  const setType = useSetPartnerInvoiceType()

  // 저장 전까지는 화면 값만 바뀐다 — 한 칸 칠 때마다 저장되면 되돌리기가 어렵다
  const [amount, setAmount] = useState(row.annualAmount ? String(row.annualAmount) : '')
  const [sessions, setSessions] = useState(String(row.sessions || 30))
  const [err, setErr] = useState('')

  const amt = Number(amount) || 0
  const per = amt > 0 && Number(sessions) > 0 ? Math.round(amt / Number(sessions)) : 0
  const dirty = amount !== (row.annualAmount ? String(row.annualAmount) : '')
    || sessions !== String(row.sessions || 30)
  const busy = setFee.isPending || clearFee.isPending

  const save = () => {
    setErr('')
    if (amt <= 0) {
      if (!row.annualAmount) return
      if (!confirm(`${row.name}님의 연 관리비 설정을 지울까요?\n지우면 '미팅 2회 = 1개월분' 방식으로 돌아갑니다.`)) return
      clearFee.mutate(row.nameKey, { onError: e => setErr(e instanceof Error ? e.message : '지우지 못했습니다.') })
      return
    }
    setFee.mutate(
      { name: row.name, annualAmount: amt, sessions: Number(sessions) || 30 },
      { onError: e => setErr(e instanceof Error ? e.message : '저장하지 못했습니다.') },
    )
  }

  return (
    <TableRow>
      <TableCell className="text-sm">
        {row.name}
        {row.resigned && <span className="ml-1 text-[11px] text-muted-foreground">(퇴사)</span>}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number" value={amount} placeholder="비우면 2회=1개월분"
            className="h-8 w-36 text-sm"
            onChange={e => setAmount(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">÷</span>
          <Input
            type="number" value={sessions} className="h-8 w-16 text-sm"
            onChange={e => setSessions(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">회</span>
          <Button size="sm" variant="outline" className="h-8" disabled={busy || !dirty} onClick={save}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : '저장'}
          </Button>
        </div>
        {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {per > 0
          ? <span className="font-medium text-blue-600">{formatKRW(per)}</span>
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {(['individual', 'business'] as const).map(tp => (
            <button
              key={tp}
              type="button"
              disabled={setType.isPending}
              onClick={() => setType.mutate({ name: row.name, invoiceType: tp })}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                row.invoiceType === tp
                  ? (tp === 'business' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')
                  : 'text-muted-foreground hover:bg-white'
              }`}
            >{tp === 'business' ? '사업자' : '개인'}</button>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {(['domestic', 'overseas'] as const).map(rg => (
            <button
              key={rg}
              type="button"
              disabled={setType.isPending}
              onClick={() => setType.mutate({ name: row.name, accountRegion: rg })}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                row.accountRegion === rg ? 'bg-slate-700 text-white' : 'text-muted-foreground hover:bg-white'
              }`}
            >{rg === 'overseas' ? '해외계좌' : '국내계좌'}</button>
          ))}
        </div>
      </TableCell>
    </TableRow>
  )
}
