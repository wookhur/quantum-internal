import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  Plus,
  Video,
  Eye,
  ThumbsUp,
  MessageCircle,
  Share2,
  ExternalLink,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  Film,
  Upload,
  Clapperboard,
  Lightbulb,
} from 'lucide-react'
import { useVideoProjects, useCreateVideoProject, useUpdateVideoProject, useDeleteVideoProject } from '@/hooks/useVideoProjects'
import { useProfiles } from '@/hooks/useProfiles'
import type { VideoStatus, VideoProject } from '@/types'

const STATUS_CONFIG: Record<VideoStatus, { label: string; color: string; icon: typeof Video }> = {
  idea: { label: '아이디어', color: 'bg-gray-100 text-gray-700', icon: Lightbulb },
  approved: { label: '승인됨', color: 'bg-blue-100 text-blue-700', icon: CheckCircle2 },
  filming: { label: '촬영 중', color: 'bg-amber-100 text-amber-700', icon: Film },
  editing: { label: '편집 중', color: 'bg-purple-100 text-purple-700', icon: Clapperboard },
  review: { label: '검토 중', color: 'bg-orange-100 text-orange-700', icon: Eye },
  uploaded: { label: '업로드 완료', color: 'bg-green-100 text-green-700', icon: Upload },
}

const STATUS_ORDER: VideoStatus[] = ['idea', 'approved', 'filming', 'editing', 'review', 'uploaded']

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  instagram_reels: 'Instagram Reels',
  both: 'YouTube + Reels',
}

const DEFAULT_CHECKLIST: Record<string, string> = {
  script: '스크립트 작성',
  filming: '촬영 완료',
  rough_cut: '러프컷 편집',
  review: '내부 검토',
  final_cut: '최종본 완성',
  thumbnail: '썸네일 제작',
  upload: '업로드',
}

const INITIAL_FORM: {
  title: string
  category: string
  status: VideoStatus
  assignedTo: string
  dueDate: string
  platform: 'youtube' | 'instagram_reels' | 'both'
  notes: string
} = {
  title: '',
  category: '',
  status: 'idea',
  assignedTo: '',
  dueDate: '',
  platform: 'youtube',
  notes: '',
}

