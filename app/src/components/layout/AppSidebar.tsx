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
import {
  LogOut,
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Users,
  BarChart3,
  ClipboardList,
  TrendingUp,
  BarChart2,
  Megaphone,
  CalendarDays,
  Video,
  FileText,
  Gamepad2,
  Briefcase,
  PhoneCall,
  LineChart,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureAccess, getEffectiveModules, type FeatureModule } from '@/hooks/useProfiles'

interface NavItemDef {
  label: string
  to: string
  icon: LucideIcon
}

/** Each nav section maps to a feature module for access control */
const NAV_SECTIONS: { title: string; module: FeatureModule; items: NavItemDef[] }[] = [
  {
    title: '공통',
    module: 'dashboard',
    items: [
      { label: '대시보드', to: '/dashboard', icon: LayoutDashboard },
      { label: '캘린더', to: '/calendar', icon: Calendar },
      { label: '프로젝트', to: '/todos', icon: CheckSquare },
    ],
  },
  {
    title: '세일즈',
    module: 'sales',
    items: [
      { label: '콜드콜', to: '/sales/cold-call', icon: PhoneCall },
      { label: '리드 관리', to: '/sales/leads', icon: Users },
      { label: '파이프라인', to: '/sales/pipeline', icon: BarChart3 },
      { label: '미팅 기록', to: '/sales/meetings', icon: ClipboardList },
      { label: '영업 현황', to: '/sales/performance', icon: TrendingUp },
    ],
  },
  {
    title: '마케팅',
    module: 'marketing',
    items: [
      { label: '마케팅 지표', to: '/marketing/metrics', icon: BarChart2 },
      { label: '광고 성과', to: '/marketing/ads', icon: Megaphone },
      { label: '이벤트 관리', to: '/marketing/events', icon: CalendarDays },
      { label: '영상 콘텐츠', to: '/marketing/videos', icon: Video },
    ],
  },
  {
    title: '재무',
    module: 'finance',
    items: [
      { label: '계약 관리', to: '/consulting/clients', icon: FileText },
      { label: '월별 수금', to: '/consulting/collections', icon: CalendarDays },
    ],
  },
  {
    title: '경영기획',
    module: 'planning',
    items: [
      { label: '경영 현황', to: '/planning/overview', icon: Briefcase },
      { label: '매출 전망', to: '/planning/projection', icon: LineChart },
      { label: '직원 성과', to: '/planning/employees', icon: Users },
      { label: '접근 권한 관리', to: '/planning/access', icon: Shield },
    ],
  },
  {
    title: '쉬는 시간',
    module: 'game',
    items: [
      { label: 'T-Rex 러너', to: '/game', icon: Gamepad2 },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { data: featureAccess = [] } = useFeatureAccess()
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  // Determine which modules this user can see
  const enabledModules = user ? getEffectiveModules(user, featureAccess) : []
  const visibleSections = NAV_SECTIONS.filter(s => enabledModules.includes(s.module))

  const DEPT_CONFIG: Record<string, { label: string; color: string }> = {
    sales: { label: 'Sales', color: 'bg-blue-100 text-blue-700' },
    marketing: { label: 'Marketing', color: 'bg-purple-100 text-purple-700' },
    service: { label: 'Service', color: 'bg-emerald-100 text-emerald-700' },
    finance: { label: 'Finance', color: 'bg-orange-100 text-orange-700' },
    management: { label: 'Management', color: 'bg-amber-100 text-amber-700' },
  }
  const currentDept = (user?.department && DEPT_CONFIG[user.department])
    || { label: 'Quantum', color: 'bg-gray-900 text-white' }

  return (
    <Sidebar className="border-r border-gray-200/80 bg-white">
      {/* Logo area */}
      <SidebarHeader className="px-5 py-4">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Quantum Admissions"
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${currentDept.color}`}>
              {currentDept.label}
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Internal
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {visibleSections.map((section, sIdx) => (
          <SidebarGroup key={section.title} className="py-1">
            {sIdx > 0 && (
              <SidebarSeparator className="mx-3 my-1 bg-gray-100" />
            )}
            <SidebarGroupLabel className="px-3 mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(item.to)
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        render={<Link to={item.to} />}
                        isActive={active}
                        className={`
                          relative rounded-md mx-1 h-9 px-3 gap-3
                          transition-all duration-150 ease-in-out
                          ${
                            active
                              ? 'bg-[#E6F0FF] text-blue-600 font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-blue-500'
                              : 'text-gray-600 hover:bg-gray-50'
                          }
                        `}
                      >
                        <Icon
                          className={`shrink-0 ${
                            active ? 'text-blue-500' : 'text-gray-400'
                          }`}
                          size={18}
                          strokeWidth={active ? 2 : 1.75}
                        />
                        <span className="truncate text-[13px]">
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User area */}
      <SidebarFooter className="px-3 pb-4 pt-2">
        <SidebarSeparator className="mx-1 mb-3 bg-gray-100" />
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors">
          <Avatar className="h-8 w-8 ring-2 ring-blue-100">
            <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
              {user?.name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[13px] font-medium text-gray-900 truncate">
              {user?.name || 'User'}
            </span>
            <span className="text-[11px] text-gray-400 truncate">
              {user?.role || ''}
            </span>
          </div>
          <button
            onClick={signOut}
            className="rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
