import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Users, Search, UserCheck, UserX, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n/LanguageContext'
import { toast } from 'sonner'

// ── Consultant Pool ──
const CONSULTANTS = [
  { id: 'sangbum', name: '한상범', color: 'bg-blue-500' },
  { id: 'jihyun', name: '김지현', color: 'bg-purple-500' },
  { id: 'eunyoung', name: '양은영', color: 'bg-emerald-500' },
  { id: 'yeonse', name: '남연서', color: 'bg-orange-500' },
  { id: 'danny', name: 'Danny', color: 'bg-rose-500' },
  { id: 'liz', name: '유리즈', color: 'bg-cyan-500' },
] as const

type ConsultantId = (typeof CONSULTANTS)[number]['id']

interface ContractRow {
  id: string
  student_name: string
  school_name: string
  grade_at_contract: string | null
  contractor_name: string
  phone: string | null
  service_rep: string | null
  status: string
  contract_date: string
}

function getConsultant(id: string | null) {
  return CONSULTANTS.find(c => c.id === id) || null
}

export function ConsultantAssignmentPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterConsultant, setFilterConsultant] = useState<string>('all')
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | null>>({})

  // Fetch contracts
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, student_name, school_name, grade_at_contract, contractor_name, phone, service_rep, status, contract_date')
        .in('status', ['active', 'expiring_soon'])
        .order('student_name')
      if (error) throw error
      return (data || []) as ContractRow[]
    },
  })

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (changes: Record<string, string | null>) => {
      const updates = Object.entries(changes).map(([id, rep]) =>
        supabase.from('contracts').update({ service_rep: rep }).eq('id', id)
      )
      const results = await Promise.all(updates)
      const errors = results.filter(r => r.error)
      if (errors.length > 0) throw new Error(`${errors.length}건 저장 실패`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts-assignments'] })
      setPendingChanges({})
      toast.success(t('service.saveSuccess'))
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  // Computed
  const effectiveContracts = useMemo(() => {
    return contracts.map(c => ({
      ...c,
      service_rep: pendingChanges[c.id] !== undefined ? pendingChanges[c.id] : c.service_rep,
    }))
  }, [contracts, pendingChanges])

  const filtered = useMemo(() => {
    return effectiveContracts.filter(c => {
      const matchSearch = !search ||
        c.student_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.school_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.contractor_name?.toLowerCase().includes(search.toLowerCase())
      const matchConsultant = filterConsultant === 'all' ||
        (filterConsultant === 'unassigned' ? !c.service_rep : c.service_rep === filterConsultant)
      return matchSearch && matchConsultant
    })
  }, [effectiveContracts, search, filterConsultant])

  // Stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    CONSULTANTS.forEach(c => { counts[c.id] = 0 })
    let unassigned = 0
    effectiveContracts.forEach(c => {
      if (c.service_rep && counts[c.service_rep] !== undefined) {
        counts[c.service_rep]++
      } else {
        unassigned++
      }
    })
    return { counts, unassigned, total: effectiveContracts.length }
  }, [effectiveContracts])

  const handleAssign = (contractId: string, consultantId: string | null) => {
    setPendingChanges(prev => ({ ...prev, [contractId]: consultantId }))
  }

  const hasPendingChanges = Object.keys(pendingChanges).length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('service.assignmentTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('service.assignmentDesc')}</p>
        </div>
        {hasPendingChanges && (
          <Button
            onClick={() => saveMutation.mutate(pendingChanges)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('service.saveChanges')} ({Object.keys(pendingChanges).length})
          </Button>
        )}
      </div>

      {/* Consultant Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {CONSULTANTS.map(c => (
          <Card
            key={c.id}
            className={`cursor-pointer transition-all hover:shadow-md ${filterConsultant === c.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setFilterConsultant(filterConsultant === c.id ? 'all' : c.id)}
          >
            <CardContent className="p-3 flex items-center gap-2">
              <Avatar className="size-7">
                <AvatarFallback className={`${c.color} text-white text-xs`}>
                  {c.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-lg font-bold leading-tight">{stats.counts[c.id]}</div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filterConsultant === 'unassigned' ? 'ring-2 ring-destructive' : ''}`}
          onClick={() => setFilterConsultant(filterConsultant === 'unassigned' ? 'all' : 'unassigned')}
        >
          <CardContent className="p-3 flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="bg-gray-400 text-white text-xs">
                <UserX className="size-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t('service.unassigned')}</div>
              <div className="text-lg font-bold leading-tight text-destructive">{stats.unassigned}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" />
              {t('service.studentList')} ({filtered.length}/{stats.total})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('service.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground text-sm">
              {t('service.noStudents')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.col.student')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('service.col.school')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('service.col.grade')}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t('service.col.parent')}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t('service.col.phone')}</TableHead>
                    <TableHead className="w-[180px]">{t('service.col.consultant')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(contract => {
                    const consultant = getConsultant(contract.service_rep)
                    const isPending = pendingChanges[contract.id] !== undefined
                    return (
                      <TableRow key={contract.id} className={isPending ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                        <TableCell className="font-medium">{contract.student_name}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{contract.school_name || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{contract.grade_at_contract || '-'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">{contract.contractor_name || '-'}</TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground font-mono">{contract.phone || '-'}</TableCell>
                        <TableCell>
                          <Select
                            value={contract.service_rep || '__none__'}
                            onValueChange={v => handleAssign(contract.id, v === '__none__' ? null : v)}
                          >
                            <SelectTrigger className={`h-8 text-xs w-[160px] ${!consultant ? 'border-dashed text-muted-foreground' : ''}`}>
                              {consultant ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`size-2 rounded-full ${consultant.color}`} />
                                  <span>{consultant.name}</span>
                                </div>
                              ) : (
                                <span>{t('service.selectConsultant')}</span>
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">{t('service.noConsultant')}</span>
                              </SelectItem>
                              {CONSULTANTS.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`size-2 rounded-full ${c.color}`} />
                                    <span>{c.name}</span>
                                    <span className="text-muted-foreground ml-1">({stats.counts[c.id]})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
