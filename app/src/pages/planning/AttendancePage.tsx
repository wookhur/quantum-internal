import { useState, useMemo, useCallback } from 'react'
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
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useAttendances, useUpsertAttendance, useDeleteAttendance } from '@/hooks/useAttendances'
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

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr)
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
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

const EXCLUDED_IDS = new Set([
  'bb51bba1-b665-4431-b6d6-d44a63f82423', // Accounting Quantum
  '3638c8f3-6eee-45ea-8bc5-527c2e85a77c', // Liz Yu
  'd26cad07-580e-4cb9-bb95-cf0ae262f5b4', // Julie Kim
])

export function AttendancePage() {
  const t = useT()
  const { data: profiles = [] } = useProfiles()
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonth())
  const { data: attendances = [], isLoading } = useAttendances(currentMonth)
  const upsertMut = useUpsertAttendance()
  const deleteMut = useDeleteAttendance()

  const [selectedProfile, setSelectedProfile] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AttendanceForm>({ profileId: '', date: '', clockIn: '', clockOut: '', note: '' })

  const isCurrentMonth = currentMonth === getCurrentMonth()
  const [year, month] = currentMonth.split('-').map(Number)
  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth])

  const activeProfiles = useMemo(() => profiles.filter(p => !p.isExternal && !EXCLUDED_IDS.has(p.id)), [profiles])

  // Build lookup: profileId+date -> attendance
  const attendanceMap = useMemo(() => {
    const map = new Map<string, typeof attendances[0]>()
    for (const a of attendances) {
      map.set(`${a.profileId}:${a.date}`, a)
    }
    return map
  }, [attendances])

  // Filtered data based on selected profile
  const filteredAttendances = useMemo(() => {
    if (selectedProfile === 'all') return attendances
    return attendances.filter(a => a.profileId === selectedProfile)
  }, [attendances, selectedProfile])

  // Profile name lookup
  const profileName = useCallback((id: string) => {
    return profiles.find(p => p.id === id)?.name || '?'
  }, [profiles])

  // Late counts per profile
  const lateCountByProfile = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of attendances) {
      if (isLate(a.clockIn, a.date)) {
        map.set(a.profileId, (map.get(a.profileId) || 0) + 1)
      }
    }
    return map
  }, [attendances])

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

  // ─── Calendar view data ───
  const calendarProfiles = useMemo(() => {
    if (selectedProfile === 'all') return activeProfiles
    return activeProfiles.filter(p => p.id === selectedProfile)
  }, [activeProfiles, selectedProfile])

  const numDays = days.length

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
        <Card className={summaryStats.lateCount > 0 ? 'border-red-200' : ''}>
          <CardContent className="py-2.5 flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              {t('attendance.lateCount')}
            </span>
            <span className={`text-lg font-bold font-mono ${summaryStats.lateCount > 0 ? 'text-red-600' : ''}`}>
              {summaryStats.lateCount}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Calendar grid — fixed to viewport width */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full border-collapse table-fixed">
                <colgroup>
                  <col style={{ width: '100px' }} />
                  {days.map(day => (
                    <col key={day} style={{ width: `${(100 - 8) / numDays}%` }} />
                  ))}
                  {/* Late count column */}
                  <col style={{ width: '44px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 bg-background z-10 text-left text-xs font-medium text-muted-foreground p-1.5 pl-3">
                      {t('attendance.employee')}
                    </th>
                    {days.map(day => {
                      const d = parseInt(day.split('-')[2])
                      const dow = getDayOfWeek(day)
                      const weekend = isWeekend(day)
                      return (
                        <th
                          key={day}
                          className={`text-center p-0.5 ${weekend ? 'bg-red-50/50' : ''}`}
                        >
                          <div className="text-[11px] font-medium leading-tight">{d}</div>
                          <div className={`text-[9px] leading-tight ${weekend ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>{dow}</div>
                        </th>
                      )
                    })}
                    <th className="text-center p-0.5">
                      <div className="text-[9px] text-red-500 font-medium leading-tight" title={t('attendance.lateCount')}>
                        <AlertTriangle className="h-3 w-3 mx-auto" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calendarProfiles.map(profile => {
                    const lateCount = lateCountByProfile.get(profile.id) || 0
                    return (
                      <tr key={profile.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="sticky left-0 bg-background z-10 text-sm font-medium whitespace-nowrap p-1.5 pl-3 truncate">
                          {profile.name}
                        </td>
                        {days.map(day => {
                          const att = attendanceMap.get(`${profile.id}:${day}`)
                          const weekend = isWeekend(day)
                          const late = att ? isLate(att.clockIn, att.date) : false
                          return (
                            <td
                              key={day}
                              className={`text-center p-0 cursor-pointer hover:bg-blue-50/50 transition-colors ${weekend ? 'bg-red-50/20' : ''} ${late ? 'bg-red-50/60' : ''}`}
                              onClick={() => {
                                if (att) {
                                  openEdit(att.id)
                                } else {
                                  setEditId(null)
                                  setForm({ profileId: profile.id, date: day, clockIn: '10:00', clockOut: '19:00', note: '' })
                                  setDialogOpen(true)
                                }
                              }}
                            >
                              {att ? (
                                <div className="flex flex-col items-center leading-none py-1">
                                  <span className={`text-[9px] font-mono ${late ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                    {formatTime(att.clockIn)}
                                  </span>
                                  <span className="text-[9px] font-mono text-blue-600">
                                    {formatTime(att.clockOut)}
                                  </span>
                                </div>
                              ) : weekend ? null : (
                                <span className="text-[9px] text-muted-foreground/20">-</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="text-center p-0.5">
                          {lateCount > 0 ? (
                            <span className="text-[11px] font-bold text-red-600">{lateCount}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/30">0</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
                          {getDayOfWeek(att.date)}
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
    </div>
  )
}
