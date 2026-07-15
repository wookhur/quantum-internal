// Supabase Edge Function: sync-google-sheet-leads
// Reads all tabs from the Survey Response DB Google Sheet (public, no API key needed)
// and inserts new leads into the leads table, deduplicating by phone number.
// The sheet tab name becomes the source_channel for each lead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPREADSHEET_ID = '18p0ZJDbhAk_mhEqUQgDRGETCzyt1ogBWFv_cqqwCQ8Y'

const SHEET_TABS = [
  'Form_Responses',
  '독서의중요성', '교수추천서', '커먼앱에세이', '커먼앱액티비티',
  '학술저널지(고은솔)', '디자인과 포트폴리오', '선배 초청 세미나 (상담 연계)',
  '경희대 IJAC', 'WCBM 참가 안내 자료', 'sat vs act', '의대 합격생 체크리스트',
  '중동난민센터', '바이오탑대회', '아이비전', '우회전공 전략', '정치학과목선택',
  '여름방학', '이과성향(최장혁대표)', '최장혁대표님연구소', '공대과목선택',
  '스템대회(최장혁대표)', '하버드디베이트', '바켐 과목 선택', '좋은인턴',
  '공대 대회리스트', '미국대학리스트', 'social justice activity', '진로탐색',
  'CDS 비교분석', '편입 실제사례', '추천서', 'Yale CDS', 'academic curiosity',
  '임팩트', '리더십 EC', '건축', '보딩스쿨', 'ibvsap', '존홉 EC', '에세이',
  'paid job 인턴십', '하버드 합격', '상위권 대학 학생 특징', '입학사정관 굿 EC',
  '비즈니스 전공 EC', '리서치 로드맵', '강점 분명 학생', 'IB 과목 선택',
  'EC 보다 중요한거', '여름방학 준비', '존 로크 에세이대회', '콩코드 리뷰',
  'AP 과목 전략', '보딩', '썸머캠프 티어별', '캡스톤 + 소셜임팩트', '하버드 EC',
  'IB vs AP', '편입', '대학 에세이', 'AI 에세이', '인턴십', 'IB', '몰입',
  '전공 리서치', '캡스톤', '강점코칭', 'EC', 'DEI 폐지', '에세이 훅',
]

interface SheetRow {
  timestamp: string
  parentName: string
  studentName: string
  email: string
  phone: string
  school: string
  grade: string
  region: string
  interestArea: string
  referralSource: string
  sheetTab: string
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-\(\)\.]/g, '').trim()
}

function parseCSV(csv: string): string[][] {
  const rows: string[][] = []
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current)
      current = ''
      if (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') i++
    } else {
      current += ch
    }
  }
  if (current.trim()) lines.push(current)

  for (const line of lines) {
    const fields: string[] = []
    let field = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { field += '"'; i++ }
          else q = false
        } else { field += ch }
      } else {
        if (ch === '"') q = true
        else if (ch === ',') { fields.push(field); field = '' }
        else field += ch
      }
    }
    fields.push(field)
    rows.push(fields)
  }
  return rows
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim()
    if (h.includes('timestamp')) map['timestamp'] = i
    else if (h.includes('부모님') || h.includes("parent")) map['parentName'] = i
    else if (h.includes('학생') || h.includes("student")) map['studentName'] = i
    else if (h.includes('이메일') || h.includes('email')) map['email'] = i
    else if (h.includes('전화') || h.includes('phone')) map['phone'] = i
    else if (h.includes('학교') || h.includes('school')) map['school'] = i
    else if (h.includes('학년') || h.includes('grade')) map['grade'] = i
    else if (h.includes('국가') || h.includes('country') || h.includes('region')) map['region'] = i
    else if (h.includes('관심') || h.includes('interest')) map['interestArea'] = i
    else if (h.includes('유입') || h.includes('found us')) map['referralSource'] = i
  }
  return map
}

async function fetchSheetTab(tabName: string): Promise<SheetRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`
  const res = await fetch(url)
  if (!res.ok) return []
  const csvText = await res.text()
  const rows = parseCSV(csvText)
  if (rows.length < 2) return []

  const hMap = buildHeaderMap(rows[0])
  if (hMap['phone'] === undefined && hMap['parentName'] === undefined) return []

  const result: SheetRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const phone = normalizePhone(r[hMap['phone']] || '')
    if (!phone) continue
    const parentName = (r[hMap['parentName']] || '').trim()
    if (!parentName) continue

    result.push({
      timestamp: r[hMap['timestamp']] || '',
      parentName,
      studentName: (r[hMap['studentName']] || '').trim(),
      email: (r[hMap['email']] || '').trim(),
      phone,
      school: (r[hMap['school']] || '').trim(),
      grade: (r[hMap['grade']] || '').trim(),
      region: (r[hMap['region']] || '').trim(),
      interestArea: (r[hMap['interestArea']] || '').trim(),
      referralSource: (r[hMap['referralSource']] || '').trim(),
      sheetTab: tabName,
    })
  }
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch existing phone numbers from leads to avoid duplicates
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('phone')
    const existingPhones = new Set(
      (existingLeads || []).map((l: { phone: string }) => normalizePhone(l.phone)),
    )

    let totalFetched = 0
    let inserted = 0
    const errors: string[] = []
    const tabResults: { tab: string; fetched: number; new: number }[] = []

    for (const tab of SHEET_TABS) {
      try {
        const rows = await fetchSheetTab(tab)
        totalFetched += rows.length
        const newRows = rows.filter(r => !existingPhones.has(r.phone))

        if (newRows.length > 0) {
          const inserts = newRows.map(r => ({
            lead_date: r.timestamp
              ? (() => { const d = new Date(r.timestamp); return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0] })()
              : new Date().toISOString().split('T')[0],
            parent_name: r.parentName,
            student_name: r.studentName,
            email: r.email || null,
            phone: r.phone,
            current_school: r.school,
            grade: r.grade,
            region: r.region,
            interest_area: r.interestArea,
            source_channel: `SNS - ${r.sheetTab}`,
            memo: r.referralSource ? `유입경로: ${r.referralSource}` : '',
            pipeline_stage: 'new_lead',
          }))

          const { error: insertErr } = await supabase
            .from('leads')
            .insert(inserts)
          if (insertErr) {
            errors.push(`${tab}: ${insertErr.message}`)
          } else {
            inserted += newRows.length
            newRows.forEach(r => existingPhones.add(r.phone))
          }
        }

        tabResults.push({ tab, fetched: rows.length, new: newRows.length })
      } catch (err) {
        errors.push(`${tab}: ${err}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tabs: SHEET_TABS.length,
        totalFetched,
        inserted,
        tabResults: tabResults.filter(t => t.new > 0),
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server error: ${err}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
