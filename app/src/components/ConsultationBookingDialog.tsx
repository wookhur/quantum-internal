import { useState, useMemo, useCallback, useEffect } from 'react'
import { useT } from '@/i18n/LanguageContext'
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  addMinutes,
  setHours,
  setMinutes,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { X, ChevronLeft, ChevronRight, User, Phone, GraduationCap, Clock, Check } from 'lucide-react'
import { useGoogleCalendars, useGoogleCalendarEvents, useCreateGoogleCalendarEvent } from '@/hooks/useGoogleCalendar'
import { useUpdateLead, useCreateActivity } from '@/hooks/useLeads'
import type { PipelineStage, ConsultationMethod } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConsultationBookingDialogProps {
  open: boolean
  onClose: () => void
  lead: {
    id: string
    parentName: string
    studentName?: string
    email?: string
    phone: string
    grade?: string
    currentSchool?: string
  }
  onBooked: () => void
}

interface TimeSlot {
  hour: number
  minute: number
  label: string
}

type ConsultationNumber = 1 | 2 | 3
type DurationMinutes = 30 | 60 | 90

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#0073EA'

const WEEKDAY_HEADERS = ['consultation.mon', 'consultation.tue', 'consultation.wed', 'consultation.thu', 'consultation.fri', 'consultation.sat', 'consultation.sun']

const DURATION_OPTIONS: { value: DurationMinutes; labelKey: string }[] = [
  { value: 30, labelKey: 'consultation.duration30' },
  { value: 60, labelKey: 'consultation.duration60' },
  { value: 90, labelKey: 'consultation.duration90' },
]

const CONSULTATION_NUMBER_OPTIONS: { value: ConsultationNumber; labelKey: string }[] = [
  { value: 1, labelKey: 'consultation.number1' },
  { value: 2, labelKey: 'consultation.number2' },
  { value: 3, labelKey: 'consultation.number3' },
]

const CONSULTATION_METHOD_OPTIONS: { value: ConsultationMethod; labelKey: string }[] = [
  { value: 'zoom', labelKey: 'consultation.methodZoom' },
  { value: 'in_person', labelKey: 'consultation.methodInPerson' },
  { value: 'phone', labelKey: 'consultation.methodPhone' },
  { value: 'katalk', labelKey: 'consultation.methodKatalk' },
]

const PIPELINE_STAGE_MAP: Record<ConsultationNumber, PipelineStage> = {
  1: 'first_consultation',
  2: 'second_consultation',
  3: 'third_consultation',
}

/** Short method label for Google Calendar event title */
const METHOD_SHORT_LABEL: Record<ConsultationMethod, string> = {
  zoom: '줌',
  in_person: '방문',
  phone: '전화',
  katalk: '카톡',
}

