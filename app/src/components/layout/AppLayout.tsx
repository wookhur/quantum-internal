import { useState } from 'react'
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Outlet, useNavigate } from 'react-router-dom'
import { Globe, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { GlobalSearchBar } from './GlobalSearchBar'
import { NotificationCenter } from '@/components/NotificationCenter'
import { AccountSettingsDialog } from '@/components/AccountSettingsDialog'
import { useUnreadCount, useMessageSubscription } from '@/hooks/useMessages'

export function AppLayout() {
  const { user } = useAuth()
  const { language, setLanguage } = useLanguage()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: unreadCount = 0 } = useUnreadCount()
  useMessageSubscription()

  return (
    <SidebarProvider>
      <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
      <SidebarInset>
        {/* Top Header */}
        <header className="flex h-14 items-center gap-4 border-b border-gray-200/80 bg-white px-4">
          {/* Left: toggle */}
          <SidebarTrigger className="-ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100" />

          <div className="h-5 w-px bg-gray-200" />

          {/* Center: search */}
          <GlobalSearchBar />

          <div className="flex-1" />

          {/* Right: language toggle + messages + notification + avatar */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Language"
            >
              <Globe size={14} strokeWidth={1.75} />
              <span>{language === 'ko' ? 'EN' : 'KO'}</span>
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              onClick={() => navigate('/messages')}
            >
              <MessageSquare size={18} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] rounded-full bg-blue-500 text-white text-[10px] font-bold px-1">
                  {unreadCount}
                </span>
              )}
            </Button>

            <NotificationCenter />

            <Avatar
              className="h-8 w-8 cursor-pointer ring-2 ring-gray-100 hover:ring-blue-200 transition-all"
              onClick={() => setSettingsOpen(true)}
            >
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
              <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                {user?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 bg-[#F6F7FB] p-3 md:p-6 overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </SidebarInset>

      <AccountSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarProvider>
  )
}
