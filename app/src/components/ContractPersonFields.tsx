import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n/LanguageContext'
import { splitNameAndPhone, cleanParentName } from '@/lib/contractAutofill'
import type { ContractPersonValues } from '@/lib/contractPerson'

/**
 * 계약서의 사람 정보 — 학생과 학부모를 각자의 칸에 나눠 받는다.
 *
 * 예전에는 '학부모 성명 / 학생 이름 / 연락처' 세 칸뿐이었다. 누구 번호인지 적을 데가
 * 없어서 번호가 이름 칸으로 흘러들었고(`010-7165-4123 박신춘`), 그 값이 그대로
 * Student 360 으로 넘어갔다. 그래서 계약과 학생을 이름으로 맞출 수 없게 됐다.
 *
 * 세 폼(계약 추가 · 리드에서 계약 생성 · 계약 수정)이 같은 칸을 쓰도록 여기 모았다.
 * 칸이 갈라져 있어도 사람은 습관대로 붙여 넣으므로, 이름 칸을 떠날 때 번호가 섞여
 * 있으면 해당 연락처 칸으로 옮긴다(그 칸이 비어 있을 때만 — 적힌 값을 덮지 않는다).
 */
export function ContractPersonFields({ value, onChange, markRequired = true }: {
  value: ContractPersonValues
  onChange: (patch: Partial<ContractPersonValues>) => void
  /** 학생 이름·학부모 성명에 * 를 붙일지 */
  markRequired?: boolean
}) {
  const t = useT()
  const req = markRequired ? <span className="text-destructive"> *</span> : null

  /** 이름 칸을 떠날 때 섞여 있는 번호를 연락처 칸으로 옮긴다. */
  const tidy = (
    nameKey: 'studentName' | 'contractorName',
    phoneKey: 'studentPhone' | 'parentPhone',
  ) => () => {
    const { name, phone } = splitNameAndPhone(value[nameKey])
    // 학부모 성명에서는 '(모)' 같은 관계 표시도 뗀다 — 이름으로 맞추려면 이름만 있어야 한다.
    const clean = nameKey === 'contractorName' ? cleanParentName(name) : name
    const patch: Partial<ContractPersonValues> = {}
    if (clean !== value[nameKey]) patch[nameKey] = clean
    if (phone && !value[phoneKey].trim()) patch[phoneKey] = phone
    if (Object.keys(patch).length) onChange(patch)
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {t('contracts.personFieldsHint')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.studentName')}{req}</Label>
          <Input
            value={value.studentName}
            onChange={e => onChange({ studentName: e.target.value })}
            onBlur={tidy('studentName', 'studentPhone')}
            placeholder="김은서"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.studentNameEn')}</Label>
          <Input
            value={value.studentNameEn}
            onChange={e => onChange({ studentNameEn: e.target.value })}
            placeholder="Amy Kim"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.studentPhone')}</Label>
          <Input
            value={value.studentPhone}
            onChange={e => onChange({ studentPhone: e.target.value })}
            placeholder="010-0000-0000"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.studentEmail')}</Label>
          <Input
            type="email"
            value={value.studentEmail}
            onChange={e => onChange({ studentEmail: e.target.value })}
            placeholder="student@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.parentName')}{req}</Label>
          <Input
            value={value.contractorName}
            onChange={e => onChange({ contractorName: e.target.value })}
            onBlur={tidy('contractorName', 'parentPhone')}
            placeholder="장부희"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('contracts.parentPhone')}</Label>
          <Input
            value={value.parentPhone}
            onChange={e => onChange({ parentPhone: e.target.value })}
            placeholder="010-0000-0000"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">{t('contracts.parentEmail')}</Label>
          <Input
            type="email"
            value={value.parentEmail}
            onChange={e => onChange({ parentEmail: e.target.value })}
            placeholder="parent@example.com"
          />
        </div>
      </div>
    </div>
  )
}
