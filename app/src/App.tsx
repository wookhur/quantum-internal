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
import { MarketingMetricsPage } from '@/pages/marketing/MarketingMetricsPage'
import { AdCampaignsPage } from '@/pages/marketing/AdCampaignsPage'
import { EventsPage } from '@/pages/marketing/EventsPage'
import { VideoProjectsPage } from '@/pages/marketing/VideoProjectsPage'
import { SalesFunnelPage } from '@/pages/sales/SalesFunnelPage'
import { PlanningOverviewPage } from '@/pages/planning/PlanningOverviewPage'
import { RevenueProjectionPage } from '@/pages/planning/RevenueProjectionPage'
import { AccessManagementPage } from '@/pages/planning/AccessManagementPage'
import { EmployeePerformancePage } from '@/pages/planning/EmployeePerformancePage'
import { CashflowPage } from '@/pages/planning/CashflowPage'
import { AttendancePage } from '@/pages/planning/AttendancePage'
import { ServiceDashboardPage } from '@/pages/service/ServiceDashboardPage'
import { Student360Page } from '@/pages/service/Student360Page'
import { ConsultantKpiPage } from '@/pages/service/ConsultantKpiPage'
import { ExternalFeesPage } from '@/pages/service/ExternalFeesPage'
import { MessagesPage } from '@/pages/common/MessagesPage'
import { TaskBoardPage } from '@/pages/common/TaskBoardPage'
import { PersonProfilePage } from '@/pages/common/PersonProfilePage'
import { StudentPortalPage } from '@/pages/portal/StudentPortalPage'

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

            <Route element={<ProtectedRoute />}>
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
                <Route path="/marketing/events" element={<EventsPage />} />
                <Route path="/marketing/videos" element={<VideoProjectsPage />} />

                <Route path="/consulting/clients" element={<ContractsPage />} />
                <Route path="/consulting/clients/:id" element={<ContractDetailPage />} />
                <Route path="/consulting/collections" element={<MonthlyCollectionPage />} />
                <Route path="/finance/invoices" element={<InvoicesPage />} />
                <Route path="/finance/receipts" element={<ReceiptsPage />} />
                <Route path="/finance/wire-invoice" element={<WireInvoicePage />} />
                <Route path="/finance/incentives/by-contract" element={<IncentiveByContractPage />} />
                <Route path="/finance/incentives/by-person" element={<IncentiveByPersonPage />} />

                <Route path="/service/dashboard" element={<ServiceDashboardPage />} />
                <Route path="/service/student-360" element={<Student360Page />} />
                <Route path="/service/kpi" element={<ConsultantKpiPage />} />
                <Route path="/service/external-fees" element={<ExternalFeesPage />} />

                <Route path="/planning/overview" element={<PlanningOverviewPage />} />
                <Route path="/planning/projection" element={<RevenueProjectionPage />} />
                <Route path="/planning/access" element={<AccessManagementPage />} />
                <Route path="/planning/employees" element={<EmployeePerformancePage />} />
                <Route path="/planning/cashflow" element={<CashflowPage />} />
                <Route path="/planning/attendance" element={<AttendancePage />} />

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
