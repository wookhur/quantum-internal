/**
 * 전화번호 입력 공통 규칙
 *
 * 예전에는 폼마다 "국내/해외" 라디오를 두고, 해외를 고르면 국가번호·지역번호·번호
 * 세 칸이 따로 나타났다. 칸이 왔다 갔다 해서 어수선하고, 해외 고객이 국가번호
 * 자리표시자(+1)를 값으로 착각해 접수하지 못한 일도 있었다.
 * 국기 + 국가번호 드롭다운 하나로 합친다.
 *
 * 저장 형식은 기존 데이터와 맞춘다 —
 *   한국  : 010-1234-5678   (국가번호 없이, 지금까지 쓰던 그대로)
 *   그 외 : +1 7783453383   (국가번호 + 공백 + 나머지)
 * 중복 판정은 숫자만 남겨 뒤 8자리로 하므로 두 형식 모두 문제없다.
 */

export interface PhoneCountry {
  /** ISO 국가 코드 */
  iso: string
  /** 국가번호 (앞의 + 없이) */
  dial: string
  flag: string
  name: string
}

/** 학생·학부모가 실제로 거주하는 나라 위주로 추렸다. 자주 쓰는 곳이 위로 온다. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'KR', dial: '82', flag: '🇰🇷', name: '대한민국' },
  { iso: 'US', dial: '1', flag: '🇺🇸', name: '미국' },
  { iso: 'CA', dial: '1', flag: '🇨🇦', name: '캐나다' },
  { iso: 'GB', dial: '44', flag: '🇬🇧', name: '영국' },
  { iso: 'AU', dial: '61', flag: '🇦🇺', name: '호주' },
  { iso: 'NZ', dial: '64', flag: '🇳🇿', name: '뉴질랜드' },
  { iso: 'SG', dial: '65', flag: '🇸🇬', name: '싱가포르' },
  { iso: 'HK', dial: '852', flag: '🇭🇰', name: '홍콩' },
  { iso: 'CN', dial: '86', flag: '🇨🇳', name: '중국' },
  { iso: 'JP', dial: '81', flag: '🇯🇵', name: '일본' },
  { iso: 'TW', dial: '886', flag: '🇹🇼', name: '대만' },
  { iso: 'MY', dial: '60', flag: '🇲🇾', name: '말레이시아' },
  { iso: 'TH', dial: '66', flag: '🇹🇭', name: '태국' },
  { iso: 'VN', dial: '84', flag: '🇻🇳', name: '베트남' },
  { iso: 'PH', dial: '63', flag: '🇵🇭', name: '필리핀' },
  { iso: 'ID', dial: '62', flag: '🇮🇩', name: '인도네시아' },
  { iso: 'IN', dial: '91', flag: '🇮🇳', name: '인도' },
  { iso: 'AE', dial: '971', flag: '🇦🇪', name: '아랍에미리트' },
  { iso: 'DE', dial: '49', flag: '🇩🇪', name: '독일' },
  { iso: 'FR', dial: '33', flag: '🇫🇷', name: '프랑스' },
  { iso: 'CH', dial: '41', flag: '🇨🇭', name: '스위스' },
  { iso: 'NL', dial: '31', flag: '🇳🇱', name: '네덜란드' },
  { iso: 'ES', dial: '34', flag: '🇪🇸', name: '스페인' },
  { iso: 'IT', dial: '39', flag: '🇮🇹', name: '이탈리아' },
  { iso: 'SE', dial: '46', flag: '🇸🇪', name: '스웨덴' },
  { iso: 'IE', dial: '353', flag: '🇮🇪', name: '아일랜드' },
  { iso: 'RU', dial: '7', flag: '🇷🇺', name: '러시아' },
  { iso: 'BR', dial: '55', flag: '🇧🇷', name: '브라질' },
  { iso: 'MX', dial: '52', flag: '🇲🇽', name: '멕시코' },
  { iso: 'ZA', dial: '27', flag: '🇿🇦', name: '남아프리카공화국' },
  { iso: 'QA', dial: '974', flag: '🇶🇦', name: '카타르' },
  { iso: 'SA', dial: '966', flag: '🇸🇦', name: '사우디아라비아' },
  { iso: 'TR', dial: '90', flag: '🇹🇷', name: '터키' },
  { iso: 'KZ', dial: '7', flag: '🇰🇿', name: '카자흐스탄' },
  { iso: 'MN', dial: '976', flag: '🇲🇳', name: '몽골' },
]

export const DEFAULT_PHONE_ISO = 'KR'

export function findCountry(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find(c => c.iso === iso) ?? PHONE_COUNTRIES[0]
}

/** 국내 휴대폰: 숫자만 남기고 010-0000-0000 형태로 하이픈을 넣는다 */
export function formatKoreanPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length > 7) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`
  return d
}

/**
 * 저장된 문자열을 (국가, 남은 번호) 로 되돌린다.
 * `+` 로 시작하면 국가번호를 떼어내고, 아니면 한국으로 본다.
 * 국가번호가 겹치는 나라(미국/캐나다 등)는 앞에 있는 쪽으로 잡는다 —
 * 번호 자체는 그대로 보존되므로 표시가 달라질 뿐 값은 틀어지지 않는다.
 */
export function parsePhone(value: string | null | undefined): { iso: string; number: string } {
  const v = (value ?? '').trim()
  if (!v) return { iso: DEFAULT_PHONE_ISO, number: '' }

  if (v.startsWith('+')) {
    const digits = v.slice(1).replace(/[^\d]/g, ' ').trim()
    // 긴 국가번호부터 맞춰 봐야 +1 이 +1... 을 가로채지 않는다
    const byLength = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
    const compact = v.slice(1).replace(/\D/g, '')
    for (const c of byLength) {
      if (compact.startsWith(c.dial)) {
        return { iso: c.iso, number: compact.slice(c.dial.length) }
      }
    }
    return { iso: DEFAULT_PHONE_ISO, number: digits.replace(/\s/g, '') }
  }

  return { iso: DEFAULT_PHONE_ISO, number: formatKoreanPhone(v) }
}

/** 화면 입력 → 저장할 문자열 */
export function buildPhone(iso: string, number: string): string {
  const c = findCountry(iso)
  const n = number.trim()
  if (!n) return ''
  if (c.iso === 'KR') return formatKoreanPhone(n)
  return `+${c.dial} ${n.replace(/[^\d]/g, '')}`
}

/** 최소한의 유효성 — 국가마다 자릿수가 달라 너무 좁게 잡지 않는다 */
export function isPhoneComplete(iso: string, number: string): boolean {
  const d = number.replace(/\D/g, '')
  if (findCountry(iso).iso === 'KR') return /^01\d{8,9}$/.test(d)
  return d.length >= 6
}
