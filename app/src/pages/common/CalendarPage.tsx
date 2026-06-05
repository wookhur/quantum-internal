import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ChevronLeft, ChevronRight, Loader2, Video, CalendarDays, CircleDot, FileWarning, Globe, CheckCircle2, Circle, Cake, BarChart3, Plus, Pencil, StickyNote } from 'lucide-react'
import { useCalendarEvents, type ContractCalendarItem, type BirthdayItem } from '@/hooks/useCalendarEvents'
import { useCreateEvent, useUpdateEvent, useEvents } from '@/hooks/useEvents'
import { todayKST, currentYearKST, currentMonthKST, formatTimeKST } from '@/lib/date'
import { useT } from '@/i18n/LanguageContext'
import type { Meeting, Event, Todo, GoogleCalendarEvent } from '@/types'

const WEEKDAY_KEYS = [
  'calendar.weekdaySun', 'calendar.weekdayMon', 'calendar.weekdayTue',
  'calendar.weekdayWed', 'calendar.weekdayThu', 'calendar.weekdayFri', 'calendar.weekdaySat',
] as const

interface DayData {
  date: number
  isCurrentMonth: boolean
  dateStr: string
  meetings: Meeting[]
  events: Event[]
  todos: Todo[]
  contractExpiries: ContractCalendarItem[]
  googleEvents: GoogleCalendarEvent[]
  birthdays: BirthdayItem[]
}

