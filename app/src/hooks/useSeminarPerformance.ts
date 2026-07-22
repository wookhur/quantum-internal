import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sessionSortKey } from '@/hooks/useSeminars'
import type { Lead, PipelineStage } from '@/types'

/** Strip everything except digits so phones match across sources. */
export function normalizePhone(raw: string | undefined | null): string {
  let d = (raw || '').replace(/\D/g, '')
  // Normalize Korean country code: 8210... → 010...
  if (d.startsWith('8210')) d = '0' + d.slice(2)
  else if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  return d
}

/** Lowercase + trim an email. Empty string if missing. */
export function normalizeEmail(raw: string | undefined | null): string {
  return (raw || '').trim().toLowerCase()
}

/** Compact a name key: strip spaces, lowercase. Empty string if missing. */
export function normalizeName(raw: string | undefined | null): string {
  return (raw || '').replace(/\s+/g, '').toLowerCase()
}

/** A registrant's combined match keys. A phone only counts if it looks real. */
export interface MatchKeys {
  phone: string
  email: string
  /** parentName+studentName, used only as a last-resort match. */
  nameKey: string
}

function isUsablePhone(p: string): boolean {
  // Reject empty, too short, or obviously non-phone (e.g. all same digit)
  return p.length >= 9
}

export interface SeminarLite {
  id: string
  title: string
  date: string | null
  createdAt: string
  active: boolean
  /** Usable normalized phones of registrants. */
  phones: Set<string>
  /** Normalized emails of registrants. */
  emails: Set<string>
  /** Name keys (parentName+studentName) of registrants. */
  names: Set<string>
  /** Unique registrant count (deduped by best available key). */
  applicants: number
  /** Unique registrants who attended (attended=true). */
  attendees: number
  /** Match keys of registrants who attended. */
  attendedPhones: Set<string>
  attendedEmails: Set<string>
  attendedNames: Set<string>
  /** The seminar's sub-webinar session labels (e.g. the 4 진학전략 webinars). */
  sessions: string[]
  /** session label → unique registrant count for that session. */
  sessionApplicants: Map<string, number>
  /** normalized phone → applied session labels. */
  sessionsByPhone: Map<string, string[]>
  /** normalized email → applied session labels. */
  sessionsByEmail: Map<string, string[]>
  /** name key → applied session labels. */
  sessionsByName: Map<string, string[]>
}

/** Applied sub-webinar session labels for a lead within a seminar (phone→email→name). */
export function seminarSessionsForLead(
  seminar: SeminarLite,
  lead: { phone?: string; email?: string; parentName?: string; studentName?: string },
): string[] {
  const phone = normalizePhone(lead.phone)
  if (isUsablePhone(phone) && seminar.sessionsByPhone.has(phone)) return seminar.sessionsByPhone.get(phone)!
  const email = normalizeEmail(lead.email)
  if (email && seminar.sessionsByEmail.has(email)) return seminar.sessionsByEmail.get(email)!
  const nameKey = normalizeName(lead.parentName) + '|' + normalizeName(lead.studentName)
  if (nameKey !== '|' && seminar.sessionsByName.has(nameKey)) return seminar.sessionsByName.get(nameKey)!
  return []
}

/** True if the lead attended this seminar (matched by phone/email/name). */
export function leadAttendedSeminar(
  seminar: SeminarLite,
  lead: { phone?: string; email?: string; parentName?: string; studentName?: string },
): boolean {
  const phone = normalizePhone(lead.phone)
  if (isUsablePhone(phone) && seminar.attendedPhones.has(phone)) return true
  const email = normalizeEmail(lead.email)
  if (email && seminar.attendedEmails.has(email)) return true
  const nameKey = normalizeName(lead.parentName) + '|' + normalizeName(lead.studentName)
  if (nameKey !== '|' && seminar.attendedNames.has(nameKey)) return true
  return false
}

/** Seminars a lead attended (for the lead-card attendance badge). */
export function seminarsAttendedByLead(
  seminars: SeminarLite[],
  lead: { phone?: string; email?: string; parentName?: string; studentName?: string },
): SeminarLite[] {
  return seminars.filter(s => leadAttendedSeminar(s, lead))
}

/**
 * All seminars with their registrant match keys (phone/email/name).
 * Used to link leads back to the seminar they registered for even when
 * the phone number is malformed or the lead entered via another channel.
 */
