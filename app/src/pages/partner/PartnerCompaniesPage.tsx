import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Building2, GraduationCap, Save, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useServiceStudents } from '@/hooks/useServiceStudents'
import { useAllServiceProgramFees } from '@/hooks/useServiceProgramFees'
import {
  usePartnerCompanies, useCreatePartnerCompany, useUpdatePartnerCompany, useDeletePartnerCompany,
} from '@/hooks/usePartnerCompanies'

const STUDENT_INFO_FIELDS = [
  { key: 'name', label: '이름' },
  { key: 'school', label: '학교' },
  { key: 'grade', label: '학년' },
  { key: 'majors', label: '희망 전공' },
  { key: 'contact', label: '연락처' },
  { key: 'email', label: '이메일' },
  { key: 'meetings', label: '미팅 일정·내용' },
  { key: 'programs', label: 'EC/Academic 프로그램' },
] as const

const EMPTY_FORM = {
  name: '', businessNumber: '', businessName: '', ceoName: '', contact: '',
  address: '', bankAccount: '', feePolicy: '', notes: '', infoScope: [] as string[],
}

function studentLabel(name?: string, koreanName?: string) {
  const ko = (koreanName || '').trim(); const en = (name || '').trim()
  if (ko && en && ko !== en) return `${ko} (${en})`
  return ko || en || '—'
}

