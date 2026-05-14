import { useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Users, Phone, Video, Handshake, TrendingUp } from 'lucide-react'
import { useSalesEvents } from '@/hooks/useSalesEvents'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from 'recharts'

const FUNNEL_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#10B981']

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

export function SalesFunnelPage() {
  const { data: events = [], isLoading, error } = useSalesEvents()

  // Aggregate stats
  const totals = useMemo(() => {
    return events.reduce(
      (acc, e) => ({
        applicants: acc.applicants + e.applicants,
        attendees: acc.attendees + e.attendees,
        phoneConsultations: acc.phoneConsultations + e.phoneConsultations,
        zoomBookings: acc.zoomBookings + e.zoomBookings,
        inPersonBookings: acc.inPersonBookings + e.inPersonBookings,
        totalMeetings: acc.totalMeetings + e.totalMeetings,
        contracts: acc.contracts + e.contracts,
      }),
      {
        applicants: 0,
        attendees: 0,
        phoneConsultations: 0,
        zoomBookings: 0,
        inPersonBookings: 0,
        totalMeetings: 0,
        contracts: 0,
      },
    )
  }, [events])

  const overallRate = totals.attendees > 0 ? (totals.contracts / totals.attendees) * 100 : 0
  const attendanceRate = totals.applicants > 0 ? (totals.attendees / totals.applicants) * 100 : 0

  // Funnel data for visualization
  const funnelData = useMemo(() => [
    { name: '신청자', value: totals.applicants, fill: FUNNEL_COLORS[0] },
    { name: '참석자', value: totals.attendees, fill: FUNNEL_COLORS[1] },
    { name: '상담', value: totals.totalMeetings, fill: FUNNEL_COLORS[2] },
    { name: '계약', value: totals.contracts, fill: FUNNEL_COLORS[5] },
  ], [totals])

  // Bar chart data per event
  const barData = useMemo(() => {
    return events.map(e => ({
      name: e.eventName.length > 10 ? e.eventName.slice(0, 10) + '…' : e.eventName,
      fullName: e.eventName,
      신청자: e.applicants,
      참석자: e.attendees,
      상담: e.totalMeetings,
      계약: e.contracts,
    }))
  }, [events])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20 text-destructive text-sm">
        데이터를 불러오는 중 오류가 발생했습니다.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">영업 퍼널</h1>
        <p className="text-sm text-gray-500 mt-1">
          이벤트별 신청 → 참석 → 상담 → 계약 전환 현황
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-blue-50 p-2">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">총 신청</p>
              <p className="text-xl font-bold">{totals.applicants}명</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-indigo-50 p-2">
              <Users className="h-4 w-4 text-indigo-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">총 참석</p>
              <p className="text-xl font-bold">{totals.attendees}명</p>
              <p className="text-[10px] text-muted-foreground">참석률 {formatPercent(attendanceRate)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-green-50 p-2">
              <Phone className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">전화 상담</p>
              <p className="text-xl font-bold">{totals.phoneConsultations}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-purple-50 p-2">
              <Video className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">Zoom 예약</p>
              <p className="text-xl font-bold">{totals.zoomBookings}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-amber-50 p-2">
              <Handshake className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">대면 예약</p>
              <p className="text-xl font-bold">{totals.inPersonBookings}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="rounded-full bg-emerald-50 p-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 uppercase">총 계약</p>
              <p className="text-xl font-bold">{totals.contracts}건</p>
              <p className="text-[10px] text-muted-foreground">전환율 {formatPercent(overallRate)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel Chart */}
        <Card>
          <CardHeader className="pb-2">
            <span className="text-sm font-medium">전체 전환 퍼널</span>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--card))',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) => [`${Number(value).toLocaleString()}명`, '']}
                  />
                  <Funnel
                    dataKey="value"
                    data={funnelData}
                    isAnimationActive
                  >
                    <LabelList
                      position="center"
                      fill="#fff"
                      stroke="none"
                      fontSize={13}
                      fontWeight={600}
                      formatter={(value: unknown) => `${Number(value).toLocaleString()}`}
                    />
                    <LabelList
                      position="right"
                      fill="#6b7280"
                      stroke="none"
                      fontSize={12}
                      dataKey="name"
                    />
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart per event */}
        <Card>
          <CardHeader className="pb-2">
            <span className="text-sm font-medium">이벤트별 비교</span>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      backgroundColor: 'hsl(var(--card))',
                      fontSize: '12px',
                    }}
                    labelFormatter={(_, payload) => {
                      if (payload && payload.length > 0) {
                        return (payload[0].payload as Record<string, string>).fullName
                      }
                      return ''
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="신청자" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="참석자" fill="#6366F1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="상담" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="계약" fill="#10B981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <span className="text-sm font-medium">이벤트별 상세</span>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              영업 이벤트 데이터가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>월</TableHead>
                    <TableHead>이벤트</TableHead>
                    <TableHead className="text-right">신청</TableHead>
                    <TableHead className="text-right">참석</TableHead>
                    <TableHead className="text-right">참석률</TableHead>
                    <TableHead className="text-right">전화상담</TableHead>
                    <TableHead className="text-right">Zoom</TableHead>
                    <TableHead className="text-right">대면</TableHead>
                    <TableHead className="text-right">총 상담</TableHead>
                    <TableHead className="text-right">계약</TableHead>
                    <TableHead className="text-right">전환율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map(e => {
                    const aRate = e.applicants > 0 ? (e.attendees / e.applicants) * 100 : 0
                    const cRate = e.attendees > 0 ? (e.contracts / e.attendees) * 100 : 0
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm text-muted-foreground">{e.month}</TableCell>
                        <TableCell className="font-medium text-sm">{e.eventName}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{e.applicants}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{e.attendees}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          <Badge variant="outline" className={`text-[10px] ${aRate >= 70 ? 'text-green-600 border-green-300' : aRate >= 50 ? 'text-amber-600 border-amber-300' : 'text-red-500 border-red-300'}`}>
                            {formatPercent(aRate)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{e.phoneConsultations}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{e.zoomBookings}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{e.inPersonBookings}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{e.totalMeetings}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium text-green-700">{e.contracts}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          <Badge variant="outline" className={`text-[10px] ${cRate >= 20 ? 'text-green-600 border-green-300' : cRate >= 10 ? 'text-amber-600 border-amber-300' : 'text-muted-foreground'}`}>
                            {formatPercent(cRate)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell />
                    <TableCell className="text-sm">합계</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.applicants}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.attendees}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      <Badge variant="outline" className="text-[10px]">{formatPercent(attendanceRate)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.phoneConsultations}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.zoomBookings}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.inPersonBookings}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{totals.totalMeetings}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-green-700">{totals.contracts}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      <Badge variant="outline" className="text-[10px]">{formatPercent(overallRate)}</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