export function VideoProjectsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<VideoProject | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)

  const { data: projects = [], isLoading, error } = useVideoProjects(
    statusFilter !== 'all' ? { status: statusFilter as VideoStatus } : undefined,
  )
  const { data: profiles = [] } = useProfiles()
  const createProject = useCreateVideoProject()
  const updateProject = useUpdateVideoProject()
  const deleteProject = useDeleteVideoProject()

  const profileMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of profiles) m.set(p.id, p.name)
    return m
  }, [profiles])

  const openCreate = () => {
    setEditingProject(null)
    setForm(INITIAL_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: VideoProject) => {
    setEditingProject(p)
    setForm({
      title: p.title,
      category: p.category || '',
      status: p.status,
      assignedTo: p.assignedTo || '',
      dueDate: p.dueDate || '',
      platform: p.platform || 'youtube',
      notes: p.notes || '',
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    const payload = {
      title: form.title,
      category: form.category || undefined,
      status: form.status,
      assignedTo: form.assignedTo || undefined,
      dueDate: form.dueDate || undefined,
      platform: form.platform,
      notes: form.notes || undefined,
    }

    if (editingProject) {
      updateProject.mutate(
        { id: editingProject.id, ...payload },
        { onSuccess: () => { setDialogOpen(false); setEditingProject(null) } },
      )
    } else {
      createProject.mutate(
        {
          ...payload,
          checklist: Object.fromEntries(Object.keys(DEFAULT_CHECKLIST).map(k => [k, false])),
        },
        { onSuccess: () => { setDialogOpen(false) } },
      )
    }
  }

  const toggleChecklist = (project: VideoProject, key: string) => {
    const current = project.checklist || {}
    updateProject.mutate({
      id: project.id,
      checklist: { ...current, [key]: !current[key] },
    })
  }

  // Stats
  const stats = useMemo(() => {
    const total = projects.length
    const byStatus = STATUS_ORDER.reduce(
      (acc, s) => ({ ...acc, [s]: projects.filter(p => p.status === s).length }),
      {} as Record<VideoStatus, number>,
    )
    const uploaded = byStatus.uploaded || 0
    const totalViews = projects.reduce((sum, p) => sum + (p.views || 0), 0)
    return { total, byStatus, uploaded, totalViews }
  }, [projects])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">영상 콘텐츠</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? '로딩 중...'
              : `총 ${stats.total}개 프로젝트 · ${stats.uploaded}개 업로드 완료 · ${stats.totalViews.toLocaleString()} 조회`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v || 'all')}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {STATUS_ORDER.map(s => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={openCreate}>
            <Plus className="size-4 mr-1" />
            영상 추가
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CONFIG[s]
          const Icon = cfg.icon
          const count = stats.byStatus[s] || 0
          return (
            <Card
              key={s}
              className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === s ? 'ring-2 ring-blue-400' : ''}`}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            >
              <CardContent className="py-3 flex items-center gap-3">
                <div className={`rounded-full p-2 ${cfg.color}`}>
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Kanban-style Board */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-destructive text-sm">
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm">
          영상 프로젝트가 없습니다.
        </div>
      ) : (
        <>
          {/* Cards View */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const cfg = STATUS_CONFIG[project.status]
              const checklistEntries = Object.entries(DEFAULT_CHECKLIST)
              const checkedCount = checklistEntries.filter(([k]) => project.checklist?.[k]).length
              const checklistPct = Math.round((checkedCount / checklistEntries.length) * 100)

              return (
                <Card key={project.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm leading-tight truncate">
                          {project.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                            {cfg.label}
                          </Badge>
                          {project.platform && (
                            <span className="text-[10px] text-muted-foreground">
                              {PLATFORM_LABELS[project.platform] || project.platform}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(project)}
                          className="rounded p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('이 영상 프로젝트를 삭제하시겠습니까?')) {
                              deleteProject.mutate(project.id)
                            }
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Meta info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {project.category && (
                        <span className="bg-gray-100 rounded px-1.5 py-0.5">{project.category}</span>
                      )}
                      {project.assignedTo && (
                        <span>{profileMap.get(project.assignedTo) || '담당자'}</span>
                      )}
                      {project.dueDate && (
                        <span>{project.dueDate}</span>
                      )}
                    </div>

                    {/* Stats row (if uploaded) */}
                    {project.status === 'uploaded' && (
                      <div className="flex items-center gap-4 text-xs">
                        {project.views != null && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Eye className="size-3" />
                            {project.views.toLocaleString()}
                          </span>
                        )}
                        {project.likes != null && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <ThumbsUp className="size-3" />
                            {project.likes.toLocaleString()}
                          </span>
                        )}
                        {project.comments != null && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MessageCircle className="size-3" />
                            {project.comments}
                          </span>
                        )}
                        {project.shares != null && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Share2 className="size-3" />
                            {project.shares}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Published URL */}
                    {project.publishedUrl && (
                      <a
                        href={project.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        영상 보기
                      </a>
                    )}

                    {/* Checklist progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">체크리스트</span>
                        <span className={`font-medium ${checklistPct === 100 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {checkedCount}/{checklistEntries.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${checklistPct}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {checklistEntries.map(([key, label]) => {
                          const checked = project.checklist?.[key] === true
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleChecklist(project, key)}
                              className={`flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 cursor-pointer transition-colors hover:bg-muted/50 ${
                                checked ? 'text-green-700 bg-green-50' : 'text-muted-foreground'
                              }`}
                            >
                              {checked ? (
                                <CheckCircle2 className="size-3 text-green-600 shrink-0" />
                              ) : (
                                <Circle className="size-3 text-muted-foreground/40 shrink-0" />
                              )}
                              <span className={checked ? 'line-through' : ''}>{label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Notes */}
                    {project.notes && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{project.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Performance Table for uploaded videos */}
          {projects.some(p => p.status === 'uploaded' && (p.views || p.likes)) && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Video className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">업로드 영상 성과</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>제목</TableHead>
                      <TableHead>플랫폼</TableHead>
                      <TableHead className="text-right">조회수</TableHead>
                      <TableHead className="text-right">좋아요</TableHead>
                      <TableHead className="text-right">댓글</TableHead>
                      <TableHead className="text-right">공유</TableHead>
                      <TableHead>링크</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects
                      .filter(p => p.status === 'uploaded')
                      .sort((a, b) => (b.views || 0) - (a.views || 0))
                      .map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium text-sm">{p.title}</TableCell>
                          <TableCell className="text-sm">
                            {p.platform ? PLATFORM_LABELS[p.platform] || p.platform : '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {p.views?.toLocaleString() || '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {p.likes?.toLocaleString() || '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {p.comments ?? '-'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {p.shares ?? '-'}
                          </TableCell>
                          <TableCell>
                            {p.publishedUrl ? (
                              <a
                                href={p.publishedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-xs"
                              >
                                <ExternalLink className="size-3 inline mr-1" />
                                보기
                              </a>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? '영상 수정' : '영상 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="영상 제목"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>카테고리</Label>
                <Input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="예: 입시가이드, 인터뷰"
                />
              </div>
              <div className="space-y-2">
                <Label>상태</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as VideoStatus }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>플랫폼</Label>
                <Select
                  value={form.platform}
                  onValueChange={v => setForm(f => ({ ...f, platform: v as 'youtube' | 'instagram_reels' | 'both' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="instagram_reels">Instagram Reels</SelectItem>
                    <SelectItem value="both">YouTube + Reels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>마감일</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>담당자</Label>
              <Select value={form.assignedTo} onValueChange={v => setForm(f => ({ ...f, assignedTo: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">미지정</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>메모</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={createProject.isPending || updateProject.isPending || !form.title}
            >
              {(createProject.isPending || updateProject.isPending) ? '저장 중...' : editingProject ? '수정' : '추가'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
