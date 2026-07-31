import { Badge } from '@/components/ui/badge'
import { useSeminarsWithRegistrations, seminarsAttendedByLead, type SeminarLite } from '@/hooks/useSeminarPerformance'
import { useAllLeadAttendance } from '@/hooks/useLeadAttendance'

interface LeadLike {
  id: string
  phone?: string
  email?: string
  parentName?: string
  studentName?: string
}

/**
 * 리드의 세미나/웨비나 참석 이력을 배지로 표시 (최신순/역순).
 * 참석 판정 = 등록의 attended 플래그(전화·이메일·이름 매칭) OR 콜드콜 참석기록.
 * 콜드콜 리드 카드와 동일한 로직을 리드관리 목록/상세에서 재사용.
 */
export function LeadSeminarBadges({ lead, compact = false, max, label }: { lead: LeadLike; compact?: boolean; max?: number; label?: string }) {
  const { data: seminars = [] } = useSeminarsWithRegistrations()
  const { data: attendance = [] } = useAllLeadAttendance()

  const byReg = seminarsAttendedByLead(seminars, lead)
  const coldIds = new Set(
    attendance.filter(a => a.leadId === lead.id && a.status === 'attended').map(a => a.seminarId),
  )
  const map = new Map<string, SeminarLite>()
  for (const s of byReg) map.set(s.id, s)
  for (const s of seminars) if (coldIds.has(s.id)) map.set(s.id, s)
  // 역순: 가장 최근 세미나/웨비나가 먼저
  const attended = Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  if (!attended.length) return null

  const shown = max ? attended.slice(0, max) : attended
  const rest = attended.length - shown.length
  const cls = compact ? 'text-[10px] px-1.5 py-0 h-4' : 'text-xs'

  const badgeList = (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map(s => (
        <Badge
          key={s.id}
          variant="outline"
          className={`${cls} bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap`}
          title={`참석: ${s.title}${s.date ? ' (' + s.date.slice(0, 10) + ')' : ''}`}
        >
          🎓 {s.title}
        </Badge>
      ))}
      {rest > 0 && <span className="text-[10px] text-muted-foreground">+{rest}</span>}
    </span>
  )

  if (!label) return badgeList
  return (
    <div className="mt-3 flex items-start gap-2">
      <span className="text-xs text-muted-foreground shrink-0 mt-1 whitespace-nowrap">{label}</span>
      <div>{badgeList}</div>
    </div>
  )
}
