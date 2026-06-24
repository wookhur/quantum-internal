import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react'
import { useEmployeeInfoByToken, useUpsertEmployeeInfo, useMarkTokenUsed, type EmployeeInfo } from '@/hooks/useEmployeeInfo'
import { useLanguage } from '@/i18n/LanguageContext'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmployeeFormPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const langParam = searchParams.get('lang')
  const { language, setLanguage, t } = useLanguage()

  // Sync URL lang param on mount
  useState(() => {
    if (langParam === 'en' && language !== 'en') setLanguage('en')
    if (langParam === 'ko' && language !== 'ko') setLanguage('ko')
  })

  const { data, isLoading } = useEmployeeInfoByToken(token || '')
  const upsertInfo = useUpsertEmployeeInfo()
  const markUsed = useMarkTokenUsed()

  const [form, setForm] = useState<Partial<EmployeeInfo>>({})
  const [initialized, setInitialized] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const toggleLang = () => {
    const next = language === 'ko' ? 'en' : 'ko'
    setLanguage(next)
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
        nationality: form.nationality,
        visaType: form.visaType,
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
      {language === 'ko' ? 'English' : '한국어'}
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
            <h2 className="text-xl font-semibold">{t('employeeForm.invalidTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('employeeForm.invalidDesc')}</p>
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
            <h2 className="text-xl font-semibold">{t('employeeForm.doneTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('employeeForm.doneDesc')}</p>
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
          <h1 className="text-2xl font-bold">{t('employeeForm.pageTitle')}</h1>
          <p className="text-muted-foreground text-sm">
            {data.profileName}{t('employeeForm.pageDesc')}
          </p>
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('employeeForm.basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.phone')}</Label>
                <Input
                  placeholder={t('employeeForm.phonePh')}
                  value={form.phone || ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.birthDate')}</Label>
                <Input
                  type="date"
                  value={form.birthDate || ''}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('employeeForm.residentNumber')}</Label>
              <Input
                placeholder={t('employeeForm.residentPh')}
                value={form.residentNumber || ''}
                onChange={e => setForm(f => ({ ...f, residentNumber: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('employeeForm.address')}</Label>
              <Input
                placeholder={t('employeeForm.addressPh')}
                value={form.address || ''}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('employeeForm.startDate')}</Label>
              <Input
                type="date"
                value={form.startDate || ''}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.nationality')}</Label>
                <Input
                  placeholder={t('employeeForm.nationalityPh')}
                  value={form.nationality || ''}
                  onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                  className="h-9"
                />
              </div>
              {form.nationality && form.nationality !== '한국' && form.nationality !== 'Korea' && form.nationality !== 'Korean' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('employeeForm.visaType')}</Label>
                  <Input
                    placeholder={t('employeeForm.visaTypePh')}
                    value={form.visaType || ''}
                    onChange={e => setForm(f => ({ ...f, visaType: e.target.value }))}
                    className="h-9"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bank Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('employeeForm.bankInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.bankName')}</Label>
                <Input
                  placeholder={t('employeeForm.bankNamePh')}
                  value={form.bankName || ''}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.bankAccount')}</Label>
                <Input
                  placeholder={t('employeeForm.bankAccountPh')}
                  value={form.bankAccount || ''}
                  onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.bankHolder')}</Label>
                <Input
                  placeholder={t('employeeForm.bankHolderPh')}
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
            <CardTitle className="text-base">{t('employeeForm.emergency')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.ecName')}</Label>
                <Input
                  placeholder={t('employeeForm.ecNamePh')}
                  value={form.emergencyContactName || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactName: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.ecPhone')}</Label>
                <Input
                  placeholder={t('employeeForm.ecPhonePh')}
                  value={form.emergencyContactPhone || ''}
                  onChange={e => setForm(f => ({ ...f, emergencyContactPhone: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeeForm.ecRelation')}</Label>
                <Input
                  placeholder={t('employeeForm.ecRelationPh')}
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
              <Label className="text-xs">{t('employeeForm.notes')}</Label>
              <Input
                placeholder={t('employeeForm.notesPh')}
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
              {t('employeeForm.submitting')}
            </>
          ) : (
            t('employeeForm.submit')
          )}
        </Button>
      </div>
    </div>
  )
}
