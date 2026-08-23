import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCanEdit } from '@/hooks/usePermissions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2, MessageSquare, Trash2, ExternalLink, Search, Lock, Eye, EyeOff, Globe } from 'lucide-react'
import {
  useQnaQuestions, useAnswerQna, useDeleteQna, useResetQnaPin,
  QNA_CATEGORIES, type QnaQuestion, type QnaStatus,
} from '@/hooks/useQna'

const HOMEPAGE = 'https://quantumadmissions.com'

const STATUS_META: Record<QnaStatus, { label: string; className: string }> = {
  pending:   { label: '답변 대기', className: 'bg-amber-100 text-amber-800' },
  published: { label: '공개',      className: 'bg-emerald-100 text-emerald-800' },
  hidden:    { label: '숨김',      className: 'bg-gray-200 text-gray-600' },
}

function fmt(d: string | null) {
  if (!d) return '-'
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

export function QnaPage() {
  const canEdit = useCanEdit('/marketing/qna')
  const { data: questions = [], isLoading } = useQnaQuestions()
  const answer = useAnswerQna()
  const remove = useDeleteQna()
  const resetPin = useResetQnaPin()

  const [tab, setTab] = useState<QnaStatus | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<QnaQuestion | null>(null)
  const [newPin, setNewPin] = useState('')
  const [draft, setDraft] = useState({ answer: '', title: '', body: '', category: '기타', isLocked: false })

  const counts = useMemo(() => ({
    pending: questions.filter(q => q.status === 'pending').length,
    published: questions.filter(q => q.status === 'published').length,
    hidden: questions.filter(q => q.status === 'hidden').length,
    all: questions.length,
  }), [questions])

  const shown = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return questions
      .filter(q => tab === 'all' || q.status === tab)
      .filter(q => !kw || [q.title, q.body, q.askerName, q.answer ?? ''].some(v => v.toLowerCase().includes(kw)))
  }, [questions, tab, search])

  function open(q: QnaQuestion) {
    setEditing(q)
    setDraft({
      answer: q.answer ?? '',
      title: q.title,
      body: q.body,
      category: q.category,
      isLocked: q.isLocked,
    })
  }

  async function save(publish: boolean) {
    if (!editing) return
    await answer.mutateAsync({
      id: editing.id,
      answer: draft.answer,
      title: draft.title,
      body: draft.body,
      category: draft.category,
      isLocked: draft.isLocked,
      ...(publish ? { status: 'published' as QnaStatus } : {}),
    })
    setEditing(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">홈페이지 Q&amp;A</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            방문자가 홈페이지에서 남긴 질문입니다. 답변을 쓰고 <b>공개</b>로 바꾸면 홈페이지에 올라갑니다.
            <b>잠금</b>으로 표시된 질문은 목록에 제목만 보이고 내용·답변은 가려집니다.
          </p>
        </div>
        <a
          href={`${HOMEPAGE}/qna.php`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition hover:bg-accent"
        >
          홈페이지에서 보기 <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ['pending', '답변 대기', counts.pending],
          ['published', '공개', counts.published],
          ['hidden', '숨김', counts.hidden],
          ['all', '전체', counts.all],
        ] as const).map(([key, label, n]) => (
          <Button
            key={key}
            variant={tab === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(key as QnaStatus | 'all')}
          >
            {label} <span className="ml-1.5 opacity-70">{n}</span>
          </Button>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="질문·이름 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {tab === 'pending' ? '답변을 기다리는 질문이 없습니다.' : '해당하는 질문이 없습니다.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map(q => (
            <Card key={q.id} className="transition hover:border-primary/40">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge className={STATUS_META[q.status].className}>{STATUS_META[q.status].label}</Badge>
                  <Badge variant="outline">{q.category}</Badge>
                  {q.isLocked && (
                    <Badge variant="outline" className="gap-1 border-rose-200 text-rose-700">
                      <Lock className="h-3 w-3" /> 잠금
                    </Badge>
                  )}
                  {q.residence === 'overseas' && (
                    <Badge variant="outline" className="gap-1 border-sky-200 text-sky-700">
                      <Globe className="h-3 w-3" /> 해외{q.country ? ` · ${q.country}` : ''}
                    </Badge>
                  )}
                  {q.grade && <span className="text-muted-foreground">{q.grade}</span>}
                  <span className="text-muted-foreground">· {fmt(q.createdAt)}</span>
                  {q.leadId && (
                    <Link to={`/sales/leads/${q.leadId}`} className="text-primary underline underline-offset-2">
                      리드 보기
                    </Link>
                  )}
                </div>

                <button
                  type="button"
                  className="mt-2.5 block w-full text-left"
                  onClick={() => canEdit && open(q)}
                  disabled={!canEdit}
                >
                  <div className="font-semibold leading-snug">{q.title}</div>
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{q.body}</p>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{q.askerName}{q.studentName ? ` / ${q.studentName}` : ''}</span>
                  {q.askerPhone && <span>{q.askerPhone}</span>}
                  {q.askerEmail && <span>{q.askerEmail}</span>}
                  {q.school && <span>{q.school}</span>}
                  {q.region && <span>{q.region}</span>}
                  {q.interestArea && <span>관심: {q.interestArea}</span>}
                  {q.sourcePath && <span>경로: {q.sourcePath}</span>}
                  {q.status === 'published' && !q.isLocked && <span>조회 {q.viewCount}</span>}
                </div>

                {q.answer && (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" /> 답변 · {fmt(q.answeredAt)}
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap">{q.answer}</p>
                  </div>
                )}

                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => open(q)}>
                      {q.answer ? '답변 수정' : '답변 쓰기'}
                    </Button>
                    {q.status === 'published' ? (
                      <Button size="sm" variant="outline"
                        onClick={() => answer.mutate({ id: q.id, status: 'hidden' })}>
                        <EyeOff className="mr-1.5 h-3.5 w-3.5" /> 내리기
                      </Button>
                    ) : q.answer ? (
                      <Button size="sm" variant="outline"
                        onClick={() => answer.mutate({ id: q.id, status: 'published' })}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" /> 공개하기
                      </Button>
                    ) : null}
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('이 질문을 삭제할까요? 되돌릴 수 없습니다.')) remove.mutate(q.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>답변 쓰기</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <div>
                  <b className="text-foreground">{editing.askerName}</b>
                  {editing.studentName && ` / 학생 ${editing.studentName}`}
                  {editing.grade && ` · ${editing.grade}`}
                  {editing.school && ` · ${editing.school}`}
                </div>
                <div>
                  {editing.residence === 'overseas' ? `해외거주${editing.country ? ` · ${editing.country}` : ''}` : '국내거주'}
                  {editing.region && ` · ${editing.region}`}
                  {editing.askerPhone && ` · ${editing.askerPhone}`}
                  {editing.askerEmail && ` · ${editing.askerEmail}`}
                </div>
                <div>
                  {editing.interestArea && `관심 ${editing.interestArea} · `}
                  {editing.sourcePath && `경로 ${editing.sourcePath} · `}
                  {fmt(editing.createdAt)}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>분류</Label>
                  <Select value={draft.category} onValueChange={v => setDraft(d => ({ ...d, category: v || '기타' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QNA_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={draft.isLocked}
                      onChange={e => setDraft(d => ({ ...d, isLocked: e.target.checked }))}
                    />
                    잠금 — 제목만 노출, 내용·답변 가림
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>질문 제목</Label>
                <Input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label>질문 내용</Label>
                <Textarea
                  rows={5}
                  value={draft.body}
                  onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  공개되는 글입니다. 실명·학교명처럼 질문자가 드러나는 부분은 다듬어 주세요.
                </p>
              </div>

              {editing.isLocked && (
                <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <Label className="text-xs">잠금 비밀번호 재설정</Label>
                  <p className="text-xs text-muted-foreground">
                    비밀번호는 해시로만 저장돼 조회할 수 없습니다. 질문자가 잊었다고 연락해 오면
                    여기서 새 번호를 정해 알려주세요.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      className="w-32"
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="숫자 4자리"
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!/^[0-9]{4}$/.test(newPin) || resetPin.isPending}
                      onClick={async () => {
                        await resetPin.mutateAsync({ id: editing.id, pin: newPin })
                        setNewPin('')
                        alert('비밀번호를 바꿨습니다. 질문자에게 새 번호를 알려주세요.')
                      }}
                    >
                      재설정
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>답변</Label>
                <Textarea
                  rows={9}
                  placeholder="질문에 답하고, 더 자세한 상담이 필요하면 상담 신청을 안내해 주세요."
                  value={draft.answer}
                  onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setEditing(null)}>취소</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => save(false)} disabled={answer.isPending}>
                임시 저장
              </Button>
              <Button
                onClick={() => save(true)}
                disabled={answer.isPending || !draft.answer.trim()}
              >
                {answer.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                답변 저장 + 공개
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