/** Generate 30-minute time slots from 09:00 to 21:00 */
function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = []
  for (let hour = 9; hour < 21; hour++) {
    for (const minute of [0, 30]) {
      slots.push({
        hour,
        minute,
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      })
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsultationBookingDialog({
  open,
  onClose,
  lead,
  onBooked,
}: ConsultationBookingDialogProps) {
  const t = useT()

  // ─── State ──────────────────────────────────────────────────────────────────

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [duration, setDuration] = useState<DurationMinutes>(60)
  const [consultationNumber, setConsultationNumber] = useState<ConsultationNumber>(1)
  const [consultationMethod, setConsultationMethod] = useState<ConsultationMethod>('zoom')
  const [memo, setMemo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Google Calendar integration (graceful) ─────────────────────────────────

  // Default to CEO's calendar (samhan), fallback to stored or primary
  const DEFAULT_CALENDAR_ID = 'samhan@quantumadmissions.com'
  const { data: calendars } = useGoogleCalendars()
  const [calendarId, setCalendarId] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('googleCalendarId') || DEFAULT_CALENDAR_ID
      : DEFAULT_CALENDAR_ID
  )

  // Filter to only show team calendars (owner/writer access, not holiday calendars)
  const teamCalendars = useMemo(() => {
    if (!calendars) return []
    return calendars.filter(c =>
      (c.accessRole === 'owner' || c.accessRole === 'writer') &&
      !c.id.includes('#holiday@') && !c.id.includes('#contacts@')
    )
  }, [calendars])

  const handleCalendarChange = (newId: string) => {
    setCalendarId(newId)
    localStorage.setItem('googleCalendarId', newId)
    setSelectedSlot(null) // reset slot when calendar changes
  }

  const calendarRangeStart = selectedDate
    ? format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd'T'00:00:00XXX")
    : undefined
  const calendarRangeEnd = selectedDate
    ? format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59:59XXX")
    : undefined

  const {
    data: calendarEvents,
    isError: calendarError,
  } = useGoogleCalendarEvents(calendarId, calendarRangeStart, calendarRangeEnd)

  const createEvent = useCreateGoogleCalendarEvent()
  const updateLead = useUpdateLead()
  const createActivity = useCreateActivity()

  // ─── Reset state when dialog opens ──────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setCurrentMonth(startOfMonth(new Date()))
      setSelectedDate(null)
      setSelectedSlot(null)
      setDuration(60)
      setConsultationNumber(1)
      setConsultationMethod('zoom')
      setMemo('')
      setIsSubmitting(false)
      setIsSuccess(false)
      setError(null)
    }
  }, [open])

  // ─── Calendar grid ──────────────────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [currentMonth])

  const today = useMemo(() => startOfDay(new Date()), [])

  // ─── Busy time detection ────────────────────────────────────────────────────

  const busySlots = useMemo(() => {
    if (!calendarEvents || calendarError) return new Set<string>()

    const busy = new Set<string>()
    for (const event of calendarEvents) {
      const eventStart = event.start?.dateTime ? new Date(event.start.dateTime) : null
      const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : null
      if (!eventStart || !eventEnd) continue

      // Mark every 30-minute slot that overlaps with this event
      for (const slot of TIME_SLOTS) {
        if (!selectedDate) continue
        const slotStart = setMinutes(setHours(selectedDate, slot.hour), slot.minute)
        const slotEnd = addMinutes(slotStart, 30)

        if (slotStart < eventEnd && slotEnd > eventStart) {
          busy.add(slot.label)
        }
      }
    }
    return busy
  }, [calendarEvents, calendarError, selectedDate])

  // ─── Check if the selected slot + duration conflicts ────────────────────────

  const isSlotRangeAvailable = useCallback(
    (slot: TimeSlot, dur: DurationMinutes): boolean => {
      if (!selectedDate || !calendarEvents || calendarError) return true

      const slotStart = setMinutes(setHours(selectedDate, slot.hour), slot.minute)
      const slotEnd = addMinutes(slotStart, dur)

      for (const event of calendarEvents) {
        const eventStart = event.start?.dateTime ? new Date(event.start.dateTime) : null
        const eventEnd = event.end?.dateTime ? new Date(event.end.dateTime) : null
        if (!eventStart || !eventEnd) continue
        if (slotStart < eventEnd && slotEnd > eventStart) return false
      }
      return true
    },
    [calendarEvents, calendarError, selectedDate],
  )

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1))

  const handleDateSelect = (day: Date) => {
    if (isBefore(day, today)) return
    setSelectedDate(day)
    setSelectedSlot(null) // reset slot when date changes
  }

  const handleSlotSelect = (slot: TimeSlot) => {
    if (busySlots.has(slot.label)) return
    setSelectedSlot(slot)
  }

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSlot) return

    setIsSubmitting(true)
    setError(null)

    try {
      const startTime = setMinutes(
        setHours(selectedDate, selectedSlot.hour),
        selectedSlot.minute,
      )
      const endTime = addMinutes(startTime, duration)
      const startISO = format(startTime, "yyyy-MM-dd'T'HH:mm:ssXXX")
      const endISO = format(endTime, "yyyy-MM-dd'T'HH:mm:ssXXX")

      // Format: "줌/방문/전화) 세일즈n차 학교 학년 학생이름(학부모이름)"
      const methodLabel = METHOD_SHORT_LABEL[consultationMethod]
      const schoolPart = lead.currentSchool ? ` ${lead.currentSchool}` : ''
      const gradePart = lead.grade ? ` ${lead.grade}` : ''
      const studentPart = lead.studentName || ''
      const parentPart = lead.parentName
      const eventTitle = `${methodLabel}) 세일즈${consultationNumber}차${schoolPart}${gradePart} ${studentPart}(${parentPart})`

      // 1. Create Google Calendar event (skip if no token / fails)
      let googleMeetLink: string | undefined
      let googleEventId: string | undefined
      try {
        const event = await createEvent.mutateAsync({
          calendarId,
          title: eventTitle,
          description: [
            `학부모: ${lead.parentName}`,
            lead.studentName ? `학생: ${lead.studentName}` : '',
            `연락처: ${lead.phone}`,
            lead.grade ? `학년: ${lead.grade}` : '',
            `상담 차수: ${consultationNumber}차`,
            `상담 방식: ${t(CONSULTATION_METHOD_OPTIONS.find((o) => o.value === consultationMethod)?.labelKey || '')}`,
            memo ? `메모: ${memo}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          startTime: startISO,
          endTime: endISO,
          attendeeEmail: lead.email,
        })
        googleMeetLink = event.hangoutLink ?? undefined
        googleEventId = event.id
      } catch {
        // Google Calendar not set up — continue without event
        console.warn('Google Calendar event creation skipped (no token or error)')
      }

      // 2. Update lead pipeline stage
      const pipelineStage = PIPELINE_STAGE_MAP[consultationNumber]
      await updateLead.mutateAsync({
        id: lead.id,
        data: {
          pipelineStage,
          ...(googleMeetLink ? { googleMeetLink } : {}),
        },
      })

      // 3. Create activity record (store Google event ID for sync)
      await createActivity.mutateAsync({
        leadId: lead.id,
        activityType: 'consultation',
        title: `${consultationNumber}차 상담 예약 - ${format(startTime, 'M월 d일 (EEE) HH:mm', { locale: ko })}`,
        content: memo || undefined,
        consultationNumber,
        consultationMethod,
        meetingDate: startISO,
        googleMeetLink,
        metadata: googleEventId
          ? { googleEventId, googleCalendarId: calendarId }
          : undefined,
      })

      // 4. Show success
      setIsSuccess(true)

      // 5. Callback after short delay so the user sees the success state
      setTimeout(() => {
        onBooked()
        onClose()
      }, 1200)
    } catch (err) {
      console.error('Booking failed:', err)
      setError(err instanceof Error ? err.message : t('consultation.bookingError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Early return ───────────────────────────────────────────────────────────

  if (!open) return null

  // ─── Success state ──────────────────────────────────────────────────────────

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="mx-4 flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl bg-white p-10 shadow-2xl">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${PRIMARY}15` }}
          >
            <Check className="h-8 w-8" style={{ color: PRIMARY }} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{t('consultation.bookingComplete')}</h2>
          <p className="text-sm text-gray-500">
            {selectedDate && selectedSlot && (
              <>
                {format(selectedDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })}{' '}
                {selectedSlot.label} · {t(DURATION_OPTIONS.find((o) => o.value === duration)?.labelKey || '')}
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const canSubmit = selectedDate && selectedSlot && !isSubmitting

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t('consultation.title')}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-5">
          {/* ── Lead info summary ──────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-gray-50 px-4 py-3">
            <InfoChip icon={<User className="h-3.5 w-3.5" />} label={lead.parentName} />
            {lead.studentName && (
              <InfoChip icon={<GraduationCap className="h-3.5 w-3.5" />} label={lead.studentName} />
            )}
            <InfoChip icon={<Phone className="h-3.5 w-3.5" />} label={lead.phone} />
            {lead.grade && (
              <InfoChip icon={<GraduationCap className="h-3.5 w-3.5" />} label={lead.grade} />
            )}
          </div>

          {/* ── Calendar selector ─────────────────────────────────────────── */}
          {teamCalendars.length > 1 && (
            <div>
              <SectionLabel>{t('consultation.calendarSelect')}</SectionLabel>
              <select
                value={calendarId}
                onChange={(e) => handleCalendarChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {teamCalendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Calendar (date picker) ─────────────────────────────────────── */}
          <div>
            <SectionLabel>{t('consultation.dateSelect')}</SectionLabel>
            <div className="rounded-xl border border-gray-200 p-3">
              {/* Month navigation */}
              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={handlePrevMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                  aria-label={t('consultation.prevMonth')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-gray-800">
                  {format(currentMonth, 'yyyy년 M월', { locale: ko })}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                  aria-label={t('consultation.nextMonth')}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="mb-1 grid grid-cols-7 text-center">
                {WEEKDAY_HEADERS.map((d) => (
                  <div key={d} className="py-1 text-xs font-medium text-gray-400">
                    {t(d)}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const isPast = isBefore(day, today)
                  const isToday = isSameDay(day, today)
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
                  const isOutsideMonth = !isSameMonth(day, currentMonth)

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateSelect(day)}
                      disabled={isPast || isOutsideMonth}
                      className={`
                        relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-all
                        ${isOutsideMonth ? 'text-gray-200' : ''}
                        ${isPast && !isOutsideMonth ? 'cursor-not-allowed text-gray-300' : ''}
                        ${!isPast && !isOutsideMonth && !isSelected ? 'cursor-pointer text-gray-700 hover:bg-gray-100' : ''}
                        ${isSelected ? 'font-semibold text-white' : ''}
                      `}
                      style={isSelected ? { backgroundColor: PRIMARY } : undefined}
                    >
                      {format(day, 'd')}
                      {isToday && !isSelected && (
                        <span
                          className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                          style={{ backgroundColor: PRIMARY }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Time slot picker ────────────────────────────────────────────── */}
          {selectedDate && (
            <div>
              <SectionLabel>
                {t('consultation.timeSelect')}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}
                </span>
              </SectionLabel>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {TIME_SLOTS.map((slot) => {
                  const isBusy = busySlots.has(slot.label)
                  const isSelected = selectedSlot?.label === slot.label
                  const isAvailable = !isBusy

                  return (
                    <button
                      key={slot.label}
                      onClick={() => handleSlotSelect(slot)}
                      disabled={isBusy}
                      className={`
                        rounded-lg border px-2 py-2 text-xs font-medium transition-all
                        ${isBusy ? 'cursor-not-allowed border-red-100 bg-red-50 text-red-300 line-through' : ''}
                        ${isAvailable && !isSelected ? 'cursor-pointer border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50' : ''}
                        ${isSelected ? 'border-transparent font-semibold text-white' : ''}
                      `}
                      style={isSelected ? { backgroundColor: PRIMARY } : undefined}
                    >
                      {slot.label}
                    </button>
                  )
                })}
              </div>
              {!calendarError && calendarEvents && calendarEvents.length > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {t('consultation.busySlotHint')}
                </p>
              )}
            </div>
          )}

          {/* ── Duration ───────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>{t('consultation.duration')}</SectionLabel>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = duration === opt.value
                const conflict =
                  selectedSlot && !isSlotRangeAvailable(selectedSlot, opt.value)

                return (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    disabled={!!conflict}
                    className={`
                      rounded-lg border px-4 py-2 text-sm font-medium transition-all
                      ${conflict ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300' : ''}
                      ${!conflict && !isSelected ? 'cursor-pointer border-gray-200 text-gray-600 hover:border-blue-300' : ''}
                      ${isSelected && !conflict ? 'border-transparent text-white' : ''}
                    `}
                    style={isSelected && !conflict ? { backgroundColor: PRIMARY } : undefined}
                  >
                    {t(opt.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Consultation number + method row ───────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <SectionLabel>{t('consultation.consultationNumber')}</SectionLabel>
              <select
                value={consultationNumber}
                onChange={(e) => setConsultationNumber(Number(e.target.value) as ConsultationNumber)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {CONSULTATION_NUMBER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <SectionLabel>{t('consultation.consultationMethod')}</SectionLabel>
              <select
                value={consultationMethod}
                onChange={(e) => setConsultationMethod(e.target.value as ConsultationMethod)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {CONSULTATION_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Memo ───────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>{t('consultation.memo')}</SectionLabel>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t('consultation.memoPlaceholder')}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* ── Error ──────────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: PRIMARY }}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {t('consultation.booking')}
              </span>
            ) : (
              t('consultation.confirmBooking')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-sm font-semibold text-gray-700">{children}</p>
}

function InfoChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-gray-600">
      <span className="text-gray-400">{icon}</span>
      {label}
    </span>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
