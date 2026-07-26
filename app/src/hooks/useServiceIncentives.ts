import { useMemo } from 'react'
import { useAllServiceProgramFees } from './useServiceProgramFees'
import { usePartnerRateMap, useDefaultRates, normalizePartner, rateForTeam, type ContributorTeam } from './usePartnerCommissionRates'
import { useProfiles } from './useProfiles'
import { canonicalConsultantName, consultantNameKey } from '@/lib/consultants'

/** A sales-incentive line generated from a collected EC/Academic service. */
export interface ServiceIncentiveLine {
  id: string      // stable key (programFeeId + contributor slot)
  name: string    // canonical contributor name
  label: string   // student · partner
  amount: number  // 청구금액 × 팀 수수료율
  month: string   // settlement month (YYYY-MM, = paidDate month)
}

/**
 * Service incentives from 서비스입금관리: for every 수금 완료 EC/Academic item,
 * each contributor earns 청구금액 × (그 파트너사의 소속팀 수수료율). These feed the
 * 세일즈인센티브 인보이스 alongside contract-based incentives.
 */
export function useServiceIncentiveLines(): ServiceIncentiveLine[] {
  const { data: fees = [] } = useAllServiceProgramFees()
  const { map: partnerRateMap } = usePartnerRateMap()
  const { salesRate: defSales, serviceRate: defService } = useDefaultRates()
  const { data: profiles = [] } = useProfiles()

  return useMemo(() => {
    // name (canonical) → team, from 인사관리 소속팀 (sales/service only)
    const teamByName = new Map<string, ContributorTeam>()
    for (const p of profiles) {
      if (p.department === 'sales' || p.department === 'service') {
        teamByName.set(consultantNameKey(p.name), p.department)
      }
    }
    const autoTeam = (name?: string) => (name ? teamByName.get(consultantNameKey(name)) : undefined)

    const lines: ServiceIncentiveLine[] = []
    for (const f of fees) {
      if (f.collectionStatus !== 'paid' || !f.paidDate) continue
      const paidMonth = f.paidDate.slice(0, 7)
      const billed = f.billedAmount || 0
      if (!billed) continue
      const er = partnerRateMap.get(normalizePartner(f.label)) || { salesRate: defSales, serviceRate: defService }
      const slots: { name?: string; override?: ContributorTeam | null }[] = [
        { name: f.contributor1, override: f.contributor1Team },
        { name: f.contributor2, override: f.contributor2Team },
      ]
      slots.forEach((s, idx) => {
        if (!s.name?.trim()) return
        const team = s.override ?? autoTeam(s.name)
        const rate = rateForTeam(team, er.salesRate, er.serviceRate)
        if (!rate) return
        const amount = Math.round((billed * rate) / 100)
        if (amount <= 0) return
        const label = [f.studentName, f.label].filter(Boolean).join(' · ') || f.label
        lines.push({ id: `s:${f.id}:${idx}`, name: canonicalConsultantName(s.name), label, amount, month: paidMonth })
      })
    }
    return lines
  }, [fees, partnerRateMap, defSales, defService, profiles])
}