export function PartnerCompaniesPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'c_level' || user?.role === 'service_manager'

  const { data: companies = [] } = usePartnerCompanies()
  const { data: allStudents = [] } = useServiceStudents()
  const { data: programFees = [] } = useAllServiceProgramFees()

  // studentId → lowercase partner names from EC/Academic programs.
  const studentPartnerNames = useMemo(() => {
    const map = new Map<string, string[]>()
    programFees.forEach(f => {
      const raw = [f.label, f.contributor1, f.contributor2].filter(Boolean) as string[]
      if (!raw.length) return
      const arr = map.get(f.studentId) || []
      raw.forEach(n => arr.push(n.toLowerCase()))
      map.set(f.studentId, arr)
    })
    return map
  }, [programFees])
  const studentsForCompany = (companyName: string) => {
    const key = companyName.trim().toLowerCase()
    if (!key) return []
    return allStudents.filter(s => (studentPartnerNames.get(s.id) || []).some(n => n.includes(key)))
  }
  const create = useCreatePartnerCompany()
  const update = useUpdatePartnerCompany()
  const del = useDeletePartnerCompany()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const selected = companies.find(c => c.id === selectedId) || null

  useEffect(() => {
    if (creating) { setForm(EMPTY_FORM); return }
    if (selected) {
      setForm({
        name: selected.name, businessNumber: selected.businessNumber || '', businessName: selected.businessName || '',
        ceoName: selected.ceoName || '', contact: selected.contact || '', address: selected.address || '',
        bankAccount: selected.bankAccount || '', feePolicy: selected.feePolicy || '', notes: selected.notes || '',
        infoScope: selected.infoScope || [],
      })
    }
  }, [selectedId, creating]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const toggleScope = (key: string) => setForm(f => ({
    ...f,
    infoScope: f.infoScope.includes(key) ? f.infoScope.filter(x => x !== key) : [...f.infoScope, key],
  }))

  const servicedStudents = useMemo(
    () => studentsForCompany(selected?.name || form.name || ''),
    [selected, form.name, studentPartnerNames, allStudents], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const startCreate = () => { setCreating(true); setSelectedId(null); setForm(EMPTY_FORM) }
  const showForm = creating || !!selected
  const saving = create.isPending || update.isPending

  const save = async () => {
    if (!form.name.trim()) { alert('업체명을 입력하세요.'); return }
    const payload = { ...form, name: form.name.trim() }
    try {
      if (creating) {
        const c = await create.mutateAsync({ ...payload, createdBy: user?.id })
        setCreating(false); setSelectedId(c.id)
      } else if (selected) {
        await update.mutateAsync({ id: selected.id, ...payload })
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.')
    }
  }

  const remove = async () => {
    if (!selected) return
    if (!confirm(`'${selected.name}' 업체를 삭제할까요?`)) return
    await del.mutateAsync(selected.id)
    setSelectedId(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Partner</p>
          <h1 className="text-xl font-bold">업체 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">파트너 업체의 사업자정보·계좌·수수료정책과 학생 정보 공개 범위를 관리합니다.</p>
        </div>
        {canEdit && (
          <Button onClick={startCreate} className="gap-1.5"><Plus className="size-4" />업체 추가</Button>
        )}
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Company list */}
        <Card className="h-fit">
          <CardContent className="p-2 space-y-1">
            {companies.length === 0 && <p className="text-sm text-muted-foreground p-3">등록된 업체가 없습니다.</p>}
            {companies.map(c => {
              const count = studentsForCompany(c.name).length
              return (
                <button
                  key={c.id}
                  onClick={() => { setCreating(false); setSelectedId(c.id) }}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${c.id === selectedId && !creating ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <div className="font-medium text-sm flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" />{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">서비스 학생 {count}명</div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        {/* Detail / edit */}
        {!showForm ? (
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
            왼쪽에서 업체를 선택{canEdit ? '하거나 “업체 추가”로 새로 등록' : ''}하세요.
          </CardContent></Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{creating ? '새 업체 등록' : form.name || '업체'}</CardTitle>
              <div className="flex items-center gap-2">
                {canEdit && !creating && (
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 border-red-200" onClick={remove}>
                    <Trash2 className="size-3.5 mr-1" />삭제
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Save className="size-3.5 mr-1" />}저장
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Basic + business info */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="업체명 *"><Input value={form.name} onChange={e => set('name', e.target.value)} disabled={!canEdit} /></Field>
                <Field label="사업자등록번호"><Input value={form.businessNumber} onChange={e => set('businessNumber', e.target.value)} disabled={!canEdit} /></Field>
                <Field label="상호(사업자명)"><Input value={form.businessName} onChange={e => set('businessName', e.target.value)} disabled={!canEdit} /></Field>
                <Field label="대표자"><Input value={form.ceoName} onChange={e => set('ceoName', e.target.value)} disabled={!canEdit} /></Field>
                <Field label="연락처"><Input value={form.contact} onChange={e => set('contact', e.target.value)} disabled={!canEdit} /></Field>
                <Field label="계좌번호"><Input value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} disabled={!canEdit} /></Field>
                <div className="col-span-2">
                  <Field label="주소"><Input value={form.address} onChange={e => set('address', e.target.value)} disabled={!canEdit} /></Field>
                </div>
              </div>

              <Field label="수수료 정책">
                <Textarea value={form.feePolicy} onChange={e => set('feePolicy', e.target.value)} rows={2} placeholder="예: 프로그램 매출의 10% / 학생당 정액 …" disabled={!canEdit} />
              </Field>

              {/* Info scope */}
              <div>
                <Label className="text-xs">학생 정보 공개 범위 <span className="text-muted-foreground">(이 업체에 공개할 항목)</span></Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {STUDENT_INFO_FIELDS.map(f => {
                    const on = form.infoScope.includes(f.key)
                    return (
                      <button
                        key={f.key}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleScope(f.key)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'} ${!canEdit ? 'opacity-70 cursor-default' : ''}`}
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Field label="메모">
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} disabled={!canEdit} />
              </Field>

              {/* Serviced students */}
              <div>
                <Label className="text-xs flex items-center gap-1.5"><GraduationCap className="size-3.5" />서비스 중인 학생 ({servicedStudents.length})</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">EC/Academic 프로그램의 파트너·기여자에 이 업체명이 지정된 학생입니다.</p>
                {servicedStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">없음</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {servicedStudents.map(s => (
                      <Badge key={s.id} variant="outline" className="text-xs">
                        {studentLabel(s.name, s.koreanName)}{s.school ? ` · ${s.school}` : ''}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
