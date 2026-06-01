import { useState, useEffect, useMemo, useCallback } from 'react'
import { LogIn, LogOut, ChevronLeft, Check, Clock } from 'lucide-react'
import { useProfiles } from '@/hooks/useProfiles'
import { useAttendances, useUpsertAttendance } from '@/hooks/useAttendances'
import { useKioskExcludedIds } from '@/hooks/useKioskSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonth(): string {
  return todayStr().slice(0, 7)
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}


const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type KioskStep = 'select' | 'action' | 'done'

export function AttendanceKioskPage() {
  const { data: profiles = [] } = useProfiles()
  const { data: attendances = [] } = useAttendances(currentMonth())
  const upsertMut = useUpsertAttendance()
  const { data: kioskExcludedIds = [] } = useKioskExcludedIds()

  const [step, setStep] = useState<KioskStep>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clockStr, setClockStr] = useState(formatClock(new Date()))
  const [doneAction, setDoneAction] = useState<'in' | 'out'>('in')

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setClockStr(formatClock(new Date())), 1000)
    return () => clearInterval(iv)
  }, [])

  // Auto-reset after done
  useEffect(() => {
    if (step === 'done') {
      const timer = setTimeout(() => {
        setStep('select')
        setSelectedId(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [step])

  const excludedSet = useMemo(() => new Set(kioskExcludedIds), [kioskExcludedIds])
  const activeProfiles = useMemo(
    () => profiles.filter(p => !p.isExternal && !excludedSet.has(p.id)),
    [profiles, excludedSet],
  )

  // Today's attendance lookup
  const todayMap = useMemo(() => {
    const today = todayStr()
    const map = new Map<string, { clockIn: string | null; clockOut: string | null }>()
    for (const a of attendances) {
      if (a.date === today) {
        map.set(a.profileId, { clockIn: a.clockIn, clockOut: a.clockOut })
      }
    }
    return map
  }, [attendances])

  const selectedProfile = useMemo(
    () => activeProfiles.find(p => p.id === selectedId) || null,
    [activeProfiles, selectedId],
  )

  const selectedTodayRecord = selectedId ? todayMap.get(selectedId) || null : null

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setStep('action')
  }, [])

  const handleClockIn = useCallback(() => {
    if (!selectedId) return
    upsertMut.mutate(
      { profileId: selectedId, date: todayStr(), clockIn: nowTime(), clockOut: selectedTodayRecord?.clockOut },
      {
        onSuccess: () => {
          setDoneAction('in')
          setStep('done')
        },
      },
    )
  }, [selectedId, selectedTodayRecord, upsertMut])

  const handleClockOut = useCallback(() => {
    if (!selectedId) return
    upsertMut.mutate(
      { profileId: selectedId, date: todayStr(), clockIn: selectedTodayRecord?.clockIn, clockOut: nowTime() },
      {
        onSuccess: () => {
          setDoneAction('out')
          setStep('done')
        },
      },
    )
  }, [selectedId, selectedTodayRecord, upsertMut])

  // ─── Select Screen ───
  if (step === 'select') {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
        {/* Header */}
        <div className="text-center pt-8 pb-4 px-4">
          <div className="text-5xl font-mono font-bold text-slate-800 tracking-wider">
            {clockStr}
          </div>
          <div className="text-sm text-slate-500 mt-2">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>

        <div className="px-6 pb-3">
          <h2 className="text-lg font-semibold text-slate-700 text-center">직원을 선택하세요</h2>
        </div>

        {/* Employee grid */}
        <div className="flex-1 px-4 pb-8 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            {activeProfiles.map((p, i) => {
              const todayRec = todayMap.get(p.id)
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm active:scale-95 active:bg-slate-50 transition-all"
                >
                  <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white text-xl font-bold shadow-md`}>
                    {p.name.charAt(0)}
                  </div>
                  <span className="text-base font-semibold text-slate-800">{p.name}</span>
                  {/* Status */}
                  {todayRec?.clockIn ? (
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${todayRec.clockOut ? 'bg-slate-400' : 'bg-green-500 animate-pulse'}`} />
                      <span className="text-xs text-slate-500">
                        {todayRec.clockIn}
                        {todayRec.clockOut ? ` ~ ${todayRec.clockOut}` : ' 근무중'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">미출근</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-slate-400">
          Quantum Admissions
        </div>
      </div>
    )
  }

  // ─── Action Screen ───
  if (step === 'action' && selectedProfile) {
    const colorIdx = activeProfiles.indexOf(selectedProfile)
    const color = AVATAR_COLORS[(colorIdx >= 0 ? colorIdx : 0) % AVATAR_COLORS.length]
    const hasClockIn = !!selectedTodayRecord?.clockIn
    const hasClockOut = !!selectedTodayRecord?.clockOut

    return (
      <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
        {/* Back */}
        <div className="p-4">
          <button
            onClick={() => { setStep('select'); setSelectedId(null) }}
            className="flex items-center gap-1 text-slate-500 active:text-slate-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">돌아가기</span>
          </button>
        </div>

        {/* Clock */}
        <div className="text-center pt-4 pb-6">
          <div className="text-5xl font-mono font-bold text-slate-800 tracking-wider">
            {clockStr}
          </div>
          <div className="text-sm text-slate-500 mt-2">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>

        {/* Profile */}
        <div className="flex flex-col items-center gap-3 pb-8">
          <div className={`w-24 h-24 rounded-full ${color} flex items-center justify-center text-white text-3xl font-bold shadow-lg`}>
            {selectedProfile.name.charAt(0)}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{selectedProfile.name}</h2>

          {/* Today status */}
          {hasClockIn && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-sm text-slate-600">
                출근 {selectedTodayRecord!.clockIn}
                {hasClockOut && ` · 퇴근 ${selectedTodayRecord!.clockOut}`}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-1 flex flex-col items-center gap-4 px-8">
          {/* Clock In */}
          <button
            onClick={handleClockIn}
            disabled={upsertMut.isPending}
            className={`w-full max-w-sm py-6 rounded-2xl text-white text-xl font-bold shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
              hasClockIn
                ? 'bg-slate-300 shadow-none'
                : 'bg-green-500 active:bg-green-600 shadow-green-200'
            }`}
          >
            <LogIn className="h-7 w-7" />
            {hasClockIn ? `출근 완료 (${selectedTodayRecord!.clockIn})` : '출근'}
          </button>

          {/* Clock Out */}
          <button
            onClick={handleClockOut}
            disabled={upsertMut.isPending || !hasClockIn}
            className={`w-full max-w-sm py-6 rounded-2xl text-white text-xl font-bold shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
              !hasClockIn
                ? 'bg-slate-200 shadow-none cursor-not-allowed'
                : hasClockOut
                  ? 'bg-slate-300 shadow-none'
                  : 'bg-blue-500 active:bg-blue-600 shadow-blue-200'
            }`}
          >
            <LogOut className="h-7 w-7" />
            {hasClockOut ? `퇴근 완료 (${selectedTodayRecord!.clockOut})` : '퇴근'}
          </button>

          {hasClockIn && !hasClockOut && (
            <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              근무 중
            </p>
          )}
          {hasClockIn && hasClockOut && (
            <p className="text-sm text-slate-500 mt-2">오늘 근무가 완료되었습니다.</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-slate-400">
          Quantum Admissions
        </div>
      </div>
    )
  }

  // ─── Done Screen ───
  if (step === 'done' && selectedProfile) {
    return (
      <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center px-8">
        <div className={`w-28 h-28 rounded-full ${doneAction === 'in' ? 'bg-green-500' : 'bg-blue-500'} flex items-center justify-center shadow-xl mb-8 animate-in zoom-in duration-300`}>
          <Check className="h-14 w-14 text-white" strokeWidth={3} />
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">{selectedProfile.name}</h2>
        <p className={`text-xl font-semibold ${doneAction === 'in' ? 'text-green-600' : 'text-blue-600'}`}>
          {doneAction === 'in' ? '출근' : '퇴근'} 완료
        </p>
        <p className="text-4xl font-mono font-bold text-slate-800 mt-4">
          {nowTime()}
        </p>
        <p className="text-sm text-slate-400 mt-8">3초 후 자동으로 돌아갑니다...</p>
      </div>
    )
  }

  return null
}
