import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { todayKST, weekStart, weekDates, shiftDays } from '@/lib/date'
import { FULL_DAY_WORK } from '@/lib/leaveAttendance'
import {
  useWorkShifts,
  useSaveWorkShifts,
  SHIFT_KIND_LABEL,
  type ShiftKind,
  type WorkShift,
  type WorkShiftInput,
} from '@/hooks/useWorkShifts'

/**
 * 내 주간 출근 입력.
 *
 * 한 주를 통째로 적고 한 번에 저장한다. 하루씩 저장하면 '금요일까지 다음 주를
 * 다 적었는가'를 사람이 세어야 해서, 칸을 다 보여 주고 한 번에 받는다.
 *
 * '미입력'과 '휴무'는 다르다 — 쉬는 날이라고 비워 두면 안 적은 것과 구분이 안 되고,
 * 그러면 마감을 챙길 수 없다.
 */

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일']
const KINDS: (ShiftKind | 'none')[] = ['office', 'remote', 'off', 'none']

interface DayState {
  kind: ShiftKind | 'none'
  start: string
  end: string
}

function emptyDay(): DayState {
  return { kind: 'none', start: FULL_DAY_WORK.start, end: FULL_DAY_WORK.end }
}

export function WorkShiftDialog({ open, onOpenChange, userId, userName, defaultWeek }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  userId: string
  userName?: string
  /** 처음 열 때 보여 줄 주(그 주의 아무 날짜나). 기본은 다음 주 — 금요일 마감이 그 주 것이다. */
  defaultWeek?: string
}) {
  const today = todayKST()
  const [weekRef, setWeekRef] = useState(() => weekStart(defaultWeek || shiftDays(today, 7)))
  const dates = useMemo(() => weekDates(weekRef), [weekRef])

  const { data: shifts = [], isLoading } = useWorkShifts(dates[0], dates[6])
  const mine = useMemo(() => shifts.filter(s => s.userId === userId), [shifts, userId])

  // 저장된 값이 바뀌면(주 이동·재조회) 폼을 새로 만든다. 효과 안에서 setState 로
  // 칸을 덮으면 사용자가 입력하던 중에 값이 되돌아갈 수 있다 — key 로 갈아 끼운다.
  const formKey = useMemo(
    () => `${weekRef}|${mine.map(s => `${s.workDate}:${s.kind}:${s.startTime || ''}:${s.endTime || ''}`).sort().join(',')}`,
    [weekRef, mine],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>내 출근 입력{userName ? ` · ${userName}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={() => setWeekRef(w => shiftDays(w, -7))}>← 이전 주</Button>
          <span className="text-sm font-medium">
            {dates[0].slice(5).replace('-', '/')} – {dates[6].slice(5).replace('-', '/')}
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
            onClick={() => setWeekRef(w => shiftDays(w, 7))}>다음 주 →</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />불러오는 중…
          </div>
        ) : (
          <WeekShiftForm
            key={formKey}
            dates={dates}
            today={today}
            saved={mine}
            userId={userId}
            onSaved={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function WeekShiftForm({ dates, today, saved, userId, onSaved }: {
  dates: string[]
  today: string
  saved: WorkShift[]
  userId: string
  onSaved: () => void
}) {
  const save = useSaveWorkShifts()
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<DayState[]>(() =>
    dates.map(d => {
      const found = saved.find(s => s.workDate === d)
      if (!found) return emptyDay()
      return {
        kind: found.kind,
        start: found.startTime || FULL_DAY_WORK.start,
        end: found.endTime || FULL_DAY_WORK.end,
      }
    }),
  )

  const setDay = (i: number, patch: Partial<DayState>) =>
    setDays(prev => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  /** 평일 다섯 칸을 표준 근무로 한 번에 채운다 — 대부분은 이게 기본이다. */
  const fillWeekdays = () =>
    setDays(prev => prev.map((d, i) =>
      i < 5 ? { kind: 'office', start: FULL_DAY_WORK.start, end: FULL_DAY_WORK.end } : d,
    ))

  const submit = async () => {
    setError(null)
    const payload: WorkShiftInput[] = []
    for (let i = 0; i < dates.length; i++) {
      const d = days[i]
      if (d.kind === 'none') continue
      if (d.kind !== 'off') {
        if (!d.start || !d.end) {
          setError(`${WEEKDAY_LABEL[i]}요일 시간을 비워 두셨습니다.`)
          return
        }
        if (d.end <= d.start) {
          setError(`${WEEKDAY_LABEL[i]}요일 퇴근 시간이 출근 시간보다 빠릅니다.`)
          return
        }
      }
      payload.push({
        workDate: dates[i],
        kind: d.kind,
        startTime: d.kind === 'off' ? undefined : d.start,
        endTime: d.kind === 'off' ? undefined : d.end,
      })
    }

    try {
      await save.mutateAsync({ userId, weekDates: dates, shifts: payload })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const filled = days.filter(d => d.kind !== 'none').length

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={fillWeekdays}>
          평일 {FULL_DAY_WORK.start}–{FULL_DAY_WORK.end} 로 채우기
        </Button>
      </div>

      <div className="space-y-1">
        {dates.map((d, i) => {
          const st = days[i] || emptyDay()
          return (
            <div key={d} className={`flex items-center gap-2 rounded px-2 py-1.5 ${d === today ? 'bg-blue-50' : ''}`}>
              <span className="w-16 shrink-0 text-sm">
                <b className={i >= 5 ? 'text-rose-500' : ''}>{WEEKDAY_LABEL[i]}</b>
                <span className="ml-1 text-[11px] text-muted-foreground">{Number(d.slice(8))}일</span>
              </span>

              <div className="flex overflow-hidden rounded-md border">
                {KINDS.map(k => (
                  <button
                    key={k}
                    onClick={() => setDay(i, { kind: k })}
                    className={`h-7 border-l px-2 text-xs first:border-l-0 ${
                      st.kind === k ? 'bg-gray-900 font-medium text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {k === 'none' ? '미입력' : SHIFT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>

              {st.kind !== 'none' && st.kind !== 'off' && (
                <div className="flex items-center gap-1">
                  <Input type="time" value={st.start} onChange={e => setDay(i, { start: e.target.value })}
                    className="h-7 w-24 text-xs" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="time" value={st.end} onChange={e => setDay(i, { end: e.target.value })}
                    className="h-7 w-24 text-xs" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <span className="self-center text-[11px] text-muted-foreground">
          {filled}일 입력됨 · 매주 금요일까지 다음 주를 적어 주세요
        </span>
        <Button size="sm" onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}저장
        </Button>
      </DialogFooter>
    </>
  )
}
