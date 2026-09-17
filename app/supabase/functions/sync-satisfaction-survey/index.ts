// Supabase Edge Function: sync-satisfaction-survey
//
// 서비스 만족도 설문(구글폼) 응답 시트를 읽어 satisfaction_responses 에 넣는다.
//
// 시트를 '링크 있는 사람 공개'로 두지 않는다. 대신 구글 서비스 계정으로 읽는다.
//   1) 구글 클라우드에서 서비스 계정을 만들고 JSON 키를 받는다
//   2) 그 서비스 계정 이메일에게 시트를 '뷰어'로 공유한다
//   3) JSON 키 전체를 Supabase 시크릿 GOOGLE_SERVICE_ACCOUNT_JSON 에 넣는다
// 이렇게 하면 시트는 계속 비공개이고, 그 계정만 읽을 수 있다.
//
// 설문 문항은 바뀔 수 있으므로 어느 칸이 컨설턴트·점수인지는 코드에 박지 않고
// satisfaction_sources.column_map 에서 읽는다(화면에서 지정).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

interface ServiceAccount {
  client_email: string
  private_key: string
}

interface ColumnMap {
  consultant?: string
  timestamp?: string
  scores?: string[]
  comments?: string[]
}

// ─── 구글 서비스 계정 인증 ───────────────────────────────────────────────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64urlText = (s: string) => b64url(new TextEncoder().encode(s))

/** PEM(PKCS#8) → 서명용 CryptoKey */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** 서비스 계정 JWT 를 만들어 액세스 토큰으로 교환한다. */
export async function getAccessToken(sa: ServiceAccount, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: SHEETS_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }
  const unsigned = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(claims))}`
  const key = await importPrivateKey(sa.private_key)
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const jwt = `${unsigned}.${b64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`구글 토큰 발급 실패 ${res.status}: ${await res.text()}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('구글 응답에 access_token 이 없습니다.')
  return data.access_token as string
}

// ─── 시트 읽기 ───────────────────────────────────────────────────────────

/** 시트 한 탭을 2차원 배열로. tab 이 비면 첫 번째 탭을 읽는다. */
async function fetchSheetValues(token: string, spreadsheetId: string, tab?: string): Promise<string[][]> {
  let range = tab?.trim()
  if (!range) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!metaRes.ok) throw new Error(`시트 정보 조회 실패 ${metaRes.status}: ${await metaRes.text()}`)
    const meta = await metaRes.json()
    range = meta.sheets?.[0]?.properties?.title
    if (!range) throw new Error('시트에 탭이 없습니다.')
  }
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `시트를 읽을 수 없습니다(${res.status}). 서비스 계정 이메일에게 시트를 '뷰어'로 공유했는지 확인하세요. ${body}`,
      )
    }
    throw new Error(`시트 읽기 실패 ${res.status}: ${body}`)
  }
  const data = await res.json()
  return (data.values || []) as string[][]
}

// ─── 행 → 응답 변환 ──────────────────────────────────────────────────────

/** 행 내용을 해시해 중복 삽입을 막는다. */
export async function hashRow(values: readonly string[]): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(values)))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** '4', '4점', '매우 만족(5)' 처럼 섞여 들어와도 숫자만 뽑는다. */
export function parseScore(v?: string): number | null {
  if (!v) return null
  const m = String(v).match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** 구글폼 타임스탬프는 로케일에 따라 형식이 제각각이라 파싱 실패를 허용한다. */
export function parseTimestamp(v?: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (!isNaN(d.getTime())) return d.toISOString()
  // '2026. 9. 17 오후 3:20:11' 같은 한국어 형식
  const m = String(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return null
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00Z`
  const d2 = new Date(iso)
  return isNaN(d2.getTime()) ? null : d2.toISOString()
}

export interface MappedRow {
  raw: Record<string, string>
  consultant_name: string | null
  responded_at: string | null
  avg_score: number | null
}

/** 헤더 + 한 행 + 매핑 → 저장할 형태. 매핑에 없는 칸도 raw 에 전부 남긴다. */
export function mapRow(headers: readonly string[], row: readonly string[], map: ColumnMap): MappedRow {
  const raw: Record<string, string> = {}
  headers.forEach((h, i) => { if (h) raw[h] = row[i] ?? '' })

  const consultant = map.consultant ? (raw[map.consultant] || '').trim() : ''
  const scores = (map.scores || [])
    .map(c => parseScore(raw[c]))
    .filter((n): n is number => n !== null)

  return {
    raw,
    consultant_name: consultant || null,
    responded_at: map.timestamp ? parseTimestamp(raw[map.timestamp]) : null,
    avg_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  }
}

// ─── 핸들러 ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!saJson) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON 시크릿이 없습니다. 구글 서비스 계정 JSON 키를 Supabase 시크릿에 등록하세요.',
      )
    }
    let sa: ServiceAccount
    try {
      sa = JSON.parse(saJson)
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 이 올바른 JSON 이 아닙니다.')
    }
    if (!sa.client_email || !sa.private_key) {
      throw new Error('서비스 계정 JSON 에 client_email 또는 private_key 가 없습니다.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 특정 출처만 동기화할 수도 있다(화면의 '지금 동기화' 버튼).
    let onlySourceId: string | undefined
    try {
      const body = await req.json()
      onlySourceId = body?.sourceId
    } catch { /* 본문 없으면 전체 */ }

    let q = supabase.from('satisfaction_sources').select('*').eq('active', true)
    if (onlySourceId) q = q.eq('id', onlySourceId)
    const { data: sources, error: srcErr } = await q
    if (srcErr) throw srcErr
    if (!sources?.length) {
      return new Response(JSON.stringify({ success: true, sources: 0, inserted: 0, results: [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = await getAccessToken(sa)
    const results: { source: string; fetched: number; inserted: number; error?: string }[] = []
    let totalInserted = 0

    for (const src of sources) {
      try {
        const values = await fetchSheetValues(token, src.spreadsheet_id, src.sheet_tab)
        if (values.length < 2) {
          results.push({ source: src.name, fetched: 0, inserted: 0 })
          await supabase.from('satisfaction_sources')
            .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
            .eq('id', src.id)
          continue
        }

        const headers = values[0].map(h => (h || '').trim())
        const map = (src.column_map || {}) as ColumnMap

        const rows = []
        for (let i = 1; i < values.length; i++) {
          const row = values[i]
          if (!row || row.every(c => !c || !c.trim())) continue   // 빈 줄 건너뛰기
          const mapped = mapRow(headers, row, map)
          rows.push({
            source_id: src.id,
            ...mapped,
            row_hash: await hashRow(row),
          })
        }

        // 같은 행이 다시 들어와도 무시 (unique(source_id, row_hash))
        let inserted = 0
        const CHUNK = 500
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK)
          const { data, error } = await supabase
            .from('satisfaction_responses')
            .upsert(chunk, { onConflict: 'source_id,row_hash', ignoreDuplicates: true })
            .select('id')
          if (error) throw error
          inserted += data?.length || 0
        }

        totalInserted += inserted
        results.push({ source: src.name, fetched: rows.length, inserted })
        await supabase.from('satisfaction_sources')
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq('id', src.id)
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err)
        results.push({ source: src.name, fetched: 0, inserted: 0, error: msg })
        await supabase.from('satisfaction_sources')
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: msg })
          .eq('id', src.id)
      }
    }

    return new Response(
      JSON.stringify({ success: true, sources: sources.length, inserted: totalInserted, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
