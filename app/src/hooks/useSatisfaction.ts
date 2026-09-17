import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabasePaging'
import { consultantNameKey } from '@/lib/consultants'

/** 어느 시트 칸이 무엇인지. 설문 문항이 바뀔 수 있어 화면에서 지정한다. */
export interface SatisfactionColumnMap {
  consultant?: string
  timestamp?: string
  scores?: string[]
  comments?: string[]
}

export interface SatisfactionSource {
  id: string
  name: string
  spreadsheetId: string
  sheetTab?: string
  formUrl?: string
  columnMap: SatisfactionColumnMap
  scoreMax: number
  minResponsesToShowComments: number
  active: boolean
  lastSyncedAt?: string
  lastSyncError?: string
}

export interface SatisfactionResponse {
  id: string
  sourceId: string
  raw: Record<string, string>
  consultantName?: string
  respondedAt?: string
  avgScore?: number
}

function mapSource(r: Record<string, unknown>): SatisfactionSource {
  return {
    id: r.id as string,
    name: (r.name as string) || '',
    spreadsheetId: (r.spreadsheet_id as string) || '',
    sheetTab: (r.sheet_tab as string) || undefined,
    formUrl: (r.form_url as string) || undefined,
    columnMap: (r.column_map as SatisfactionColumnMap) || {},
    scoreMax: Number(r.score_max) || 5,
    minResponsesToShowComments: Number(r.min_responses_to_show_comments) || 3,
    active: !!r.active,
    lastSyncedAt: (r.last_synced_at as string) || undefined,
    lastSyncError: (r.last_sync_error as string) || undefined,
  }
}

function mapResponse(r: Record<string, unknown>): SatisfactionResponse {
  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    raw: (r.raw as Record<string, string>) || {},
    consultantName: (r.consultant_name as string) || undefined,
    respondedAt: (r.responded_at as string) || undefined,
    avgScore: r.avg_score != null ? Number(r.avg_score) : undefined,
  }
}

export function useSatisfactionSources() {
  return useQuery({
    queryKey: ['satisfaction_sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('satisfaction_sources')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(r => mapSource(r as Record<string, unknown>))
    },
  })
}

/** 응답은 설문이 쌓이면 1000행을 넘기므로 전량 페이지네이션 조회한다. */
export function useSatisfactionResponses(sourceId?: string) {
  return useQuery({
    queryKey: ['satisfaction_responses', sourceId],
    enabled: !!sourceId,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('satisfaction_responses')
          .select('*')
          .eq('source_id', sourceId!)
          .order('responded_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to),
      )
      return rows.map(r => mapResponse(r as Record<string, unknown>))
    },
  })
}

export function useSaveSatisfactionSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: Partial<SatisfactionSource> & { id?: string }) => {
      const row: Record<string, unknown> = {
        name: s.name,
        spreadsheet_id: s.spreadsheetId,
        sheet_tab: s.sheetTab || null,
        form_url: s.formUrl || null,
        score_max: s.scoreMax ?? 5,
        min_responses_to_show_comments: s.minResponsesToShowComments ?? 3,
        active: s.active ?? true,
        updated_at: new Date().toISOString(),
      }
      if (s.columnMap !== undefined) row.column_map = s.columnMap
      if (s.id) {
        const { error } = await supabase.from('satisfaction_sources').update(row).eq('id', s.id)
        if (error) throw error
        return s.id
      }
      const { data, error } = await supabase.from('satisfaction_sources').insert(row).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['satisfaction_sources'] }) },
  })
}

export function useDeleteSatisfactionSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('satisfaction_sources').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['satisfaction_sources'] })
      qc.invalidateQueries({ queryKey: ['satisfaction_responses'] })
    },
  })
}

