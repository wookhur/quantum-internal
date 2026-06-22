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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  LogOut,
  LayoutDashboard,
  Calendar,
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
  Wallet,
  Clock,
  UserSearch,
  MessageSquare,
  Settings,
  Receipt,
  Percent,
  HandCoins,
  Lock,
  Target,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureAccess, getEffectiveRoutes, type FeatureModule } from '@/hooks/useProfiles'
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
      { labelKey: 'nav.taskBoard', to: '/tasks', icon: ClipboardList },
      { labelKey: 'nav.messages', to: '/messages', icon: MessageSquare },
      { labelKey: 'nav.coupangOrders', to: '/common/coupang-orders', icon: ShoppingCart },
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
      { labelKey: 'nav.eventManagement', to: '/calendar', icon: CalendarDays },
      { labelKey: 'nav.videoContent', to: '/marketing/videos', icon: Video },
    ],
  },
  {
    titleKey: 'nav.service',
    module: 'service',
    items: [
      { labelKey: 'nav.serviceDashboard', to: '/service/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.student360', to: '/service/student-360', icon: UserSearch },
      { labelKey: 'nav.weeklyReport', to: '/service/weekly-report', icon: FileText },
    ],
  },
  {
    titleKey: 'nav.finance',
    module: 'finance',
    items: [
      { labelKey: 'nav.financeDashboard', to: '/finance/dashboard', icon: LayoutDashboard },
      { labelKey: 'nav.contractManagement', to: '/consulting/clients', icon: FileText },
      { labelKey: 'nav.monthlyCollection', to: '/consulting/collections', icon: CalendarDays },
      { labelKey: 'nav.invoices', to: '/finance/invoices', icon: FileText },
      { labelKey: 'nav.receipts', to: '/finance/receipts', icon: Receipt },
      { labelKey: 'nav.wireInvoice', to: '/finance/wire-invoice', icon: FileText },
      { labelKey: 'nav.externalFees', to: '/service/external-fees', icon: HandCoins },
      { labelKey: 'nav.incentives', to: '/finance/incentives/by-contract', icon: Percent },
    ],
  },
  {
    titleKey: 'nav.planning',
    module: 'planning',
    items: [
      { labelKey: 'nav.overview', to: '/planning/overview', icon: Briefcase },
      { labelKey: 'nav.revenueProjection', to: '/planning/projection', icon: LineChart },
      { labelKey: 'nav.cashflow', to: '/planning/cashflow', icon: Wallet },
    ],
  },
  {
    titleKey: 'nav.hr',
    module: 'hr',
    items: [
      { labelKey: 'nav.attendance', to: '/hr/attendance', icon: Clock },
      { labelKey: 'nav.kpiTargets', to: '/hr/kpi-targets', icon: Target },
      { labelKey: 'nav.personalInfo', to: '/hr/personal-info', icon: ClipboardList },
      { labelKey: 'nav.accessControl', to: '/hr/employees', icon: Users },
    ],
  },
  {
    titleKey: 'nav.partner',
    module: 'partner',
    items: [
      { labelKey: 'nav.partnerContracts', to: '/partner/contracts', icon: FileText },
      { labelKey: 'nav.calendar', to: '/calendar', icon: Calendar },
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

export function AppSidebar({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { data: featureAccess = [] } = useFeatureAccess()
  const { t } = useLanguage()
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  // Determine which routes this user can access
  const enabledRoutes = user ? getEffectiveRoutes(user, featureAccess) : []
  // Show ALL sections and items, but mark which ones are accessible
  const visibleSections = NAV_SECTIONS

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
                  const hasAccess = enabledRoutes.includes(item.to)
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
                              : hasAccess
                                ? 'text-gray-600 hover:bg-gray-50'
                                : 'text-gray-400 hover:bg-gray-50'
                          }
                        `}
                      >
                        <Icon
                          className={`shrink-0 ${
                            active ? 'text-blue-500' : hasAccess ? 'text-gray-400' : 'text-gray-300'
                          }`}
                          size={18}
                          strokeWidth={active ? 2 : 1.75}
                        />
                        <span className="truncate text-[13px]">
                          {t(item.labelKey)}
                        </span>
                        {!hasAccess && (
                          <Lock size={12} className="ml-auto shrink-0 text-gray-300" />
                        )}
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
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
          >
            <Avatar className="h-8 w-8 ring-2 ring-blue-100">
              {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
              <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-semibold">
                {user?.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 min-w-0 text-left">
              <span className="text-[13px] font-medium text-gray-900 truncate">
                {user?.name || 'User'}
              </span>
              <span className="text-[11px] text-gray-400 truncate">
                {user?.role || ''}
              </span>
            </div>
          </button>
          <button
            onClick={onOpenSettings}
            className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={t('account.settings')}
          >
            <Settings size={16} />
          </button>
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