function buildCalendarGrid(
  year: number,
  month: number,
  meetings: Meeting[],
  events: Event[],
  todos: Todo[],
  contractExpiries: ContractCalendarItem[],
  googleEvents: GoogleCalendarEvent[],
  birthdays: BirthdayItem[],
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
    const d = e.eventDate?.slice(0, 10) || e.eventDatetime?.slice(0, 10)
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

  const birthdaysByDate = new Map<string, BirthdayItem[]>()
  birthdays.forEach(b => {
    const d = b.birthDate?.slice(0, 10)
    if (d) birthdaysByDate.set(d, [...(birthdaysByDate.get(d) || []), b])
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
    currentWeek.push({ date, isCurrentMonth: false, dateStr, meetings: [], events: [], todos: [], contractExpiries: [], googleEvents: [], birthdays: [] })
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
      birthdays: birthdaysByDate.get(dateStr) || [],
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
      currentWeek.push({ date: nextDate, isCurrentMonth: false, dateStr, meetings: [], events: [], todos: [], contractExpiries: [], googleEvents: [], birthdays: [] })
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
  const totalItems = day.meetings.length + day.events.length + day.todos.length + day.contractExpiries.length + day.googleEvents.length + day.birthdays.length
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
            <span className="text-[10px] text-orange-700 truncate">{c.studentName}</span>
          </div>
        ))}
        {day.todos.slice(0, 1).map(t => (
          <div key={t.id} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-[10px] text-red-700 truncate">{t.title}</span>
          </div>
        ))}
        {day.birthdays.slice(0, 1).map(b => (
          <div key={b.profileId} className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-pink-400 shrink-0" />
            <span className="text-[10px] text-pink-600 truncate">🎂 {b.name}</span>
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

// ─── Gantt Chart Types & Helpers ─────────────────────────────────────
const CHECKLIST_STEPS = [
  { key: 'speakerConfirmed', color: 'bg-blue-500', labelKey: 'calendar.ganttSpeaker', detailPlaceholder: '연사명 입력...' },
  { key: 'venueConfirmed', color: 'bg-purple-500', labelKey: 'calendar.ganttVenue', detailPlaceholder: '장소 입력...' },
  { key: 'copyWritten', color: 'bg-amber-500', labelKey: 'calendar.ganttCopy', detailPlaceholder: '카피 내용/링크...' },
  { key: 'designCompleted', color: 'bg-pink-500', labelKey: 'calendar.ganttDesign', detailPlaceholder: '디자인 파일/링크...' },
  { key: 'pptCompleted', color: 'bg-cyan-500', labelKey: 'calendar.ganttPpt', detailPlaceholder: 'PPT 파일/링크...' },
  { key: 'uploaded', color: 'bg-emerald-500', labelKey: 'calendar.ganttUpload', detailPlaceholder: '업로드 링크...' },
] as const

type GanttCategory = 'event' | 'birthday' | 'contract'

interface GanttItem {
  id: string
  category: GanttCategory
  label: string
  subLabel?: string
  day: number           // day of month (1-31)
  color: string         // tailwind bg class
  dotColor: string      // tailwind bg class for dot
  event?: Event         // if category is 'event'
}

const CATEGORY_CONFIG: Record<GanttCategory, { labelKey: string; dotColor: string; barColor: string }> = {
  event:    { labelKey: 'calendar.legendEvent',          dotColor: 'bg-emerald-500', barColor: 'bg-emerald-400' },
  birthday: { labelKey: 'calendar.legendBirthday',       dotColor: 'bg-pink-400',    barColor: 'bg-pink-300' },
  contract: { labelKey: 'calendar.legendContractExpiry', dotColor: 'bg-orange-500',  barColor: 'bg-orange-400' },
}

function buildGanttItems(
  events: Event[],
  birthdays: BirthdayItem[],
  contractExpiries: ContractCalendarItem[],
  year: number,
  month: number,
  daysInMonth: number,
): GanttItem[] {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const items: GanttItem[] = []

  // Events (seminars, webinars etc)
  events.forEach(e => {
    if (e.month !== monthStr && !e.eventDate?.startsWith(monthStr)) return
    const dayStr = e.eventDate?.slice(8, 10)
    const day = dayStr ? parseInt(dayStr, 10) : daysInMonth
    items.push({
      id: `event-${e.id}`,
      category: 'event',
      label: e.eventName,
      subLabel: e.venue || undefined,
      day,
      color: CATEGORY_CONFIG.event.barColor,
      dotColor: CATEGORY_CONFIG.event.dotColor,
      event: e,
    })
  })

  // Birthdays
  birthdays.forEach(b => {
    const d = b.birthDate?.slice(0, 10)
    if (!d?.startsWith(monthStr)) return
    items.push({
      id: `bday-${b.profileId}`,
      category: 'birthday',
      label: `🎂 ${b.name}`,
      subLabel: b.department || undefined,
      day: parseInt(d.slice(8, 10), 10),
      color: CATEGORY_CONFIG.birthday.barColor,
      dotColor: CATEGORY_CONFIG.birthday.dotColor,
    })
  })

  // Contract expiries
  contractExpiries.forEach(c => {
    const d = c.expiryDate?.slice(0, 10)
    if (!d?.startsWith(monthStr)) return
    items.push({
      id: `contract-${c.id}`,
      category: 'contract',
      label: c.studentName,
      subLabel: c.contractorName,
      day: parseInt(d.slice(8, 10), 10),
      color: CATEGORY_CONFIG.contract.barColor,
      dotColor: CATEGORY_CONFIG.contract.dotColor,
    })
  })

  // Sort by day
  items.sort((a, b) => a.day - b.day)
  return items
}

// ─── Gantt Chart Component (with independent month navigation) ───────
function ScheduleGanttChart() {
  const t = useT()
  const [ganttYear, setGanttYear] = useState(currentYearKST())
  const [ganttMonth, setGanttMonth] = useState(currentMonthKST())

  // Fetch data for the gantt month independently
  const { data: calData } = useCalendarEvents(ganttYear, ganttMonth)
  const ganttEvents = calData?.events ?? []
  const ganttBirthdays = calData?.birthdays ?? []
  const ganttContracts = calData?.contractExpiries ?? []

  // Fetch ALL events (no month filter) for management cards
  const { data: allEvents = [] } = useEvents()

  const daysInMonth = new Date(ganttYear, ganttMonth, 0).getDate()
  const today = todayKST()
  const monthStr = `${ganttYear}-${String(ganttMonth).padStart(2, '0')}`
  const isCurrentMonth = today.startsWith(monthStr)
  const todayDay = isCurrentMonth ? parseInt(today.slice(8, 10), 10) : -1

  function goGanttPrev() {
    if (ganttMonth === 1) { setGanttYear(y => y - 1); setGanttMonth(12) }
    else setGanttMonth(m => m - 1)
  }
  function goGanttNext() {
    if (ganttMonth === 12) { setGanttYear(y => y + 1); setGanttMonth(1) }
    else setGanttMonth(m => m + 1)
  }
  function goGanttToday() {
    setGanttYear(currentYearKST())
    setGanttMonth(currentMonthKST())
  }

  const ganttItems = useMemo(
    () => buildGanttItems(ganttEvents, ganttBirthdays, ganttContracts, ganttYear, ganttMonth, daysInMonth),
    [ganttEvents, ganttBirthdays, ganttContracts, ganttYear, ganttMonth, daysInMonth],
  )

  const groupedItems = useMemo(() => {
    const groups: { category: GanttCategory; items: GanttItem[] }[] = []
    const catOrder: GanttCategory[] = ['event', 'birthday', 'contract']
    for (const cat of catOrder) {
      const catItems = ganttItems.filter(i => i.category === cat)
      if (catItems.length > 0) groups.push({ category: cat, items: catItems })
    }
    return groups
  }, [ganttItems])

  const daysArr = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(ganttYear, ganttMonth - 1, i + 1)
      return { day: i + 1, dow: d.getDay() }
    })
  }, [ganttYear, ganttMonth, daysInMonth])

  const isThisMonth = ganttYear === currentYearKST() && ganttMonth === currentMonthKST()

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="size-4 text-primary" />
            <Button variant="ghost" size="icon" className="size-7" onClick={goGanttPrev}>
              <ChevronLeft className="size-4" />
            </Button>
            <CardTitle className="text-base font-semibold">
              {t('calendar.yearMonth', { year: String(ganttYear), month: String(ganttMonth) })}
            </CardTitle>
            <Button variant="ghost" size="icon" className="size-7" onClick={goGanttNext}>
              <ChevronRight className="size-4" />
            </Button>
            {!isThisMonth && (
              <Button variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={goGanttToday}>
                {t('common.today')}
              </Button>
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
              const hasItems = ganttItems.some(i => i.category === key)
              if (!hasItems) return null
              return (
                <span key={key} className="flex items-center gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotColor} inline-block`} />
                  <span className="text-[10px] text-muted-foreground">{t(cfg.labelKey)}</span>
                </span>
              )
            })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('calendar.ganttSubtitle')}</p>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        {ganttItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('calendar.ganttNoEvents')}</p>
        ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Timeline header — day numbers */}
            <div className="flex border-t border-b bg-muted/30 sticky top-0 z-20">
              <div className="w-52 shrink-0 px-4 py-2 text-[11px] font-medium text-muted-foreground border-r" />
              <div className="flex-1 flex relative">
                {daysArr.map(({ day, dow }) => (
                  <div
                    key={day}
                    className={`flex-1 text-center text-[10px] py-1.5 border-r border-transparent ${
                      dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-muted-foreground'
                    } ${day === todayDay ? 'font-bold text-primary bg-primary/5' : ''}`}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Grouped rows */}
            {groupedItems.map(({ category, items }) => {
              const cfg = CATEGORY_CONFIG[category]
              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex border-b bg-muted/20">
                    <div className="w-52 shrink-0 px-4 py-1.5 border-r flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                      <span className="text-[11px] font-semibold text-muted-foreground">{t(cfg.labelKey)} ({items.length})</span>
                    </div>
                    <div className="flex-1" />
                  </div>

                  {/* Items */}
                  {items.map(item => (
                    <div key={item.id} className="flex border-b hover:bg-muted/10 transition-colors group">
                      {/* Label */}
                      <div className="w-52 shrink-0 px-4 py-2 border-r min-w-0">
                        <div className="text-xs font-medium truncate">{item.label}</div>
                        {item.subLabel && (
                          <div className="text-[10px] text-muted-foreground truncate">{item.subLabel}</div>
                        )}
                      </div>

                      {/* Timeline bar area */}
                      <div className="flex-1 relative flex items-center">
                        {/* Weekend shading */}
                        {daysArr.map(({ day, dow }) =>
                          (dow === 0 || dow === 6) ? (
                            <div
                              key={`wk-${day}`}
                              className="absolute top-0 bottom-0 bg-muted/20"
                              style={{
                                left: `${((day - 1) / daysInMonth) * 100}%`,
                                width: `${(1 / daysInMonth) * 100}%`,
                              }}
                            />
                          ) : null
                        )}

                        {/* Today line */}
                        {isCurrentMonth && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400/60 z-10"
                            style={{ left: `${((todayDay - 0.5) / daysInMonth) * 100}%` }}
                          />
                        )}

                        {/* Point marker for this item's date */}
                        <div
                          className="absolute z-10 flex items-center"
                          style={{ left: `${((item.day - 0.5) / daysInMonth) * 100}%`, transform: 'translateX(-50%)' }}
                        >
                          <div className={`w-3 h-3 rounded-full ${item.dotColor} ring-2 ring-background shadow-sm`} />
                        </div>

                        {/* For events: show checklist progress bar leading up to event date */}
                        {item.event && (
                          <div className="absolute h-2 flex" style={{ left: '0%', width: `${((item.day - 0.5) / daysInMonth) * 100}%` }}>
                            {CHECKLIST_STEPS.map((step, idx) => {
                              const isDone = item.event![step.key as keyof Event] === true
                              return (
                                <div
                                  key={step.key}
                                  className={`flex-1 ${idx === 0 ? 'rounded-l-full' : ''} ${idx === CHECKLIST_STEPS.length - 1 ? 'rounded-r-full' : ''} ${
                                    isDone ? step.color : 'bg-gray-200 dark:bg-gray-700'
                                  } ${isDone ? 'opacity-80' : 'opacity-30'}`}
                                  style={{ marginRight: idx < CHECKLIST_STEPS.length - 1 ? 1 : 0 }}
                                />
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Progress for events */}
                      {item.event ? (
                        <div className="w-16 shrink-0 px-1 py-2 border-l flex items-center justify-center">
                          {(() => {
                            const done = CHECKLIST_STEPS.filter(s => item.event![s.key as keyof Event] === true).length
                            const pct = Math.round((done / CHECKLIST_STEPS.length) * 100)
                            return (
                              <span className={`text-[11px] font-semibold ${
                                pct === 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-gray-400'
                              }`}>{pct}%</span>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="w-16 shrink-0 px-1 py-2 border-l flex items-center justify-center">
                          <span className="text-[10px] text-muted-foreground">{item.day}일</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* Event management cards — all events across all months */}
        {allEvents.length > 0 && (
          <EventManagementCards events={allEvents} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Single Event Card with editable checklist + memo ──────────────
function EventCard({ event }: { event: Event }) {
  const t = useT()
  const updateEvent = useUpdateEvent()
  const [editingDetail, setEditingDetail] = useState<string | null>(null)
  const [detailValue, setDetailValue] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(event.notes || '')

  const details = event.checklistDetails || {}
  const completed = CHECKLIST_STEPS.filter(s => event[s.key as keyof Event] === true).length
  const percent = Math.round((completed / CHECKLIST_STEPS.length) * 100)

  function handleToggle(stepKey: string) {
    const checked = event[stepKey as keyof Event] === true
    if (!checked) {
      // When checking: open detail input
      const step = CHECKLIST_STEPS.find(s => s.key === stepKey)
      setEditingDetail(stepKey)
      setDetailValue(details[stepKey] || '')
      // Also toggle the checkbox on
      updateEvent.mutate({ id: event.id, field: stepKey, value: true })
      // Auto-focus handled by React
      if (!step) return
    } else {
      // Unchecking
      updateEvent.mutate({ id: event.id, field: stepKey, value: false })
    }
  }

  function saveDetail(stepKey: string) {
    const newDetails = { ...details, [stepKey]: detailValue.trim() }
    updateEvent.mutate({ id: event.id, field: 'checklistDetails', value: newDetails })
    setEditingDetail(null)
  }

  function saveNotes() {
    updateEvent.mutate({ id: event.id, field: 'notes', value: notesValue.trim() || null })
    setEditingNotes(false)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate">{event.eventName}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {event.eventDate
                  ? `${parseInt(event.eventDate.slice(5, 7))}/${parseInt(event.eventDate.slice(8, 10))}`
                  : event.eventDatetime || event.month
                }
                {event.eventDatetime && ` ${event.eventDatetime.split(', ')[1] || ''}`}
              </span>
              {event.week && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {event.week}주차
                </Badge>
              )}
            </div>
          </div>
          <Badge
            variant={percent === 100 ? 'default' : 'outline'}
            className={`shrink-0 text-[10px] ${percent === 100 ? 'bg-green-600 text-white' : ''}`}
          >
            {completed}/{CHECKLIST_STEPS.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('calendar.ganttProgress')}</span>
            <span className={`font-medium ${
              percent === 100 ? 'text-green-600' : percent >= 50 ? 'text-amber-600' : 'text-red-500'
            }`}>
              {percent}%
            </span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>

        {/* Interactive Checklist with detail inputs */}
        <div className="space-y-1">
          {CHECKLIST_STEPS.map(step => {
            const checked = event[step.key as keyof Event] === true
            const detail = details[step.key]
            const isEditing = editingDetail === step.key
            return (
              <div key={step.key}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggle(step.key)}
                    className={`flex items-center gap-1.5 text-xs rounded px-1.5 py-1 cursor-pointer transition-colors hover:bg-muted/50 flex-1 min-w-0 ${
                      checked ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-muted-foreground'
                    }`}
                  >
                    {checked ? (
                      <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
                    ) : (
                      <Circle className="size-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={checked ? '' : ''}>{t(step.labelKey)}</span>
                  </button>
                  {/* Show detail text or edit button */}
                  {checked && !isEditing && (
                    <button
                      type="button"
                      onClick={() => { setEditingDetail(step.key); setDetailValue(detail || '') }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      {detail ? (
                        <span className="max-w-[120px] truncate text-xs text-foreground/70">{detail}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic">{step.detailPlaceholder}</span>
                      )}
                      <Pencil className="size-2.5" />
                    </button>
                  )}
                </div>
                {/* Inline detail editor */}
                {isEditing && (
                  <div className="flex items-center gap-1 ml-6 mt-1">
                    <Input
                      autoFocus
                      className="h-6 text-xs flex-1"
                      placeholder={step.detailPlaceholder}
                      value={detailValue}
                      onChange={e => setDetailValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveDetail(step.key); if (e.key === 'Escape') setEditingDetail(null) }}
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => saveDetail(step.key)}>
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Notes / Memo */}
        <div className="border-t pt-2">
          {editingNotes ? (
            <div className="space-y-1.5">
              <Textarea
                autoFocus
                className="text-xs min-h-[60px] resize-none"
                placeholder="메모 입력..."
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setEditingNotes(false); setNotesValue(event.notes || '') } }}
              />
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setEditingNotes(false); setNotesValue(event.notes || '') }}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" className="h-6 px-2 text-xs" onClick={saveNotes}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="flex items-start gap-1.5 text-xs w-full text-left rounded px-1 py-1 hover:bg-muted/50 transition-colors"
            >
              <StickyNote className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
              {event.notes ? (
                <span className="text-foreground/80 whitespace-pre-wrap line-clamp-3">{event.notes}</span>
              ) : (
                <span className="text-muted-foreground/50 italic">메모 추가...</span>
              )}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Event Management Cards ─────────────────────────────────────────
function EventManagementCards({ events }: { events: Event[] }) {
  const t = useT()
  return (
    <div className="px-6 pt-4 border-t mt-2">
      <h4 className="text-xs font-semibold text-muted-foreground mb-3">
        {t('events.title')} — {t('calendar.ganttProgress')}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}

// ─── Add Event Dialog ────────────────────────────────────────────────
const INITIAL_EVENT_FORM = {
  month: '',
  week: 1,
  eventName: '',
  eventDatetime: '',
  venue: '',
  speakers: '',
}

export function CalendarPage() {
  const t = useT()
  const [year, setYear] = useState(() => currentYearKST())
  const [month, setMonth] = useState(() => currentMonthKST())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [eventForm, setEventForm] = useState(INITIAL_EVENT_FORM)
  const createEvent = useCreateEvent()

  const { data, isLoading } = useCalendarEvents(year, month)
  const meetings = data?.meetings || []
  const events = data?.events || []
  const todos = data?.todos || []
  const contractExpiries = data?.contractExpiries || []
  const googleEvents = data?.googleEvents || []
  const birthdays = data?.birthdays || []

  function handleCreateEvent() {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    const speakersArray = eventForm.speakers
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    createEvent.mutate(
      {
        month: eventForm.month || monthStr,
        week: eventForm.week,
        event_name: eventForm.eventName,
        event_datetime: eventForm.eventDatetime,
        venue: eventForm.venue || undefined,
        speakers: speakersArray.length > 0 ? speakersArray : undefined,
      },
      {
        onSuccess: () => {
          setEventDialogOpen(false)
          setEventForm(INITIAL_EVENT_FORM)
        },
      },
    )
  }

  const weeks = useMemo(
    () => buildCalendarGrid(year, month, meetings, events, todos, contractExpiries, googleEvents, birthdays),
    [year, month, meetings, events, todos, contractExpiries, googleEvents, birthdays]
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
          <h1 className="text-2xl font-bold tracking-tight">{t('calendar.title')}</h1>
          <p className="text-muted-foreground">{t('calendar.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {t('calendar.legendMeeting')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> {t('calendar.legendEvent')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> {t('calendar.legendGoogle')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> {t('calendar.legendContractExpiry')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {t('calendar.legendTodo')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400 inline-block" /> {t('calendar.legendBirthday')}</span>
          </div>
          <Button size="sm" className="h-9 shrink-0" onClick={() => setEventDialogOpen(true)}>
            <Plus className="size-4 mr-1" />
            {t('events.addEvent')}
          </Button>
        </div>
      </div>

      {/* Add Event Dialog */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('events.addEvent')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('events.month')}</Label>
                <Input
                  placeholder={`${year}-${String(month).padStart(2, '0')}`}
                  value={eventForm.month}
                  onChange={e => setEventForm(f => ({ ...f, month: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('events.week')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={eventForm.week}
                  onChange={e => setEventForm(f => ({ ...f, week: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('events.eventName')}</Label>
              <Input
                value={eventForm.eventName}
                onChange={e => setEventForm(f => ({ ...f, eventName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('events.datetime')}</Label>
              <Input
                type="datetime-local"
                value={eventForm.eventDatetime}
                onChange={e => setEventForm(f => ({ ...f, eventDatetime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('events.venue')}</Label>
              <Input
                value={eventForm.venue}
                onChange={e => setEventForm(f => ({ ...f, venue: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('events.speakers')}</Label>
              <Input
                placeholder={t('events.speakersPlaceholder')}
                value={eventForm.speakers}
                onChange={e => setEventForm(f => ({ ...f, speakers: e.target.value }))}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleCreateEvent}
              disabled={createEvent.isPending || !eventForm.eventName || !eventForm.eventDatetime}
            >
              {createEvent.isPending ? t('common.saving') : t('common.add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gantt Chart — independent month navigation */}
      <ScheduleGanttChart />

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
                  {t('calendar.yearMonth', { year: String(year), month: String(month) })}
                </CardTitle>
                <Button variant="ghost" size="icon" className="size-8" onClick={goToNextMonth}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                {t('common.today')}
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
                  {WEEKDAY_KEYS.map((key, i) => (
                    <div
                      key={key}
                      className={`text-center text-xs font-medium py-2 ${
                        i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'
                      }`}
                    >
                      {t(key)}
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
                ? t('calendar.daySchedule', { month: String(parseInt(selectedDate!.slice(5, 7))), day: String(parseInt(selectedDate!.slice(8, 10))) })
                : t('calendar.selectDate')
              }
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDay ? (
              <div className="text-center py-12 text-muted-foreground text-sm whitespace-pre-line">
                {t('calendar.selectDateHint')}
              </div>
            ) : selectedDay.meetings.length + selectedDay.events.length + selectedDay.todos.length + selectedDay.contractExpiries.length + selectedDay.googleEvents.length + selectedDay.birthdays.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {t('calendar.noSchedule')}
              </div>
            ) : (
              <>
                {/* Meetings */}
                {selectedDay.meetings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Video className="size-3.5 text-blue-500" />
                      <h3 className="text-xs font-semibold text-blue-700">{t('calendar.meetingSection')} ({selectedDay.meetings.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.meetings.map(m => (
                        <div key={m.id} className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50">
                          <div className="text-sm font-medium">{m.parentName}</div>
                          {m.studentName && (
                            <div className="text-xs text-muted-foreground">{t('calendar.student')}: {m.studentName}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300">
                              {t('calendar.nthConsultation', { n: m.meetingNumber })}
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
                      <h3 className="text-xs font-semibold text-emerald-700">{t('calendar.eventSection')} ({selectedDay.events.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.events.map(e => (
                        <div key={e.id} className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
                          <div className="text-sm font-medium">{e.eventName}</div>
                          {e.venue && (
                            <div className="text-xs text-muted-foreground">{t('calendar.venue')}: {e.venue}</div>
                          )}
                          {e.eventDatetime && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {formatTimeKST(e.eventDatetime)}
                            </div>
                          )}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {e.speakerConfirmed && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-100 border-emerald-300">{t('calendar.speakerConfirmed')}</Badge>}
                            {e.venueConfirmed && <Badge variant="outline" className="text-[10px] px-1 py-0 bg-emerald-100 border-emerald-300">{t('calendar.venueConfirmed')}</Badge>}
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
                      <h3 className="text-xs font-semibold text-violet-700">{t('calendar.googleSection')} ({selectedDay.googleEvents.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.googleEvents.map(g => (
                        <div key={g.id} className="p-2.5 rounded-lg border border-violet-200 bg-violet-50/50">
                          <div className="text-sm font-medium">{g.summary}</div>
                          {g.location && (
                            <div className="text-xs text-muted-foreground">{t('calendar.venue')}: {g.location}</div>
                          )}
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {g.isAllDay ? t('calendar.allDay') : `${formatTimeKST(g.startTime)} - ${formatTimeKST(g.endTime)}`}
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
                                {t('calendar.joinConference')}
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
                      <h3 className="text-xs font-semibold text-orange-700">{t('calendar.contractExpirySection')} ({selectedDay.contractExpiries.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.contractExpiries.map(c => (
                        <div key={c.id} className="p-2.5 rounded-lg border border-orange-200 bg-orange-50/50">
                          <div className="text-sm font-medium">{c.studentName}</div>
                          <div className="text-xs text-muted-foreground">{t('calendar.contractorName')}: {c.contractorName}</div>
                          {c.schoolName && (
                            <div className="text-xs text-muted-foreground">{t('calendar.schoolName')}: {c.schoolName}</div>
                          )}
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 mt-1 border-orange-400 text-orange-600"
                          >
                            {t('calendar.contractExpiryDate')}
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
                      <h3 className="text-xs font-semibold text-red-700">{t('calendar.todoSection')} ({selectedDay.todos.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.todos.map(td => (
                        <div key={td.id} className="p-2.5 rounded-lg border border-red-200 bg-red-50/50">
                          <div className="text-sm font-medium">{td.title}</div>
                          {td.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{td.description}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                td.priority === 'high'
                                  ? 'border-red-400 text-red-600'
                                  : td.priority === 'medium'
                                    ? 'border-yellow-400 text-yellow-600'
                                    : 'border-gray-300 text-gray-500'
                              }`}
                            >
                              {td.priority === 'high' ? t('priority.high') : td.priority === 'medium' ? t('priority.medium') : t('priority.low')}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Birthdays */}
                {selectedDay.birthdays.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cake className="size-3.5 text-pink-400" />
                      <h3 className="text-xs font-semibold text-pink-600">{t('calendar.legendBirthday')} ({selectedDay.birthdays.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {selectedDay.birthdays.map(b => (
                        <div key={b.profileId} className="p-2.5 rounded-lg border border-pink-200 bg-pink-50/50">
                          <div className="text-sm font-medium">🎂 {b.name}</div>
                          {b.department && (
                            <div className="text-xs text-muted-foreground">{b.department}</div>
                          )}
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
