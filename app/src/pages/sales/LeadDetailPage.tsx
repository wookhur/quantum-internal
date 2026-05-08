import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, Phone, Mail, MapPin, School, GraduationCap,
  Calendar, MessageSquare, Edit, Clock, CheckCircle2, Loader2,
} from 'lucide-react'
import { useLead } from '@/hooks/useLeads'
import type { PipelineStage } from '@/types'

const STAGE_LABELS: Record<PipelineStage, { label: string; color: string }> = {
  new_lead: { label: '신규 리드', color: 'bg-stage-new' },
  katalk_sent: { label: '카톡 발송', color: 'bg-stage-contacted' },
  first_consultation: { label: '1차 상담', color: 'bg-stage-consulting' },
  second_consultation: { label: '2차 상담', color: 'bg-stage-review' },
  contract_review: { label: '계약 검토', color: 'bg-stage-review' },
  contracted: { label: '계약 완료', color: 'bg-stage-contracted' },
  lost: { label: '이탈', color: 'bg-stage-lost' },
}

export function LeadDetailPage() {
  const { id } = useParams()
  const { data: lead, isLoading, error } = useLead(id || '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> 리드 목록
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          리드를 찾을 수 없습니다.
        </div>
      </div>
    )
  }

  const stage = STAGE_LABELS[lead.pipelineStage]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Link to="/sales/leads" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> 리드 목록
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Edit className="size-3.5" /> 수정
          </Button>
          <Button size="sm">미팅 예약</Button>
        </div>
      </div>

      {/* Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold">
                  {lead.studentName || lead.parentName}
                </h1>
                <Badge className={`${stage.color} text-white text-xs`}>{stage.label}</Badge>
              </div>
              {lead.studentName && (
                <p className="text-sm text-muted-foreground">{lead.parentName} (학부모)</p>
              )}
            </div>
            {lead.requiredAction && (
              <Badge variant="outline" className="border-warning text-warning font-medium">
                {lead.requiredAction}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="size-4 text-muted-foreground" />
              <span>{lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span>{lead.email}</span>
              </div>
            )}
            {lead.currentSchool && (
              <div className="flex items-center gap-2 text-sm">
                <School className="size-4 text-muted-foreground" />
                <span>{lead.currentSchool}</span>
              </div>
            )}
            {lead.grade && (
              <div className="flex items-center gap-2 text-sm">
                <GraduationCap className="size-4 text-muted-foreground" />
                <span>G{lead.grade}</span>
              </div>
            )}
            {lead.region && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground" />
                <span>{lead.region}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span>유입: {lead.leadDate}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span>{lead.sourceChannel}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consultation Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">상담 진행 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {[
              { label: '1차 상담', data: lead.consultations?.first },
              { label: '2차 상담', data: lead.consultations?.second },
              { label: '3차 상담', data: lead.consultations?.third },
            ].map((c, i) => (
              <div key={i} className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {c.data?.status === 'completed' ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Clock className="size-5 text-muted-foreground/30" />
                  )}
                  <span className={`text-sm font-medium ${c.data?.status === 'completed' ? '' : 'text-muted-foreground'}`}>
                    {c.label}
                  </span>
                </div>
                {c.data?.status === 'completed' && (
                  <div className="ml-7 text-xs text-muted-foreground space-y-0.5">
                    {c.data.date && <p>{c.data.date}</p>}
                    {c.data.method && <p>{c.data.method}</p>}
                  </div>
                )}
                {i < 2 && <Separator className="mt-3" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Timeline / Notes / Files */}
      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">메모</TabsTrigger>
          <TabsTrigger value="files">파일</TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {lead.memo ? (
                <p className="text-sm leading-relaxed">{lead.memo}</p>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-6">
                  메모가 없습니다. 메모를 추가하세요.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground text-sm py-12">
              첨부된 파일이 없습니다.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
