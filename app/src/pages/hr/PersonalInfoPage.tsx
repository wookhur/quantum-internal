import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
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
  Users,
  Link2,
  Copy,
  Check,
  Loader2,
  Search,
  FileText,
  Lock,
  ShieldCheck,
  Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useAllEmployeeInfo, useCreateFormToken, useUpsertEmployeeInfo, type EmployeeInfo } from '@/hooks/useEmployeeInfo'

const PAGE_PIN = '2256'

const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: 'permanent', label: '정규직' },
  { value: 'contract', label: '계약직' },
  { value: 'dispatch', label: '파견직' },
  { value: 'daily', label: '일용직' },
  { value: 'freelancer', label: '프리랜서' },
  { value: 'commissioned', label: '위촉직' },
  { value: 'executive', label: '등기임원' },
]

export function PersonalInfoPage() {
  const t = useT()
  const { data: profiles = [] } = useProfiles()
  const { data: allInfo = [], isLoading } = useAllEmployeeInfo()
  const createToken = useCreateFormToken()
  const upsertInfo = useUpsertEmployeeInfo()

  const [authenticated, setAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [search, setSearch] = useState('')
  const [linkDialog, setLinkDialog] = useState<{ profileId: string; name: string } | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | false>(false)
  const [editDialog, setEditDialog] = useState<string | null>(null) // profileId
  const [editForm, setEditForm] = useState<Partial<EmployeeInfo>>({})

  const activeProfiles = useMemo(() => profiles.filter(p => !p.isExternal), [profiles])

  const infoMap = useMemo(() => {
    const map = new Map<string, EmployeeInfo>()
    for (const info of allInfo) map.set(info.profileId, info)
    return map
  }, [allInfo])

  const filteredProfiles = useMemo(() => {
    if (!search.trim()) return activeProfiles
    const q = search.toLowerCase()
    return activeProfiles.filter(p =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    )
  }, [activeProfiles, search])

  const profileName = useCallback(
    (id: string) => profiles.find(p => p.id === id)?.name || '?',
    [profiles],
  )

  const handleGenerateLink = async (profileId: string, name: string) => {
    setLinkDialog({ profileId, name })
    setGeneratedLink(null)
    setCopied(false)
    try {
      const token = await createToken.mutateAsync(profileId)
      const url = `${window.location.origin}/employee-form/${token}`
      setGeneratedLink(url)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCopy = (linkLang: 'ko' | 'en') => {
    if (!generatedLink) return
    const url = linkLang === 'en' ? `${generatedLink}?lang=en` : generatedLink
    navigator.clipboard.writeText(url)
    setCopied(linkLang)
    setTimeout(() => setCopied(false), 2000)
  }

  const openEdit = (profileId: string) => {
    const existing = infoMap.get(profileId)
    setEditForm(existing || { profileId })
    setEditDialog(profileId)
  }

  const handleSaveEdit = () => {
    if (!editDialog) return
    upsertInfo.mutate({
      profileId: editDialog,
      phone: editForm.phone,
      address: editForm.address,
      birthDate: editForm.birthDate,
      residentNumber: editForm.residentNumber,
      emergencyContactName: editForm.emergencyContactName,
      emergencyContactPhone: editForm.emergencyContactPhone,
      emergencyContactRelation: editForm.emergencyContactRelation,
      bankName: editForm.bankName,
      bankAccount: editForm.bankAccount,
      bankHolder: editForm.bankHolder,
      startDate: editForm.startDate,
      notes: editForm.notes,
      nationality: editForm.nationality,
      visaType: editForm.visaType,
      employmentType: editForm.employmentType,
      contractStartDate: editForm.contractStartDate,
      contractEndDate: editForm.contractEndDate,
    })
    setEditDialog(null)
  }

  const filledCount = activeProfiles.filter(p => infoMap.has(p.id)).length

  const handleExportExcel = () => {
    const rows = activeProfiles.map(p => {
      const info = infoMap.get(p.id)
      return {
        [t('personalInfo.name')]: p.name,
        [t('common.email')]: p.email,
        [t('personalInfo.phone')]: info?.phone || '',
        [t('personalInfo.birthDate')]: info?.birthDate || '',
        [t('personalInfo.address')]: info?.address || '',
        '근로유형': EMPLOYMENT_TYPES.find(e => e.value === info?.employmentType)?.label || '',
        [t('personalInfo.startDate')]: info?.startDate || '',
        '계약 시작일': info?.contractStartDate || '',
        '계약 종료일': info?.contractEndDate || '',
        [t('personalInfo.bankName')]: info?.bankName || '',
        [t('personalInfo.bankAccount')]: info?.bankAccount || '',
        [t('personalInfo.bankHolder')]: info?.bankHolder || '',
        [t('personalInfo.ecName')]: info?.emergencyContactName || '',
        [t('personalInfo.ecPhone')]: info?.emergencyContactPhone || '',
        [t('personalInfo.ecRelation')]: info?.emergencyContactRelation || '',
        [t('personalInfo.nationality')]: info?.nationality || '',
        [t('personalInfo.visaType')]: info?.visaType || '',
        [t('personalInfo.notes')]: info?.notes || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t('personalInfo.title'))
    // Auto-width columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length + 2, ...rows.map(r => String((r as Record<string, string>)[key] || '').length + 2)),
    }))
    ws['!cols'] = colWidths
    XLSX.writeFile(wb, `개인정보_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const handlePinSubmit = () => {
    if (pin === PAGE_PIN) {
      setAuthenticated(true)
      setPinError(false)
    } else {
      setPinError(true)
      setPin('')
    }
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-8 pb-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
                <Lock className="h-7 w-7 text-blue-600" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold">{t('personalInfo.pinTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('personalInfo.pinDesc')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Input
                ref={el => { if (el) setTimeout(() => el.focus(), 100) }}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={6}
                placeholder="••••"
                className="h-12 text-center text-2xl tracking-[0.5em] font-mono"
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(false) }}
                onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              />
              {pinError && (
                <p className="text-sm text-red-500 text-center">{t('personalInfo.pinError')}</p>
              )}
              <Button className="w-full h-10" onClick={handlePinSubmit} disabled={pin.length === 0}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                {t('personalInfo.pinConfirm')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('personalInfo.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('personalInfo.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExportExcel}>
          <Download className="h-3.5 w-3.5" />
          {t('personalInfo.exportExcel')}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{activeProfiles.length}</div>
              <div className="text-xs text-muted-foreground">{t('personalInfo.totalEmployees')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-lg font-bold">{filledCount}</div>
              <div className="text-xs text-muted-foreground">{t('personalInfo.submitted')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-lg font-bold">{activeProfiles.length - filledCount}</div>
              <div className="text-xs text-muted-foreground">{t('personalInfo.pending')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('personalInfo.searchPlaceholder')}
          className="pl-9 h-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('personalInfo.name')}</TableHead>
                  <TableHead>근로유형</TableHead>
                  <TableHead>{t('personalInfo.phone')}</TableHead>
                  <TableHead>{t('personalInfo.birthDate')}</TableHead>
                  <TableHead>{t('personalInfo.bank')}</TableHead>
                  <TableHead>{t('personalInfo.emergency')}</TableHead>
                  <TableHead>{t('personalInfo.status')}</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map(profile => {
                  const info = infoMap.get(profile.id)
                  const hasInfo = !!info
                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <div>
                          <div className="text-sm font-medium">{profile.name}</div>
                          <div className="text-xs text-muted-foreground">{profile.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {info?.employmentType
                          ? <Badge variant="outline" className="text-[10px] h-4">{EMPLOYMENT_TYPES.find(e => e.value === info.employmentType)?.label || info.employmentType}</Badge>
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{info?.phone || '-'}</TableCell>
                      <TableCell className="text-sm">{info?.birthDate || '-'}</TableCell>
                      <TableCell className="text-sm">
                        {info?.bankName ? `${info.bankName} ${info.bankAccount || ''}` : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {info?.emergencyContactName
                          ? `${info.emergencyContactName} (${info.emergencyContactRelation || ''})`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {hasInfo ? (
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                            {t('personalInfo.filled')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {t('personalInfo.notFilled')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEdit(profile.id)}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleGenerateLink(profile.id, profile.name)}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            {t('personalInfo.sendLink')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Link Generation Dialog */}
      <Dialog open={!!linkDialog} onOpenChange={() => setLinkDialog(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-5" />
              {t('personalInfo.generateLink')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('personalInfo.linkDescription', { name: linkDialog?.name || '' })}
            </p>
            {generatedLink ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">🇰🇷 {t('personalInfo.linkKo')}</div>
                  <div className="flex items-center gap-2">
                    <Input value={generatedLink} readOnly className="text-xs h-9 font-mono" />
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleCopy('ko')}>
                      {copied === 'ko' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">🇺🇸 {t('personalInfo.linkEn')}</div>
                  <div className="flex items-center gap-2">
                    <Input value={`${generatedLink}?lang=en`} readOnly className="text-xs h-9 font-mono" />
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => handleCopy('en')}>
                      {copied === 'en' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('personalInfo.linkExpiry')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editDialog ? profileName(editDialog) : ''} — {t('personalInfo.editInfo')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('personalInfo.phone')}</Label>
                <Input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('personalInfo.birthDate')}</Label>
                <Input type="date" value={editForm.birthDate || ''} onChange={e => setEditForm(f => ({ ...f, birthDate: e.target.value }))} className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('personalInfo.residentNumber')}</Label>
              <Input value={editForm.residentNumber || ''} onChange={e => setEditForm(f => ({ ...f, residentNumber: e.target.value }))} className="h-9" placeholder="000000-0000000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('personalInfo.address')}</Label>
              <Input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('personalInfo.startDate')}</Label>
              <Input type="date" value={editForm.startDate || ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">근로유형</Label>
              <Select value={editForm.employmentType || '_none'} onValueChange={v => setEditForm(f => ({ ...f, employmentType: !v || v === '_none' ? null : v }))}>
                <SelectTrigger className="h-9">
                  <span>{EMPLOYMENT_TYPES.find(e => e.value === editForm.employmentType)?.label || '미지정'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">미지정</SelectItem>
                  {EMPLOYMENT_TYPES.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">계약 시작일</Label>
                <Input type="date" value={editForm.contractStartDate || ''} onChange={e => setEditForm(f => ({ ...f, contractStartDate: e.target.value }))} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">계약 종료일</Label>
                <Input type="date" value={editForm.contractEndDate || ''} onChange={e => setEditForm(f => ({ ...f, contractEndDate: e.target.value }))} className="h-9" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('personalInfo.nationality')}</Label>
                <Input value={editForm.nationality || ''} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))} className="h-9" placeholder={t('personalInfo.nationalityPh')} />
              </div>
              {editForm.nationality && editForm.nationality !== '한국' && editForm.nationality !== 'Korea' && editForm.nationality !== 'Korean' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.visaType')}</Label>
                  <Input value={editForm.visaType || ''} onChange={e => setEditForm(f => ({ ...f, visaType: e.target.value }))} className="h-9" placeholder={t('personalInfo.visaTypePh')} />
                </div>
              )}
            </div>

            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-semibold mb-2">{t('personalInfo.bankInfo')}</h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.bankName')}</Label>
                  <Input value={editForm.bankName || ''} onChange={e => setEditForm(f => ({ ...f, bankName: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.bankAccount')}</Label>
                  <Input value={editForm.bankAccount || ''} onChange={e => setEditForm(f => ({ ...f, bankAccount: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.bankHolder')}</Label>
                  <Input value={editForm.bankHolder || ''} onChange={e => setEditForm(f => ({ ...f, bankHolder: e.target.value }))} className="h-9" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <h4 className="text-sm font-semibold mb-2">{t('personalInfo.emergencyContact')}</h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.ecName')}</Label>
                  <Input value={editForm.emergencyContactName || ''} onChange={e => setEditForm(f => ({ ...f, emergencyContactName: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.ecPhone')}</Label>
                  <Input value={editForm.emergencyContactPhone || ''} onChange={e => setEditForm(f => ({ ...f, emergencyContactPhone: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('personalInfo.ecRelation')}</Label>
                  <Input value={editForm.emergencyContactRelation || ''} onChange={e => setEditForm(f => ({ ...f, emergencyContactRelation: e.target.value }))} className="h-9" placeholder="예: 배우자, 부모" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('personalInfo.notes')}</Label>
              <Input value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={upsertInfo.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
