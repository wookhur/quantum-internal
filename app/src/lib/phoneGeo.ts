// 전화번호 국가코드 → 거주국가 자동 인식, 도시 → 시간대(현지 시각) 계산 유틸.
// 콜드콜에서 해외 리드의 거주국가/현지 시각을 자동으로 채우는 데 사용.

export interface PhoneCountry {
  iso: string        // ISO2 (예: 'US')
  nameKo: string     // 한글 국가명 (예: '미국')
  dialCode: string   // 국가 전화 코드
  timezone: string   // 대표 IANA 시간대
  /** 국토가 여러 시간대에 걸쳐 있어 도시 없이는 시각을 특정할 수 없는 국가 */
  multiZone?: boolean
}

// 3자리 코드가 2·1자리보다 먼저 오도록 배열 순서 유지(가장 긴 접두 우선 매칭).
const DIAL_CODES: PhoneCountry[] = [
  // 3-digit
  { dialCode: '852', iso: 'HK', nameKo: '홍콩', timezone: 'Asia/Hong_Kong' },
  { dialCode: '971', iso: 'AE', nameKo: '아랍에미리트', timezone: 'Asia/Dubai' },
  { dialCode: '966', iso: 'SA', nameKo: '사우디아라비아', timezone: 'Asia/Riyadh' },
  { dialCode: '974', iso: 'QA', nameKo: '카타르', timezone: 'Asia/Qatar' },
  { dialCode: '972', iso: 'IL', nameKo: '이스라엘', timezone: 'Asia/Jerusalem' },
  { dialCode: '353', iso: 'IE', nameKo: '아일랜드', timezone: 'Europe/Dublin' },
  { dialCode: '351', iso: 'PT', nameKo: '포르투갈', timezone: 'Europe/Lisbon' },
  // 2-digit
  { dialCode: '82', iso: 'KR', nameKo: '대한민국', timezone: 'Asia/Seoul' },
  { dialCode: '86', iso: 'CN', nameKo: '중국', timezone: 'Asia/Shanghai' },
  { dialCode: '81', iso: 'JP', nameKo: '일본', timezone: 'Asia/Tokyo' },
  { dialCode: '65', iso: 'SG', nameKo: '싱가포르', timezone: 'Asia/Singapore' },
  { dialCode: '60', iso: 'MY', nameKo: '말레이시아', timezone: 'Asia/Kuala_Lumpur' },
  { dialCode: '62', iso: 'ID', nameKo: '인도네시아', timezone: 'Asia/Jakarta', multiZone: true },
  { dialCode: '63', iso: 'PH', nameKo: '필리핀', timezone: 'Asia/Manila' },
  { dialCode: '66', iso: 'TH', nameKo: '태국', timezone: 'Asia/Bangkok' },
  { dialCode: '84', iso: 'VN', nameKo: '베트남', timezone: 'Asia/Ho_Chi_Minh' },
  { dialCode: '91', iso: 'IN', nameKo: '인도', timezone: 'Asia/Kolkata' },
  { dialCode: '44', iso: 'GB', nameKo: '영국', timezone: 'Europe/London' },
  { dialCode: '61', iso: 'AU', nameKo: '호주', timezone: 'Australia/Sydney', multiZone: true },
  { dialCode: '64', iso: 'NZ', nameKo: '뉴질랜드', timezone: 'Pacific/Auckland' },
  { dialCode: '49', iso: 'DE', nameKo: '독일', timezone: 'Europe/Berlin' },
  { dialCode: '33', iso: 'FR', nameKo: '프랑스', timezone: 'Europe/Paris' },
  { dialCode: '39', iso: 'IT', nameKo: '이탈리아', timezone: 'Europe/Rome' },
  { dialCode: '34', iso: 'ES', nameKo: '스페인', timezone: 'Europe/Madrid' },
  { dialCode: '31', iso: 'NL', nameKo: '네덜란드', timezone: 'Europe/Amsterdam' },
  { dialCode: '41', iso: 'CH', nameKo: '스위스', timezone: 'Europe/Zurich' },
  { dialCode: '46', iso: 'SE', nameKo: '스웨덴', timezone: 'Europe/Stockholm' },
  { dialCode: '90', iso: 'TR', nameKo: '튀르키예', timezone: 'Europe/Istanbul' },
  { dialCode: '52', iso: 'MX', nameKo: '멕시코', timezone: 'America/Mexico_City', multiZone: true },
  { dialCode: '55', iso: 'BR', nameKo: '브라질', timezone: 'America/Sao_Paulo', multiZone: true },
  { dialCode: '7', iso: 'RU', nameKo: '러시아', timezone: 'Europe/Moscow', multiZone: true },
  // 1-digit (+1 = 미국/캐나다 공유 → 도시로 시간대 특정)
  { dialCode: '1', iso: 'US', nameKo: '미국/캐나다', timezone: 'America/New_York', multiZone: true },
]

