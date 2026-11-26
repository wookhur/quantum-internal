import { useMemo } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SHIFT_KIND_LABEL, type WorkShift } from '@/hooks/useWorkShifts'

/**
 * 직원 주간 근무 시간표.
 *
 * 날짜 칸에 이름만 늘어놓으면 '누가 몇 시에 겹쳐 있나'가 안 보인다. 세로를 시간축으로
 * 두고 막대로 그리면 그게 한눈에 보인다 — 오후 3시에 사무실에 누가 있는지, 학생 미팅
 * 시간에 담당자가 자리에 있는지 같은 것.
 *
 * 겹치는 사람은 옆으로 나눠 세운다(lane). 같은 자리에 겹쳐 그리면 뒤엣것이 가려진다.
 */

export interface GridMeeting {
  id: string
  date: string
  /** 'HH:mm'. 비어 있으면 시간을 모르는 미팅이라 막대로 못 그린다. */
  time?: string
  label: string
  sublabel?: string
}

/**
 * 사람별 색.
 *
 * 이름을 해시해서 고르면 두 사람이 같은 색을 받는 일이 생긴다(실제로 났다 —
 * Evelyn 과 Julie 가 둘 다 파랑이었다). 그래서 이번 주에 나오는 사람을 이름순으로
 * 줄 세우고 순서대로 집어 준다. 한 화면 안에서는 반드시 서로 다른 색이 된다.
 */
const PERSON_COLORS = [
  'bg-blue-600',
  'bg-rose-700',
  'bg-amber-500',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-pink-600',
  'bg-lime-600',
  'bg-indigo-600',
]

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일']
/** 한 시간 칸의 높이(px). 너무 좁으면 글자가 안 들어가고, 넓으면 하루가 화면을 넘는다. */
const HOUR_PX = 34

function toMin(hhmm?: string): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

interface Bar {
  key: string
  userId: string
  name: string
  kind: WorkShift['kind']
  start: number
  end: number
  lane: number
  lanes: number
}

/** 겹치는 막대를 옆으로 나눈다. 빈 자리가 생기면 다시 쓴다. */
function assignLanes(items: { start: number; end: number }[]): { lane: number[]; lanes: number } {
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start)
  const laneEnd: number[] = []
  const lane = new Array<number>(items.length).fill(0)
  for (const i of order) {
    let put = laneEnd.findIndex(e => e <= items[i].start)
    if (put === -1) { laneEnd.push(items[i].end); put = laneEnd.length - 1 }
    else laneEnd[put] = items[i].end
    lane[i] = put
  }
  return { lane, lanes: Math.max(1, laneEnd.length) }
}

