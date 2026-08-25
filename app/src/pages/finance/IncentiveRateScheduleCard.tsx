import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trash2, CalendarClock } from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/hooks/useProfiles'
import { INCENTIVE_TYPES, type IncentiveType } from '@/hooks/useIncentives'
import {
  useIncentiveRateSchedules,
  useCreateRateSchedule,
  useDeleteRateSchedule,
} from '@/hooks/useIncentiveRateSchedule'

// 요율 변경이 실제 일어나는 '사람 단위' 유형만 노출 (계약별로 값이 제각각인 유형은 제외)
const SCHEDULABLE_TYPES: IncentiveType[] = [
  'service_team',
  'service_director',
  'total_revenue',
  'total_revenue_1_5',
  'cold_call',
]

// 0.5 ~ 10.0 (0.5 간격) + 0 (미반영)
const RATE_OPTIONS = [0, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 0.5)]

export function IncentiveRateScheduleCard() {
  const t = useT()
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  const { data: schedules = [] } = useIncentiveRateSchedules()
  const createMut = useCreateRateSchedule()
  const deleteMut = useDeleteRateSchedule()

  const [profileId, setProfileId] = useState('')
  const [incentiveType, setIncentiveType] = useState<IncentiveType>('service_team')
  const [rate, setRate] = useState('2')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  const typeLabel = (key: string) =>
    INCENTIVE_TYPES[key as IncentiveType] ? t(INCENTIVE_TYPES[key as IncentiveType].labelKey) : key
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name || '(알 수 없음)'

  // 재직자 우선, 이름순
  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => Number(a.resigned) - Number(b.resigned) || a.name.localeCompare(b.name, 'ko')),
    [profiles],
  )

  const canSubmit = profileId && effectiveFrom && rate !== ''

  const submit = () => {
    if (!canSubmit) return
    createMut.mutate(
      {
        profileId,
        incentiveType,
        rate: Number(rate),
        effectiveFrom, // 'YYYY-MM'
        createdBy: user?.id,
      },
      {
        onSuccess: () => {
          setProfileId('')
          setEffectiveFrom('')
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-[#a51c30]" />
          인센티브 요율 변경 (적용 시작월)
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          사람·유형별로 <b>“언제부터 몇 %”</b>를 등록하면, 해당 월부터 <b>수금되는 회차</b>에 자동 적용됩니다.
          이전 달은 기존 계약별 요율 그대로 유지돼요. (0% = 미반영 / 퇴사·이관 처리)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 입력 폼 */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-1">
            <Label className="text-xs">대상자</Label>
            <Select value={profileId} onValueChange={(v) => setProfileId(v ?? '')}>
              <SelectTrigger><span>{profileId ? nameOf(profileId) : '선택'}</span></SelectTrigger>
              <SelectContent>
                {sortedProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.resigned ? ' (퇴사)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-xs">인센티브 유형</Label>
            <Select value={incentiveType} onValueChange={(v) => setIncentiveType(v as IncentiveType)}>
              <SelectTrigger><span>{typeLabel(incentiveType)}</span></SelectTrigger>
              <SelectContent>
                {SCHEDULABLE_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>{typeLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-xs">요율</Label>
            <Select value={rate} onValueChange={(v) => setRate(v ?? '')}>
              <SelectTrigger><span>{rate}%</span></SelectTrigger>
              <SelectContent>
                {RATE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}%{r === 0 ? ' (미반영)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-xs">적용 시작월</Label>
            <Input type="month" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div className="sm:col-span-1">
            <Button className="w-full" onClick={submit} disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? '저장 중…' : '추가'}
            </Button>
          </div>
        </div>

        {/* 목록 */}
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">등록된 요율 변경이 없습니다. (스케줄이 없으면 계약별 요율 그대로 적용)</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>대상자</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">요율</TableHead>
                <TableHead>적용 시작월</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{nameOf(s.profileId)}</TableCell>
                  <TableCell>{typeLabel(s.incentiveType)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.rate}%{s.rate === 0 ? ' (미반영)' : ''}
                  </TableCell>
                  <TableCell className="tabular-nums">{s.effectiveFrom}~</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => {
                        if (confirm(`${nameOf(s.profileId)} · ${typeLabel(s.incentiveType)} · ${s.rate}% (${s.effectiveFrom}~) 삭제할까요?`)) {
                          deleteMut.mutate(s.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
