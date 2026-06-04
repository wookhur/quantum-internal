import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar, TrendingUp, TrendingDown,
  Wallet, Plus, Pencil, Trash2, CircleDot, CheckCircle2, Clock,
} from 'lucide-react'
import { useInstallments } from '@/hooks/useInstallments'
import {
  useFixedExpenses, useCreateFixedExpense, useUpdateFixedExpense, useDeleteFixedExpense,
  type ExpenseCategory, type FixedExpense,
} from '@/hooks/useFixedExpenses'
import { formatCurrency } from '@/types'
import { useT } from '@/i18n/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return getMonthKey(d)
}

const EXPENSE_CATEGORIES: { key: ExpenseCategory; labelKey: string; color: string }[] = [
  { key: 'salary', labelKey: 'cashflow.cat.salary', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'rent', labelKey: 'cashflow.cat.rent', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'subscription', labelKey: 'cashflow.cat.subscription', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { key: 'insurance', labelKey: 'cashflow.cat.insurance', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'tax', labelKey: 'cashflow.cat.tax', color: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'marketing', labelKey: 'cashflow.cat.marketing', color: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'etc', labelKey: 'cashflow.cat.etc', color: 'bg-gray-50 text-gray-700 border-gray-200' },
]

function getCatConfig(cat: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find(c => c.key === cat) || EXPENSE_CATEGORIES[6]
}

// ---------------------------------------------------------------------------
// Expense Dialog
// ---------------------------------------------------------------------------

function ExpenseDialog({
  open,
  onOpenChange,
  expense,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  expense?: FixedExpense
}) {
  const t = useT()
  const { user } = useAuth()
  const create = useCreateFixedExpense()
  const update = useUpdateFixedExpense()

  const [form, setForm] = useState({
    name: '',
    category: 'etc' as ExpenseCategory,
    amount: '',
    currency: 'KRW' as 'KRW' | 'USD',
    notes: '',
  })

  // Reset form when dialog opens
  const handleOpenChange = useCallback((v: boolean) => {
    if (v && expense) {
      setForm({
        name: expense.name,
        category: expense.category,
        amount: String(expense.amount),
        currency: expense.currency,
        notes: expense.notes || '',
      })
    } else if (v) {
      setForm({ name: '', category: 'etc', amount: '', currency: 'KRW', notes: '' })
    }
    onOpenChange(v)
  }, [expense, onOpenChange])

  // Sync when expense prop changes while open
  useState(() => {
    if (open && expense) {
      setForm({
        name: expense.name,
        category: expense.category,
        amount: String(expense.amount),
        currency: expense.currency,
        notes: expense.notes || '',
      })
    }
  })

  const handleSave = () => {
    if (!form.name.trim() || !form.amount) return
    const amt = Number(form.amount)
    if (amt <= 0) return

    if (expense) {
      update.mutate(
        { id: expense.id, name: form.name.trim(), category: form.category, amount: amt, currency: form.currency, notes: form.notes || null },
        { onSuccess: () => onOpenChange(false) },
      )
    } else {
      create.mutate(
        { name: form.name.trim(), category: form.category, amount: amt, currency: form.currency, notes: form.notes || undefined, createdBy: user?.id },
        { onSuccess: () => onOpenChange(false) },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? t('cashflow.editExpense') : t('cashflow.addExpense')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('cashflow.expenseName')} *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('cashflow.expenseNamePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cashflow.category')} *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ExpenseCategory }))}>
                <SelectTrigger>
                  <span>{t(getCatConfig(form.category).labelKey)}</span>
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c.key} value={c.key}>{t(c.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('cashflow.currency')}</Label>
              <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as 'KRW' | 'USD' }))}>
                <SelectTrigger><span>{form.currency === 'USD' ? 'USD ($)' : 'KRW (원)'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRW">KRW (원)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('cashflow.monthlyAmount')} *</Label>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('common.notes')}</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button className="flex-1" onClick={handleSave} disabled={!form.name.trim() || !form.amount || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function CashflowPage() {
  const t = useT()
  const [currentMonth, setCurrentMonth] = useState(() => getMonthKey(new Date()))
  const isCurrentMonth = currentMonth === getMonthKey(new Date())
  const [year, month] = currentMonth.split('-').map(Number)

  // Data
  const { data: installments = [], isLoading: loadingInst } = useInstallments()
  const { data: expenses = [], isLoading: loadingExp } = useFixedExpenses()
  const deleteExpense = useDeleteFixedExpense()
  const updateExpense = useUpdateFixedExpense()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editExpense, setEditExpense] = useState<FixedExpense | undefined>()

  // ── Income: this month's installments ──
  const income = useMemo(() => {
    const monthInst = installments.filter(inst =>
      inst.dueDate?.startsWith(currentMonth) || inst.paidDate?.startsWith(currentMonth),
    )

    let paidKrw = 0, paidUsd = 0
    let pendingKrw = 0, pendingUsd = 0
    let overdueKrw = 0, overdueUsd = 0
    const todayStr = new Date().toISOString().slice(0, 10)
    const details: { label: string; contractor: string; student: string; amount: number; currency: 'KRW' | 'USD'; status: 'paid' | 'pending' | 'overdue' }[] = []

    for (const inst of monthInst) {
      const isPaid = inst.status === 'paid'
      const isOverdue = !isPaid && inst.dueDate! < todayStr
      const amount = isPaid ? inst.paidAmount : inst.amount - inst.paidAmount

      if (inst.currency === 'USD') {
        if (isPaid) paidUsd += amount
        else if (isOverdue) overdueUsd += amount
        else pendingUsd += amount
      } else {
        if (isPaid) paidKrw += amount
        else if (isOverdue) overdueKrw += amount
        else pendingKrw += amount
      }

      details.push({
        label: inst.label,
        contractor: inst.contract?.contractorName || '-',
        student: inst.contract?.studentName || '-',
        amount,
        currency: inst.currency,
        status: isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending',
      })
    }

    return {
      paidKrw, paidUsd,
      pendingKrw, pendingUsd,
      overdueKrw, overdueUsd,
      totalKrw: paidKrw + pendingKrw + overdueKrw,
      totalUsd: paidUsd + pendingUsd + overdueUsd,
      details: details.sort((a, b) => {
        const order = { paid: 0, pending: 1, overdue: 2 }
        return order[a.status] - order[b.status]
      }),
    }
  }, [installments, currentMonth])

  // ── Expenses: active fixed expenses ──
  const activeExpenses = useMemo(() => expenses.filter(e => e.isActive), [expenses])
  const expenseTotal = useMemo(() => {
    let krw = 0, usd = 0
    for (const e of activeExpenses) {
      if (e.currency === 'USD') usd += e.amount
      else krw += e.amount
    }
    return { krw, usd }
  }, [activeExpenses])

  // ── Available cash ──
  const availableKrw = income.paidKrw + income.pendingKrw - expenseTotal.krw
  const availableUsd = income.paidUsd + income.pendingUsd - expenseTotal.usd
  const confirmedKrw = income.paidKrw - expenseTotal.krw
  const hasUsd = income.totalUsd > 0 || expenseTotal.usd > 0

  const isLoading = loadingInst || loadingExp

  // Group expenses by category
  const expensesByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, FixedExpense[]>()
    for (const e of activeExpenses) {
      if (!map.has(e.category)) map.set(e.category, [])
      map.get(e.category)!.push(e)
    }
    return Array.from(map.entries())
  }, [activeExpenses])

  const openEdit = (exp: FixedExpense) => {
    setEditExpense(exp)
    setDialogOpen(true)
  }
  const openCreate = () => {
    setEditExpense(undefined)
    setDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('cashflow.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('cashflow.subtitle')}</p>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[140px] text-center">
          {year}{t('common.year')} {month}{t('common.month')}
        </h2>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => shiftMonth(m, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentMonth(getMonthKey(new Date()))}>
            <Calendar className="size-4 mr-1" />
            {t('common.thisMonth')}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Income */}
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingUp className="size-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold text-emerald-600 whitespace-nowrap">{formatCurrency(income.totalKrw)}</div>
              {hasUsd && income.totalUsd > 0 && <div className="text-sm font-semibold text-emerald-400 whitespace-nowrap">{formatCurrency(income.totalUsd, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('cashflow.totalIncome')}</div>
            </div>
          </CardContent>
        </Card>

        {/* Total Expense */}
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <TrendingDown className="size-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold text-red-600 whitespace-nowrap">{formatCurrency(expenseTotal.krw)}</div>
              {hasUsd && expenseTotal.usd > 0 && <div className="text-sm font-semibold text-red-400 whitespace-nowrap">{formatCurrency(expenseTotal.usd, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('cashflow.totalExpense')}</div>
            </div>
          </CardContent>
        </Card>

        {/* Available Cash (expected) */}
        <Card className={availableKrw >= 0 ? 'border-emerald-200' : 'border-red-200'}>
          <CardContent className="py-3 flex items-center gap-3">
            <Wallet className={`size-5 shrink-0 ${availableKrw >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
            <div className="min-w-0">
              <div className={`text-lg font-bold whitespace-nowrap ${availableKrw >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(availableKrw)}
              </div>
              {hasUsd && <div className="text-sm font-semibold text-muted-foreground whitespace-nowrap">{formatCurrency(availableUsd, 'USD')}</div>}
              <div className="text-xs text-muted-foreground">{t('cashflow.availableCash')}</div>
            </div>
          </CardContent>
        </Card>

        {/* Confirmed Cash (paid only - expenses) */}
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="size-5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <div className={`text-lg font-bold whitespace-nowrap ${confirmedKrw >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(confirmedKrw)}
              </div>
              <div className="text-xs text-muted-foreground">{t('cashflow.confirmedCash')}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: Income | Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Income ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-500" />
              {t('cashflow.income')}
              <Badge variant="outline" className="text-xs ml-auto">{income.details.length}{t('common.count')}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {income.details.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('cashflow.noIncome')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('cashflow.col.client')}</TableHead>
                    <TableHead>{t('cashflow.col.item')}</TableHead>
                    <TableHead className="text-right">{t('cashflow.col.amount')}</TableHead>
                    <TableHead className="w-[70px]">{t('cashflow.col.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {income.details.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{d.contractor}</div>
                        <div className="text-xs text-muted-foreground">{d.student}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{d.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(d.amount, d.currency)}
                      </TableCell>
                      <TableCell>
                        {d.status === 'paid' ? (
                          <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="size-3" />{t('cashflow.paid')}
                          </Badge>
                        ) : d.status === 'overdue' ? (
                          <Badge variant="outline" className="text-[10px] gap-1 bg-red-50 text-red-700 border-red-200">
                            <CircleDot className="size-3" />{t('cashflow.overdue')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 bg-gray-50 text-gray-600 border-gray-200">
                            <Clock className="size-3" />{t('cashflow.pending')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {/* Income subtotals */}
            <div className="px-4 py-3 border-t bg-muted/30 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('cashflow.paidAmount')}</span>
                <span className="font-mono font-semibold text-emerald-600">
                  {formatCurrency(income.paidKrw)}
                  {hasUsd && income.paidUsd > 0 && <span className="text-emerald-400 ml-2">{formatCurrency(income.paidUsd, 'USD')}</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('cashflow.pendingAmount')}</span>
                <span className="font-mono text-muted-foreground">
                  {formatCurrency(income.pendingKrw)}
                  {hasUsd && income.pendingUsd > 0 && <span className="ml-2">{formatCurrency(income.pendingUsd, 'USD')}</span>}
                </span>
              </div>
              {income.overdueKrw > 0 && (
                <div className="flex justify-between">
                  <span className="text-red-500">{t('cashflow.overdueAmount')}</span>
                  <span className="font-mono text-red-500">{formatCurrency(income.overdueKrw)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Expenses ── */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="size-4 text-red-500" />
              {t('cashflow.fixedExpenses')}
              <Badge variant="outline" className="text-xs">{activeExpenses.length}{t('common.count')}</Badge>
            </CardTitle>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreate}>
              <Plus className="size-3" />{t('cashflow.addExpense')}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {activeExpenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('cashflow.noExpenses')}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('cashflow.col.expenseName')}</TableHead>
                    <TableHead>{t('cashflow.category')}</TableHead>
                    <TableHead className="text-right">{t('cashflow.col.amount')}</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesByCategory.map(([, items]) =>
                    items.map(exp => {
                      const cat = getCatConfig(exp.category)
                      return (
                        <TableRow key={exp.id}>
                          <TableCell className="text-sm font-medium">
                            {exp.name}
                            {exp.notes && <span className="text-xs text-muted-foreground ml-1">({exp.notes})</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${cat.color}`}>
                              {t(cat.labelKey)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-600">
                            {formatCurrency(exp.amount, exp.currency)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(exp)}>
                                <Pencil className="size-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-red-500"
                                onClick={() => {
                                  if (confirm(t('cashflow.confirmDelete'))) deleteExpense.mutate(exp.id)
                                }}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }),
                  )}
                </TableBody>
              </Table>
            )}
            {/* Expense subtotals by category */}
            {expensesByCategory.length > 0 && (
              <div className="px-4 py-3 border-t bg-muted/30 text-sm space-y-1">
                {expensesByCategory.map(([cat, items]) => {
                  const total = items.reduce((s, e) => s + e.amount, 0)
                  const cfg = getCatConfig(cat)
                  return (
                    <div key={cat} className="flex justify-between">
                      <span className="text-muted-foreground">{t(cfg.labelKey)}</span>
                      <span className="font-mono text-red-500">{formatCurrency(total)}</span>
                    </div>
                  )
                })}
                <div className="flex justify-between pt-1 border-t font-semibold">
                  <span>{t('cashflow.totalExpense')}</span>
                  <span className="font-mono text-red-600">{formatCurrency(expenseTotal.krw)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inactive expenses list */}
        {expenses.some(e => !e.isActive) && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{t('cashflow.inactiveExpenses')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {expenses.filter(e => !e.isActive).map(exp => (
                  <div key={exp.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                    <span className="line-through">{exp.name}</span>
                    <span className="font-mono">{formatCurrency(exp.amount, exp.currency)}</span>
                    <Switch
                      checked={false}
                      onCheckedChange={() => updateExpense.mutate({ id: exp.id, isActive: true })}
                      className="h-4 w-7"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expense Dialog */}
      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editExpense} />
    </div>
  )
}
