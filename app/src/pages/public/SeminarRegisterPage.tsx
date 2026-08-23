import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/PhoneInput'
import { parsePhone, isPhoneComplete, findCountry } from '@/lib/phone'
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

const SOURCE_OPTIONS = [
  '인스타그램', '네이버 블로그/카페', '카카오톡 채널', '지인 소개',
  '구글/네이버 검색', '유튜브', '문자/DM', '기타',
]

export function SeminarRegisterPage() {
  const { id } = useParams<{ id: string }>()
  const { data: seminar, isLoading, error } = useSeminarById(id)
  const submitMut = useSubmitRegistration()
  const [submitted, setSubmitted] = useState(false)

  const [form, setForm] = useState({
    parentName: '',
    email: '',
    studentName: '',
    grade: '',
    school: '',
    regionGeo: '',
    source: '',
    memo: '',
    applicantCount: '2',
    phone: '',            // 국기 드롭다운 + 번호가 합쳐진 최종 문자열
    overCountry: '',
  })
  const [pickedSession, setPickedSession] = useState<string>('')
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const hasSessions = !!seminar && seminar.sessions.length > 0
  const phoneParts = parsePhone(form.phone)
  const isDom = phoneParts.iso === 'KR'
  const domDigits = phoneParts.number.replace(/\D/g, '')
  const phoneOk = isPhoneComplete(phoneParts.iso, phoneParts.number)
  const canSubmit =
    !!form.parentName.trim() && !!form.studentName.trim() && !!form.email.trim() &&
    !!form.grade && phoneOk && (!hasSessions || !!pickedSession)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !canSubmit) return

    // 국가번호·지역번호는 따로 저장해 온 항목이라 형태를 유지한다.
    // 이제 지역번호를 따로 받지 않으므로 한국만 010 을 채운다.
    const dial = findCountry(phoneParts.iso).dial
    const countryCode = `+${dial}`
    const areaCode = isDom ? '010' : ''
    const phoneNumber = isDom ? domDigits.slice(3) : phoneParts.number.replace(/[^\d]/g, '')
    const country = isDom ? '대한민국' : (form.overCountry.trim() || null)
    const combinedPhone = form.phone.trim()

    await submitMut.mutateAsync({
      seminarId: id,
      parentName: form.parentName.trim(),
      phone: combinedPhone,
      email: form.email.trim() || null,
      studentName: form.studentName.trim(),
      grade: form.grade || null,
      school: form.school.trim() || null,
      memo: form.memo.trim() || null,
      residenceType: isDom ? 'domestic' : 'overseas',
      countryCode,
      areaCode: areaCode || null,
      phoneNumber,
      country,
      regionGeo: form.regionGeo.trim() || null,
      source: form.source || null,
      applicantCount: form.applicantCount ? Number(form.applicantCount) : null,
      sessionLabels: pickedSession ? [pickedSession] : [],
    })
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'CompleteRegistration', {
        content_name: seminar?.title ?? '세미나 신청',
      })
    }
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
              {pickedSession && (
                <div className="mt-3 mx-auto max-w-xs text-left bg-gray-50 rounded-md border p-3">
                  <p className="text-xs font-semibold text-gray-600">신청하신 회차</p>
                  <p className="text-sm text-gray-800 leading-snug mt-0.5">· {pickedSession}</p>
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
        <div className="text-left space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {seminar.title}
          </h1>
          {seminar.description && (
            <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">{seminar.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
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
              {/* 희망 회차 — 단일 선택 */}
              {hasSessions && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 border-b pb-1">
                    희망 회차 <span className="text-red-500">*</span>
                  </p>
                  <div className="space-y-2">
                    {seminar.sessions.map((s: SeminarSession, idx: number) => {
                      const checked = pickedSession === s.label
                      return (
                        <label
                          key={`${s.label}-${idx}`}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition ${
                            checked ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="session"
                            className="mt-0.5 size-4 accent-indigo-600"
                            checked={checked}
                            onChange={() => setPickedSession(s.label)}
                          />
                          <span className="text-sm text-gray-800 leading-snug">{s.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 학부모 정보 */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">학부모 정보</p>
                <div>
                  <Label>부모님 성함 *</Label>
                  <Input value={form.parentName} onChange={e => set({ parentName: e.target.value })} placeholder="홍길동" required />
                </div>
                <div>
                  <Label>이메일 *</Label>
                  <Input value={form.email} onChange={e => set({ email: e.target.value })} placeholder="email@example.com" type="email" required />
                </div>
              </div>

              {/* 학생 정보 */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">학생 정보</p>
                <div>
                  <Label>학생 이름 *</Label>
                  <Input value={form.studentName} onChange={e => set({ studentName: e.target.value })} placeholder="홍길순" required />
                </div>
                <div>
                  <Label>학년 *</Label>
                  <Select value={form.grade} onValueChange={v => set({ grade: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="학년 선택" /></SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>재학 중인 학교</Label>
                  <Input value={form.school} onChange={e => set({ school: e.target.value })} placeholder="OO고등학교" />
                </div>
              </div>

              {/* 연락처 (국내/해외) */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">연락처</p>
                <div>
                  <Label>연락처 *</Label>
                  <PhoneInput
                    value={form.phone}
                    onChange={v => set({ phone: v })}
                    required
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    국가를 고르고 번호를 입력해주세요. 한국은 숫자만 넣으면 010-0000-0000 형식으로 정리됩니다.
                  </p>
                </div>

                {!isDom && (
                  <div>
                    <Label>거주 국가</Label>
                    <Input value={form.overCountry} onChange={e => set({ overCountry: e.target.value })} placeholder="미국 / 캐나다 등" />
                  </div>
                )}

                <div>
                  <Label>거주 지역 (도시)</Label>
                  <Input value={form.regionGeo} onChange={e => set({ regionGeo: e.target.value })} placeholder="예: 서울 강남 / Vancouver" />
                </div>
              </div>

              {/* 추가 정보 */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">추가 정보</p>
                <div>
                  <Label>세미나를 알게되신 경로</Label>
                  <Select value={form.source} onValueChange={v => set({ source: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>신청 인원</Label>
                  <Input type="number" min={1} value={form.applicantCount} onChange={e => set({ applicantCount: e.target.value })} placeholder="2" />
                  <p className="text-xs text-gray-400 mt-1">참석 예정 인원 (예: 학생 + 학부모 = 2)</p>
                </div>
              </div>

              <div>
                <Label>추가 메모</Label>
                <Textarea value={form.memo} onChange={e => set({ memo: e.target.value })} placeholder="궁금한 점이나 전달사항" rows={3} />
              </div>

              <Button type="submit" className="w-full" disabled={submitMut.isPending || !canSubmit}>
                {submitMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                {hasSessions && !pickedSession ? '희망 회차를 선택해주세요' : !phoneOk ? '전화번호를 확인해주세요' : '신청하기'}
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
