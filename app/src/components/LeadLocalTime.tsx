import { useMemo } from 'react'
import { Clock, Globe } from 'lucide-react'
import { resolveInstant, formatLocalTime } from '@/lib/leadLocation'

interface LeadLike {
  phone?: string
  region?: string
  residenceCity?: string
  residenceCountry?: string
  currentSchool?: string
}

/** 현지 시간대와 한국(KST) 대비 시차(시간) 계산. 실패 시 null. */
function tzDiffFromKorea(timezone: string): number | null {
  try {
    const now = new Date()
    const kor = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
    const other = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    return Math.round((other.getTime() - kor.getTime()) / 3600000)
  } catch {
    return null
  }
}

/**
 * 리드의 거주지/전화 기반 국가·현지시각·한국 대비 시차 표시 (①).
 * leadLocation.resolveInstant(도시>전화>학교>지역) 로직 재사용.
 */
export function LeadLocalTime({ lead }: { lead: LeadLike }) {
  const resolved = useMemo(
    () => resolveInstant({ city: lead.residenceCity, school: lead.currentSchool, region: lead.region, phone: lead.phone }),
    [lead.residenceCity, lead.currentSchool, lead.region, lead.phone],
  )
  const country = resolved?.country || lead.residenceCountry || ''
  const timezone = resolved?.timezone || null
  const localTime = timezone ? formatLocalTime(new Date(), timezone) : null
  const diff = timezone ? tzDiffFromKorea(timezone) : null

  if (!country && !localTime) return null

  const diffLabel = diff === null ? null
    : diff === 0 ? '한국과 동일'
    : diff > 0 ? `한국보다 +${diff}시간`
    : `한국보다 ${diff}시간`

  return (
    <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {country && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Globe className="size-4" />
          {country}{resolved?.city ? ` · ${resolved.city}` : ''}
        </span>
      )}
      {localTime && (
        <span className="flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" />
          현지 {localTime}
          {diffLabel && <span className="text-xs text-muted-foreground">({diffLabel})</span>}
        </span>
      )}
    </div>
  )
}
