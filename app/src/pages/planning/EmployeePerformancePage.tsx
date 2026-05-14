import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/i18n/LanguageContext'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Users, Phone, FileText, FolderKanban, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useProfiles } from '@/hooks/useProfiles'
import type { User, Department } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface EmployeeMetrics {
  profile: User
  // Sales
  leadsOwned: number
  callsMade: number
  consultationsDone: number
  contractsAsSales: number
  contractRevenueSales: number
  // Service / Consulting
  contractsAsService: number
  meetingsCreated: number
  // Projects
  todosOwned: number
  todosCompleted: number
  todosAssigned: number
}

const DEPT_COLORS: Record<Department, string> = {
  management: 'bg-amber-100 text-amber-700',
  sales: 'bg-blue-100 text-blue-700',
  marketing: 'bg-purple-100 text-purple-700',
  finance: 'bg-orange-100 text-orange-700',
  service: 'bg-emerald-100 text-emerald-700',
}

// ── Data hook ────────────────────────────────────────────────────────────────

function useEmployeePerformance() {
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles()

  const { data: rawData, isLoading: dataLoading } = useQuery({
    queryKey: ['employee-performance-data'],
    queryFn: async () => {
      const [leadsRes, activitiesRes, contractsRes, meetingsRes, todosRes] =
        await Promise.all([
          // Leads with assigned_to
          supabase
            .from('leads')
            .select('id, assigned_to, pipeline_stage'),

          // Lead activities (calls, consultations)
          supabase
            .from('lead_activities')
            .select('id, created_by, activity_type'),

          // Contracts (sales_rep, service_rep, total_amount)
          supabase
            .from('contracts')
            .select('id, sales_rep, service_rep, total_amount, status'),

          // Meetings
          supabase
            .from('meetings')
            .select('id, created_by'),

          // Todos
          supabase
            .from('todos')
            .select('id, "ownerId", assignees, status, created_by'),
        ])

      return {
        leads: leadsRes.data || [],
        activities: activitiesRes.data || [],
        contracts: contractsRes.data || [],
        meetings: meetingsRes.data || [],
        todos: todosRes.data || [],
      }
    },
    staleTime: 60_000,
  })

  const metrics = useMemo<EmployeeMetrics[]>(() => {
    if (!rawData || profiles.length === 0) return []

    const { leads, activities, contracts, meetings, todos } = rawData

    return profiles
      .filter((p) => !p.isExternal)
      .map((profile) => {
        const uid = profile.id

        // Leads owned
        const leadsOwned = leads.filter(
          (l: Record<string, unknown>) => l.assigned_to === uid,
        ).length

        // Calls made
        const callsMade = activities.filter(
          (a: Record<string, unknown>) =>
            a.created_by === uid && a.activity_type === 'call',
        ).length

        // Consultations done
        const consultationsDone = activities.filter(
          (a: Record<string, unknown>) =>
            a.created_by === uid && a.activity_type === 'consultation',
        ).length

        // Contracts as sales rep
        const salesContracts = contracts.filter(
          (c: Record<string, unknown>) => c.sales_rep === uid,
        )
        const contractsAsSales = salesContracts.length
        const contractRevenueSales = salesContracts.reduce(
          (sum: number, c: Record<string, unknown>) =>
            sum + (Number(c.total_amount) || 0),
          0,
        )

        // Contracts as service rep
        const contractsAsService = contracts.filter(
          (c: Record<string, unknown>) => c.service_rep === uid,
        ).length

        // Meetings created
        const meetingsCreated = meetings.filter(
          (m: Record<string, unknown>) => m.created_by === uid,
        ).length

        // Todos owned
        const ownedTodos = todos.filter(
          (t: Record<string, unknown>) => t.ownerId === uid,
        )
        const todosOwned = ownedTodos.length
        const todosCompleted = ownedTodos.filter(
          (t: Record<string, unknown>) => t.status === 'done',
        ).length

        // Todos assigned (as member)
        const todosAssigned = todos.filter((t: Record<string, unknown>) => {
          const assignees = t.assignees as string[] | null
          return assignees && assignees.includes(uid)
        }).length

        return {
          profile,
          leadsOwned,
          callsMade,
          consultationsDone,
          contractsAsSales,
          contractRevenueSales,
          contractsAsService,
          meetingsCreated,
          todosOwned,
          todosCompleted,
          todosAssigned,
        }
      })
  }, [profiles, rawData])

  return { metrics, isLoading: profilesLoading || dataLoading }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function EmployeePerformancePage() {
  const t = useT()
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const { metrics, isLoading } = useEmployeePerformance()

  const filtered = useMemo(() => {
    if (deptFilter === 'all') return metrics
    return metrics.filter((m) => m.profile.department === deptFilter)
  }, [metrics, deptFilter])

  // Group by department
  const grouped = useMemo(() => {
    const map = new Map<string, EmployeeMetrics[]>()
    const order: Department[] = ['management', 'sales', 'marketing', 'finance', 'service']
    for (const dept of order) {
      const items = filtered.filter((m) => m.profile.department === dept)
      if (items.length > 0) map.set(dept, items)
    }
    // Unassigned department
    const noDepart = filtered.filter((m) => !m.profile.department)
    if (noDepart.length > 0) map.set('none', noDepart)
    return map
  }, [filtered])

  // Summary stats
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, m) => ({
        employees: acc.employees + 1,
        leads: acc.leads + m.leadsOwned,
        calls: acc.calls + m.callsMade,
        consultations: acc.consultations + m.consultationsDone,
        contracts: acc.contracts + m.contractsAsSales,
        revenue: acc.revenue + m.contractRevenueSales,
        meetings: acc.meetings + m.meetingsCreated,
        todos: acc.todos + m.todosOwned,
        todosComplete: acc.todosComplete + m.todosCompleted,
      }),
      {
        employees: 0,
        leads: 0,
        calls: 0,
        consultations: 0,
        contracts: 0,
        revenue: 0,
        meetings: 0,
        todos: 0,
        todosComplete: 0,
      },
    )
  }, [filtered])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('empPerf.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('empPerf.subtitle')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-50 p-2">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('empPerf.employees')}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totals.employees}명
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-50 p-2">
                <Phone className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('empPerf.totalCalls')}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totals.calls}건
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-violet-50 p-2">
                <TrendingUp className="h-4 w-4 text-violet-500" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('empPerf.totalConsults')}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totals.consultations}건
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-50 p-2">
                <FileText className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('empPerf.totalContracts')}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totals.contracts}건
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-50 p-2">
                <FolderKanban className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {t('empPerf.projects')}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {totals.todosComplete}/{totals.todos}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v || 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('common.filter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.allDepartments')}</SelectItem>
            <SelectItem value="management">{t('dept.management')}</SelectItem>
            <SelectItem value="sales">{t('dept.sales')}</SelectItem>
            <SelectItem value="marketing">{t('dept.marketing')}</SelectItem>
            <SelectItem value="finance">{t('dept.finance')}</SelectItem>
            <SelectItem value="service">{t('dept.service')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grouped Tables */}
      {Array.from(grouped.entries()).map(([dept, members]) => (
        <Card key={dept}>
          <CardContent className="p-0">
            {/* Department Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50/50">
              <Badge
                className={
                  dept !== 'none'
                    ? DEPT_COLORS[dept as Department]
                    : 'bg-gray-100 text-gray-600'
                }
              >
                {dept !== 'none'
                  ? t('dept.' + dept)
                  : t('empPerf.noDept')}
              </Badge>
              <span className="text-sm text-gray-500">{members.length}명</span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">{t('empPerf.col.name')}</TableHead>
                  <TableHead className="w-[80px]">{t('empPerf.col.position')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.leads')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.calls')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.consults')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.contractsSales')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.revenue')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.contractsService')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.meetings')}</TableHead>
                  <TableHead className="text-right">{t('empPerf.col.projects')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const hasActivity =
                    m.leadsOwned > 0 ||
                    m.callsMade > 0 ||
                    m.consultationsDone > 0 ||
                    m.contractsAsSales > 0 ||
                    m.meetingsCreated > 0 ||
                    m.todosOwned > 0

                  return (
                    <TableRow
                      key={m.profile.id}
                      className={hasActivity ? '' : 'opacity-50'}
                    >
                      <TableCell className="font-medium">
                        {m.profile.name}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-gray-500">
                          {m.profile.position || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.leadsOwned || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.callsMade || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.consultationsDone || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.contractsAsSales || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.contractRevenueSales > 0
                          ? `${(m.contractRevenueSales / 10000).toFixed(0)}만`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.contractsAsService || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.meetingsCreated || '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.todosOwned > 0 ? (
                          <span>
                            <span className="text-green-600">
                              {m.todosCompleted}
                            </span>
                            /{m.todosOwned}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          {t('empPerf.noEmployees')}
        </div>
      )}
    </div>
  )
}
