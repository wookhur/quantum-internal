import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { LanguageProvider } from '@/i18n/LanguageContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LeadsPage } from '@/pages/sales/LeadsPage'
import { LeadDetailPage } from '@/pages/sales/LeadDetailPage'
import { PipelinePage } from '@/pages/sales/PipelinePage'
import { SalesPerformancePage } from '@/pages/sales/SalesPerformancePage'
import { MeetingsPage } from '@/pages/sales/MeetingsPage'
import { ColdCallPage } from '@/pages/sales/ColdCallPage'
// TodosPage merged into TaskBoardPage
import { CalendarPage } from '@/pages/common/CalendarPage'
import { GamePage } from '@/pages/common/GamePage'
import { ContractsPage } from '@/pages/consulting/ContractsPage'
import { ContractDetailPage } from '@/pages/consulting/ContractDetailPage'
import { MonthlyCollectionPage } from '@/pages/consulting/MonthlyCollectionPage'
import { InvoicesPage } from '@/pages/finance/InvoicesPage'
import { ReceiptsPage } from '@/pages/finance/ReceiptsPage'
import { WireInvoicePage } from '@/pages/finance/WireInvoicePage'
import { IncentiveByContractPage } from '@/pages/finance/IncentiveByContractPage'
import { IncentiveByPersonPage } from '@/pages/finance/IncentiveByPersonPage'
import { FinanceDashboardPage } from '@/pages/finance/FinanceDashboardPage'
import { MarketingMetricsPage } from '@/pages/marketing/MarketingMetricsPage'
import { AdCampaignsPage } from '@/pages/marketing/AdCampaignsPage'
// EventsPage merged into CalendarPage
import { VideoProjectsPage } from '@/pages/marketing/VideoProjectsPage'
import { SalesFunnelPage } from '@/pages/sales/SalesFunnelPage'
import { PlanningOverviewPage } from '@/pages/planning/PlanningOverviewPage'
import { RevenueProjectionPage } from '@/pages/planning/RevenueProjectionPage'
import { AccessManagementPage } from '@/pages/planning/AccessManagementPage'
// EmployeePerformancePage merged into KpiTargetsPage
import { KpiTargetsPage } from '@/pages/planning/KpiTargetsPage'
import { CashflowPage } from '@/pages/planning/CashflowPage'
import { AttendancePage } from '@/pages/planning/AttendancePage'
import { AttendanceKioskPage } from '@/pages/planning/AttendanceKioskPage'
import { PersonalInfoPage } from '@/pages/hr/PersonalInfoPage'
import { EmployeeFormPage } from '@/pages/hr/EmployeeFormPage'
import { ServiceDashboardPage } from '@/pages/service/ServiceDashboardPage'
import { Student360Page } from '@/pages/service/Student360Page'
import { ExternalFeesPage } from '@/pages/service/ExternalFeesPage'
import { MessagesPage } from '@/pages/common/MessagesPage'
import { TaskBoardPage } from '@/pages/common/TaskBoardPage'
import { PersonProfilePage } from '@/pages/common/PersonProfilePage'
import { StudentPortalPage } from '@/pages/portal/StudentPortalPage'
import { PartnerContractsPage } from '@/pages/partner/PartnerContractsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})


export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portal/:token" element={<StudentPortalPage />} />
            <Route path="/employee-form/:token" element={<EmployeeFormPage />} />

            <Route element={<ProtectedRoute />}>
              {/* Full-screen kiosk (no sidebar) */}
              <Route path="/kiosk" element={<AttendanceKioskPage />} />

              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/todos" element={<Navigate to="/tasks" replace />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/tasks" element={<TaskBoardPage />} />
                <Route path="/person" element={<PersonProfilePage />} />

                <Route path="/sales/leads" element={<LeadsPage />} />
                <Route path="/sales/leads/:id" element={<LeadDetailPage />} />
                <Route path="/sales/pipeline" element={<PipelinePage />} />
                <Route path="/sales/performance" element={<SalesPerformancePage />} />
                <Route path="/sales/meetings" element={<MeetingsPage />} />
                <Route path="/sales/cold-call" element={<ColdCallPage />} />
                <Route path="/sales/funnel" element={<SalesFunnelPage />} />

                <Route path="/marketing/metrics" element={<MarketingMetricsPage />} />
                <Route path="/marketing/ads" element={<AdCampaignsPage />} />
                <Route path="/marketing/events" element={<Navigate to="/calendar" replace />} />
                <Route path="/marketing/videos" element={<VideoProjectsPage />} />

                <Route path="/consulting/clients" element={<ContractsPage />} />
                <Route path="/consulting/clients/:id" element={<ContractDetailPage />} />
                <Route path="/consulting/collections" element={<MonthlyCollectionPage />} />
                <Route path="/finance/dashboard" element={<FinanceDashboardPage />} />
                <Route path="/finance/invoices" element={<InvoicesPage />} />
                <Route path="/finance/receipts" element={<ReceiptsPage />} />
                <Route path="/finance/wire-invoice" element={<WireInvoicePage />} />
                <Route path="/finance/incentives/by-contract" element={<IncentiveByContractPage />} />
                <Route path="/finance/incentives/by-person" element={<IncentiveByPersonPage />} />

                <Route path="/partner/contracts" element={<PartnerContractsPage />} />

                <Route path="/service/dashboard" element={<ServiceDashboardPage />} />
                <Route path="/service/student-360" element={<Student360Page />} />
                <Route path="/service/kpi" element={<Navigate to="/hr/kpi-targets" replace />} />
                <Route path="/service/external-fees" element={<ExternalFeesPage />} />

                <Route path="/planning/overview" element={<PlanningOverviewPage />} />
                <Route path="/planning/projection" element={<RevenueProjectionPage />} />
                <Route path="/planning/employees" element={<Navigate to="/hr/kpi-targets" replace />} />
                <Route path="/planning/cashflow" element={<CashflowPage />} />

                <Route path="/hr/attendance" element={<AttendancePage />} />
                <Route path="/hr/kpi-targets" element={<KpiTargetsPage />} />
                <Route path="/hr/employees" element={<AccessManagementPage />} />
                <Route path="/hr/personal-info" element={<PersonalInfoPage />} />

                {/* Legacy redirects */}
                <Route path="/planning/attendance" element={<Navigate to="/hr/attendance" replace />} />
                <Route path="/planning/access" element={<Navigate to="/hr/employees" replace />} />
                <Route path="/planning/kpi-targets" element={<Navigate to="/hr/kpi-targets" replace />} />

                <Route path="/game" element={<GamePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
}
