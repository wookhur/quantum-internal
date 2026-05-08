import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PIPELINE_STAGES } from '@/types'
import { useLeads } from '@/hooks/useLeads'
import { Loader2 } from 'lucide-react'
import type { Lead, PipelineStage } from '@/types'
import { daysFromTodayKST } from '@/lib/date'

export function PipelinePage() {
  const { data: leads = [], isLoading } = useLeads()

  // Group leads by pipeline stage
  const grouped: Record<PipelineStage, Lead[]> = {
    new_lead: [], katalk_sent: [], first_consultation: [],
    second_consultation: [], contract_review: [], contracted: [], lost: [],
  }
  leads.forEach(lead => {
    grouped[lead.pipelineStage]?.push(lead)
  })

  function getDaysSince(dateStr: string) {
    if (!dateStr) return 0
    return -daysFromTodayKST(dateStr)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">파이프라인</h1>
        <p className="text-muted-foreground">4월 파이프라인 현황 (드래그로 단계 이동)</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.filter(s => s.key !== 'lost').map((stage) => {
          const cards = grouped[stage.key]
          return (
            <div key={stage.key} className="flex-shrink-0 w-[280px]">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <h3 className="text-sm font-semibold">{stage.label}</h3>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  {cards.length}
                </Badge>
              </div>

              {/* Cards Container */}
              <div className="space-y-2.5 min-h-[400px] bg-muted/30 rounded-xl p-2.5">
                {cards.map((lead) => {
                  const days = getDaysSince(lead.leadDate)
                  return (
                    <Card key={lead.id} className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-l-2" style={{ borderLeftColor: stage.key === 'contracted' ? '#059669' : undefined }}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-sm font-semibold">{lead.studentName || lead.parentName}</span>
                          {days > 0 && stage.key !== 'contracted' && (
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${days > 7 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                              D+{days}
                            </span>
                          )}
                        </div>
                        {lead.studentName && (
                          <p className="text-xs text-muted-foreground mb-1">{lead.parentName} (학부모)</p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {lead.currentSchool && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{lead.currentSchool}</Badge>
                          )}
                          {lead.grade && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{lead.grade}</Badge>
                          )}
                        </div>
                        <div className="mt-2 pt-2 border-t">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{lead.sourceChannel}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}

                {cards.length === 0 && (
                  <div className="flex items-center justify-center h-[100px] text-xs text-muted-foreground">
                    비어 있음
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
