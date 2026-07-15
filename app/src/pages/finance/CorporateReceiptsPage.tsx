import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Loader2, Plus, Trash2, Paperclip, ExternalLink, Lock, CreditCard } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { todayKST } from '@/lib/date'
import {
  useCorporateReceipts,
  useCreateCorporateReceipt,
  useDeleteCorporateReceipt,
} from '@/hooks/useCorporateReceipts'

export function CorporateReceiptsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: receipts = [], isLoading } = useCorporateReceipts()
  const create = useCreateCorporateReceipt()
  const del = useDeleteCorporateReceipt()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ payer: '', reason: '', paidDate: todayKST(), memo: '' })
  const [file, setFile] = useState<File | null>(null)

  const reset = () => { setForm({ payer: '', reason: '', paidDate: todayKST(), memo: '' }); setFile(null); if (fileRef.current) fileRef.current.value = '' }

  const canSave = form.payer.trim() !== '' && form.reason.trim() !== '' && !create.isPending

  const handleSave = () => {
    if (!canSave) return
    create.mutate(
      { payer: form.payer, reason: form.reason, paidDate: form.paidDate || undefined, memo: form.memo, file },
      {
        onSuccess: reset,
        onError: (e: unknown) => {
          const err = e as { message?: string; details?: string; hint?: string; code?: string }
          alert(`저장에 실패했습니다.\n${err?.message || ''}${err?.details ? `\n${err.details}` : ''}${err?.hint ? `\n${err.hint}` : ''}${err?.code ? `\n(${err.code})` : ''}`)
        },
      },
    )
  }

  // admin 전용
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">영수증관리는 관리자만 열람할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">영수증 관리</h1>
        <p className="text-sm text-muted-foreground">
          법인카드로 결제한 건을 기록하고 영수증 사진을 첨부해 관리합니다. (관리자 전용)
        </p>
      </div>

      {/* 등록 폼 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="size-4 text-purple-500" /> 법인카드 결제 등록
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">결제인 <span className="text-red-500">*</span></Label>
              <Input value={form.payer} onChange={e => setForm({ ...form, payer: e.target.value })} placeholder="이름" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">결제일</Label>
              <Input type="date" value={form.paidDate} onChange={e => setForm({ ...form, paidDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">영수증 첨부</Label>
              <Input ref={fileRef} type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">결제사유 <span className="text-red-500">*</span></Label>
            <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="예: 팀 회식, 사무용품 구입 등" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">상세보고 (메모)</Label>
            <Textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} placeholder="상세 내역을 입력하세요" />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!canSave}>
              {create.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Plus className="size-4 mr-1" />}
              등록
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : receipts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">등록된 영수증이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">결제일</TableHead>
                  <TableHead className="w-28">결제인</TableHead>
                  <TableHead>결제사유</TableHead>
                  <TableHead>상세보고</TableHead>
                  <TableHead className="w-24 text-center">영수증</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.paidDate || '-'}</TableCell>
                    <TableCell className="text-sm font-medium">{r.payer || '-'}</TableCell>
                    <TableCell className="text-sm">{r.reason || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="max-w-[280px] truncate" title={r.memo || ''}>{r.memo || '-'}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      {r.receiptUrl ? (
                        <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                          <Paperclip className="size-3" /> 보기 <ExternalLink className="size-3" />
                        </a>
                      ) : <span className="text-xs text-muted-foreground">없음</span>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-red-600"
                        onClick={() => { if (confirm('이 영수증 기록을 삭제할까요?')) del.mutate(r.id) }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
