/**
 * 세미나 성과표의 '전화상담' 집계.
 *
 * 왜 따로 필요한가: 전화 상담은 리드관리 '고객 여정 타임라인'에 콜 기록
 * (lead_activities, activity_type='call')으로 남는다. 반면 Zoom·대면은 미팅기록
 * (meetings)에 남는다. 전화상담 칼럼이 meetings.meeting_method='phone' 만 세고 있어서,
 * 타임라인에 통화를 아무리 기록해도 0으로 나왔다.
 *
 * 그래서 두 곳을 모두 본다.
 *   · 타임라인 콜 기록 중 '통화 성공'      (부재중·재통화 요청은 상담이 아니므로 제외)
 *   · 미팅기록 중 방식이 '전화'인 건       (미팅관리에서 전화상담으로 잡은 경우)
 * 같은 리드·같은 날짜에 양쪽 모두 기록돼 있으면 한 건으로 센다(이중 집계 방지).
 */

/** 통화가 '성공'으로 기록된 결과값. 부재중(no_answer)·재통화(callback)는 상담으로 보지 않는다. */
export const CONNECTED_CALL_RESULTS = new Set(['connected'])

export interface CallActivityLite {
  leadId: string
  activityType: string
  callResult: string | null
  createdAt: string
}

export interface PhoneMeetingLite {
  id: string
  leadId: string | null
  meetingMethod: string | null
  meetingDate: string | null
  parentName?: string | null
  studentName?: string | null
  phone?: string | null
}

export interface PhoneConsultEvent {
  /** 목록 렌더링용 고유 키 */
  key: string
  leadId: string
  /** YYYY-MM-DD */
  date: string
  /** call = 타임라인 통화 기록, meeting = 미팅기록의 전화 방식 */
  source: 'call' | 'meeting'
}

const day = (iso?: string | null) => (iso || '').slice(0, 10)

/**
 * 주어진 리드들의 전화상담 건을 시간순으로 돌려준다.
 * @param leadIds  이 세미나/세션에 매칭된 리드 id (타임라인 콜 기록을 거르는 데 쓴다)
 * @param meetings 이미 이 행에 매칭된 미팅기록만 넘긴다. 미팅은 lead_id 가 비어 있어도
 *                 전화번호로 매칭되는 경우가 있어, 여기서 리드 id 로 다시 거르지 않는다.
 */
export function phoneConsultEvents(
  leadIds: ReadonlySet<string>,
  activities: readonly CallActivityLite[],
  meetings: readonly PhoneMeetingLite[],
): PhoneConsultEvent[] {
  const out: PhoneConsultEvent[] = []
  const seen = new Set<string>()          // `${leadId}|${date}` — 같은 날 중복 집계 방지

  for (const a of activities) {
    if (a.activityType !== 'call') continue
    if (!a.callResult || !CONNECTED_CALL_RESULTS.has(a.callResult)) continue
    if (!leadIds.has(a.leadId)) continue
    const d = day(a.createdAt)
    if (!d) continue
    const dedupe = `${a.leadId}|${d}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({ key: `call:${a.leadId}:${a.createdAt}`, leadId: a.leadId, date: d, source: 'call' })
  }

  for (const m of meetings) {
    if (m.meetingMethod !== 'phone') continue
    const d = day(m.meetingDate)
    if (!d) continue
    // 리드가 연결되지 않은 미팅은 전화번호로 묶어 중복을 막는다.
    const dedupe = `${m.leadId || m.phone || m.id}|${d}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({ key: `meeting:${m.id}`, leadId: m.leadId || '', date: d, source: 'meeting' })
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
