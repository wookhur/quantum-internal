import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/PhoneInput'
import { parsePhone, isPhoneComplete } from '@/lib/phone'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { useSubmitConsultation } from '@/hooks/useConsultation'

const GRADES = Array.from({ length: 12 }, (_, i) => `G${i + 1}`)
const YEARS = Array.from({ length: 12 }, (_, i) => `Y${i + 1}`)
const GRADE_OPTIONS = [...GRADES, ...YEARS]

const SOURCE_OPTIONS = [
  '인스타그램', '네이버 블로그/카페', '카카오톡 채널', '지인 소개',
  '구글/네이버 검색', '유튜브', '문자/DM', '기타',
]

export function ConsultRegisterPage() {
  const submitMut = useSubmitConsultation()
  const [submitted, setSubmitted] = useState(false)
  // 공개 수집 폼이라 개인정보 수집·이용 동의가 필요하다(홈페이지 폼에 있던 항목).
  const [privacyAgreed, setPrivacyAgreed] = useState(false)

  const [form, setForm] = useState({
    parentName: '',
    email: '',
    studentName: '',
    grade: '',
    school: '',
    regionGeo: '',
    interest: '',
    source: '',
    memo: '',
    phone: '',            // 국기 드롭다운 + 번호가 합쳐진 최종 문자열
    overCountry: '',
  })
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  // iframe 삽입 시 부모 페이지에 실제 높이를 알려 스크롤 겹침 없이 자동 맞춤
  useEffect(() => {
    const post = () => {
      try {
        window.parent?.postMessage(
          { type: 'qa-consult-height', height: document.body.scrollHeight },
          '*',
        )
      } catch { /* ignore */ }
    }
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    window.addEventListener('load', post)
    return () => { ro.disconnect(); window.removeEventListener('load', post) }
  }, [])

  const phoneParts = parsePhone(form.phone)
  const isDom = phoneParts.iso === 'KR'
  const phoneOk = isPhoneComplete(phoneParts.iso, phoneParts.number)
  const canSubmit =
    !!form.parentName.trim() && !!form.studentName.trim() && !!form.email.trim() &&
    !!form.grade && phoneOk && privacyAgreed

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const combinedPhone = form.phone.trim()

    // 거주 국가/경로는 메모에 함께 남겨 유실 방지
    const extra: string[] = []
    if (!isDom && form.overCountry.trim()) extra.push(`거주국가: ${form.overCountry.trim()}`)
    if (form.source) extra.push(`알게된 경로: ${form.source}`)
    const message = [form.memo.trim(), ...extra].filter(Boolean).join('\n')

    await submitMut.mutateAsync({
      parentName: form.parentName.trim(),
      studentName: form.studentName.trim(),
      phone: combinedPhone,
      email: form.email.trim() || null,
      school: form.school.trim() || null,
      grade: form.grade || null,
      region: form.regionGeo.trim() || null,
      interest: form.interest.trim() || null,
      message: message || null,
    })
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'Lead', { content_name: '홈페이지 상담신청' })
    }
    // iframe 으로 삽입된 경우 부모 페이지(홈페이지)가 전환 이벤트를 기록하도록 알린다.
    try {
      window.parent?.postMessage({ type: 'qa-consult-submitted' }, '*')
    } catch { /* ignore */ }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="size-16 text-green-500 mx-auto" />
            <div>
              <p className="text-xl font-bold text-gray-800">상담신청이 완료되었습니다!</p>
              <p className="text-sm text-gray-500 mt-2">담당 컨설턴트가 확인 후 연락드리겠습니다. 감사합니다.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">상담신청</h1>
          <p className="text-gray-600 text-sm leading-relaxed">
            아래 정보를 남겨주시면 담당 컨설턴트가 확인 후 상담 일정을 안내드립니다.
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">상담신청 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* 상담 정보 */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 border-b pb-1">상담 정보</p>
                <div>
                  <Label>관심 분야</Label>
                  <Input value={form.interest} onChange={e => set({ interest: e.target.value })} placeholder="예: 미국 학부 / 편입 / 대학원 / 조기유학" />
                </div>
                <div>
                  <Label>알게 되신 경로</Label>
                  <Select value={form.source} onValueChange={v => set({ source: v ?? '' })}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>상담 희망 내용 / 메모</Label>
                <Textarea value={form.memo} onChange={e => set({ memo: e.target.value })} placeholder="궁금한 점이나 전달사항을 자유롭게 남겨주세요." rows={3} />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[#0c3656]"
                  checked={privacyAgreed}
                  onChange={e => setPrivacyAgreed(e.target.checked)}
                />
                <span>
                  개인정보 수집 및 이용에 동의합니다. <span className="text-red-500">*</span>
                  <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                    수집 항목: 학생·학부모 이름, 연락처, 이메일, 학교·학년, 거주 지역 · 목적: 입시 상담 안내 · 보유 기간: 상담 종료 후 3년
                  </span>
                </span>
              </label>

              <Button type="submit" className="w-full" disabled={submitMut.isPending || !canSubmit}>
                {submitMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
                {!phoneOk ? '전화번호를 확인해주세요' : '상담 신청하기'}
              </Button>
              {submitMut.isError && (
                <p className="text-sm text-red-500 text-center">
                  {(submitMut.error as Error)?.message || '신청 중 오류가 발생했습니다. 다시 시도해주세요.'}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">© Quantum Admissions</p>
      </div>
    </div>
  )
}
