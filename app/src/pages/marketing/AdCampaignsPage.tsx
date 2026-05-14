import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, DollarSign, MousePointerClick, BarChart3, Plus } from 'lucide-react'
import { useAdCampaigns, useCreateAdCampaign } from '@/hooks/useAdCampaigns'
import { useT } from '@/i18n/LanguageContext'
import type { AdPlatform } from '@/types'

const PLATFORM_CONFIG: Record<string, { label: string; className: string }> = {
  meta: { label: 'Meta', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  kakao: { label: 'Kakao', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
}

function formatCurrency(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`
  return value.toLocaleString()
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

const INITIAL_CAMPAIGN_FORM = {
  platform: 'meta' as AdPlatform,
  eventName: '',
  impressions: 0,
  reach: 0,
  clicks: 0,
  cost: 0,
  note: '',
}

export function AdCampaignsPage() {
  const t = useT()
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_CAMPAIGN_FORM)
  const createCampaign = useCreateAdCampaign()

  const handleCreateCampaign = () => {
    const ctr = form.impressions > 0 ? (form.clicks / form.impressions) * 100 : 0
    const cpc = form.clicks > 0 ? form.cost / form.clicks : 0
    createCampaign.mutate(
      {
        platform: form.platform,
        event_name: form.eventName,
        impressions: form.impressions,
        reach: form.reach,
        clicks: form.clicks,
        cost: form.cost,
        ctr: Math.round(ctr * 100) / 100,
        cpc: Math.round(cpc * 100) / 100,
        note: form.note || undefined,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(INITIAL_CAMPAIGN_FORM)
        },
      }
    )
  }

  const { data: campaigns = [], isLoading, error } = useAdCampaigns({
    platform: platformFilter !== 'all' ? platformFilter as AdPlatform : undefined,
    month: monthFilter !== 'all' ? monthFilter : undefined,
  })

  // Summary stats
  const summary = useMemo(() => {
    if (campaigns.length === 0) return { totalSpend: 0, avgCtr: 0, avgCpc: 0, totalClicks: 0 }
    const totalSpend = campaigns.reduce((s, c) => s + (c.cost || 0), 0)
    const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0)
    const avgCtr = campaigns.reduce((s, c) => s + (c.ctr || 0), 0) / campaigns.length
    const avgCpc = campaigns.reduce((s, c) => s + (c.cpc || 0), 0) / campaigns.length
    return { totalSpend, avgCtr, avgCpc, totalClicks }
  }, [campaigns])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('ads.title')}</h1>
          <p className="text-muted-foreground">
            {isLoading ? t('common.loading') : t('ads.totalCampaigns', { n: campaigns.length }) + (monthFilter !== 'all' ? ` · ${monthFilter.split('-')[0]}년 ${Number(monthFilter.split('-')[1])}월` : '')}
          </p>
        </div>
        <Button size="sm" className="h-9" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-1" />
          {t('ads.addCampaign')}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('ads.addCampaign')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('ads.platform')}</Label>
                  <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v as AdPlatform }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meta">Meta</SelectItem>
                      <SelectItem value="kakao">Kakao</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('ads.eventName')}</Label>
                  <Input
                    value={form.eventName}
                    onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('ads.impressions')}</Label>
                  <Input
                    type="number"
                    value={form.impressions}
                    onChange={e => setForm(f => ({ ...f, impressions: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('ads.reach')}</Label>
                  <Input
                    type="number"
                    value={form.reach}
                    onChange={e => setForm(f => ({ ...f, reach: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('ads.clicks')}</Label>
                  <Input
                    type="number"
                    value={form.clicks}
                    onChange={e => setForm(f => ({ ...f, clicks: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('ads.cost')}</Label>
                  <Input
                    type="number"
                    value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))}
                  />
                </div>
              </div>
              {form.impressions > 0 && form.clicks > 0 && (
                <div className="text-xs text-muted-foreground">
                  {t('ads.autoCalc')} - CTR: {((form.clicks / form.impressions) * 100).toFixed(2)}% / CPC: {Math.round(form.cost / form.clicks).toLocaleString()}원
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('ads.note')}</Label>
                <Textarea
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateCampaign}
                disabled={createCampaign.isPending || !form.eventName}
              >
                {createCampaign.isPending ? t('common.saving') : t('common.add')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50">
              <DollarSign className="size-5 text-red-500" />
            </div>
            <div>
              <div className="text-lg font-bold">{formatCurrency(summary.totalSpend)}원</div>
              <div className="text-xs text-muted-foreground">{t('ads.totalSpend')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <BarChart3 className="size-5 text-blue-500" />
            </div>
            <div>
              <div className="text-lg font-bold">{formatPercent(summary.avgCtr)}</div>
              <div className="text-xs text-muted-foreground">{t('ads.avgCtr')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50">
              <DollarSign className="size-5 text-green-500" />
            </div>
            <div>
              <div className="text-lg font-bold">{Math.round(summary.avgCpc).toLocaleString()}원</div>
              <div className="text-xs text-muted-foreground">{t('ads.avgCpc')}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-50">
              <MousePointerClick className="size-5 text-purple-500" />
            </div>
            <div>
              <div className="text-lg font-bold">{summary.totalClicks.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{t('ads.totalClicks')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Select value={platformFilter} onValueChange={v => setPlatformFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder={t('ads.platform')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ads.allPlatforms')}</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
                <SelectItem value="kakao">Kakao</SelectItem>
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={v => setMonthFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder={t('mktMetrics.month')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ads.allMonths')}</SelectItem>
                {Array.from({ length: 24 }, (_, i) => {
                  const year = 2025 + Math.floor(i / 12)
                  const month = (i % 12) + 1
                  const value = `${year}-${String(month).padStart(2, '0')}`
                  return (
                    <SelectItem key={value} value={value}>
                      {year}년 {month}월
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
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
              {t('common.error')}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('ads.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">{t('ads.platform')}</TableHead>
                    <TableHead>{t('ads.eventName')}</TableHead>
                    <TableHead className="text-right">{t('ads.impressions')}</TableHead>
                    <TableHead className="text-right">{t('ads.reach')}</TableHead>
                    <TableHead className="text-right">{t('ads.clicks')}</TableHead>
                    <TableHead className="text-right">{t('ads.cost')}</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">{t('ads.comments')}</TableHead>
                    <TableHead className="text-right">{t('ads.friendsDiff')}</TableHead>
                    <TableHead>{t('ads.note')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(c => {
                    const platform = PLATFORM_CONFIG[c.platform] || { label: c.platform, className: '' }
                    const friendsDiff = (c.friendsAfter ?? 0) - (c.friendsBefore ?? 0)
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs font-medium ${platform.className}`}>
                            {platform.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{c.eventName}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.impressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.reach.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.clicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatCurrency(c.cost)}원</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{formatPercent(c.ctr)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{Math.round(c.cpc).toLocaleString()}원</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.comments ?? '-'}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {c.friendsBefore != null ? (
                            <span className={friendsDiff > 0 ? 'text-green-600' : friendsDiff < 0 ? 'text-red-500' : ''}>
                              {friendsDiff > 0 ? '+' : ''}{friendsDiff}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {c.note || '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
