import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Camera, Loader2, User, Bell, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUpdateProfile } from '@/hooks/useProfiles'
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationPreferences'
import { NOTIFICATION_TYPES } from '@/hooks/useNotifications'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/LanguageContext'
import { useLanguage } from '@/i18n/LanguageContext'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountSettingsDialog({ open, onOpenChange }: Props) {
  const t = useT()
  const { language } = useLanguage()
  const { user } = useAuth()
  const updateProfile = useUpdateProfile()
  const { data: notifPrefs } = useNotificationPreferences()
  const updateNotifPrefs = useUpdateNotificationPreferences()

  const [name, setName] = useState(user?.name || '')
  const [position, setPosition] = useState(user?.position || '')
  const [uploading, setUploading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'profile' | 'notifications'>('profile')

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(user?.name || '')
      setPosition(user?.position || '')
      setAvatarPreview(null)
      setTab('profile')
    }
    onOpenChange(isOpen)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      // Preview
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)

      // Upload to Supabase Storage
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)

      // Update profile
      await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id)
    } catch (err) {
      console.error('Avatar upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleSaveProfile = () => {
    if (!user) return
    updateProfile.mutate(
      { id: user.id, name, position },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const disabledTypes = notifPrefs?.disabledTypes || []
  const handleToggleNotifType = (type: string) => {
    const newTypes = disabledTypes.includes(type)
      ? disabledTypes.filter((t) => t !== type)
      : [...disabledTypes, type]
    updateNotifPrefs.mutate(newTypes)
  }

  const avatarSrc = avatarPreview || user?.avatarUrl

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('account.settings')}</DialogTitle>
        </DialogHeader>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'profile'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="size-3.5" /> {t('account.profile')}
          </button>
          <button
            onClick={() => setTab('notifications')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'notifications'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bell className="size-3.5" /> {t('account.notifications')}
          </button>
        </div>

        {tab === 'profile' && (
          <div className="space-y-5">
            {/* Avatar section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <Avatar className="h-20 w-20 ring-4 ring-gray-100">
                  {avatarSrc ? (
                    <AvatarImage src={avatarSrc} alt={user?.name} />
                  ) : null}
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xl font-bold">
                    {user?.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploading ? (
                    <Loader2 className="size-5 text-white animate-spin" />
                  ) : (
                    <Camera className="size-5 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium">{user?.email}</div>
                <div className="text-xs text-gray-400">{user?.role}</div>
              </div>
            </div>

            <Separator />

            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t('account.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('account.namePlaceholder')}
              />
            </div>

            {/* Position */}
            <div className="space-y-1.5">
              <Label>{t('account.position')}</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder={t('account.positionPlaceholder')}
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleSaveProfile}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {t('common.save')}
            </Button>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t('account.notifDesc')}</p>
            <div className="space-y-3">
              {NOTIFICATION_TYPES.map((nt) => (
                <div
                  key={nt.key}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {language === 'ko' ? nt.label : nt.labelEn}
                    </div>
                  </div>
                  <Switch
                    checked={!disabledTypes.includes(nt.key)}
                    onCheckedChange={() => handleToggleNotifType(nt.key)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
