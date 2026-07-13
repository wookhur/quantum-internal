import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, Percent, Briefcase, Handshake, CheckCircle2 } from 'lucide-react'
import {
  useTeamCommissionRates,
  useUpsertCommissionRate,
  TEAM_SALES_KEY,
  TEAM_SERVICE_KEY,
} from '@/hooks/usePartnerCommissionRates'

const RATE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function CommissionRatesPage() {
  const { salesRate, serviceRate, isLoading } = useTeamCommissionRates()
  const upsert = useUpsertCommissionRate()

  const [sales, setSales] = useState('5')
  const [service, setService] = useState('3')
  const [saved, setSaved] = useState(false)

  // hydrate the dropdowns once the stored rates load
  useEffect(() => {
    if (!isLoading) {
      setSales(String(salesRate || 5))
      setService(String(serviceRate || 3))
    }
  }, [isLoading, salesRate, serviceRate])

  const handleSave = () => {
    setSaved(false)
    Promise.all([
      upsert.mutateAsync({ partner: TEAM_SALES_KEY, rate: Number(sales) }),
      upsert.mutateAsync({ partner: TEAM_SERVICE_KEY, rate: Number(service) }),
    ])
      .then(() => { setSaved(true); setTimeout(() => setSaved(false), 2500) })
      .catch((e: unknown) => {
        const err = e as { message?: string; details?: string; hint?: string; code?: string }
        alert(`저장에 실패했습니다.\n${err?.message || ''}${err?.details ? `\n${err.details}` : ''}${err?.hint ? `\n${err.hint}` : ''}${err?.code ? `\n(${err.code})` : ''}`)
      })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">수수료 관리</h1>
        <p className="text-sm text-muted-foreground">
          세일즈맨과 서비스맨의 수수료율(인센티브율)을 설정합니다. 서비스입금관리에서 각 기여자의 <b>인사관리 소속팀</b>을 기준으로
          해당 팀 수수료율(청구금액 × 율)이 자동 적용되며, 소속팀을 확인할 수 없으면 항목에서 직접 팀을 지정할 수 있습니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="size-4 text-purple-500" /> 팀별 수수료율
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Handshake className="size-4 text-blue-500" /> 세일즈맨 수수료율
                  </div>
                  <p className="text-xs text-muted-foreground">인사관리 소속팀이 <b>세일즈팀</b>인 기여자에게 적용</p>
                  <Select value={sales} onValueChange={v => setSales(v || '5')}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Briefcase className="size-4 text-emerald-500" /> 서비스맨 수수료율
                  </div>
                  <p className="text-xs text-muted-foreground">인사관리 소속팀이 <b>서비스팀</b>인 기여자에게 적용</p>
                  <Select value={service} onValueChange={v => setService(v || '3')}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATE_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={upsert.isPending} className="h-9">
                  {upsert.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}저장
                </Button>
                {saved && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" /> 저장되었습니다
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        예) 세일즈 5% / 서비스 3% 설정 → 청구금액 1,000,000원 서비스에서 세일즈 담당은 50,000원,
        서비스 담당은 30,000원이 인센티브로 계산됩니다. 소속팀은 <b>인사관리</b>에서 지정합니다.
      </p>
    </div>
  )
}
