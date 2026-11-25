import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * 학부모 선제 소통 제안 ('로드').
 *
 * 미팅 다이어리를 읽고 "이 학부모가 지금 무엇을 궁금해할지"와 먼저 건넬 말을
 * 짚어 준다. 사람이 고쳐 쓰는 초안이고, 학부모에게 바로 나가지 않는다.
 */
export type OutreachPriority = 'high' | 'medium' | 'low' | 'none'

export interface OutreachSuggestion {
  studentId: string
  priority: OutreachPriority
  concern: string
  basis: string
  suggestion: string
  draftMessage: string
}

export interface OutreachDiaryInput {
  entryDate?: string
  agendaItems?: string
  meetingSummary?: string
  extracurricularNotes?: string
  identityNarrativeNotes?: string
  questionsConcerns?: string
  nextMeetingAgenda?: string
  nextMeetingDate?: string
  followUpCommitments?: string
  assignments?: string
  criticalDates?: string
  criticalIssue?: string
}

export interface OutreachStudentInput {
  id: string
  name?: string
  koreanName?: string
  grade?: string
  school?: string
  majorDetail?: string
  contractType?: string
  consultantName?: string
  parentName?: string
  meetingsDone?: number
  meetingsTarget?: number
  noShows?: number
  lastMeetingDate?: string
  diaries?: OutreachDiaryInput[]
}

/** 엣지 함수가 한 번에 받는 인원. 더 보내면 함수가 시간 안에 못 끝낸다. */
const CHUNK = 3

export const PRIORITY_LABEL: Record<OutreachPriority, string> = {
  high: '이번 주 안에',
  medium: '2~3주 안에',
  low: '여유 있을 때',
  none: '지금은 연락 불필요',
}

export const PRIORITY_RANK: Record<OutreachPriority, number> = {
  high: 0, medium: 1, low: 2, none: 3,
}

/** 함수가 돌려준 값이 우리가 아는 꼴인지 — AI 응답은 그대로 믿지 않는다. */
function normalize(v: unknown): OutreachSuggestion | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const id = typeof o.studentId === 'string' ? o.studentId : ''
  if (!id) return null
  const p = o.priority
  const priority: OutreachPriority =
    p === 'high' || p === 'medium' || p === 'low' || p === 'none' ? p : 'low'
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '')
  return {
    studentId: id,
    priority,
    concern: str('concern'),
    basis: str('basis'),
    suggestion: str('suggestion'),
    draftMessage: str('draftMessage'),
  }
}

export function useParentOutreach() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<OutreachSuggestion[]>([])

  const reset = () => { setSuggestions([]); setError(null); setDone(0); setTotal(0) }

  const run = async (students: OutreachStudentInput[]) => {
    if (!students.length) return
    setLoading(true); setError(null); setSuggestions([]); setDone(0); setTotal(students.length)
    const out: OutreachSuggestion[] = []
    try {
      // 끊어서 차례로 — 한꺼번에 던지면 함수가 시간 안에 못 끝내고,
      // 중간까지 나온 것이라도 보여 줄 수 있어야 한다.
      for (let i = 0; i < students.length; i += CHUNK) {
        const slice = students.slice(i, i + CHUNK)
        const { data, error: fnError } = await supabase.functions.invoke('suggest-parent-outreach', {
          body: { students: slice },
        })
        if (fnError) {
          // 기본 메시지('non-2xx')는 진짜 이유를 가린다 — 본문을 읽는다
          let detail = fnError.message || String(fnError)
          const ctx = (fnError as { context?: Response }).context
          if (ctx && typeof ctx.text === 'function') {
            try {
              const rawBody = await ctx.text()
              try {
                const parsed = JSON.parse(rawBody) as { error?: string }
                detail = parsed.error || rawBody || detail
              } catch { detail = rawBody || detail }
            } catch { /* 본문을 못 읽으면 기본 메시지 */ }
          }
          throw new Error(detail)
        }
        if (!data?.ok) throw new Error(data?.error || '제안을 받지 못했습니다.')
        const arr = Array.isArray(data.suggestions) ? data.suggestions : []
        for (const s of arr) {
          const n = normalize(s)
          if (n) out.push(n)
        }
        setDone(Math.min(i + CHUNK, students.length))
        setSuggestions([...out])
      }
      setSuggestions(out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return { run, reset, loading, done, total, error, suggestions }
}
