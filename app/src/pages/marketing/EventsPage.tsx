import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Calendar, MapPin, Users, CheckCircle2, Circle, Plus } from 'lucide-react'
import { useEvents, useCreateEvent, useUpdateEvent } from '@/hooks/useEvents'
import { formatDatetimeKST } from '@/lib/date'
import type { Event } from '@/types'

const CHECKLIST_ITEMS: { key: keyof Event; label: string }[] = [
  { key: 'speakerConfirmed', label: '연사 확정' },
  { key: 'venueConfirmed', label: '장소 확정' },
  { key: 'copyWritten', label: '카피 작성' },
  { key: 'designCompleted', label: '디자인 완료' },
  { key: 'pptCompleted', label: 'PPT 완료' },
  { key: 'uploaded', label: '업로드 완료' },
]

function getChecklistProgress(event: Event): { completed: number; total: number; percent: number } {
  const total = CHECKLIST_ITEMS.length
  const completed = CHECKLIST_ITEMS.filter(item => event[item.key] === true).length
  return { completed, total, percent: Math.round((completed / total) * 100) }
}

function formatDatetime(dt?: string): string {
  return formatDatetimeKST(dt)
}

const MONTHS = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
]

const INITIAL_EVENT_FORM = {
  month: '',
  week: 1,
  eventName: '',
  eventDatetime: '',
  venue: '',
  speakers: '',
}

export function EventsPage() {
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_EVENT_FORM)
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()

  const { data: events = [], isLoading, error } = useEvents(
    monthFilter !== 'all' ? { month: monthFilter } : undefined
  )

  const handleCreateEvent = () => {
    const speakersArray = form.speakers
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    createEvent.mutate(
      {
        month: form.month,
        week: form.week,
        event_name: form.eventName,
        event_datetime: form.eventDatetime,
        venue: form.venue || undefined,
        speakers: speakersArray.length > 0 ? speakersArray : undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_EVENT_FORM)
        },
      }
    )
  }

  // Stats
  const stats = useMemo(() => {
    const total = events.length
    const fullyReady = events.filter(e => getChecklistProgress(e).percent === 100).length
    const avgProgress = total > 0
      ? Math.round(events.reduce((sum, e) => sum + getChecklistProgress(e).percent, 0) / total)
      : 0
    return { total, fullyReady, avgProgress }
  }, [events])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">이벤트 관리</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : (
              <>
                총 {stats.total}개 이벤트 · {stats.fullyReady}개 준비 완료 · 평균 진행률 {stats.avgProgress}%
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthFilter} onValueChange={v => setMonthFilter(v || 'all')}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="월 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {MONTHS.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-1" />
            이벤트 추가
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이벤트 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>월 (YYYY-MM)</Label>
                    <Input
                      placeholder="2026-04"
                      value={form.month}
                      onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>주차</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={form.week}
                      onChange={e => setForm(f => ({ ...f, week: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>이벤트명</Label>
                  <Input
                    value={form.eventName}
                    onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>일시</Label>
                  <Input
                    type="datetime-local"
                    value={form.eventDatetime}
                    onChange={e => setForm(f => ({ ...f, eventDatetime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>장소</Label>
                  <Input
                    value={form.venue}
                    onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>연사 (쉼표로 구분)</Label>
                  <Input
                    placeholder="홍길동, 김철수"
                    value={form.speakers}
                    onChange={e => setForm(f => ({ ...f, speakers: e.target.value }))}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateEvent}
                  disabled={createEvent.isPending || !form.month || !form.eventName || !form.eventDatetime}
                >
                  {createEvent.isPending ? '저장 중...' : '추가'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-destructive text-sm">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          이벤트가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(event => {
            const progress = getChecklistProgress(event)
            return (
              <Card key={event.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate">{event.eventName}</h3>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formatDatetime(event.eventDatetime)}
                        </span>
                        {event.week && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {event.week}주차
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={progress.percent === 100 ? 'default' : 'outline'}
                      className={`shrink-0 text-[10px] ${progress.percent === 100 ? 'bg-green-600 text-white' : ''}`}
                    >
                      {progress.completed}/{progress.total}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Venue & Speakers */}
                  <div className="space-y-1.5 text-xs">
                    {event.venue && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{event.venue}</span>
                      </div>
                    )}
                    {event.speakers && event.speakers.length > 0 && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="size-3 shrink-0" />
                        <span className="truncate">{event.speakers.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">진행률</span>
                      <span className={`font-medium ${progress.percent === 100 ? 'text-green-600' : progress.percent >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {progress.percent}%
                      </span>
                    </div>
                    <Progress value={progress.percent} className="h-1.5" />
                  </div>

                  {/* Checklist */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {CHECKLIST_ITEMS.map(item => {
                      const checked = event[item.key] === true
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() =>
                            updateEvent.mutate({
                              id: event.id,
                              field: item.key,
                              value: !checked,
                            })
                          }
                          className={`flex items-center gap-1.5 text-xs rounded px-1.5 py-1 cursor-pointer transition-colors hover:bg-muted/50 ${checked ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-muted-foreground'}`}
                        >
                          {checked ? (
                            <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />
                          ) : (
                            <Circle className="size-3.5 text-muted-foreground/40 shrink-0" />
                          )}
                          <span className={checked ? 'line-through' : ''}>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
