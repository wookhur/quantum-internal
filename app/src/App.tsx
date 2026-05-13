import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
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
import { TodosPage } from '@/pages/common/TodosPage'
import { CalendarPage } from '@/pages/common/CalendarPage'
import { GamePage } from '@/pages/common/GamePage'
import { ContractsPage } from '@/pages/consulting/ContractsPage'
import { PaymentsPage } from '@/pages/consulting/PaymentsPage'
import { MarketingMetricsPage } from '@/pages/marketing/MarketingMetricsPage'
import { AdCampaignsPage } from '@/pages/marketing/AdCampaignsPage'
import { EventsPage } from '@/pages/marketing/EventsPage'
import { PlanningOverviewPage } from '@/pages/planning/PlanningOverviewPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-muted-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">개발 예정</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/todos" element={<TodosPage />} />

                <Route path="/sales/leads" element={<LeadsPage />} />
                <Route path="/sales/leads/:id" element={<LeadDetailPage />} />
                <Route path="/sales/pipeline" element={<PipelinePage />} />
                <Route path="/sales/performance" element={<SalesPerformancePage />} />
                <Route path="/sales/meetings" element={<MeetingsPage />} />
                <Route path="/sales/cold-call" element={<ColdCallPage />} />

                <Route path="/marketing/metrics" element={<MarketingMetricsPage />} />
                <Route path="/marketing/ads" element={<AdCampaignsPage />} />
                <Route path="/marketing/events" element={<EventsPage />} />
                <Route path="/marketing/videos" element={<PlaceholderPage title="영상 콘텐츠" />} />

                <Route path="/consulting/clients" element={<ContractsPage />} />
                <Route path="/consulting/payments" element={<PaymentsPage />} />

                <Route path="/planning/overview" element={<PlanningOverviewPage />} />

                <Route path="/game" element={<GamePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