export function useSeminarsWithRegistrations() {
  return useQuery({
    queryKey: ['seminars-with-registrations'],
    queryFn: async () => {
      const { data: seminars, error: semErr } = await supabase
        .from('seminars')
        .select('id, title, date, active, created_at, sessions')
        .order('created_at', { ascending: false })
      if (semErr) throw semErr

      const PAGE = 1000
      let from = 0
      const regs: {
        seminar_id: string
        phone: string | null
        email: string | null
        parent_name: string | null
        student_name: string | null
        session_labels: string[] | null
        attended: boolean | null
      }[] = []
      while (true) {
        const { data, error } = await supabase
          .from('seminar_registrations')
          .select('seminar_id, phone, email, parent_name, student_name, session_labels, attended')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as typeof regs
        regs.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }

      interface Acc {
        phones: Set<string>
        emails: Set<string>
        names: Set<string>
        attendedPhones: Set<string>
        attendedEmails: Set<string>
        attendedNames: Set<string>
        /** dedup keys for counting unique registrants */
        personKeys: Set<string>
        attendedPersonKeys: Set<string>
        /** session label → unique person keys registered for that session */
        sessionPersonKeys: Map<string, Set<string>>
        sessionsByPhone: Map<string, string[]>
        sessionsByEmail: Map<string, string[]>
        sessionsByName: Map<string, string[]>
      }
      const newAcc = (): Acc => ({
        phones: new Set(), emails: new Set(), names: new Set(),
        attendedPhones: new Set(), attendedEmails: new Set(), attendedNames: new Set(),
        personKeys: new Set(), attendedPersonKeys: new Set(),
        sessionPersonKeys: new Map(),
        sessionsByPhone: new Map(), sessionsByEmail: new Map(), sessionsByName: new Map(),
      })
      const bySeminar = new Map<string, Acc>()
      for (const r of regs) {
        if (!bySeminar.has(r.seminar_id)) bySeminar.set(r.seminar_id, newAcc())
        const acc = bySeminar.get(r.seminar_id)!
        const phone = normalizePhone(r.phone)
        const email = normalizeEmail(r.email)
        const nameKey = normalizeName(r.parent_name) + '|' + normalizeName(r.student_name)
        const labels = Array.isArray(r.session_labels) ? r.session_labels.filter(Boolean) : []
        const attended = !!r.attended
        if (isUsablePhone(phone)) { acc.phones.add(phone); if (attended) acc.attendedPhones.add(phone); if (labels.length) acc.sessionsByPhone.set(phone, labels) }
        if (email) { acc.emails.add(email); if (attended) acc.attendedEmails.add(email); if (labels.length) acc.sessionsByEmail.set(email, labels) }
        if (nameKey !== '|') { acc.names.add(nameKey); if (attended) acc.attendedNames.add(nameKey); if (labels.length) acc.sessionsByName.set(nameKey, labels) }
        // Unique person: prefer email, then usable phone, then name
        const personKey = email || (isUsablePhone(phone) ? phone : '') || nameKey
        if (personKey && personKey !== '|') {
          acc.personKeys.add(personKey)
          if (attended) acc.attendedPersonKeys.add(personKey)
          for (const label of labels) {
            if (!acc.sessionPersonKeys.has(label)) acc.sessionPersonKeys.set(label, new Set())
            acc.sessionPersonKeys.get(label)!.add(personKey)
          }
        }
      }

      return (seminars || []).map((s): SeminarLite => {
        const row = s as Record<string, unknown>
        const acc = bySeminar.get(row.id as string) ?? newAcc()
        const rawSessions = row.sessions
        const sessions: string[] = (Array.isArray(rawSessions)
          ? rawSessions.map((x) => (typeof x === 'string' ? x : (x as { label?: string })?.label)).filter(Boolean) as string[]
          : [])
          .map((label, i) => ({ label, i }))
          .sort((a, b) => {
            const ka = sessionSortKey({ label: a.label }), kb = sessionSortKey({ label: b.label })
            return ka === kb ? a.i - b.i : ka - kb
          })
          .map((x) => x.label)
        const sessionApplicants = new Map<string, number>()
        for (const label of sessions) {
          sessionApplicants.set(label, acc.sessionPersonKeys.get(label)?.size ?? 0)
        }
        return {
          id: row.id as string,
          title: row.title as string,
          date: row.date as string | null,
          createdAt: row.created_at as string,
          active: row.active as boolean,
          phones: acc.phones,
          emails: acc.emails,
          names: acc.names,
          applicants: acc.personKeys.size,
          attendees: acc.attendedPersonKeys.size,
          attendedPhones: acc.attendedPhones,
          attendedEmails: acc.attendedEmails,
          attendedNames: acc.attendedNames,
          sessions,
          sessionApplicants,
          sessionsByPhone: acc.sessionsByPhone,
          sessionsByEmail: acc.sessionsByEmail,
          sessionsByName: acc.sessionsByName,
        }
      })
    },
  })
}

export interface MeetingSlim {
  id: string
  leadId: string | null
  meetingMethod: string | null
  meetingDate: string | null
  meetingNumber: number | null
  parentName: string | null
  studentName: string | null
  phone: string | null
}

