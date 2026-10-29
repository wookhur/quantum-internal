import { useMemo } from 'react'
import { useAllServiceProgramFees, feeIncentivePayable } from './useServiceProgramFees'
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
      // 수금 완료 + 입금일이 있어야 인센티브가 잡힌다. 발생취소는 돈이 들어왔어도 제외.
      if (!feeIncentivePayable(f) || !f.paidDate) continue
      const paidMonth = f.paidDate.slice(0, 7)
      const billed = f.billedAmount || 0
      if (!billed) continue
      const er = partnerRateMap.get(normalizePartner(f.label)) || { salesRate: defSales, serviceRate: defService }
      const slots: { name?: string; override?: ContributorTeam | 'none' | null }[] = [
        { name: f.contributor1, override: f.contributor1Team },
        { name: f.contributor2, override: f.contributor2Team },
      ]
      slots.forEach((s, idx) => {
        if (!s.name?.trim()) return
        if (s.override === 'none') return  // '없음' = 인센티브 제외
        // 수기 입금 건은 건별로 고른 요율을 쓴다 — 불규칙 정산이라 파트너사
        // 기준율이 맞지 않고, 애초에 걸린 파트너사도 없다.
        let rate: number | undefined = f.incentiveRate
        if (rate == null) {
          const team = (s.override as ContributorTeam | null | undefined) ?? autoTeam(s.name)
          rate = rateForTeam(team, er.salesRate, er.serviceRate)
        }
        if (!rate) return
        const amount = Math.round((billed * rate) / 100)
        if (amount <= 0) return
        // 학생명은 Student360(service_students) 기준 한글+영어로 통일 표기
        const studentDisplay = [f.studentKoreanName, f.studentName].filter(Boolean).join(' ') || f.studentName
        // 어느 달 수업인지를 항목명에 남긴다. 같은 학원 줄이 달마다 올라오면
        // 월이 없을 때 어느 줄이 어느 달 것인지 알 수 없다. 이월 태그의 '(8월분)'은
        // 정산월(돈이 들어온 달)이라 이것과 다른 값이다.
        const program = [f.label, f.serviceMonth].filter(Boolean).join(' ')
        const label = [studentDisplay, program].filter(Boolean).join(' · ') || program
        lines.push({ id: `s:${f.id}:${idx}`, name: canonicalConsultantName(s.name), label, amount, month: paidMonth })
      })
    }
    return lines
  }, [fees, partnerRateMap, defSales, defService, profiles])
}
