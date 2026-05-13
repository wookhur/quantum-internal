import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Search, Download, Plus, Loader2, FileText, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useContracts, useCreateContract } from '@/hooks/useContracts'
import type { ContractStatus } from '@/types'

const STATUS_CONFIG: Record<ContractStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  active: { label: '활성', variant: 'default', className: 'bg-emerald-500 text-white' },
  expiring_soon: { label: '만료 임박', variant: 'outline', className: 'border-yellow-500 text-yellow-600 bg-yellow-50' },
  expired: { label: '만료', variant: 'destructive', className: 'bg-red-500 text-white' },
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
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

  const { data: contracts = [], isLoading, error } = useContracts({
    status: statusFilter !== 'all' ? statusFilter as ContractStatus : undefined,
    search: search || undefined,
  })

  const total = contracts.length
  const activeCount = contracts.filter(c => c.status === 'active').length
  const expiringCount = contracts.filter(c => c.status === 'expiring_soon').length
  const expiredCount = contracts.filter(c => c.status === 'expired').length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">계약 고객</h1>
          <p className="text-muted-foreground">
            {isLoading ? '로딩 중...' : `총 ${total}건의 계약`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> 계약 추가
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
          <Button variant="outline" className="gap-2">
            <Download className="size-4" /> 내보내기
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <FileText className="size-5 text-primary" />
            <div>
              <div className="text-lg font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">전체 계약</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <div>
              <div className="text-lg font-bold">{activeCount}</div>
              <div className="text-xs text-muted-foreground">활성</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="size-5 text-yellow-500" />
            <div>
              <div className="text-lg font-bold">{expiringCount}</div>
              <div className="text-xs text-muted-foreground">만료 임박</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <XCircle className="size-5 text-destructive" />
            <div>
              <div className="text-lg font-bold">{expiredCount}</div>
              <div className="text-xs text-muted-foreground">만료</div>
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
              계약이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계약자</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>학교</TableHead>
                  <TableHead className="w-[60px]">학년</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead className="w-[100px]">계약일</TableHead>
                  <TableHead className="w-[100px]">만료일</TableHead>
                  <TableHead className="w-[90px]">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const status = STATUS_CONFIG[contract.status]
                  return (
                    <TableRow key={contract.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{contract.contractorName}</TableCell>
                      <TableCell>{contract.studentName}</TableCell>
                      <TableCell className="text-sm">{contract.schoolName}</TableCell>
                      <TableCell className="text-sm">{contract.gradeAtContract || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{contract.phone || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {contract.contractDate?.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {contract.expiryDate?.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className={status.className + ' text-xs'}>
                          {status.label}
                        </Badge>
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
