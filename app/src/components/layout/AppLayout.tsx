import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Outlet } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/AuthContext'

export function AppLayout() {
  const { user } = useAuth()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Top Header */}
        <header className="flex h-14 items-center gap-4 border-b border-gray-200/80 bg-white px-4">
          {/* Left: toggle */}
          <SidebarTrigger className="-ml-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100" />

          <div className="h-5 w-px bg-gray-200" />

          {/* Center: search */}
          <div className="relative flex-1 max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
            <Input
              placeholder="검색..."
              className="pl-9 h-9 rounded-full bg-[#F6F7FB] border-0 text-sm text-gray-700 placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-blue-200 focus-visible:bg-white transition-colors"
            />
          </div>

          <div className="flex-1" />

          {/* Right: notification + avatar */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <Bell size={18} strokeWidth={1.75} />
            </Button>

            <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-gray-100 hover:ring-blue-200 transition-all">
              <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                {user?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 bg-[#F6F7FB] p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
