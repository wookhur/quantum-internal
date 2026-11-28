/**
 * 유입경로별 성공률 — "웨비나로 1,000건 들어와서 2건 계약" 을 세는 곳.
 *
 * 어느 경로에 노력을 더 쏟을지 정하려면 '몇 건 들어왔나'가 아니라 '그중 몇 건이
 * 돈이 됐나'를 봐야 한다. 경로마다 들어오는 양이 10배씩 차이 나서, 건수만 보면
 * 가장 시끄러운 경로가 가장 좋아 보인다.
 *
 * 전환율을 두 가지로 센다.
 *  · 전체 기준 = 계약 ÷ 전체 리드. 경로의 실제 수익률이지만, 최근에 들어온
 *    리드는 아직 결판이 안 나서 늘 낮게 나온다.
 *  · 종결 기준 = 계약 ÷ (계약 + 이탈). 진행 중인 건을 빼고 보는 값이라
 *    경로끼리 공평하게 비교된다.
 *
 * 둘 다 보여 준다. 하나만 보면 둘 다 틀린 판단을 하게 된다 — 전체 기준만 보면
 * 최근 집중한 경로가 나빠 보이고, 종결 기준만 보면 '아직 아무것도 안 끝난'
 * 경로가 100% 로 보인다.
 */

/** 계약까지 간 단계. */
const WON_STAGES = new Set(['contracted'])

/** 더 볼 것 없이 끝난 단계. */
const LOST_STAGES = new Set(['lost', 'rejected', 'no_response', 'service_cancelled'])

export interface ConversionLead {
  id: string
  sourceChannel?: string
  pipelineStage?: string
  /** 'YYYY-MM-DD' */
  leadDate?: string
  /** 계약을 쓰면서 만들어진 리드 — 만들어지는 순간 이미 계약이라 분모가 없다 */
  createdFromContract?: boolean
}

export interface ConversionContract {
  leadId?: string
  totalAmount?: number
  currency?: 'KRW' | 'USD'
  status?: string
}

export interface ChannelStat {
  channel: string
  /** 기간 안에 들어온 전체 리드 */
  total: number
  /** 계약까지 간 건 */
  won: number
  /** 이탈·거절·무응답으로 끝난 건 */
  lost: number
  /** 아직 결판이 안 난 건 */
  open: number
  /** 계약 ÷ 전체 (%) */
  rate: number
  /** 계약 ÷ (계약 + 이탈) (%) — 진행 중은 뺀다 */
  closedRate: number
  /** 그 경로에서 나온 계약 금액 합 (원) */
  revenue: number
  /** 계약 1건당 리드 몇 건이 필요한가 — 'N건 중 1건' */
  leadsPerWin: number | null
  /**
   * 그중 계약 시점에 만들어진 리드 수.
   *
   * 이 건들은 '계약 안 된 경우' 가 애초에 기록되지 않아 분모가 비어 있다.
   * 전환율이 100% 에 가깝게 나오므로 다른 경로와 나란히 비교하면 안 된다.
   * 숫자를 빼지는 않는다 — '소개로 31건 계약됐다' 는 알아야 할 사실이다.
   */
  atContract: number
}

export interface ConversionSummary {
  channels: ChannelStat[]
  total: ChannelStat
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
}

/** 비어 있는 유입경로는 한 칸에 모은다 — 흩어져 있으면 비교가 안 된다. */
function channelOf(l: ConversionLead): string {
  const c = (l.sourceChannel || '').trim()
  return c || '미입력'
}

export function summarizeConversion(input: {
  leads: ConversionLead[]
  contracts: ConversionContract[]
  /** 'YYYY-MM-DD' — 이 날짜 이후 유입분만. 비우면 전체. */
  from?: string
  to?: string
  /** 달러 계약을 원화로 환산할 때 */
  usdRate?: number
}): ConversionSummary {
  const { leads, contracts, from, to, usdRate = 1340 } = input

  // 계약 금액을 리드에 붙인다. 해지·취소된 계약은 성과로 세지 않는다.
  const revenueByLead = new Map<string, number>()
  for (const c of contracts) {
    if (!c.leadId) continue
    if (c.status === 'cancelled' || c.status === 'terminated') continue
    const amt = c.currency === 'USD' ? Math.round((c.totalAmount || 0) * usdRate) : (c.totalAmount || 0)
    revenueByLead.set(c.leadId, (revenueByLead.get(c.leadId) || 0) + amt)
  }

  const acc = new Map<string, { total: number; won: number; lost: number; revenue: number; atContract: number }>()
  const bump = (k: string) => {
    let v = acc.get(k)
    if (!v) { v = { total: 0, won: 0, lost: 0, revenue: 0, atContract: 0 }; acc.set(k, v) }
    return v
  }

  for (const l of leads) {
    const d = (l.leadDate || '').slice(0, 10)
    if (from && d && d < from) continue
    if (to && d && d > to) continue
    if ((from || to) && !d) continue        // 기간을 걸었는데 유입일이 없으면 셀 수 없다

    const v = bump(channelOf(l))
    v.total += 1
    if (l.createdFromContract) v.atContract += 1
    const stage = l.pipelineStage || ''
    if (WON_STAGES.has(stage)) {
      v.won += 1
      v.revenue += revenueByLead.get(l.id) || 0
    } else if (LOST_STAGES.has(stage)) {
      v.lost += 1
    }
  }

  const finish = (
    channel: string,
    v: { total: number; won: number; lost: number; revenue: number; atContract: number },
  ): ChannelStat => ({
    channel,
    total: v.total,
    won: v.won,
    lost: v.lost,
    open: v.total - v.won - v.lost,
    rate: pct(v.won, v.total),
    closedRate: pct(v.won, v.won + v.lost),
    revenue: v.revenue,
    leadsPerWin: v.won > 0 ? Math.round((v.total / v.won) * 10) / 10 : null,
    atContract: v.atContract,
  })

  const channels = [...acc.entries()]
    .map(([k, v]) => finish(k, v))
    // 계약을 많이 낸 경로부터. 같으면 리드가 많은 쪽.
    .sort((a, b) => (b.won - a.won) || (b.total - a.total))

  const sum = channels.reduce(
    (s, c) => ({
      total: s.total + c.total, won: s.won + c.won, lost: s.lost + c.lost,
      revenue: s.revenue + c.revenue, atContract: s.atContract + c.atContract,
    }),
    { total: 0, won: 0, lost: 0, revenue: 0, atContract: 0 },
  )

  return { channels, total: finish('전체', sum) }
}