export function WorkShiftWeekGrid({ days, shifts, nameOf, meetings = [], expected = [], onEdit }: {
  /** 'YYYY-MM-DD' 월~일 7일 */
  days: string[]
  shifts: WorkShift[]
  nameOf: (userId: string) => string
  meetings?: GridMeeting[]
  /** 이 주를 적어야 하는 사람 — 누가 아직 안 적었는지 보이려면 명단이 필요하다 */
  expected?: { id: string; name: string }[]
  /** 연필 — 본인이 입력 대상일 때만 넘어온다. 보고 있는 그 주를 연다. */
  onEdit?: () => void
}) {
  const shown = useMemo(() => {
    // 주말은 그날 근무나 미팅이 있을 때만 — 늘 비어 있는 칸 두 개가 화면을 먹는다
    const weekendHas = (d: string) =>
      shifts.some(s => s.workDate === d) || meetings.some(m => m.date === d)
    return days.filter((d, i) => i < 5 || weekendHas(d))
  }, [days, shifts, meetings])

  const timed = useMemo(() => meetings.filter(m => toMin(m.time) !== null), [meetings])
  const untimed = useMemo(() => meetings.filter(m => toMin(m.time) === null), [meetings])

  // 시간축 범위 — 기록에 맞춰 넓히되 너무 납작해지지 않게 최소 폭을 둔다
  const [fromH, toH] = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const s of shifts) {
      const a = toMin(s.startTime), b = toMin(s.endTime)
      if (a !== null) starts.push(a)
      if (b !== null) ends.push(b)
    }
    for (const m of timed) {
      const a = toMin(m.time)
      if (a !== null) { starts.push(a); ends.push(a + 60) }
    }
    if (!starts.length) return [9, 20]
    const lo = Math.max(0, Math.floor(Math.min(...starts) / 60))
    const hi = Math.min(24, Math.ceil(Math.max(...ends, Math.min(...starts) + 60) / 60))
    return [lo, Math.max(hi, lo + 4)]
  }, [shifts, timed])

  const hours = useMemo(
    () => Array.from({ length: toH - fromH + 1 }, (_, i) => fromH + i),
    [fromH, toH],
  )
  const spanMin = (toH - fromH) * 60
  const gridH = (toH - fromH) * HOUR_PX

  // 범례 겸 색 순번 — 이번 주에 한 번이라도 나오는 사람을 이름순으로
  const legend = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of shifts) if (!seen.has(s.userId)) seen.set(s.userId, nameOf(s.userId))
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((p, i) => ({ ...p, color: PERSON_COLORS[i % PERSON_COLORS.length] }))
  }, [shifts, nameOf])

  const colorById = useMemo(
    () => new Map(legend.map(p => [p.id, p.color])),
    [legend],
  )

  /** 그 날짜의 근무 막대 — 출근·재택만(휴무는 시간이 없다). */
  const barsOf = (date: string): Bar[] => {
    const raw = shifts
      .filter(s => s.workDate === date && s.kind !== 'off')
      .map(s => ({
        key: `${s.userId}-${date}`,
        userId: s.userId,
        name: nameOf(s.userId),
        kind: s.kind,
        start: toMin(s.startTime) ?? fromH * 60,
        end: toMin(s.endTime) ?? (toMin(s.startTime) ?? fromH * 60) + 60,
      }))
      .filter(b => b.end > b.start)
    const { lane, lanes } = assignLanes(raw)
    return raw.map((b, i) => ({ ...b, lane: lane[i], lanes }))
  }

  const hasAnything = shifts.length > 0 || meetings.length > 0

  // 한 줄도 안 적은 사람. '휴무'는 적은 것이므로 여기 안 들어온다 —
  // 그래서 쉬는 날을 비워 두지 말라고 입력 창에서 따로 일러둔다.
  const missing = useMemo(() => {
    const entered = new Set(shifts.map(s => s.userId))
    return expected.filter(p => !entered.has(p.id))
  }, [shifts, expected])

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">직원 주간 근무 스케줄</p>
          {onEdit && (
            <Button
              size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px] text-gray-500 hover:text-gray-900"
              onClick={onEdit}
              title="보고 있는 주의 내 근무를 입력합니다"
            >
              <Pencil size={11} />내 근무 입력
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legend.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-[11px] text-gray-600">
              <span className={`size-2.5 rounded-sm ${p.color}`} />{p.name}
            </span>
          ))}
          {!!timed.length && (
            <span className="flex items-center gap-1 text-[11px] text-gray-600">
              <span className="size-2.5 rounded-sm bg-slate-800" />정기 미팅
            </span>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="border-b bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
          아직 안 적은 사람 {missing.length}명 · {missing.map(p => p.name).join(', ')}
        </p>
      )}

      {!hasAnything ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          이 주에 입력된 근무가 없습니다.{onEdit ? ' 위의 ‘내 근무 입력’으로 적어 주세요.' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px] px-3 pb-3 pt-2">
            {/* 요일 머리 */}
            <div className="flex">
              <div className="w-12 shrink-0" />
              {shown.map(d => {
                const i = days.indexOf(d)
                const offs = shifts.filter(s => s.workDate === d && s.kind === 'off')
                const un = untimed.filter(m => m.date === d)
                return (
                  <div key={d} className="min-w-0 flex-1 px-0.5">
                    <div className="rounded-t bg-slate-800 py-1 text-center text-white">
                      <p className="text-xs font-semibold">{WEEKDAY_LABEL[i] ?? ''}</p>
                      <p className="text-[10px] opacity-70">{d.slice(5).replace('-', '/')}</p>
                    </div>
                    {(offs.length > 0 || un.length > 0) && (
                      <div className="space-y-0.5 pt-0.5">
                        {offs.map(s => (
                          <p key={s.userId} className="truncate rounded bg-gray-50 px-1 text-[10px] text-gray-400"
                            title={`${nameOf(s.userId)} · ${SHIFT_KIND_LABEL.off}`}>
                            {nameOf(s.userId)} 휴무
                          </p>
                        ))}
                        {un.map(m => (
                          <p key={m.id} className="truncate rounded bg-violet-50 px-1 text-[10px] text-violet-700"
                            title={`${m.label}${m.sublabel ? ` · ${m.sublabel}` : ''} · 시간 미정`}>
                            {m.label} <span className="opacity-60">시간 미정</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 시간축 + 막대 */}
            <div className="mt-1 flex">
              <div className="relative w-12 shrink-0" style={{ height: gridH }}>
                {hours.map(h => (
                  <span
                    key={h}
                    className="absolute right-1 text-[10px] tabular-nums text-gray-400"
                    style={{ top: (h - fromH) * HOUR_PX - 6 }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              {shown.map(d => {
                const bars = barsOf(d)
                const dayMeetings = timed.filter(m => m.date === d)
                // 미팅이 있는 날은 오른쪽 한 줄을 미팅에 내준다. 같은 자리에 겹쳐
                // 그리면 미팅이 근무 막대를 덮어 '그때 누가 있었나'가 안 보인다.
                const shiftW = dayMeetings.length ? 62 : 100
                const meetLanes = assignLanes(
                  dayMeetings.map(m => ({ start: toMin(m.time)!, end: toMin(m.time)! + 60 })),
                )
                return (
                  <div key={d} className="min-w-0 flex-1 px-0.5">
                    <div className="relative border-l border-r border-gray-100" style={{ height: gridH }}>
                      {/* 시간선 */}
                      {hours.slice(1, -1).map(h => (
                        <div key={h} className="absolute inset-x-0 border-t border-gray-100"
                          style={{ top: (h - fromH) * HOUR_PX }} />
                      ))}

                      {bars.map(b => {
                        const top = ((b.start - fromH * 60) / spanMin) * gridH
                        const h = Math.max(((b.end - b.start) / spanMin) * gridH, 18)
                        const w = shiftW / b.lanes
                        // 칸이 좁아지면 글자가 잘린다('Joh…'). 칸 폭은 겹친 사람 수만으로
                        // 정해지지 않는다 — 미팅이 있는 날은 근무가 쓰는 폭부터 줄어든다.
                        // 그래서 실제 몫(%)으로 가른다: 좁으면 시각을 빼고, 더 좁으면
                        // 성을 떼어 이름만 남긴다('John Kim' 보다 'John' 이 읽힌다).
                        const share = shiftW / b.lanes
                        const roomy = share >= 45
                        const shown = share < 35 ? b.name.split(' ')[0] : b.name
                        return (
                          <div
                            key={b.key}
                            className={`absolute overflow-hidden rounded py-0.5 text-[10px] leading-tight text-white ${
                              // 좁은 칸은 여백부터 줄인다 — 한글 세 글자('남연서')가 들어가고 말고가 여기서 갈린다
                              share < 35 ? 'px-0.5' : 'px-1'
                            } ${
                              colorById.get(b.userId) || PERSON_COLORS[0]
                            } ${b.kind === 'remote' ? 'opacity-75 ring-1 ring-inset ring-white/70' : ''}`}
                            style={{ top, height: h, left: `${b.lane * w}%`, width: `calc(${w}% - 2px)` }}
                            title={`${b.name} · ${SHIFT_KIND_LABEL[b.kind]} ${fmt(b.start)}–${fmt(b.end)}`}
                          >
                            <p className="truncate font-semibold">{shown}</p>
                            {roomy && h >= 32 && (
                              <p className="truncate opacity-85">{fmt(b.start)}~{fmt(b.end)}</p>
                            )}
                            {b.kind === 'remote' && h >= 46 && <p className="truncate opacity-85">재택</p>}
                          </div>
                        )
                      })}

                      {dayMeetings.map((m, mi) => {
                        const a = toMin(m.time)!
                        const top = ((a - fromH * 60) / spanMin) * gridH
                        const h = Math.max((60 / spanMin) * gridH, 20)
                        const w = (100 - shiftW) / meetLanes.lanes
                        return (
                          <div
                            key={m.id}
                            className="absolute overflow-hidden rounded bg-slate-800 px-1 py-0.5 text-[10px] leading-tight text-white"
                            style={{
                              top,
                              height: h,
                              left: `calc(${shiftW}% + ${meetLanes.lane[mi] * w}%)`,
                              width: `calc(${w}% - 2px)`,
                            }}
                            title={`${m.label}${m.sublabel ? ` · ${m.sublabel}` : ''} · ${m.time}`}
                          >
                            <p className="truncate font-semibold">{m.label}</p>
                            {h >= 32 && <p className="truncate opacity-80">{m.time}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
