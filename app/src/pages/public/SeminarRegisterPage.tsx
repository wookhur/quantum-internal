import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle2, CalendarDays, MapPin } from 'lucide-react'
import { useSeminarById, useSubmitRegistration } from '@/hooks/useSeminars'
import type { SeminarSession } from '@/hooks/useSeminars'

function formatSeminarDate(raw: string): string {
  const [datePart, timePart] = raw.split(' ')
  if (!datePart) return raw
  const [y, m, d] = datePart.split('-')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  const dayName = days[dt.getDay()]
  const base = `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 (${dayName})`
  return timePart ? `${base} ${timePart}` : base
}

const GRADES = Array.from({ length: 12 }, (_, i) => `G${i + 1}`)
const YEARS = Array.from({ length: 12 }, (_, i) => `Y${i + 1}`)
const GRADE_OPTIONS = [...GRADES, ...YEARS]

export function SeminarRegisterPage() {
  const { id } = useParams<{ id: string }>()
  const { data: seminar, isLoading, error } = useSeminarById(id)
  const submitMut = useSubmitRegistration()
  const [submitted, setSubmitted] = useState(false)

  const [form, setForm] = useState({
    parentName: '',
    phone: '',
    email: '',
    studentName: '',
    grade: '',
    school: '',
    interest: '',
    memo: '',
  })
  const [pickedSessions, setPickedSessions] = useState<Set<string>>(new Set())

  const hasSessions = !!seminar && seminar.sessions.length > 0
  const needsSessionPick = hasSessions && pickedSessions.size === 0

  const toggleSession = (label: string) => {
    setPickedSessions(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !form.parentName.trim() || !form.phone.trim() || !form.studentName.trim()) return
    if (needsSessionPick) return
    await submitMut.mutateAsync({
      seminarId: id,
      parentName: form.parentName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      studentName: form.studentName.trim(),
      grade: form.grade || null,
      school: form.school.trim() || null,
      interest: form.interest.trim() || null,
      memo: form.memo.trim() || null,
      sessionLabels: Array.from(pickedSessions),
    })
    setSubmitted(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !seminar) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium text-gray-700">세미나를 찾을 수 없습니다</p>
            <p className="text-sm text-gray-500 mt-2">링크를 다시 확인해주세요.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!seminar.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium text-gray-700">신청이 마감되었습니다</p>
            <p className="text-sm text-gray-500 mt-2">이 세미나의 신청 기간이 종료되었습니다.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    const picked = Array.from(pickedSessions)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="size-16 text-green-500 mx-auto" />
            <div>
              <p className="text-xl font-bold text-gray-800">신청이 완료되었습니다!</p>
              <p className="text-sm text-gray-500 mt-2">
                {seminar.title} 세미나 신청이 접수되었습니다.
              </p>
              {picked.length > 0 && (
                <div className="mt-3 mx-auto max-w-xs text-left bg-gray-50 rounded-md border p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-600">신청하신 세션</p>
                  {picked.map(l => (
                    <p key={l} className="text-sm text-gray-800 leading-snug">· {l}</p>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-500 mt-3">확인 연락을 드리겠습니다. 감사합니다.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {seminar.title}
          </h1>
          {seminar.description && (
            <p className="text-gray-600 text-sm whitespace-pre-wrap">{seminar.description}</p>
          )}
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            {!hasSessions && seminar.date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-4" />
                {formatSeminarDate(seminar.date)}
              </span>
            )}
            {seminar.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {seminar.location}
              </span>
            )}
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">세미나 참가 신청</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Session picker — only when the seminar defines a schedule */}
              {hasSessions && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 border-b pb-1">
                    신청하시는 세션 일정 <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-400 font-normal ml-1">(중복 선택 가능)</span>
                  </p>
                  <div className="space-y-2">
                    {seminar.sessions.map((s: SeminarSession, idx: number) => {
                      const checked = pickedSessions.has(s.label)
                      return (
                        <label
                          key={`${s.label}-${idx}`}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                            checked ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-indigo-600"
                            checked={checked}
                            onChange={() => toggleSession(s.label)}
                          />
                          <span className="text-sm text-gray-800 leading-snug">{s.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Parent info */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">학부모 정보</p>
                <div>
                  <Label>이름 *</Label>
                  <Input
                    value={form.parentName}
                    onChange={e => setForm({ ...form, parentName: e.target.value })}
                    placeholder="홍길동"
                    required
                  />
                </div>
                <div>
                  <Label>연락처 *</Label>
                  <Input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="010-1234-5678"
                    required
                  />
                </div>
                <div>
                  <Label>이메일 *</Label>
                  <Input
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                    type="email"
                    required
                  />
                </div>
              </div>

              {/* Student info */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">자녀 정보</p>
                <div>
                  <Label>학생 이름 *</Label>
                  <Input
                    value={form.studentName}
                    onChange={e => setForm({ ...form, studentName: e.target.value })}
                    placeholder="홍길순"
                    required
                  />
                </div>
                <div>
                  <Label>학년</Label>
                  <Select value={form.grade} onValueChange={v => setForm({ ...form, grade: v ?? '' })}>
                    <SelectTrigger>
                      <SelectValue placeholder="학년 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>학교</Label>
                  <Input
                    value={form.school}
                    onChange={e => setForm({ ...form, school: e.target.value })}
                    placeholder="OO고등학교"
                  />
                </div>
                <div>
                  <Label>관심 프로그램 / 사항</Label>
                  <Input
                    value={form.interest}
                    onChange={e => setForm({ ...form, interest: e.target.value })}
                    placeholder="미국 대학 입시, SAT 등"
                  />
                </div>
              </div>

              <div>
                <Label>추가 메모</Label>
                <Textarea
                  value={form.memo}
                  onChange={e => setForm({ ...form, memo: e.target.value })}
                  placeholder="궁금한 점이나 전달사항"
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  submitMut.isPending ||
                  !form.parentName.trim() ||
                  !form.phone.trim() ||
                  !form.studentName.trim() ||
                  needsSessionPick
                }
              >
                {submitMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                {needsSessionPick ? '세션 일정을 선택해주세요' : '신청하기'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          © Quantum Admissions
        </p>
      </div>
    </div>
  )
}
