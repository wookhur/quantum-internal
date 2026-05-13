import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Loader2, Video, CalendarDays, CircleDot, FileWarning, Globe } from 'lucide-react'
import { useCalendarEvents, type ContractCalendarItem } from '@/hooks/useCalendarEvents'
import { todayKST, currentYearKST, currentMonthKST, formatTimeKST } from '@/lib/date'
import type { Meeting, Event, Todo, GoogleCalendarEvent } from '@/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

interface DayData {
  date: number
  isCurrentMonth: boolean
  dateStr: string
  meetings: Meeting[]
  events: Event[]
  todos: Todo[]
  contractExpiries: ContractCalendarItem[]
  googleEvents: GoogleCalendarEvent[]
}

function buildCalendarGrid(
  year: number,
  month: number,
  meetings: Meeting[],
  events: Event[],
  todos: Todo[],
  contractExpiries: ContractCalendarItem[],
  googleEvents: GoogleCalendarEvent[],
): DayData[][] {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startDayOfWeek = firstDay.getDay()
  const totalDays = lastDay.getDate()

  // Build meeting/event/todo/contract maps by date string
  const meetingsByDate = new Map<string, Meeting[]>()
  meetings.forEach(m => {
    const d = m.meetingDate?.slice(0, 10)
    if (d) meetingsByDate.set(d, [...(meetingsByDate.get(d) || []), m])
  })

  const eventsByDate = new Map<string, Event[]>()
  events.forEach(e => {
    const d = e.eventDatetime?.slice(0, 10)
    if (d) eventsByDate.set(d, [...(eventsByDate.get(d) || []), e])
  })

  const todosByDate = new Map<string, Todo[]>()
  todos.forEach(t => {
    const d = t.dueDate?.slice(0, 10)
    if (d) todosByDate.set(d, [...(todosByDate.get(d) || []), t])
  })

  const contractsByDate = new Map<string, ContractCalendarItem[]>()
  contractExpiries.forEach(c => {
    const d = c.expiryDate?.slice(0, 10)
    if (d) contractsByDate.set(d, [...(contractsByDate.get(d) || []), c])
  })

  const googleEventsByDate = new Map<string, GoogleCalendarEvent[]>()
  googleEvents.forEach(g => {
    const d = g.startTime?.slice(0, 10)
    if (d) googleEventsByDate.set(d, [...(googleEventsByDate.get(d) || []), g])
  })

  const weeks: DayData[][] = []
  let currentWeek: DayData[] = []

  // Previous month padding
  const prevMonth = new Date(year, month - 1, 0)
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = prevMonth.getDate() - i
    const m = month - 1 === 0 ? 12 : month - 1
    const y = month - 1 === 0 ? year - 1 : year
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    currentWeek.push({ date, isCurrentMonth: false, dateStr, meetings: [], events: [], todos: [], contractExpiries: [], googleEvents: [] })
  }

  // Current month days
  for (let date = 1; date <= totalDays; date++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    currentWeek.push({
      date,
      isCurrentMonth: true,
      dateStr,
      meetings: meetingsByDate.get(dateStr) || [],
      events: eventsByDate.get(dateStr) || [],
      todos: todosByDate.get(dateStr) || [],
      contractExpiries: contractsByDate.get(dateStr) || [],
      googleEvents: googleEventsByDate.get(dateStr) || [],
    })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  // Next month padding
  if (currentWeek.length > 0) {
    let nextDate = 1
    while (currentWeek.length < 7) {
      const m = month + 1 > 12 ? 1 : month + 1
      const y = month + 1 > 12 ? year + 1 : year
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(nextDate).padStart(2, '0')}`
      currentWeek.push({ date: nextDate, isCurrentMonth: false, dateStr, meetings: [], events: [], todos: [], contractExpiries: [], googleEvents: [] })
      nextDate++
    }
    weeks.push(currentWeek)
  }

  return weeks
}

function DayCell({
  day,
  isToday,
  isSelected,
  onClick,
}: {
  day: DayData
  isToday: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const totalItems = day.meetings.length + day.events.length + day.todos.length + day.contractExpiries.length + day.googleEvents.length
  const hasItems = totalItems > 0

  return (
    <button
      onClick={onClick}
      className={`
        relative h-24 p-1.5 border-b border-r text-left transition-colors
        ${day.isCurrentMonth ? 'bg-background' : 'bg-muted/30'}
        ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
        ${hasItems ? 'cursor-pointer hover:bg-muted/50' : 'cursor-pointer hover:bg-muted/20'}
      `}
    >
      <div className={`text-xs font-medium mb-1 ${
        isToday
          ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center'
          : day.isCurrentMonth
            ? 'text-foreground'
            : 'text-muted-foreground/50'
      }`}>
        {day.date}
      </div>

      <div className="space-y-0.5 overflow-hidden">
        {day.meetings.slice(0, 2).map(m => (
          <div key={m.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[10px] text-blue-700 truncate">{m.parentName}</span>
          </div>
        ))}
        {day.events.slice(0, 2).map(e => (
          <div key={e.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[10px] text-emerald-700 truncate">{e.eventName}</span>
          </div>
        ))}
        {day.googleEvents.slice(0, 2).map(g => (
          <div key={g.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            <span className="text-[10px] text-violet-700 truncate">{g.summary}</span>
          </div>
        ))}
        {day.contractExpiries.slice(0, 1).map(c => (
          <div key={c.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            <span className="text-[10px] text-orange-700 truncate">{c.studentName} 만료</span>
          </div>
        ))}
        {day.todos.slice(0, 1).map(t => (
          <div key={t.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-[10px] text-red-700 truncate">{t.title}</span>
          </div>
        ))}
        {totalItems > 3 && (
          <div className="text-[10px] text-muted-foreground">
            +{totalItems - 3}
          </div>
        )}
      </div>
    </button>
  )
}

export function CalendarPage() {
  const [year, setYear] = useState(() => currentYearKST())
  const [month, setMonth] = useState(() => currentMonthKST())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { data, isLoading } = useCalendarEvents(year, month)
  const meetings = data?.meetings || []
  const events = data?.events || []
  const todos = data?.todos || []
  const contractExpiries = data?.contractExpiries || []
  const googleEvents = data?.googleEvents || []

  const weeks = useMemo(
    () => buildCalendarGrid(year, month, meetings, events, todos, contractExpiries, googleEvents),
    [year, month, meetings, events, todos, contractExpiries, googleEvents]
  )

  const todayStr = todayKST()

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null
    for (const week of weeks) {
      for (const day of week) {
        if (day.dateStr === selectedDate && day.isCurrentMonth) return day
      }
    }
    return null
  }, [selectedDate, weeks])

  function goToPrevMonth() {
    if (month === 1) {
      setYear(y => y - 1)
      setMonth(12)
    } else {
      setMonth(m => m - 1)
    }
    setSelectedDate(null)
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear(y => y + 1)
      setMonth(1)
    } else {
      setMonth(m => m + 1)
    }
    setSelectedDate(null)
  }

  function goToToday() {
    setYear(currentYearKST())
    setMonth(currentMonthKST())
    setSelectedDate(todayStr)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">캘린더</h1>
          <p className="text-muted-foreground">미팅, 이벤트, 계약 만료일을 한눈에 확인하세요</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 mr-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> 미팅</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 이벤트</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> 구글 캘린더</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 계약 만료</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 할일</span>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Calendar Grid */}
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="size-8" onClick={goToPrevMonth}>
                  <ChevronLeft className="size-4" />
                </Button>
                <CardTitle className="text-lg font-semibold">
                  {year}년 {month}월
                </CardTitle>
                <Button variant="ghost" size="icon" className="size-8" onClick={goToNextMonth}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                오늘
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 border-b">
                  {WEEKDAYS.map((day, i) => (
                    <div
                      key={day}
                      className={`text-center text-xs font-medium py-2 ${
                        i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((day) => (
                      <DayCell
                        key={day.dateStr}
                        day={day}
                        isToday={day.dateStr === todayStr}
                        isSelected={day.dateStr === selectedDate}
                        onClick={() => setSelectedDate(day.dateStr)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Side Panel - Day Detail */}
        <Card className="w-80 shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {selectedDay
                ? `${parseInt(selectedDate!.slice(5, 7))}월 ${parseInt(selectedDate!.slice(8, 10))}일 일정`
                : '날짜를 선택하세요'
              }
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDay ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                캘린더에서 날짜를 클릭하면<br />상세 일정을 확인할 수 있습니다.
              </div>
            ) : selectedDay.meetings.length + selectedDay.events.length + selectedDay.todos.length + selectedDay.contractExpiries.length + selectedDay.googleEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                이 날에는 일정이 없습니다.
              </div>
            ) : (
              <>
                {/* Meetings */}
                {selectedDay.meetings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Video className="size-3.5 text-blue-500" />
                      <h3 className="text-xs font-semibold text-blue-700">미팅 ({selectedDay.meetings.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.meetings.map(m => (
                        <div key={m.id} className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50">
                          <div className="text-sm font-medium">{m.parentName}</div>
                          {m.studentName && (
                            <div className="text-xs text-muted-foreground">학생: {m.studentName}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300">
                              {m.meetingNumber}차 상담
                            </Badge>
                            {m.currentSchool && (
                              <span className="text-[10px] text-muted-foreground">{m.currentSchool}</span>
                            )}
                          </div>
                          {m.memo && (
                            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{m.memo}</p>
                          )}
                          {m.requiredAction && (
                            <div className="text-[11px] text-orange-600 font-medium mt-1">
                              Action: {m.requiredAction}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Events */}
                {selectedDay.events.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CalendarDays className="size-3.5 text-emerald-500" />
                      <h3 className="text-xs font-semibold text-emerald-700">이벤트 ({selectedDay.events.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.events.map(e => (
                        <div key={e.id} className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
                          <div className="text-sm font-medium">{e.eventName}</div>
                          {e.venue && (
                            <div className="text-xs text-muted-foreground">장소: {e.venue}</div>
                          )}
                          {e.eventDatetime && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTimeKST(e.eventDatetime)}
                            </div>
                          )}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {e.speakerConfirmed && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-100 border-emerald-300">연사 확정</Badge>}
                            {e.venueConfirmed && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-100 border-emerald-300">장소 확정</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Google Calendar Events */}
                {selectedDay.googleEvents.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Globe className="size-3.5 text-violet-500" />
                      <h3 className="text-xs font-semibold text-violet-700">구글 캘린더 ({selectedDay.googleEvents.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.googleEvents.map(g => (
                        <div key={g.id} className="p-2.5 rounded-lg border border-violet-200 bg-violet-50/50">
                          <div className="text-sm font-medium">{g.summary}</div>
                          {g.location && (
                            <div className="text-xs text-muted-foreground">장소: {g.location}</div>
                          )}
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {g.isAllDay ? '종일' : `${formatTimeKST(g.startTime)} - ${formatTimeKST(g.endTime)}`}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {g.calendarId && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 text-violet-600">
                                {g.calendarId.split('@')[0]}
                              </Badge>
                            )}
                            {g.conferenceUrl && (
                              <a
                                href={g.conferenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-violet-600 hover:underline"
                              >
                                화상회의 참가
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contract Expiries */}
                {selectedDay.contractExpiries.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <FileWarning className="size-3.5 text-orange-500" />
                      <h3 className="text-xs font-semibold text-orange-700">계약 만료 ({selectedDay.contractExpiries.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.contractExpiries.map(c => (
                        <div key={c.id} className="p-2.5 rounded-lg border border-orange-200 bg-orange-50/50">
                          <div className="text-sm font-medium">{c.studentName}</div>
                          <div className="text-xs text-muted-foreground">계약자: {c.contractorName}</div>
                          {c.schoolName && (
                            <div className="text-xs text-muted-foreground">학교: {c.schoolName}</div>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 mt-1 border-orange-400 text-orange-600"
                          >
                            계약 만료일
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Todos */}
                {selectedDay.todos.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <CircleDot className="size-3.5 text-red-500" />
                      <h3 className="text-xs font-semibold text-red-700">할일 ({selectedDay.todos.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.todos.map(t => (
                        <div key={t.id} className="p-2.5 rounded-lg border border-red-200 bg-red-50/50">
                          <div className="text-sm font-medium">{t.title}</div>
                          {t.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                t.priority === 'high'
                                  ? 'border-red-400 text-red-600'
                                  : t.priority === 'medium'
                                    ? 'border-yellow-400 text-yellow-600'
                                    : 'border-gray-300 text-gray-500'
                              }`}
                            >
                              {t.priority === 'high' ? '긴급' : t.priority === 'medium' ? '보통' : '낮음'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
