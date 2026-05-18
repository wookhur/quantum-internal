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
  Filter,
  CalendarDays,
  Video,
  FileText,
  Gamepad2,
  Briefcase,
  PhoneCall,
  LineChart,
  Shield,
  UserSearch,
  type LucideIcon,
} from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureAccess, getEffectiveModules, type FeatureModule } from '@/hooks/useProfiles'
import { useLanguage } from '@/i18n/LanguageContext'
import type { TranslationKeys } from '@/i18n/translations'

interface NavItemDef {
  labelKey: TranslationKeys
  to: string
  icon: LucideIcon
}

/** Each nav section maps to a feature module for access control */
const NAV_SECTIONS: { titleKey: TranslationKeys; module: FeatureModule; items: NavItemDef[] }[] = [
  {
    titleKey: 'nav.common',
    module: 'dashboard',
    items: [
      { labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.calendar', to: '/calendar', icon: Calendar },
      { labelKey: 'nav.projects', to: '/todos', icon: CheckSquare },
    ],
  },
  {
    titleKey: 'nav.sales',
    module: 'sales',
    items: [
      { labelKey: 'nav.coldCall', to: '/sales/cold-call', icon: PhoneCall },
      { labelKey: 'nav.leadManagement', to: '/sales/leads', icon: Users },
      { labelKey: 'nav.pipeline', to: '/sales/pipeline', icon: BarChart3 },
      { labelKey: 'nav.meetingRecords', to: '/sales/meetings', icon: ClipboardList },
      { labelKey: 'nav.salesFunnel', to: '/sales/funnel', icon: Filter },
      { labelKey: 'nav.salesPerformance', to: '/sales/performance', icon: TrendingUp },
    ],
  },
  {
    titleKey: 'nav.marketing',
    module: 'marketing',
    items: [
      { labelKey: 'nav.marketingMetrics', to: '/marketing/metrics', icon: BarChart2 },
      { labelKey: 'nav.adPerformance', to: '/marketing/ads', icon: Megaphone },
      { labelKey: 'nav.eventManagement', to: '/marketing/events', icon: CalendarDays },
      { labelKey: 'nav.videoContent', to: '/marketing/videos', icon: Video },
    ],
  },
  {
    titleKey: 'nav.service',
    module: 'service',
    items: [
      { labelKey: 'nav.student360', to: '/service/student-360', icon: UserSearch },
    ],
  },
  {
    titleKey: 'nav.finance',
    module: 'finance',
    items: [
      { labelKey: 'nav.contractManagement', to: '/consulting/clients', icon: FileText },
      { labelKey: 'nav.monthlyCollection', to: '/consulting/collections', icon: CalendarDays },
    ],
  },
  {
    titleKey: 'nav.planning',
    module: 'planning',
    items: [
      { labelKey: 'nav.overview', to: '/planning/overview', icon: Briefcase },
      { labelKey: 'nav.revenueProjection', to: '/planning/projection', icon: LineChart },
      { labelKey: 'nav.employeePerformance', to: '/planning/employees', icon: Users },
      { labelKey: 'nav.accessControl', to: '/planning/access', icon: Shield },
    ],
  },
  {
    titleKey: 'nav.breakTime',
    module: 'game',
    items: [
      { labelKey: 'nav.trexRunner', to: '/game', icon: Gamepad2 },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { data: featureAccess = [] } = useFeatureAccess()
  const { t } = useLanguage()
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
          <SidebarGroup key={section.titleKey} className="py-1">
            {sIdx > 0 && (
              <SidebarSeparator className="mx-3 my-1 bg-gray-100" />
            )}
            <SidebarGroupLabel className="px-3 mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {t(section.titleKey)}
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
                          {t(item.labelKey)}
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
            title={t('common.logout')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
