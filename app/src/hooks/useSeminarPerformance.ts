import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead, PipelineStage } from '@/types'

/** Strip everything except digits so phones match across sources. */
export function normalizePhone(raw: string | undefined | null): string {
  return (raw || '').replace(/\D/g, '')
}

export interface SeminarLite {
  id: string
  title: string
  date: string | null
  createdAt: string
  active: boolean
  /** Normalized phone numbers of all registrants (deduplicated). */
  registrationPhones: Set<string>
  /** Unique registrant count (by phone). */
  applicants: number
}

/**
 * All seminars with their registrant phone sets.
 * Used to match leads back to the seminar they registered for,
 * even when the lead's source_channel points to another channel.
 */
export function useSeminarsWithRegistrations() {
  return useQuery({
    queryKey: ['seminars-with-registrations'],
    queryFn: async () => {
      const { data: seminars, error: semErr } = await supabase
        .from('seminars')
        .select('id, title, date, active, created_at')
        .order('created_at', { ascending: false })
      if (semErr) throw semErr

      const PAGE = 1000
      let from = 0
      const regs: { seminar_id: string; phone: string }[] = []
      while (true) {
        const { data, error } = await supabase
          .from('seminar_registrations')
          .select('seminar_id, phone')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as { seminar_id: string; phone: string }[]
        regs.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }

      const bySeminar = new Map<string, Set<string>>()
      for (const r of regs) {
        const p = normalizePhone(r.phone)
        if (!p) continue
        if (!bySeminar.has(r.seminar_id)) bySeminar.set(r.seminar_id, new Set())
        bySeminar.get(r.seminar_id)!.add(p)
      }

      return (seminars || []).map((s): SeminarLite => {
        const row = s as Record<string, unknown>
        const phones = bySeminar.get(row.id as string) ?? new Set<string>()
        return {
          id: row.id as string,
          title: row.title as string,
          date: row.date as string | null,
          createdAt: row.created_at as string,
          active: row.active as boolean,
          registrationPhones: phones,
          applicants: phones.size,
        }
      })
    },
  })
}

export interface ContactActivitySlim {
  leadId: string
  activityType: string
  callResult: string | null
  createdAt: string
}

/**
 * All contact activities (call/sms/katalk/email) across all leads,
 * ordered oldest → newest. Used for cold-call outcome aggregation.
 */
export function useAllContactActivities() {
  return useQuery({
    queryKey: ['all-contact-activities'],
    queryFn: async () => {
      const PAGE = 1000
      let from = 0
      const rows: ContactActivitySlim[] = []
      while (true) {
        const { data, error } = await supabase
          .from('lead_activities')
          .select('lead_id, activity_type, metadata, created_at')
          .in('activity_type', ['call', 'sms', 'katalk', 'email'])
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as Record<string, unknown>[]
        rows.push(
          ...batch.map((r) => ({
            leadId: r.lead_id as string,
            activityType: r.activity_type as string,
            callResult:
              ((r.metadata as Record<string, unknown> | null)?.callResult as string | undefined) ?? null,
            createdAt: r.created_at as string,
          })),
        )
        if (batch.length < PAGE) break
        from += PAGE
      }
      return rows
    },
  })
}

/** Stages that mean a consultation was scheduled or progressed further. */
const CONSULT_OR_BEYOND: PipelineStage[] = [
  'consultation_scheduled',
  'first_consultation',
  'second_consultation',
  'third_consultation',
  'contract_review',
  'contracted',
]

/** Positive contact results — the person actually responded. */
const CONFIRMED_RESULTS = new Set(['connected', 'replied', 'read'])

export interface ColdCallOutcome {
  /** Unique seminar registrants (0 when not scoped to a seminar). */
  applicants: number
  /** Leads matched to this scope. */
  totalLeads: number
  /** Leads never contacted yet. */
  uncontacted: number
  /** Leads with at least one contact attempt. */
  contacted: number
  /** Leads that responded at least once (call connected / message replied). */
  confirmed: number
  /** Leads contacted but never reached (only no_answer / no_reply). */
  unreachable: number
  /** Leads whose most recent call result is a callback request. */
  callbackNeeded: number
  /** Leads that reached consultation-scheduled stage or beyond. */
  consultScheduled: number
  /** Leads contracted. */
  contracted: number
}

/** Aggregate cold-call outcomes for a set of leads. */
export function computeColdCallOutcome(
  leads: Lead[],
  activities: ContactActivitySlim[],
  applicants: number,
): ColdCallOutcome {
  const leadIds = new Set(leads.map((l) => l.id))
  const byLead = new Map<string, ContactActivitySlim[]>()
  for (const a of activities) {
    if (!leadIds.has(a.leadId)) continue
    if (!byLead.has(a.leadId)) byLead.set(a.leadId, [])
    byLead.get(a.leadId)!.push(a)
  }

  let contacted = 0
  let confirmed = 0
  let unreachable = 0
  let callbackNeeded = 0
  let consultScheduled = 0
  let contracted = 0

  for (const lead of leads) {
    const acts = byLead.get(lead.id) ?? []
    const hasContact = acts.length > 0 || lead.pipelineStage === 'contact_attempted' || lead.pipelineStage === 'no_response'
    if (hasContact) contacted++

    const results = acts.map((a) => a.callResult).filter((r): r is string => !!r)
    const anyConfirmed = results.some((r) => CONFIRMED_RESULTS.has(r))
    if (anyConfirmed) confirmed++

    // Contacted but never got a positive response
    if (hasContact && !anyConfirmed) unreachable++

    // Latest result is a callback request
    const lastResult = results.length > 0 ? results[results.length - 1] : null
    if (lastResult === 'callback') callbackNeeded++

    if (CONSULT_OR_BEYOND.includes(lead.pipelineStage)) consultScheduled++
    if (lead.pipelineStage === 'contracted') contracted++
  }

  return {
    applicants,
    totalLeads: leads.length,
    uncontacted: leads.length - contacted,
    contacted,
    confirmed,
    unreachable,
    callbackNeeded,
    consultScheduled,
    contracted,
  }
}

/**
 * Match leads to a seminar: either the lead's source_channel is the seminar
 * title, or the lead's phone appears in the seminar's registrations
 * (covers leads that entered earlier through another channel).
 */
export function leadMatchesSeminar(lead: Lead, seminar: SeminarLite): boolean {
  if (lead.sourceChannel === seminar.title) return true
  const p = normalizePhone(lead.phone)
  return p.length > 0 && seminar.registrationPhones.has(p)
}
