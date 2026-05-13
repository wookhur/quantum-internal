import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search, Plus, Loader2, DollarSign, CheckCircle2, AlertTriangle, Clock,
  Upload, Ban, ChevronRight,
} from 'lucide-react'
import { useContractsWithInstallments, useCreateContract } from '@/hooks/useContracts'
import { ContractPdfUploadDialog } from '@/components/ContractPdfUploadDialog'
import { formatCurrency } from '@/types'
import type { ContractStatus, PaymentInstallment } from '@/types'

function InstallmentBadge({ installment }: { installment: PaymentInstallment }) {
  const statusStyles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-gray-50 text-gray-600 border-gray-200',
    overdue: 'bg-red-50 text-red-600 border-red-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  const statusLabel: Record<string, string> = {
    paid: '완납',
    pending: '예정',
    overdue: '연체',
    partial: '일부',
  }

  return (
    <Badge
      variant="outline"
      className={`text-[10px] h-5 px-1.5 font-normal ${statusStyles[installment.status] || ''}`}
    >
      {installment.label} {statusLabel[installment.status] || installment.status}
    </Badge>
  )
}

/** Compact installment summary for the list row */
function InstallmentSummaryCell({ installments, currency }: { installments: PaymentInstallment[]; currency: 'KRW' | 'USD' }) {
  if (installments.length === 0) {
    return <span className="text-xs text-muted-foreground">납입일정 없음</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {installments.map((inst) => (
        <InstallmentBadge key={inst.id} installment={inst} />
      ))}
    </div>
  )
}

const INITIAL_CONTRACT_FORM = {
  contractorName: '',
  studentName: '',
  schoolName: '',
  gradeAtContract: '',
  contractDate: '',
  expiryDate: '',
}

export function ContractsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [form, setForm] = useState(INITIAL_CONTRACT_FORM)
  const createContract = useCreateContract()

  const handleCreateContract = () => {
    if (!form.contractorName.trim() || !form.studentName.trim()) return
    createContract.mutate(form, {
      onSuccess: () => {
        setDialogOpen(false)
        setForm(INITIAL_CONTRACT_FORM)
      },
    })
  }

  const { data: contracts = [], isLoading, error } = useContractsWithInstallments({
    status: statusFilter !== 'all' ? statusFilter as ContractStatus : undefined,
    search: search || undefined,
  })

  // Summary stats
  const total = contracts.length
  const totalPaid = contracts.reduce((s, c) => s + (c.paidAmount || 0), 0)
  const totalOutstanding = contracts.reduce((s, c) => s + (c.outstandingAmount || 0), 0)
  const overdueContracts = contracts.filter(c =>
    c.installments?.some(i => i.status === 'overdue')
  ).length
  const cancelledCount = contracts.filter(c => c.status === 'cancelled').length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">계약 관리</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? '로딩 중...' : `총 ${total}건 | 수금 완료 ${formatCurrency(totalPaid)} | 미수금 ${formatCurrency(totalOutstanding)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPdfDialogOpen(true)}>
            <Upload className="size-3.5" /> PDF 업로드
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3.5" /> 계약 추가
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>계약 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>학부모명</Label>
                    <Input
                      placeholder="학부모명"
                      value={form.contractorName}
                      onChange={e => setForm(f => ({ ...f, contractorName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>학생명</Label>
                    <Input
                      placeholder="학생명"
                      value={form.studentName}
                      onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>학교명</Label>
                    <Input
                      placeholder="학교명"
                      value={form.schoolName}
                      onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>학년</Label>
                    <Input
                      placeholder="학년"
                      value={form.gradeAtContract}
                      onChange={e => setForm(f => ({ ...f, gradeAtContract: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>계약일</Label>
                    <Input
                      type="date"
                      value={form.contractDate}
                      onChange={e => setForm(f => ({ ...f, contractDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>만료일</Label>
                    <Input
                      type="date"
                      value={form.expiryDate}
                      onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateContract}
                  disabled={!form.contractorName.trim() || !form.studentName.trim() || createContract.isPending}
                >
                  {createContract.isPending ? '추가 중...' : '추가'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <ContractPdfUploadDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalPaid)}</div>
              <div className="text-xs text-muted-foreground">수금 완료</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Clock className="size-5 text-blue-500" />
            <div>
              <div className="text-lg font-bold">{formatCurrency(totalOutstanding)}</div>
              <div className="text-xs text-muted-foreground">미수금</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-red-500" />
            <div>
              <div className="text-lg font-bold">{overdueContracts}</div>
              <div className="text-xs text-muted-foreground">연체 계약</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Ban className="size-5 text-gray-400" />
            <div>
              <div className="text-lg font-bold">{cancelledCount}</div>
              <div className="text-xs text-muted-foreground">취소/이탈</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="학생명, 계약자명 검색..."
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || 'all')}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="active">활성</SelectItem>
                <SelectItem value="expiring_soon">만료 임박</SelectItem>
                <SelectItem value="expired">만료</SelectItem>
                <SelectItem value="cancelled">취소</SelectItem>
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
              데이터를 불러오는 중 오류가 발생했습니다.
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
              <p>계약이 없습니다.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">계약자</TableHead>
                  <TableHead className="w-[100px]">학생</TableHead>
                  <TableHead>납입 현황</TableHead>
                  <TableHead className="text-right w-[130px]">계약 금액</TableHead>
                  <TableHead className="text-right w-[130px]">수금액</TableHead>
                  <TableHead className="text-right w-[130px]">잔액</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const isCancelled = contract.status === 'cancelled'
                  return (
                    <TableRow
                      key={contract.id}
                      className={`cursor-pointer hover:bg-muted/50 ${isCancelled ? 'opacity-50' : ''}`}
                      onClick={() => navigate(`/consulting/clients/${contract.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {contract.contractorName}
                          {isCancelled && (
                            <Badge variant="outline" className="text-[10px] h-4 bg-gray-100 text-gray-500 border-gray-300">
                              취소
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{contract.studentName}</TableCell>
                      <TableCell>
                        <InstallmentSummaryCell
                          installments={contract.installments || []}
                          currency={contract.currency}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {contract.totalAmount > 0 ? formatCurrency(contract.totalAmount, contract.currency) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600">
                        {(contract.paidAmount || 0) > 0 ? formatCurrency(contract.paidAmount!, contract.currency) : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${(contract.outstandingAmount || 0) > 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                        {(contract.outstandingAmount || 0) > 0 ? formatCurrency(contract.outstandingAmount!, contract.currency) : '-'}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
