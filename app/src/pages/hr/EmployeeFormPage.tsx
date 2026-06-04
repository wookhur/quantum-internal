import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react'
import { useEmployeeInfoByToken, useUpsertEmployeeInfo, useMarkTokenUsed, type EmployeeInfo } from '@/hooks/useEmployeeInfo'

// ---------------------------------------------------------------------------
// Bilingual text
// ---------------------------------------------------------------------------

type Lang = 'ko' | 'en'

const TEXT: Record<string, Record<Lang, string>> = {
  invalidTitle:   { ko: '링크가 유효하지 않습니다', en: 'Invalid Link' },
  invalidDesc:    { ko: '이 링크는 만료되었거나 이미 사용되었습니다. 관리자에게 새 링크를 요청해주세요.', en: 'This link has expired or has already been used. Please request a new link from your administrator.' },
  doneTitle:      { ko: '제출 완료', en: 'Submitted Successfully' },
  doneDesc:       { ko: '개인정보가 성공적으로 등록되었습니다. 이 페이지를 닫으셔도 됩니다.', en: 'Your personal information has been submitted. You may close this page.' },
  pageTitle:      { ko: '개인정보 등록', en: 'Personal Information' },
  pageDesc:       { ko: '님, 아래 개인정보를 입력해주세요.', en: ', please fill in your personal information below.' },
  basicInfo:      { ko: '기본 정보', en: 'Basic Information' },
  phone:          { ko: '연락처', en: 'Phone' },
  phonePh:        { ko: '010-0000-0000', en: 'Phone number' },
  birthDate:      { ko: '생년월일', en: 'Date of Birth' },
  residentNumber: { ko: '주민등록번호', en: 'Resident Registration No.' },
  residentPh:     { ko: '000000-0000000', en: '000000-0000000' },
  address:        { ko: '주소', en: 'Address' },
  addressPh:      { ko: '거주지 주소', en: 'Home address' },
  startDate:      { ko: '입사일', en: 'Start Date' },
  bankInfo:       { ko: '계좌 정보', en: 'Bank Information' },
  bankName:       { ko: '은행명', en: 'Bank Name' },
  bankNamePh:     { ko: '예: 국민은행', en: 'e.g. Chase, BofA' },
  bankAccount:    { ko: '계좌번호', en: 'Account No.' },
  bankAccountPh:  { ko: '계좌번호', en: 'Account number' },
  bankHolder:     { ko: '예금주', en: 'Account Holder' },
  bankHolderPh:   { ko: '예금주명', en: 'Name on account' },
  emergency:      { ko: '비상연락처', en: 'Emergency Contact' },
  ecName:         { ko: '이름', en: 'Name' },
  ecNamePh:       { ko: '비상연락처 이름', en: 'Contact name' },
  ecPhone:        { ko: '연락처', en: 'Phone' },
  ecPhonePh:      { ko: '010-0000-0000', en: 'Phone number' },
  ecRelation:     { ko: '관계', en: 'Relation' },
  ecRelationPh:   { ko: '예: 배우자, 부모', en: 'e.g. Spouse, Parent' },
  notes:          { ko: '기타 메모', en: 'Notes' },
  notesPh:        { ko: '알레르기, 특이사항 등', en: 'Allergies, special notes, etc.' },
  submitting:     { ko: '제출 중...', en: 'Submitting...' },
  submit:         { ko: '제출하기', en: 'Submit' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmployeeFormPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const langParam = searchParams.get('lang')
  const [lang, setLang] = useState<Lang>(langParam === 'en' ? 'en' : 'ko')

  const { data, isLoading } = useEmployeeInfoByToken(token || '')
  const upsertInfo = useUpsertEmployeeInfo()
  const markUsed = useMarkTokenUsed()

  const [form, setForm] = useState<Partial<EmployeeInfo>>({})
  const [initialized, setInitialized] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const t = (key: string) => TEXT[key]?.[lang] || key

  const toggleLang = () => {
    const next = lang === 'ko' ? 'en' : 'ko'
    setLang(next)
    setSearchParams(prev => { prev.set('lang', next); return prev }, { replace: true })
  }

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
        residentNumber: form.residentNumber,
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

  // Language toggle button (always visible)
  const langToggle = (
    <button
      onClick={toggleLang}
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border shadow-sm text-sm font-medium hover:bg-gray-50 transition-colors"
    >
      <Globe className="h-3.5 w-3.5" />
      {lang === 'ko' ? 'English' : '한국어'}
    </button>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {langToggle}
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        {langToggle}
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <XCircle className="h-12 w-12 text-red-400 mx-auto" />
            <h2 className="text-xl font-semibold">{t('invalidTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('invalidDesc')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        {langToggle}
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">{t('doneTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('doneDesc')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      {langToggle}
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
          <p className="text-muted-foreground text-sm">
            {data.profileName}{t('pageDesc')}
          </p>
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('phone')}</Label>
                <Input
                  placeholder={t('phonePh')}
                  value={form.phone || ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('birthDate')}</Label>
                <Input
                  type="date"
                  value={form.birthDate || ''}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('residentNumber')}</Label>
              <Input
                placeholder={t('residentPh')}
                value={form.residentNumber || ''}
                onChange={e => setForm(f => ({ ...f, residentNumber: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('address')}</Label>
              <Input
                placeholder={t('addressPh')}
                value={form.address || ''}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('startDate')}</Label>
              <Input
                type="date"
                value={form.startDate || ''}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('bankInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('bankName')}</Label>
                <Input
                  placeholder={t('bankNamePh')}
                  value={form.bankName || ''}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('bankAccount')}</Label>
                <Input
                  placeholder={t('bankAccountPh')}
                  value={form.bankAccount || ''}
                  onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('bankHolder')}</Label>
                <Input
                  placeholder={t('bankHolderPh')}
                  value={form.bankHolder || ''}
                  onChange={e => setForm(f => ({ ...f, bankHolder: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('emergency')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('ecName')}</Label>
                <Input
                  placeholder={t('ecNamePh')}
                  value={form.emergencyContactName || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('ecPhone')}</Label>
                <Input
                  placeholder={t('ecPhonePh')}
                  value={form.emergencyContactPhone || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('ecRelation')}</Label>
                <Input
                  placeholder={t('ecRelationPh')}
                  value={form.emergencyContactRelation || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactRelation: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('notes')}</Label>
              <Input
                placeholder={t('notesPh')}
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
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </div>
    </div>
  )
}
