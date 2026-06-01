import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Users,
  Link2,
  Copy,
  Check,
  Loader2,
  Search,
  FileText,
} from 'lucide-react'
import { useT } from '@/i18n/LanguageContext'
import { useProfiles } from '@/hooks/useProfiles'
import { useAllEmployeeInfo, useCreateFormToken, useUpsertEmployeeInfo, type EmployeeInfo } from '@/hooks/useEmployeeInfo'

export function PersonalInfoPage() {
  const t = useT()
  const { data: profiles = [] } = useProfiles()
  const { data: allInfo = [], isLoading } = useAllEmployeeInfo()
  const createToken = useCreateFormToken()
  const upsertInfo = useUpsertEmployeeInfo()

  const [search, setSearch] = useState('')
  const [linkDialog, setLinkDialog] = useState<{ profileId: string; name: string } | null>(null)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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

  const handleCopy = () => {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
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
      emergencyContactName: editForm.emergencyContactName,
      emergencyContactPhone: editForm.emergencyContactPhone,
      emergencyContactRelation: editForm.emergencyContactRelation,
      bankName: editForm.bankName,
      bankAccount: editForm.bankAccount,
      bankHolder: editForm.bankHolder,
      startDate: editForm.startDate,
      notes: editForm.notes,
    })
    setEditDialog(null)
  }

  const filledCount = activeProfiles.filter(p => infoMap.has(p.id)).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('personalInfo.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('personalInfo.subtitle')}</p>
        </div>
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
        <DialogContent className="sm:max-w-[420px]">
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
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="text-xs h-9 font-mono" />
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
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
              <Label className="text-xs">{t('personalInfo.address')}</Label>
              <Input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('personalInfo.startDate')}</Label>
              <Input type="date" value={editForm.startDate || ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className="h-9" />
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