/** 구글 시트에서 응답을 당겨온다(서비스 계정). */
export function useSyncSatisfaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sourceId?: string) => {
      const { data, error } = await supabase.functions.invoke('sync-satisfaction-survey', {
        body: sourceId ? { sourceId } : {},
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { inserted: number; results: { source: string; fetched: number; inserted: number; error?: string }[] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['satisfaction_responses'] })
      qc.invalidateQueries({ queryKey: ['satisfaction_sources'] })
    },
  })
}

/** 매핑을 바꿨을 때, 이미 저장된 응답의 집계 칸을 다시 채운다. */
export function useRemapSatisfaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ source, responses }: { source: SatisfactionSource; responses: SatisfactionResponse[] }) => {
      const map = source.columnMap
      const num = (v?: string) => {
        const m = String(v ?? '').match(/-?\d+(\.\d+)?/)
        const n = m ? Number(m[0]) : NaN
        return Number.isFinite(n) ? n : null
      }
      for (const r of responses) {
        const scores = (map.scores || []).map(c => num(r.raw[c])).filter((n): n is number => n !== null)
        const consultant = map.consultant ? (r.raw[map.consultant] || '').trim() : ''
        const tsRaw = map.timestamp ? r.raw[map.timestamp] : ''
        const d = tsRaw ? new Date(tsRaw) : null
        const { error } = await supabase.from('satisfaction_responses').update({
          consultant_name: consultant || null,
          avg_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
          responded_at: d && !isNaN(d.getTime()) ? d.toISOString() : null,
        }).eq('id', r.id)
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['satisfaction_responses'] }) },
  })
}

export interface ConsultantSatisfaction {
  name: string
  responses: number
  avgScore: number | null
  /** 100점 환산 (score_max 기준) */
  percent: number | null
  comments: string[]
  /** 응답 수가 적어 코멘트를 가렸는지 */
  commentsHidden: boolean
}

/**
 * 컨설턴트별 집계.
 * 이름 표기가 갈려도(Julie Kim ↔ 김지현) 한 사람으로 묶이도록 정규화 키로 합친다.
 * 응답 수가 기준 미만이면 개별 코멘트를 가린다 — 익명 설문에서 응답자가 드러나지 않게.
 */
export function useConsultantSatisfaction(
  source: SatisfactionSource | undefined,
  responses: SatisfactionResponse[],
): ConsultantSatisfaction[] {
  return useMemo(() => {
    if (!source) return []
    const minForComments = source.minResponsesToShowComments
    const commentCols = source.columnMap.comments || []
    const byKey = new Map<string, { name: string; scores: number[]; comments: string[]; count: number }>()

    for (const r of responses) {
      const raw = (r.consultantName || '').trim()
      if (!raw) continue
      const key = consultantNameKey(raw)
      const e = byKey.get(key) || { name: raw, scores: [], comments: [], count: 0 }
      e.count += 1
      if (r.avgScore != null) e.scores.push(r.avgScore)
      for (const c of commentCols) {
        const txt = (r.raw[c] || '').trim()
        if (txt) e.comments.push(txt)
      }
      byKey.set(key, e)
    }

    return [...byKey.values()]
      .map(e => {
        const avg = e.scores.length ? e.scores.reduce((a, b) => a + b, 0) / e.scores.length : null
        const hidden = e.count < minForComments
        return {
          name: e.name,
          responses: e.count,
          avgScore: avg,
          percent: avg != null && source.scoreMax > 0 ? (avg / source.scoreMax) * 100 : null,
          comments: hidden ? [] : e.comments,
          commentsHidden: hidden && e.comments.length > 0,
        }
      })
      .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || a.name.localeCompare(b.name, 'ko'))
  }, [source, responses])
}

/** 시트 헤더 후보 — 매핑 드롭다운 채우기용. 저장된 응답의 raw 키에서 모은다. */
export function useResponseColumns(responses: SatisfactionResponse[]): string[] {
  return useMemo(() => {
    const set = new Set<string>()
    for (const r of responses) for (const k of Object.keys(r.raw)) set.add(k)
    return [...set]
  }, [responses])
}
