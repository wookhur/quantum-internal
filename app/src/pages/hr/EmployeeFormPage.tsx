import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useEmployeeInfoByToken, useUpsertEmployeeInfo, useMarkTokenUsed, type EmployeeInfo } from '@/hooks/useEmployeeInfo'

export function EmployeeFormPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading } = useEmployeeInfoByToken(token || '')
  const upsertInfo = useUpsertEmployeeInfo()
  const markUsed = useMarkTokenUsed()

  const [form, setForm] = useState<Partial<EmployeeInfo>>({})
  const [initialized, setInitialized] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Initialize form with existing data once loaded
  if (data?.valid && data.info && !initialized) {
    setForm(data.info)
    setInitialized(true)
  } else if (data?.valid && !data.info && !initialized) {
    setForm({ profileId: data.profileId })
    setInitialized(true)
  }

  const handleSubmit = async () => {
    if (!data?.valid || !data.profileId) return
    try {
      await upsertInfo.mutateAsync({
        profileId: data.profileId,
        phone: form.phone,
        address: form.address,
        birthDate: form.birthDate,
        emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone,
        emergencyContactRelation: form.emergencyContactRelation,
        bankName: form.bankName,
        bankAccount: form.bankAccount,
        bankHolder: form.bankHolder,
        startDate: form.startDate,
        notes: form.notes,
      })
      await markUsed.mutateAsync(token!)
      setSubmitted(true)
    } catch (err) {
      console.error(err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <XCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h2 className="text-xl font-semibold">링크가 유효하지 않습니다</h2>
            <p className="text-sm text-muted-foreground">
              이 링크는 만료되었거나 이미 사용되었습니다. 관리자에게 새 링크를 요청해주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">제출 완료</h2>
            <p className="text-sm text-muted-foreground">
              개인정보가 성공적으로 등록되었습니다. 이 페이지를 닫으셔도 됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">개인정보 등록</h1>
          <p className="text-muted-foreground text-sm">
            {data.profileName}님, 아래 개인정보를 입력해주세요.
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">연락처</Label>
                <Input
                  placeholder="010-0000-0000"
                  value={form.phone || ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">생년월일</Label>
                <Input
                  type="date"
                  value={form.birthDate || ''}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">주소</Label>
              <Input
                placeholder="거주지 주소"
                value={form.address || ''}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">입사일</Label>
              <Input
                type="date"
                value={form.startDate || ''}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">계좌 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">은행명</Label>
                <Input
                  placeholder="예: 국민은행"
                  value={form.bankName || ''}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">계좌번호</Label>
                <Input
                  placeholder="계좌번호"
                  value={form.bankAccount || ''}
                  onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">예금주</Label>
                <Input
                  placeholder="예금주명"
                  value={form.bankHolder || ''}
                  onChange={e => setForm(f => ({ ...f, bankHolder: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">비상연락처</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">이름</Label>
                <Input
                  placeholder="비상연락처 이름"
                  value={form.emergencyContactName || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">연락처</Label>
                <Input
                  placeholder="010-0000-0000"
                  value={form.emergencyContactPhone || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">관계</Label>
                <Input
                  placeholder="예: 배우자, 부모"
                  value={form.emergencyContactRelation || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactRelation: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">기타 메모</Label>
              <Input
                placeholder="알레르기, 특이사항 등"
                value={form.notes || ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full h-11"
          onClick={handleSubmit}
          disabled={upsertInfo.isPending || markUsed.isPending}
        >
          {upsertInfo.isPending || markUsed.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              제출 중...
            </>
          ) : (
            '제출하기'
          )}
        </Button>
      </div>
    </div>
  )
}
