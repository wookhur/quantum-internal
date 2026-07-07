import { useState, useMemo, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Download,
  Upload,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
  Settings2,
  Check,
  X,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useAttendances, useUpsertAttendance, useDeleteAttendance, useBulkUpsertAttendances } from '@/hooks/useAttendances'
import { useKioskExcludedIds, useUpdateKioskExcludedIds } from '@/hooks/useKioskSettings'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getDaysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const days: string[] = []
  for (let d = 1; d <= lastDay; d++) {
    days.push(`${ym}-${String(d).padStart(2, '0')}`)
  }
  return days
}

const DAY_KEYS = [
  'attendance.daySun', 'attendance.dayMon', 'attendance.dayTue',
  'attendance.dayWed', 'attendance.dayThu', 'attendance.dayFri', 'attendance.daySat',
] as const

function getDayOfWeekKey(dateStr: string): string {
  return DAY_KEYS[new Date(dateStr).getDay()]
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  return d.getDay() === 0 || d.getDay() === 6
}

/** 10:00 이후 출근 = 지각 (주말 제외) */
function isLate(clockIn: string | null, dateStr: string): boolean {
  if (!clockIn || isWeekend(dateStr)) return false
  return clockIn > '10:00'
}

function formatTime(t: string | null | undefined): string {
  return t || ''
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
  return `${fmt(mon)}~${fmt(sun)}`
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return mon.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// SHIFTY / Shiftee import helpers
// ---------------------------------------------------------------------------

interface ImportRow {
  rowIndex: number       // original sheet row (1-based, for error messages)
  rawName: string
  matchedProfileId: string | null
  date: string           // YYYY-MM-DD
  clockIn: string | null // HH:mm
  clockOut: string | null
  scheduleStart: string | null
  scheduleEnd: string | null
  note: string | null
  error: string | null
}

function normalizeTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  // Excel cell with time format may come as a fraction of day
  if (typeof v === 'number' && v > 0 && v < 2) {
    const total = Math.round(v * 24 * 60)
    const h = Math.floor(total / 60) % 24
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (!s) return null
  // Accept "9:00", "09:00", "9:00:00", "09:00 AM"
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const suf = ampm[3]?.toUpperCase()
    if (suf === 'PM' && h < 12) h += 12
    if (suf === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return null
}

function normalizeDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  // Excel serial date
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (m) {
    return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`
  }
  return null
}

/** Find a profile by name (exact, then trimmed loose match). */
function matchProfile(name: string, profiles: { id: string; name: string }[]): string | null {
  if (!name) return null
  const exact = profiles.find(p => p.name === name)
  if (exact) return exact.id
  const trimmed = name.replace(/\s+/g, '')
  const loose = profiles.find(p => p.name.replace(/\s+/g, '') === trimmed)
  return loose?.id ?? null
}

/**
 * Parse SHIFTY/Shiftee attendance export.
 * Column layout (matches our export):
 *   0: 사원번호  1: 직원이름  2: 날짜
 *   3: 시작시간  4: 종료시간  5: 조직  6: 직무
 *   7: 출근시간  8: 퇴근시간  9: 근무노트
 * Tries to autodetect header row.
 */
function parseShiftyFile(rows: unknown[][], profiles: { id: string; name: string }[]): ImportRow[] {
  // Find header row: row containing "직원이름" and "날짜"
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || []
    const joined = r.map(c => String(c ?? '')).join('|')
    if (joined.includes('직원이름') && joined.includes('날짜')) {
      headerIdx = i
      break
    }
  }
  // Determine column indices from header (fallback to fixed positions)
  let nameCol = 1, dateCol = 2, schedStartCol = 3, schedEndCol = 4
  let clockInCol = 7, clockOutCol = 8, noteCol = 9
  if (headerIdx >= 0) {
    const h = rows[headerIdx].map(c => String(c ?? ''))
    const findCol = (kw: string[]) => h.findIndex(c => kw.some(k => c.includes(k)))
    const i1 = findCol(['직원이름', '이름']); if (i1 >= 0) nameCol = i1
    const i2 = findCol(['날짜']); if (i2 >= 0) dateCol = i2
    const i3 = findCol(['시작시간']); if (i3 >= 0) schedStartCol = i3
    const i4 = findCol(['종료시간']); if (i4 >= 0) schedEndCol = i4
    const i5 = findCol(['출근시간', '출근']); if (i5 >= 0) clockInCol = i5
    const i6 = findCol(['퇴근시간', '퇴근']); if (i6 >= 0) clockOutCol = i6
    const i7 = findCol(['근무노트', '메모', '비고']); if (i7 >= 0) noteCol = i7
  }
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 1

  const out: ImportRow[] = []
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i] || []
    const rawName = String(r[nameCol] ?? '').trim()
    const date = normalizeDate(r[dateCol])
    if (!rawName && !date) continue // skip blank rows

    const clockIn = normalizeTime(r[clockInCol])
    const clockOut = normalizeTime(r[clockOutCol])
    const schedStart = normalizeTime(r[schedStartCol])
    const schedEnd = normalizeTime(r[schedEndCol])
    const note = String(r[noteCol] ?? '').trim() || null
    const matched = matchProfile(rawName, profiles)

    let error: string | null = null
    if (!rawName) error = 'missing_name'
    else if (!date) error = 'invalid_date'
    else if (!matched) error = 'unknown_employee'
    else if (!clockIn && !clockOut && !schedStart && !schedEnd) error = 'empty_row'

    out.push({
      rowIndex: i + 1,
      rawName,
      matchedProfileId: matched,
      date: date || '',
      clockIn, clockOut,
      scheduleStart: schedStart,
      scheduleEnd: schedEnd,
      note,
      error,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AttendanceForm {
  profileId: string
  date: string
  clockIn: string
  clockOut: string
  note: string
}

export function AttendancePage() {
  const t = useT()
  const { data: profiles = [] } = useProfiles()
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth())
  const { data: attendances = [], isLoading } = useAttendances(currentMonth)
  const upsertMut = useUpsertAttendance()
  const deleteMut = useDeleteAttendance()
  const bulkUpsertMut = useBulkUpsertAttendances()
  const { data: kioskExcludedIds = [] } = useKioskExcludedIds()
  const updateKioskExcluded = useUpdateKioskExcludedIds()

  const [selectedProfile, setSelectedProfile] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AttendanceForm>({ profileId: '', date: '', clockIn: '', clockOut: '', note: '' })
  const [kioskSettingsOpen, setKioskSettingsOpen] = useState(false)
  const [kioskExcludedDraft, setKioskExcludedDraft] = useState<Set<string>>(new Set())
  const [dayDetail, setDayDetail] = useState<{ date: string; mode: 'work' | 'late' } | null>(null)
  const [lateMonthOpen, setLateMonthOpen] = useState(false)

  // ── Import state ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importError, setImportError] = useState<string | null>(null)

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)
  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth])

  const excludedSet = useMemo(() => new Set(kioskExcludedIds), [kioskExcludedIds])
  // 근태관리는 '정규직' 고용형태인 인원만 대상으로 함
  const activeProfiles = useMemo(
    () => profiles.filter(p =>
      (p.employmentTypes?.includes('permanent') || p.employmentType === 'permanent') &&
      !excludedSet.has(p.id),
    ),
    [profiles, excludedSet],
  )

  // Filtered data based on selected profile
  const filteredAttendances = useMemo(() => {
    if (selectedProfile === 'all') return attendances
    return attendances.filter(a => a.profileId === selectedProfile)
  }, [attendances, selectedProfile])

  // Profile name lookup
  const profileName = useCallback((id: string) => {
    return profiles.find(p => p.id === id)?.name || '?'
  }, [profiles])

  // Summary stats
  const summaryStats = useMemo(() => {
    const target = selectedProfile === 'all' ? attendances : filteredAttendances
    const totalDays = target.length
    const clockedIn = target.filter(a => a.clockIn).length
    const lateCount = target.filter(a => isLate(a.clockIn, a.date)).length
    return { totalDays, clockedIn, lateCount }
  }, [attendances, filteredAttendances, selectedProfile])

  // Dialog
  const openCreate = (date?: string) => {
    setEditId(null)
    setForm({
      profileId: selectedProfile !== 'all' ? selectedProfile : (activeProfiles[0]?.id || ''),
      date: date || new Date().toISOString().slice(0, 10),
      clockIn: '10:00',
      clockOut: '19:00',
      note: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (id: string) => {
    const att = attendances.find(a => a.id === id)
    if (!att) return
    setEditId(id)
    setForm({
      profileId: att.profileId,
      date: att.date,
      clockIn: att.clockIn || '',
      clockOut: att.clockOut || '',
      note: att.note || '',
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!form.profileId || !form.date) return
    upsertMut.mutate({
      profileId: form.profileId,
      date: form.date,
      clockIn: form.clockIn || null,
      clockOut: form.clockOut || null,
      note: form.note || null,
    })
    setDialogOpen(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm(t('attendance.confirmDelete'))) return
    deleteMut.mutate(id)
  }

  // ─── Export in Shiftee format ───
  const handleExport = () => {
    const wsData: (string | number | null)[][] = []

    wsData.push([
      '직원의 사원번호를 입력합니다.\n (동명이인을 구분하려면 직원의 사원번호를 입력하세요.)\n \n (예) ID1224',
      '직원을 입력합니다.\n (기존에 회사에 등록되어 있는 직원만 입력 가능합니다.)\n \n (예) 홍길동',
      '출퇴근기록의 날짜를 입력합니다.\n (형식: YYYY-MM-DD)\n \n\n (예) 2020-01-01',
      '일정 근무라면, 근무일정의 시작시간을 입력합니다.\n (형식: HH:mm)\n \n\n (예) 09:00',
      '일정 근무라면, 근무일정의 종료시간을 입력합니다.\n (형식: HH:mm)\n \n\n (예) 18:00',
      '무일정 근무라면, 출퇴근기록의 조직을 입력합니다.\n (시프티에서 이미 생성된 조직 이어야 합니다.)\n (무일정 근무일때 입력합니다.)\n (조직이 없을경우 입력하지 않습니다.)\n \n (예)   인사팀',
      '무일정 근무라면, 출퇴근기록의 직무를 입력합니다.\n (시프티에서 이미 생성된 직무여야 합니다.)\n (무일정 근무일때 입력합니다.)\n (직무가 없을경우 입력하지 않습니다.)\n \n\n (예) 마케팅',
      '출퇴근기록의 출근시간을 입력합니다.\n (형식: HH:mm)\n \n\n (예) 09:00',
      '출퇴근기록의 퇴근시간을 입력합니다.\n (현재 근무중이라면 입력하지 않습니다.)\n (형식: HH:mm)\n \n\n (예) 18:00',
      '출퇴근기록 관련 메모를 입력합니다.',
    ])

    wsData.push([
      '사원번호 [선택]', '직원이름 [필수]', '날짜 [필수]',
      '(근무일정) 시작시간 [선택]', '(근무일정) 종료시간 [선택]',
      '(무일정) 조직 [선택]', '(무일정) 직무 [선택]',
      '출근시간 [필수]', '퇴근시간 [선택]', '근무노트 [선택]',
    ])

    const targetAttendances = selectedProfile === 'all'
      ? attendances
      : attendances.filter(a => a.profileId === selectedProfile)

    const sorted = [...targetAttendances].sort((a, b) => {
      const nameA = profileName(a.profileId)
      const nameB = profileName(b.profileId)
      if (nameA !== nameB) return nameA.localeCompare(nameB)
      return a.date.localeCompare(b.date)
    })

    for (const att of sorted) {
      wsData.push([
        '', profileName(att.profileId), att.date,
        att.scheduleStart || '', att.scheduleEnd || '',
        '', '',
        att.clockIn || '', att.clockOut || '', att.note || '',
      ])
    }

    while (wsData.length < 1002) {
      wsData.push(['', '', '', '', '', '', '', '', '', ''])
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [
      { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '업로드')

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `shiftee-attendances-${currentMonth}.xlsx`)
  }

  // ─── Import handlers ───
  const handleFilePick = () => fileInputRef.current?.click()

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so picking same file again works
    setImportError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) {
        setImportError(t('attendance.import.emptyFile'))
        return
      }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
      const parsed = parseShiftyFile(rows, profiles)
      if (parsed.length === 0) {
        setImportError(t('attendance.import.noRows'))
        return
      }
      setImportRows(parsed)
      setImportDialogOpen(true)
    } catch (err) {
      console.error(err)
      setImportError(String(err instanceof Error ? err.message : err))
    }
  }

  const importValidRows = useMemo(() => importRows.filter(r => !r.error), [importRows])
  const importErrorRows = useMemo(() => importRows.filter(r => r.error), [importRows])

  const handleImportConfirm = async () => {
    if (importValidRows.length === 0) return
    await bulkUpsertMut.mutateAsync(
      importValidRows.map(r => ({
        profileId: r.matchedProfileId!,
        date: r.date,
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        scheduleStart: r.scheduleStart,
        scheduleEnd: r.scheduleEnd,
        note: r.note,
      }))
    )
    setImportDialogOpen(false)
    setImportRows([])
  }

  // ─── Calendar view data ───
  const calendarProfiles = useMemo(() => {
    if (selectedProfile === 'all') return activeProfiles
    return activeProfiles.filter(p => p.id === selectedProfile)
  }, [activeProfiles, selectedProfile])

  // Attendance records grouped by date (only the profiles shown in the calendar)
  const attendancesByDate = useMemo(() => {
    const ids = new Set(calendarProfiles.map(p => p.id))
    const m = new Map<string, typeof attendances>()
    for (const a of attendances) {
      if (!ids.has(a.profileId)) continue
      const arr = m.get(a.date) || []
      arr.push(a)
      m.set(a.date, arr)
    }
    return m
  }, [attendances, calendarProfiles])

  const todayStr = new Date().toISOString().slice(0, 10)
  const firstDow = days.length ? new Date(`${days[0]}T00:00:00`).getDay() : 0

  // Total worked hours per employee for the month
  const totalHoursByProfile = useMemo(() => {
    const map = new Map<string, number>() // profileId -> total minutes
    for (const a of attendances) {
      if (a.clockIn && a.clockOut) {
        const [h1, m1] = a.clockIn.split(':').map(Number)
        const [h2, m2] = a.clockOut.split(':').map(Number)
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
        if (mins > 0) {
          map.set(a.profileId, (map.get(a.profileId) || 0) + mins)
        }
      }
    }
    return map
  }, [attendances])

  const sortedHoursSummary = useMemo(() => {
    const entries = Array.from(totalHoursByProfile.entries())
      .map(([profileId, totalMins]) => ({
        profileId,
        name: profileName(profileId),
        totalMins,
        hours: Math.floor(totalMins / 60),
        mins: totalMins % 60,
      }))
      .filter(e => {
        if (selectedProfile === 'all') return true
        return e.profileId === selectedProfile
      })
    entries.sort((a, b) => b.totalMins - a.totalMins)
    return entries
  }, [totalHoursByProfile, profileName, selectedProfile])

  // Weekly hours per employee — current week only
  const weeklyHoursSummary = useMemo(() => {
    const currentWeekKey = getWeekKey(new Date().toISOString().slice(0, 10))
    const profileMap = new Map<string, number>()
    let weekLabel = ''
    for (const a of attendances) {
      if (!a.clockIn || !a.clockOut) continue
      if (getWeekKey(a.date) !== currentWeekKey) continue
      if (!weekLabel) weekLabel = getWeekLabel(a.date)
      const [h1, m1] = a.clockIn.split(':').map(Number)
      const [h2, m2] = a.clockOut.split(':').map(Number)
      const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
      if (mins > 0) profileMap.set(a.profileId, (profileMap.get(a.profileId) || 0) + mins)
    }
    if (profileMap.size === 0) return []
    const entries = Array.from(profileMap.entries())
      .map(([pid, totalMins]) => ({
        profileId: pid,
        name: profileName(pid),
        totalMins,
        hours: Math.floor(totalMins / 60),
        mins: totalMins % 60,
      }))
      .filter(e => selectedProfile === 'all' || e.profileId === selectedProfile)
    entries.sort((a, b) => b.totalMins - a.totalMins)
    return entries.length > 0 ? [{ weekKey: currentWeekKey, label: weekLabel, entries }] : []
  }, [attendances, profileName, selectedProfile])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('attendance.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('attendance.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold min-w-[120px] text-center">
          {year}{t('common.year')} {month}{t('common.month')}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setCurrentMonth(getCurrentMonth())}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            {t('common.thisMonth')}
          </Button>
        )}

        <div className="flex-1" />

        <Select value={selectedProfile} onValueChange={v => v && setSelectedProfile(v)}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <span>{selectedProfile === 'all' ? t('common.all') : profileName(selectedProfile)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {activeProfiles.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" className="h-8" onClick={() => openCreate()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('attendance.add')}
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {t('attendance.export')}
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={handleFilePick}>
          <Upload className="h-3.5 w-3.5 mr-1" />
          {t('attendance.import.button')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChosen}
        />
        {importError && (
          <span className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />{importError}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            setKioskExcludedDraft(new Set(kioskExcludedIds))
            setKioskSettingsOpen(true)
          }}
        >
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          {t('attendance.kioskSettings')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-2.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('attendance.totalRecords')}</span>
            <span className="text-lg font-bold font-mono">{summaryStats.totalDays}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('attendance.clockedIn')}</span>
            <span className="text-lg font-bold font-mono text-green-600">{summaryStats.clockedIn}</span>
          </CardContent>
        </Card>
        <Card
          className={`${summaryStats.lateCount > 0 ? 'border-red-200 cursor-pointer hover:bg-red-50/40' : ''}`}
          onClick={() => { if (summaryStats.lateCount > 0) setLateMonthOpen(true) }}
        >
          <CardContent className="py-2.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              {t('attendance.lateCount')}
              {summaryStats.lateCount > 0 && <span className="text-[10px] text-muted-foreground/70">(클릭)</span>}
            </span>
            <span className={`text-lg font-bold font-mono ${summaryStats.lateCount > 0 ? 'text-red-600' : ''}`}>
              {summaryStats.lateCount}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Weekly hours per employee */}
      {weeklyHoursSummary.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-indigo-500" />
              {t('attendance.weeklyHours')}
            </h3>
            <div className="space-y-2">
              {weeklyHoursSummary.map(week => (
                <div key={week.weekKey}>
                  <div className="text-xs font-medium text-muted-foreground mb-1">{week.label}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {week.entries.map(entry => (
                      <div
                        key={entry.profileId}
                        className="flex items-center justify-between bg-indigo-50/60 rounded-lg px-3 py-1.5"
                      >
                        <span className="text-sm font-medium truncate mr-2">{entry.name}</span>
                        <span className={`text-sm font-mono font-bold whitespace-nowrap ${entry.totalMins > 52 * 60 ? 'text-red-600' : 'text-indigo-600'}`}>
                          {entry.hours}h{entry.mins > 0 ? ` ${entry.mins}m` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly total hours per employee */}
      {sortedHoursSummary.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-500" />
              {t('attendance.monthlyHours')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {sortedHoursSummary.map(entry => (
                <div
                  key={entry.profileId}
                  className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-medium truncate mr-2">{entry.name}</span>
                  <span className="text-sm font-mono font-bold text-blue-600 whitespace-nowrap">
                    {entry.hours}h{entry.mins > 0 ? ` ${entry.mins}m` : ''}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly attendance calendar — per-day 출근/지각 인원 */}
      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div>
              {/* Weekday header */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                  <div key={w} className={`text-center text-[11px] font-semibold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'}`}>{w}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`blank-${i}`} />)}
                {days.map(day => {
                  const recs = attendancesByDate.get(day) || []
                  const present = recs.filter(r => r.clockIn).length
                  const late = recs.filter(r => isLate(r.clockIn, r.date)).length
                  const dnum = parseInt(day.split('-')[2])
                  const weekend = isWeekend(day)
                  const today = day === todayStr
                  return (
                    <div
                      key={day}
                      className={`min-h-[72px] rounded-md border p-1 flex flex-col gap-0.5 ${weekend ? 'bg-red-50/30' : 'bg-white'} ${today ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <div className={`text-[11px] font-medium ${weekend ? 'text-red-500' : 'text-gray-600'}`}>{dnum}</div>
                      {present > 0 && (
                        <button
                          type="button"
                          onClick={() => setDayDetail({ date: day, mode: 'work' })}
                          className="text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded px-1 py-0.5 text-left font-medium transition-colors"
                          title="클릭하면 출퇴근 기록 보기"
                        >
                          출근 {present}
                        </button>
                      )}
                      {late > 0 && (
                        <button
                          type="button"
                          onClick={() => setDayDetail({ date: day, mode: 'late' })}
                          className="text-[11px] text-red-600 bg-red-50 hover:bg-red-100 rounded px-1 py-0.5 text-left font-medium transition-colors"
                          title="클릭하면 지각자 보기"
                        >
                          지각 {late}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                초록 “출근 N”을 누르면 그 날 출퇴근한 인원의 기록이 나옵니다 · 대상: 정규직 {calendarProfiles.length}명
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail list */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('attendance.employee')}</TableHead>
                <TableHead>{t('attendance.date')}</TableHead>
                <TableHead>{t('attendance.clockIn')}</TableHead>
                <TableHead>{t('attendance.clockOut')}</TableHead>
                <TableHead>{t('attendance.workHours')}</TableHead>
                <TableHead>{t('attendance.note')}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttendances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    {t('attendance.noRecords')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAttendances.map(att => {
                  let workHrs = ''
                  if (att.clockIn && att.clockOut) {
                    const [h1, m1] = att.clockIn.split(':').map(Number)
                    const [h2, m2] = att.clockOut.split(':').map(Number)
                    const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
                    if (mins > 0) {
                      const hrs = Math.floor(mins / 60)
                      const rm = mins % 60
                      workHrs = `${hrs}h${rm > 0 ? ` ${rm}m` : ''}`
                    }
                  }
                  const weekend = isWeekend(att.date)
                  const late = isLate(att.clockIn, att.date)
                  return (
                    <TableRow key={att.id} className={`${weekend ? 'bg-red-50/30' : ''} ${late ? 'bg-red-50/40' : ''}`}>
                      <TableCell className="font-medium">{profileName(att.profileId)}</TableCell>
                      <TableCell>
                        <span>{att.date}</span>
                        <Badge variant="outline" className={`ml-2 text-[10px] ${weekend ? 'bg-red-50 text-red-600 border-red-200' : ''}`}>
                          {t(getDayOfWeekKey(att.date))}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {att.clockIn ? (
                          <Badge
                            variant="secondary"
                            className={`font-mono text-xs ${late ? 'bg-red-100 text-red-700 border-red-300' : ''}`}
                          >
                            {att.clockIn}
                            {late && <AlertTriangle className="h-3 w-3 ml-1 inline" />}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {att.clockOut ? (
                          <Badge variant="secondary" className="font-mono text-xs">{att.clockOut}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{workHrs || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{att.note || ''}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(att.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(att.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Day detail — 근무(출퇴근 전체) or 지각(지각자만) */}
      <Dialog open={!!dayDetail} onOpenChange={o => { if (!o) setDayDetail(null) }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {dayDetail?.date} {dayDetail?.mode === 'late' ? '지각자' : '출퇴근 기록'}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const all = dayDetail ? attendancesByDate.get(dayDetail.date) || [] : []
            const recs = all
              .filter(r => dayDetail?.mode === 'late' ? isLate(r.clockIn, r.date) : (r.clockIn || r.clockOut))
              .sort((a, b) => (a.clockIn || '').localeCompare(b.clockIn || ''))
            if (recs.length === 0) {
              return <p className="text-sm text-muted-foreground py-6 text-center">
                {dayDetail?.mode === 'late' ? '이 날 지각자가 없습니다.' : '이 날 출퇴근 기록이 없습니다.'}
              </p>
            }
            return (
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {recs.map(r => {
                  const late = isLate(r.clockIn, r.date)
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-2 px-1 cursor-pointer hover:bg-muted/40 rounded"
                      onClick={() => { setDayDetail(null); openEdit(r.id) }}
                    >
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        {profileName(r.profileId)}
                        {dayDetail?.mode === 'late' && <Badge variant="outline" className="text-[10px] h-4 bg-red-50 text-red-600 border-red-200">지각</Badge>}
                      </span>
                      <span className="text-sm font-mono">
                        <span className={late ? 'text-red-600 font-bold' : 'text-green-600'}>{formatTime(r.clockIn)}</span>
                        <span className="text-muted-foreground"> ~ </span>
                        <span className="text-blue-600">{formatTime(r.clockOut)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Month late list — from the top 지각 summary card */}
      <Dialog open={lateMonthOpen} onOpenChange={setLateMonthOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{year}{t('common.year')} {month}{t('common.month')} 지각 내역</DialogTitle>
          </DialogHeader>
          {(() => {
            const target = selectedProfile === 'all' ? attendances : filteredAttendances
            const lateRecs = target
              .filter(a => isLate(a.clockIn, a.date))
              .sort((a, b) => a.date.localeCompare(b.date) || (a.clockIn || '').localeCompare(b.clockIn || ''))
            if (lateRecs.length === 0) {
              return <p className="text-sm text-muted-foreground py-6 text-center">지각 내역이 없습니다.</p>
            }
            return (
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {lateRecs.map(r => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2 px-1 cursor-pointer hover:bg-muted/40 rounded"
                    onClick={() => { setLateMonthOpen(false); openEdit(r.id) }}
                  >
                    <span className="text-sm">
                      <span className="font-mono text-muted-foreground mr-2">{r.date.slice(5)}</span>
                      <span className="font-medium">{profileName(r.profileId)}</span>
                    </span>
                    <span className="text-sm font-mono text-red-600 font-bold">{formatTime(r.clockIn)}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editId ? t('attendance.edit') : t('attendance.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('attendance.employee')} *</Label>
              <Select value={form.profileId} onValueChange={v => v && setForm(f => ({ ...f, profileId: v }))}>
                <SelectTrigger>
                  <span>{form.profileId ? profileName(form.profileId) : t('common.select')}</span>
                </SelectTrigger>
                <SelectContent>
                  {activeProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('attendance.date')} *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('attendance.clockIn')}</Label>
                <Input type="time" value={form.clockIn} onChange={e => setForm(f => ({ ...f, clockIn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('attendance.clockOut')}</Label>
                <Input type="time" value={form.clockOut} onChange={e => setForm(f => ({ ...f, clockOut: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('attendance.note')}</Label>
              <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder={t('attendance.notePlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={!form.profileId || !form.date}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[820px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" />
              {t('attendance.import.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="h-3 w-3 mr-1" />
              {t('attendance.import.matched')}: {importValidRows.length}
            </Badge>
            {importErrorRows.length > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <X className="h-3 w-3 mr-1" />
                {t('attendance.import.skipped')}: {importErrorRows.length}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {t('attendance.import.upsertNote')}
            </span>
          </div>
          <div className="flex-1 overflow-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>{t('attendance.employee')}</TableHead>
                  <TableHead>{t('attendance.date')}</TableHead>
                  <TableHead>{t('attendance.clockIn')}</TableHead>
                  <TableHead>{t('attendance.clockOut')}</TableHead>
                  <TableHead>{t('attendance.note')}</TableHead>
                  <TableHead className="w-[100px]">{t('attendance.import.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map(r => (
                  <TableRow key={r.rowIndex} className={r.error ? 'bg-red-50/40' : ''}>
                    <TableCell className="text-xs text-muted-foreground">{r.rowIndex}</TableCell>
                    <TableCell className="text-sm">
                      {r.matchedProfileId ? (
                        <span className="font-medium">{profileName(r.matchedProfileId)}</span>
                      ) : (
                        <span className="text-red-600">{r.rawName || '(empty)'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{r.date || '-'}</TableCell>
                    <TableCell className="text-sm font-mono">{r.clockIn || '-'}</TableCell>
                    <TableCell className="text-sm font-mono">{r.clockOut || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                      {r.note || ''}
                    </TableCell>
                    <TableCell>
                      {r.error ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
                          {t(`attendance.import.err.${r.error}`)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                          <Check className="h-3 w-3 mr-0.5" /> OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={importValidRows.length === 0 || bulkUpsertMut.isPending}
            >
              {bulkUpsertMut.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              {t('attendance.import.confirm', { count: String(importValidRows.length) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kiosk Settings Dialog */}
      <Dialog open={kioskSettingsOpen} onOpenChange={setKioskSettingsOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-5" />
              {t('attendance.kioskSettings')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('attendance.kioskSettingsDesc')}</p>
          <div className="max-h-[50vh] overflow-y-auto space-y-1 py-2">
            {profiles.filter(p => !p.isExternal).map(p => {
              const isExcluded = kioskExcludedDraft.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setKioskExcludedDraft(prev => {
                      const next = new Set(prev)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      return next
                    })
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    isExcluded ? 'bg-gray-50 text-muted-foreground' : 'bg-green-50 hover:bg-green-100'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                    isExcluded ? 'border-gray-300 bg-white' : 'border-green-500 bg-green-500'
                  }`}>
                    {!isExcluded && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-sm font-medium">{p.name}</span>
                  {isExcluded && <span className="text-xs text-muted-foreground ml-auto">{t('attendance.kioskHidden')}</span>}
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKioskSettingsOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => {
                updateKioskExcluded.mutate([...kioskExcludedDraft])
                setKioskSettingsOpen(false)
              }}
              disabled={updateKioskExcluded.isPending}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
