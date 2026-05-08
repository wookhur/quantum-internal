import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut } from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface NavItemDef {
  label: string
  to: string
}

const NAV_SECTIONS: { title: string; items: NavItemDef[] }[] = [
  {
    title: '공통',
    items: [
      { label: '대시보드', to: '/dashboard' },
      { label: '캘린더', to: '/calendar' },
      { label: '할일 목록', to: '/todos' },
    ],
  },
  {
    title: '세일즈',
    items: [
      { label: '리드 관리', to: '/sales/leads' },
      { label: '파이프라인', to: '/sales/pipeline' },
      { label: '영업 현황', to: '/sales/performance' },
      { label: '미팅 기록', to: '/sales/meetings' },
    ],
  },
  {
    title: '마케팅',
    items: [
      { label: '마케팅 지표', to: '/marketing/metrics' },
      { label: '광고 성과', to: '/marketing/ads' },
      { label: '이벤트 관리', to: '/marketing/events' },
      { label: '영상 콘텐츠', to: '/marketing/videos' },
    ],
  },
  {
    title: '컨설팅',
    items: [
      { label: '계약 고객', to: '/consulting/clients' },
      { label: '결제 관리', to: '/consulting/payments' },
    ],
  },
  {
    title: '쉬는 시간',
    items: [
      { label: '🦖 T-Rex 러너', to: '/game' },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/logo.png" alt="Quantum Admissions" className="h-8 w-auto" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-accent-foreground">Quantum</span>
            <span className="text-xs text-sidebar-foreground/60">Internal System</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.title}>
            {sIdx > 0 && <SidebarSeparator />}
            <SidebarGroup>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton render={<Link to={item.to} />} isActive={isActive(item.to)}>
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarSeparator className="mb-3" />
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {user?.name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-sidebar-accent-foreground truncate">{user?.name || 'User'}</span>
            <span className="text-xs text-sidebar-foreground/50 truncate">{user?.role || ''}</span>
          </div>
          <button
            onClick={signOut}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="로그아웃"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
