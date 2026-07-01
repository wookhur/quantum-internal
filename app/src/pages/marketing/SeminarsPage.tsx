import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Plus,
  Loader2,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext'
import {
  useSeminars,
  useCreateSeminar,
  useUpdateSeminar,
  useDeleteSeminar,
  useSeminarRegistrations,
  useDeleteRegistration,
  type Seminar,
} from '@/hooks/useSeminars'

function CopyLinkButton({ seminarId }: { seminarId: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/seminar/${seminarId}`
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      <Copy className="size-4 mr-1" />
      {copied ? '복사됨' : '링크 복사'}
    </Button>
  )
}

function RegistrationsPanel({ seminar }: { seminar: Seminar }) {
  const { data: regs = [], isLoading } = useSeminarRegistrations(seminar.id)
  const deleteMut = useDeleteRegistration()

  const exportCsv = () => {
    const headers = ['신청일', '학부모', '연락처', '이메일', '학생', '학년', '학교', '관심사항', '메모']
    const rows = regs.map(r => [
      new Date(r.createdAt).toLocaleDateString('ko-KR'),
      r.parentName,
      r.phone,
      r.email || '',
      r.studentName,
      r.grade || '',
      r.school || '',
      r.interest || '',
      r.memo || '',
    ])
    const bom = '﻿'
    const csv = bom + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${seminar.title}_registrations.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (isLoading) return <Loader2 className="size-4 animate-spin mx-auto my-4" />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">신청자 목록 ({regs.length}명)</p>
        {regs.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4 mr-1" /> CSV 다운로드
          </Button>
        )}
      </div>
      {regs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">아직 신청자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>신청일</TableHead>
                <TableHead>학부모</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>학생</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>학교</TableHead>
                <TableHead>관심사항</TableHead>
                <TableHead>메모</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell>{r.parentName}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell>{r.email || '-'}</TableCell>
                  <TableCell>{r.studentName}</TableCell>
                  <TableCell>{r.grade || '-'}</TableCell>
                  <TableCell>{r.school || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.interest || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.memo || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('이 신청을 삭제하시겠습니까?')) deleteMut.mutate(r.id)
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function SeminarsPage() {
  const { t } = useLanguage()
  const { data: seminars = [], isLoading } = useSeminars()
  const createMut = useCreateSeminar()
  const updateMut = useUpdateSeminar()
  const deleteMut = useDeleteSeminar()

  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    maxCapacity: '',
  })

  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setError(null)
    try {
      await createMut.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date || null,
        location: form.location.trim() || null,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
      })
      setForm({ title: '', description: '', date: '', location: '', maxCapacity: '' })
      setShowCreate(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '세미나 생성에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.seminars')}</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" /> 새 세미나
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : seminars.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 등록된 세미나가 없습니다. 새 세미나를 만들어보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {seminars.map(s => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {s.title}
                      <Badge variant={s.active ? 'default' : 'secondary'}>
                        {s.active ? '모집중' : '마감'}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {s.date && <span>{s.date}</span>}
                      {s.location && <span>{s.location}</span>}
                      {s.maxCapacity && <span>정원 {s.maxCapacity}명</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyLinkButton seminarId={s.id} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMut.mutate({ id: s.id, active: !s.active })}
                    >
                      {s.active ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />}
                      {s.active ? '마감' : '열기'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('이 세미나를 삭제하시겠습니까?')) deleteMut.mutate(s.id)
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {s.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                >
                  {expandedId === s.id ? (
                    <><ChevronUp className="size-4 mr-1" /> 신청자 숨기기</>
                  ) : (
                    <><ChevronDown className="size-4 mr-1" /> 신청자 보기</>
                  )}
                </Button>
                {expandedId === s.id && <RegistrationsPanel seminar={s} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 세미나 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>세미나 제목 *</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="2026 여름 미국 대학 입시 세미나"
              />
            </div>
            <div>
              <Label>설명</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="세미나 소개 및 안내사항"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>날짜</Label>
                <Input
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  placeholder="2026년 7월 15일 (화) 14:00"
                />
              </div>
              <div>
                <Label>장소</Label>
                <Input
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="퀀텀어드미션즈 세미나실"
                />
              </div>
            </div>
            <div>
              <Label>정원 (선택)</Label>
              <Input
                type="number"
                value={form.maxCapacity}
                onChange={e => setForm({ ...form, maxCapacity: e.target.value })}
                placeholder="50"
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending || !form.title.trim()}>
              {createMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
