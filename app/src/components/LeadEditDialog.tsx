import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useUpdateLead } from '@/hooks/useLeads'
import { useT } from '@/i18n/LanguageContext'
import { PIPELINE_STAGES, SOURCE_CHANNELS, INTEREST_AREAS, REGIONS, GRADES } from '@/types'
import type { Lead, PipelineStage } from '@/types'

const PRIMARY = '#0073EA'

interface LeadEditDialogProps {
  open: boolean
  onClose: () => void
  lead: Lead
}

export default function LeadEditDialog({ open, onClose, lead }: LeadEditDialogProps) {
  const updateLead = useUpdateLead()
  const navigate = useNavigate()
  const t = useT()

  const [form, setForm] = useState({
    parentName: '',
    studentName: '',
    email: '',
    phone: '',
    currentSchool: '',
    grade: '',
    region: '',
    interestArea: '',
    sourceChannel: '',
    memo: '',
    requiredAction: '',
    pipelineStage: '' as PipelineStage,
    contactChannel: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm({
        parentName: lead.parentName || '',
        studentName: lead.studentName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        currentSchool: lead.currentSchool || '',
        grade: lead.grade || '',
        region: lead.region || '',
        interestArea: lead.interestArea || '',
        sourceChannel: lead.sourceChannel || '',
        memo: lead.memo || '',
        requiredAction: lead.requiredAction || '',
        pipelineStage: lead.pipelineStage,
        contactChannel: lead.contactChannel || '',
      })
      setError(null)
    }
  }, [open, lead])

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!form.parentName.trim() || !form.phone.trim()) {
      setError(t('leadEdit.requiredFieldsError'))
      return
    }
    setError(null)

    try {
      const stageChanged = lead.pipelineStage !== form.pipelineStage
      const isContractStage = form.pipelineStage === 'contract_review' || form.pipelineStage === 'contracted'

      await updateLead.mutateAsync({
        id: lead.id,
        data: {
          parentName: form.parentName,
          studentName: form.studentName || undefined,
          email: form.email || undefined,
          phone: form.phone,
          currentSchool: form.currentSchool,
          grade: form.grade,
          region: form.region,
          interestArea: form.interestArea,
          sourceChannel: form.sourceChannel,
          memo: form.memo,
          requiredAction: form.requiredAction || undefined,
          pipelineStage: form.pipelineStage,
          contactChannel: form.contactChannel || undefined,
        },
        previousStage: stageChanged ? lead.pipelineStage : undefined,
      })
      onClose()

      // Navigate to contract creation when stage moves to contract_review or contracted
      if (stageChanged && isContractStage) {
        const params = new URLSearchParams({
          leadId: lead.id,
          contractorName: form.parentName,
          studentName: form.studentName || '',
          schoolName: form.currentSchool || '',
          grade: form.grade || '',
          phone: form.phone || '',
        })
        navigate(`/consulting/clients?${params.toString()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('leadEdit.saveError'))
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t('leadEdit.title')}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {/* Row: Parent + Student */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('leadEdit.parentName') + ' *'} value={form.parentName} onChange={v => handleChange('parentName', v)} />
            <Field label={t('leadEdit.studentName')} value={form.studentName} onChange={v => handleChange('studentName', v)} />
          </div>

          {/* Row: Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('leadEdit.phone') + ' *'} value={form.phone} onChange={v => handleChange('phone', v)} />
            <Field label={t('leadEdit.email')} value={form.email} onChange={v => handleChange('email', v)} />
          </div>

          {/* Row: School + Grade */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('leadEdit.school')} value={form.currentSchool} onChange={v => handleChange('currentSchool', v)} />
            <SelectField label={t('leadEdit.grade')} value={form.grade} onChange={v => handleChange('grade', v)} options={[...GRADES]} allowEmpty />
          </div>

          {/* Row: Region + Source */}
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t('leadEdit.region')} value={form.region} onChange={v => handleChange('region', v)} options={[...REGIONS]} allowEmpty />
            <SelectField label={t('leadEdit.sourceChannel')} value={form.sourceChannel} onChange={v => handleChange('sourceChannel', v)} options={[...SOURCE_CHANNELS]} />
          </div>

          {/* Interest Area */}
          <SelectField label={t('leadEdit.interestArea')} value={form.interestArea} onChange={v => handleChange('interestArea', v)} options={[...INTEREST_AREAS]} allowEmpty />

          {/* Pipeline Stage */}
          <SelectField
            label={t('leadEdit.pipelineStage')}
            value={form.pipelineStage}
            onChange={v => handleChange('pipelineStage', v)}
            options={PIPELINE_STAGES.map(s => ({ value: s.key, label: s.label }))}
          />

          {/* Contact Channel */}
          <SelectField
            label={t('leadEdit.contactChannel')}
            value={form.contactChannel}
            onChange={v => handleChange('contactChannel', v)}
            options={[
              { value: '단톡방', label: t('leadEdit.contactChannelOptions.groupChat') },
              { value: '카카오 비즈', label: t('leadEdit.contactChannelOptions.kakaoBiz') },
              { value: '전화', label: t('leadEdit.contactChannelOptions.phone') },
              { value: '이메일', label: t('leadEdit.contactChannelOptions.email') },
              { value: '기타', label: t('leadEdit.contactChannelOptions.other') },
            ]}
            allowEmpty
          />

          {/* Required Action */}
          <Field label={t('leadEdit.requiredAction')} value={form.requiredAction} onChange={v => handleChange('requiredAction', v)} placeholder={t('leadEdit.requiredActionPlaceholder')} />

          {/* Memo */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">{t('leadEdit.memo')}</label>
            <textarea
              value={form.memo}
              onChange={e => handleChange('memo', e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={updateLead.isPending}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: PRIMARY }}
          >
            {updateLead.isPending ? t('leadEdit.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  )
}

function SelectField({
  label, value, onChange, options, allowEmpty,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: (string | { value: string; label: string })[]
  allowEmpty?: boolean
}) {
  const t = useT()
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        {allowEmpty && <option value="">{t('leadEdit.noSelection')}</option>}
        {options.map(opt => {
          const val = typeof opt === 'string' ? opt : opt.value
          const lbl = typeof opt === 'string' ? opt : opt.label
          return <option key={val} value={val}>{lbl}</option>
        })}
      </select>
    </div>
  )
}
