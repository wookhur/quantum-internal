import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Search, Download, Loader2 } from 'lucide-react'
import { useLeads, useCreateLead } from '@/hooks/useLeads'
import type { PipelineStage } from '@/types'

const STAGE_BADGE: Record<PipelineStage, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  new_lead: { label: '신규 리드', variant: 'outline', className: 'border-stage-new text-stage-new' },
  katalk_sent: { label: '카톡 발송', variant: 'outline', className: 'border-stage-contacted text-stage-contacted' },
  first_consultation: { label: '1차 상담', variant: 'outline', className: 'border-stage-consulting text-stage-consulting' },
  second_consultation: { label: '2차 상담', variant: 'outline', className: 'border-stage-review text-stage-review' },
  contract_review: { label: '계약 검토', variant: 'outline', className: 'border-stage-review text-stage-review' },
  contracted: { label: '계약 완료', variant: 'default', className: 'bg-stage-contracted text-white' },
  lost: { label: '이탈', variant: 'secondary', className: 'bg-stage-lost text-white' },
}

const INITIAL_LEAD_FORM = {
  parentName: '',
  studentName: '',
  phone: '',
  email: '',
  sourceChannel: '',
  pipelineStage: 'new_lead' as PipelineStage,
  memo: '',
}

export function LeadsPage() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_LEAD_FORM)

  const createLead = useCreateLead()

  const handleCreateLead = () => {
    createLead.mutate(
      {
        ...form,
        leadDate: new Date().toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_LEAD_FORM)
        },
      },
    )
  }

  const { data: leads = [], isLoading, error } = useLeads({
    stage: stageFilter !== 'all' ? stageFilter as PipelineStage : undefined,
    channel: channelFilter !== 'all' ? channelFilter : undefined,
    search: search || undefined,
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">리드 관리</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : `총 ${leads.length}명의 리드`}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> 리드 추가
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="이름, 학교, 연락처 검색..."
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={stageFilter} onValueChange={(v) => setStageFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="파이프라인" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="new_lead">신규 리드</SelectItem>
                <SelectItem value="katalk_sent">카톡 발송</SelectItem>
                <SelectItem value="first_consultation">1차 상담</SelectItem>
                <SelectItem value="second_consultation">2차 상담</SelectItem>
                <SelectItem value="contract_review">계약 검토</SelectItem>
                <SelectItem value="contracted">계약 완료</SelectItem>
                <SelectItem value="lost">이탈</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="유입 채널" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="Instagram">Instagram</SelectItem>
                <SelectItem value="세미나">세미나</SelectItem>
                <SelectItem value="카카오톡">카카오톡</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="size-3.5" /> 내보내기
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-20 text-destructive text-sm">
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              리드가 없습니다. 새 리드를 추가하세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">유입일</TableHead>
                  <TableHead>학부모</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>학교</TableHead>
                  <TableHead className="w-[60px]">학년</TableHead>
                  <TableHead>지역</TableHead>
                  <TableHead>유입 채널</TableHead>
                  <TableHead>단계</TableHead>
                  <TableHead>Required Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const stage = STAGE_BADGE[lead.pipelineStage]
                  return (
                    <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        <Link to={`/sales/leads/${lead.id}`} className="block">
                          {lead.leadDate?.replace('2026-', '').replace('2025-', '')}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to={`/sales/leads/${lead.id}`}>{lead.parentName}</Link>
                      </TableCell>
                      <TableCell>{lead.studentName || '-'}</TableCell>
                      <TableCell className="text-sm">{lead.currentSchool}</TableCell>
                      <TableCell className="text-sm">{lead.grade}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lead.region}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">{lead.sourceChannel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={stage.variant} className={stage.className + ' text-xs'}>
                          {stage.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">
                        {lead.requiredAction && (
                          <span className={lead.pipelineStage === 'contracted' ? 'text-success font-medium' : 'text-warning font-medium'}>
                            {lead.requiredAction}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Lead Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>새 리드 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>학부모 이름 *</Label>
                <Input value={form.parentName} onChange={e => setForm(f => ({ ...f, parentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>학생 이름</Label>
                <Input value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>연락처</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>이메일</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>유입 채널 *</Label>
                <Select value={form.sourceChannel} onValueChange={v => v && setForm(f => ({ ...f, sourceChannel: v }))}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="seminar">세미나</SelectItem>
                    <SelectItem value="kakao">카카오톡</SelectItem>
                    <SelectItem value="referral">추천</SelectItem>
                    <SelectItem value="website">웹사이트</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>파이프라인 단계</Label>
                <Select value={form.pipelineStage} onValueChange={v => v && setForm(f => ({ ...f, pipelineStage: v as PipelineStage }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_lead">신규 리드</SelectItem>
                    <SelectItem value="katalk_sent">카톡 발송</SelectItem>
                    <SelectItem value="first_consultation">1차 상담</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>메모</Label>
              <Textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleCreateLead} disabled={!form.parentName || !form.sourceChannel || createLead.isPending}>
                {createLead.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
