/** Manual lead level (replaces the old computed 1~4순위). Chosen from a dropdown
 *  with a reason memo, shown as an emoji + color badge on lead cards. */
export type LeadLevel = 'hot' | 'warm' | 'qualified' | 'cold' | 'info_seeker'

export interface LeadLevelConfig {
  key: LeadLevel
  emoji: string
  labelEn: string
  labelKo: string
  meaningKo: string
  /** Badge classes (bg + text + border). */
  badge: string
  /** Solid dot color. */
  dot: string
  /** Sort rank (higher = hotter). */
  rank: number
}

export const LEAD_LEVELS: LeadLevelConfig[] = [
  { key: 'hot',         emoji: '🔥', labelEn: 'Hot Lead',        labelKo: '매우 높음', meaningKo: '계약 가능성이 매우 높음 · 상담만 잘하면 등록 가능', badge: 'bg-red-100 text-red-700 border-red-200',        dot: 'bg-red-500',    rank: 5 },
  { key: 'warm',        emoji: '🟠', labelEn: 'Warm Lead',       labelKo: '높음',      meaningKo: '관심이 높고 지속적인 팔로업 필요',                 badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', rank: 4 },
  { key: 'qualified',   emoji: '🟡', labelEn: 'Qualified Lead',  labelKo: '보통',      meaningKo: '조건은 맞지만 아직 확신은 없는 상태',              badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400', rank: 3 },
  { key: 'cold',        emoji: '🔵', labelEn: 'Cold Lead',       labelKo: '낮음',      meaningKo: '관심이 낮거나 시기가 맞지 않음',                   badge: 'bg-blue-100 text-blue-700 border-blue-200',      dot: 'bg-blue-500',   rank: 2 },
  { key: 'info_seeker', emoji: '⚫', labelEn: 'Information Seeker', meaningKo: '매번 신청만 하고 계약 가능성이 거의 없음', labelKo: '매우 낮음',   badge: 'bg-gray-200 text-gray-700 border-gray-300',      dot: 'bg-gray-800',   rank: 1 },
]

export function leadLevelConfig(level?: string | null): LeadLevelConfig | undefined {
  return LEAD_LEVELS.find(l => l.key === level)
}
