import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  PHONE_COUNTRIES, findCountry, parsePhone, buildPhone, formatKoreanPhone,
} from '@/lib/phone'

/**
 * 국기 + 국가번호 드롭다운 하나에 번호 칸을 붙인 전화번호 입력.
 *
 *   🇰🇷 +82 ▾ │ 010-1234-5678
 *
 * 값은 저장 형식 문자열 하나로 주고받는다(한국은 010-…, 그 외는 +1 …).
 * 부모는 전화번호를 어떻게 쪼개 담을지 신경 쓸 필요가 없다.
 */
export function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  disabled,
  id,
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
}) {
  const { iso, number } = useMemo(() => parsePhone(value), [value])
  const country = findCountry(iso)

  return (
    <div className={`flex items-stretch rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-ring/50 ${className ?? ''}`}>
      <label className="sr-only" htmlFor={id ? `${id}-country` : undefined}>국가 번호</label>
      <select
        id={id ? `${id}-country` : undefined}
        aria-label="국가 번호"
        disabled={disabled}
        value={iso}
        onChange={e => onChange(buildPhone(e.target.value, number))}
        className="shrink-0 cursor-pointer rounded-l-md border-0 bg-transparent py-2 pl-3 pr-1 text-sm outline-none disabled:cursor-not-allowed"
      >
        {PHONE_COUNTRIES.map(c => (
          <option key={c.iso} value={c.iso}>
            {c.flag} +{c.dial}
          </option>
        ))}
      </select>

      <span className="my-2 w-px shrink-0 bg-border" aria-hidden="true" />

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        value={number}
        placeholder={placeholder ?? (country.iso === 'KR' ? '010-1234-5678' : '전화번호')}
        onChange={e => {
          const raw = e.target.value
          const next = country.iso === 'KR' ? formatKoreanPhone(raw) : raw.replace(/[^\d\s-]/g, '')
          onChange(buildPhone(country.iso, next))
        }}
        className="border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
    </div>
  )
}