/**
 * 전화번호에서 국가를 추정한다.
 * - 국제표시(+, 00) 또는 82로 시작 → 국가코드 매칭
 * - 0으로 시작(010, 02 …) → 국내(대한민국)로 간주
 * 인식 불가 시 null.
 */
export function parsePhoneCountry(phone: string | null | undefined): PhoneCountry | null {
  let d = (phone || '').replace(/[^\d]/g, '')
  if (!d) return null
  // 국제 접두 00 제거 (+ 는 위에서 이미 제거됨)
  if (d.startsWith('00')) d = d.slice(2)
  // 0으로 시작하는 번호는 국내(대한민국) 로컬 번호로 간주
  if (d.startsWith('0')) return DIAL_CODES.find((c) => c.iso === 'KR') || null
  for (const c of DIAL_CODES) {
    if (d.startsWith(c.dialCode)) return c
  }
  return null
}

// 주요 도시 → IANA 시간대. 다국시간대 국가(미국/캐나다/호주 등)의 도시 구분에 특히 중요.
// 키는 소문자·공백제거로 정규화하여 조회.
const CITY_TIMEZONES: Record<string, string> = {
  // 미국 동부
  newyork: 'America/New_York', 뉴욕: 'America/New_York', ny: 'America/New_York', nyc: 'America/New_York',
  boston: 'America/New_York', 보스턴: 'America/New_York',
  washington: 'America/New_York', dc: 'America/New_York', 워싱턴: 'America/New_York',
  philadelphia: 'America/New_York', 필라델피아: 'America/New_York',
  atlanta: 'America/New_York', 애틀랜타: 'America/New_York',
  miami: 'America/New_York', 마이애미: 'America/New_York',
  newjersey: 'America/New_York', 뉴저지: 'America/New_York',
  pittsburgh: 'America/New_York', baltimore: 'America/New_York',
  // 미국 중부
  chicago: 'America/Chicago', 시카고: 'America/Chicago',
  dallas: 'America/Chicago', 댈러스: 'America/Chicago',
  houston: 'America/Chicago', 휴스턴: 'America/Chicago',
  austin: 'America/Chicago', 오스틴: 'America/Chicago',
  minneapolis: 'America/Chicago', nashville: 'America/Chicago',
  // 미국 산악
  denver: 'America/Denver', 덴버: 'America/Denver',
  phoenix: 'America/Phoenix', 피닉스: 'America/Phoenix',
  saltlakecity: 'America/Denver',
  // 미국 서부
  losangeles: 'America/Los_Angeles', la: 'America/Los_Angeles', 로스앤젤레스: 'America/Los_Angeles', 엘에이: 'America/Los_Angeles',
  sanfrancisco: 'America/Los_Angeles', sf: 'America/Los_Angeles', 샌프란시스코: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', 시애틀: 'America/Los_Angeles',
  sandiego: 'America/Los_Angeles', 샌디에이고: 'America/Los_Angeles',
  irvine: 'America/Los_Angeles', 어바인: 'America/Los_Angeles',
  sanjose: 'America/Los_Angeles', portland: 'America/Los_Angeles',
  berkeley: 'America/Los_Angeles', 버클리: 'America/Los_Angeles',
  // 하와이
  honolulu: 'Pacific/Honolulu', 호놀룰루: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu', 하와이: 'Pacific/Honolulu',
  // 캐나다
  toronto: 'America/Toronto', 토론토: 'America/Toronto',
  montreal: 'America/Toronto', 몬트리올: 'America/Toronto',
  ottawa: 'America/Toronto', vancouver: 'America/Vancouver', 밴쿠버: 'America/Vancouver',
  calgary: 'America/Edmonton', 캘거리: 'America/Edmonton', edmonton: 'America/Edmonton',
  // 영국·유럽
  london: 'Europe/London', 런던: 'Europe/London', oxford: 'Europe/London', cambridge: 'Europe/London',
  manchester: 'Europe/London', edinburgh: 'Europe/London',
  paris: 'Europe/Paris', 파리: 'Europe/Paris',
  berlin: 'Europe/Berlin', 베를린: 'Europe/Berlin', munich: 'Europe/Berlin', frankfurt: 'Europe/Berlin',
  amsterdam: 'Europe/Amsterdam', madrid: 'Europe/Madrid', barcelona: 'Europe/Madrid',
  rome: 'Europe/Rome', milan: 'Europe/Rome', zurich: 'Europe/Zurich', geneva: 'Europe/Zurich',
  // 아시아
  beijing: 'Asia/Shanghai', 베이징: 'Asia/Shanghai', 북경: 'Asia/Shanghai',
  shanghai: 'Asia/Shanghai', 상하이: 'Asia/Shanghai', 상해: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai', guangzhou: 'Asia/Shanghai',
  hongkong: 'Asia/Hong_Kong', 홍콩: 'Asia/Hong_Kong',
  singapore: 'Asia/Singapore', 싱가포르: 'Asia/Singapore',
  tokyo: 'Asia/Tokyo', 도쿄: 'Asia/Tokyo', osaka: 'Asia/Tokyo', 오사카: 'Asia/Tokyo',
  dubai: 'Asia/Dubai', 두바이: 'Asia/Dubai', abudhabi: 'Asia/Dubai',
  bangkok: 'Asia/Bangkok', 방콕: 'Asia/Bangkok',
  manila: 'Asia/Manila', hanoi: 'Asia/Ho_Chi_Minh', 하노이: 'Asia/Ho_Chi_Minh',
  bali: 'Asia/Makassar', 발리: 'Asia/Makassar', jakarta: 'Asia/Jakarta',
  kualalumpur: 'Asia/Kuala_Lumpur', 쿠알라룸푸르: 'Asia/Kuala_Lumpur',
  seoul: 'Asia/Seoul', 서울: 'Asia/Seoul',
  // 오세아니아
  sydney: 'Australia/Sydney', 시드니: 'Australia/Sydney', canberra: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne', 멜버른: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane', 브리즈번: 'Australia/Brisbane',
  perth: 'Australia/Perth', 퍼스: 'Australia/Perth',
  adelaide: 'Australia/Adelaide', auckland: 'Pacific/Auckland', 오클랜드: 'Pacific/Auckland',
}

function normalizeCity(city: string): string {
  return city.toLowerCase().replace(/[\s.,'-]/g, '')
}

/**
 * 거주도시 + (전화번호에서 추정한) 국가로 IANA 시간대를 해석한다.
 * - 도시가 매핑에 있으면 그 시간대
 * - 없고 단일 시간대 국가면 국가 대표 시간대
 * - 다국시간대 국가인데 도시를 모르면 특정 불가 → null
 */
export function resolveTimezone(
  city: string | null | undefined,
  country: PhoneCountry | null | undefined,
): string | null {
  const key = city ? normalizeCity(city) : ''
  if (key && CITY_TIMEZONES[key]) return CITY_TIMEZONES[key]
  if (!country) return null
  if (country.multiZone) return null // 미국/호주 등은 도시 없이는 특정 불가
  return country.timezone
}

/** 주어진 시간대의 현지 시각을 "월 14:32" 형태로 포맷. 실패 시 null. */
export function formatLocalTime(now: Date, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
  } catch {
    return null
  }
}
