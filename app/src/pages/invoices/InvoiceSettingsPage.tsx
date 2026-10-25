import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, Search, Settings, Lock, Trash2, Undo2 } from 'lucide-react'
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
  hidden: boolean
  /** 돈을 실제로 받는 사람. 본인과 같으면 비워 둔다. */
  payeeName?: string
}

function SettingsBody() {
  const { data: profiles = [] } = useProfiles()
  const { data: mentors = [] } = useMentors()
  const annualFees = useConsultantAnnualFees()
  const { data: partnerTypes } = usePartnerInvoiceTypes()
  const [q, setQ] = useState('')
  const [onlySet, setOnlySet] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

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
        hidden: pt?.hidden === true,
        payeeName: pt?.payeeName,
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
      // 뺀 사람은 '뺀 사람 보기' 를 켰을 때만 — 켜면 그 사람들만 보여 되돌리기 쉽다
      if (r.hidden !== showHidden) return false
      if (onlySet && !r.annualAmount) return false
      return !needle || r.name.toLowerCase().includes(needle)
    })
  }, [rows, q, onlySet, showHidden])

  const visible = rows.filter(r => !r.hidden)
  const setCount = visible.filter(r => !!r.annualAmount).length
  const hiddenCount = rows.length - visible.length

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
            <p className="mt-1 text-[12px] text-muted-foreground">
              발행 대상이 아닌 사람은 오른쪽 휴지통으로 <b>이 목록에서만</b> 뺍니다 — 인사관리의 계정은 그대로이고,
              <b>뺀 사람 보기</b>에서 언제든 되돌릴 수 있습니다.
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              <b>수령인</b>은 일한 사람과 돈을 받는 사람이 다를 때만 적습니다. 적어 두면 발행할 때 수령인 칸이 그 이름으로
              채워지고, <b>그 이름으로 지급된 건이 이 사람의 청구 목록을 내려 줍니다</b>. 비워 두면 본인이 받습니다.
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
            {(hiddenCount > 0 || showHidden) && (
              <button
                type="button"
                onClick={() => setShowHidden(v => !v)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  showHidden
                    ? 'border-slate-600 bg-slate-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                뺀 사람 {hiddenCount}명{showHidden ? ' ✕' : ' 보기'}
              </button>
            )}
            <span className="text-[11px] text-muted-foreground">
              {showHidden ? `뺀 사람 ${hiddenCount}명` : `목록 ${visible.length}명`}
            </span>
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
                  <TableHead className="w-44">수령인</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      {showHidden ? '뺀 사람이 없습니다.' : '해당하는 사람이 없습니다.'}
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
  const [payee, setPayee] = useState(row.payeeName || '')
  const [err, setErr] = useState('')

  const payeeDirty = payee.trim() !== (row.payeeName || '')
  const savePayee = () => {
    setErr('')
    setType.mutate(
      { name: row.name, payeeName: payee.trim() },
      { onError: e => setErr(e instanceof Error ? e.message : '저장하지 못했습니다.') },
    )
  }

  const amt = Number(amount) || 0
  const per = amt > 0 && Number(sessions) > 0 ? Math.round(amt / Number(sessions)) : 0
  const dirty = amount !== (row.annualAmount ? String(row.annualAmount) : '')
    || sessions !== String(row.sessions || 30)
  const busy = setFee.isPending || clearFee.isPending

  /**
   * 목록에서 뺀다. 인사관리의 계정은 건드리지 않는다 — 여기서 지우는 건 '인보이스
   * 발행 대상' 표시뿐이다.
   *
   * 연 관리비가 걸려 있으면 함께 지운다. 목록에서 안 보이는 사람에게 회당 방식이
   * 계속 적용되면, 아무도 못 보는 자리에서 금액이 정해지는 꼴이 된다.
   */
  const hide = () => {
    setErr('')
    const warn = row.annualAmount
      ? `${row.name}님을 인보이스설정 목록에서 뺄까요?\n연 관리비 설정도 함께 지워져 '미팅 2회 = 1개월분' 방식으로 돌아갑니다.\n(인사관리의 계정은 그대로입니다.)`
      : `${row.name}님을 인보이스설정 목록에서 뺄까요?\n(인사관리의 계정은 그대로입니다. 나중에 되돌릴 수 있습니다.)`
    if (!confirm(warn)) return
    const fail = (e: unknown) => setErr(e instanceof Error ? e.message : '빼지 못했습니다.')
    setType.mutate({ name: row.name, hidden: true }, {
      onError: fail,
      onSuccess: () => { if (row.annualAmount) clearFee.mutate(row.nameKey, { onError: fail }) },
    })
  }

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
      <TableCell>
        {/* 일한 사람과 받는 사람이 다른 경우(이준형님 몫을 이상민님 이름으로 등).
            비워 두면 본인이 받는다. 적어 두면 발행할 때 수령인 칸이 그 이름으로
            채워지고, 그 이름으로 지급된 건이 이 사람의 청구 목록을 내려 준다. */}
        <div className="flex items-center gap-1">
          <Input
            value={payee} placeholder="본인" className="h-8 w-28 text-sm"
            onChange={e => setPayee(e.target.value)}
          />
          <Button size="sm" variant="outline" className="h-8" disabled={busy || !payeeDirty} onClick={savePayee}>
            {setType.isPending ? <Loader2 className="size-3.5 animate-spin" /> : '저장'}
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {row.hidden ? (
          <Button
            size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
            disabled={setType.isPending}
            onClick={() => setType.mutate({ name: row.name, hidden: false })}
          >
            <Undo2 className="size-3.5" /> 되돌리기
          </Button>
        ) : (
          <button
            type="button"
            disabled={setType.isPending || busy}
            onClick={hide}
            className="text-gray-300 hover:text-red-500"
            title="이 목록에서 빼기"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </TableCell>
    </TableRow>
  )
}