/** All meeting records (slim) — used to count consultations by method. */
export function useAllMeetingsSlim() {
  return useQuery({
    queryKey: ['all-meetings-slim'],
    queryFn: async () => {
      const PAGE = 1000
      let from = 0
      const rows: MeetingSlim[] = []
      while (true) {
        const { data, error } = await supabase
          .from('meetings')
          .select('id, lead_id, meeting_method, meeting_date, meeting_number, parent_name, student_name, phone')
          .order('meeting_date', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data || []) as Record<string, unknown>[]
        rows.push(
          ...batch.map((r) => ({
            id: r.id as string,
            leadId: (r.lead_id as string | null) ?? null,
            meetingMethod: (r.meeting_method as string | null) ?? null,
            meetingDate: (r.meeting_date as string | null) ?? null,
            meetingNumber: (r.meeting_number as number | null) ?? null,
            parentName: (r.parent_name as string | null) ?? null,
            studentName: (r.student_name as string | null) ?? null,
            phone: (r.phone as string | null) ?? null,
          })),
        )
        if (batch.length < PAGE) break
        from += PAGE
      }
      return rows
    },
  })
}

/**
 * Meetings linked to a set of leads: by lead_id, or by phone when the
 * meeting was never linked to a lead.
 */
export function meetingsForLeads(meetings: MeetingSlim[], leads: Lead[]): MeetingSlim[] {
  const leadIds = new Set(leads.map((l) => l.id))
  const leadPhones = new Set(
    leads.map((l) => normalizePhone(l.phone)).filter((p) => isUsablePhone(p)),
  )
  return meetings.filter((m) => {
    if (m.leadId && leadIds.has(m.leadId)) return true
    const p = normalizePhone(m.phone)
    return isUsablePhone(p) && leadPhones.has(p)
  })
}

export interface ContactActivitySlim {
  leadId: string
  activityType: string
  callResult: string | null
  /** 1:1 상담유도 성공 표시 (metadata.oneOnOneConsult) */
  oneOnOneConsult: boolean
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
            oneOnOneConsult:
              ((r.metadata as Record<string, unknown> | null)?.oneOnOneConsult as boolean | undefined) === true,
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
 * Match a lead to a seminar by any of: seminar title as source, phone,
 * or email. This tolerates malformed phone numbers (e.g. an email typed
 * into the phone field) by falling back to the email key. Name matching is
 * intentionally NOT used here — Korean homonyms produce false positives.
 */
export function leadMatchesSeminar(lead: Lead, seminar: SeminarLite): boolean {
  if (lead.sourceChannel === seminar.title) return true

  const phone = normalizePhone(lead.phone)
  if (phone.length >= 9 && seminar.phones.has(phone)) return true

  const email = normalizeEmail(lead.email)
  if (email && seminar.emails.has(email)) return true

  return false
}

/**
 * Looser match used to list EVERY seminar a lead applied to (콜드콜 상세의 참석 연동).
 * Unlike leadMatchesSeminar it also matches by registrant name key, so a person
 * whose lead phone/email differs from their registration — or whose registration
 * lacks session labels — still surfaces the seminar (with a "(전체)" attendance row).
 */
export function leadMatchesSeminarLoose(
  seminar: SeminarLite,
  lead: { phone?: string; email?: string; parentName?: string; studentName?: string; sourceChannel?: string },
): boolean {
  if (lead.sourceChannel && lead.sourceChannel === seminar.title) return true
  const phone = normalizePhone(lead.phone)
  if (isUsablePhone(phone) && seminar.phones.has(phone)) return true
  const email = normalizeEmail(lead.email)
  if (email && seminar.emails.has(email)) return true
  const nameKey = normalizeName(lead.parentName) + '|' + normalizeName(lead.studentName)
  if (nameKey !== '|' && seminar.names.has(nameKey)) return true
  return false
}

/** Rank a pipeline stage so we can keep the most-progressed duplicate. */
const STAGE_RANK: Record<string, number> = {
  contracted: 100,
  contract_review: 90,
  third_consultation: 80,
  second_consultation: 70,
  first_consultation: 60,
  consultation_scheduled: 50,
  contact_attempted: 40,
  new_lead: 30,
  no_response: 20,
  on_hold: 15,
  rejected: 10,
  lost: 5,
}

/**
 * A person key that merges duplicate lead rows for the same person while
 * keeping siblings (same parent phone/email, different student) separate.
 * Uses the strongest identifier available (email → usable phone) plus the
 * student name; falls back to parent+student name when neither exists.
 */
function personKey(lead: Lead): string {
  const email = normalizeEmail(lead.email)
  const phone = normalizePhone(lead.phone)
  const strong = email || (phone.length >= 9 ? phone : '')
  const student = normalizeName(lead.studentName)
  if (strong) return `${strong}|${student}`
  return `p:${normalizeName(lead.parentName)}|${student}`
}

/**
 * Collapse duplicate lead rows that represent the same person, keeping the
 * most-progressed one (e.g. a contracted row wins over a raw new_lead).
 */
export function dedupeLeadsByPerson<T extends Lead>(leads: T[]): T[] {
  const best = new Map<string, T>()
  for (const lead of leads) {
    const key = personKey(lead)
    const existing = best.get(key)
    if (!existing) {
      best.set(key, lead)
      continue
    }
    const a = STAGE_RANK[lead.pipelineStage] ?? 0
    const b = STAGE_RANK[existing.pipelineStage] ?? 0
    if (a > b) best.set(key, lead)
  }
  return Array.from(best.values())
}
