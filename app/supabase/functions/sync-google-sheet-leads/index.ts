// Supabase Edge Function: sync-google-sheet-leads
// Reads all tabs from the Survey Response DB Google Sheet and inserts
// new leads into the leads table, deduplicating by phone number.
// The sheet tab name becomes the source_channel for each lead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPREADSHEET_ID = '18p0ZJDbhAk_mhEqUQgDRGETCzyt1ogBWFv_cqqwCQ8Y'

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

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

function parseCSV(csv: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  const lines: string[] = []

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
    rows.push(parseCSVLine(line))
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

async function fetchSheetTab(
  apiKey: string,
  tabName: string,
): Promise<SheetRow[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(tabName)}?key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const values: string[][] = data.values || []
  if (values.length < 2) return []

  const hMap = buildHeaderMap(values[0])
  if (hMap['phone'] === undefined && hMap['parentName'] === undefined) return []

  const rows: SheetRow[] = []
  for (let i = 1; i < values.length; i++) {
    const r = values[i]
    const phone = normalizePhone(r[hMap['phone']] || '')
    if (!phone) continue
    const parentName = (r[hMap['parentName']] || '').trim()
    if (!parentName) continue

    rows.push({
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
  return rows
}

async function getSheetTabs(apiKey: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return (data.sheets || []).map((s: { properties: { title: string } }) => s.properties.title)
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

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('YOUTUBE_API_KEY') || ''
    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get all sheet tabs
    const tabs = await getSheetTabs(googleApiKey)
    if (tabs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Could not read sheet tabs. Check API key and sheet sharing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Fetch existing phone numbers from leads to avoid duplicates
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('phone')
    const existingPhones = new Set(
      (existingLeads || []).map((l: { phone: string }) => normalizePhone(l.phone)),
    )

    // 3. Fetch all tabs and collect new rows
    let totalFetched = 0
    let inserted = 0
    const errors: string[] = []
    const tabResults: { tab: string; fetched: number; new: number }[] = []

    for (const tab of tabs) {
      try {
        const rows = await fetchSheetTab(googleApiKey, tab)
        totalFetched += rows.length
        const newRows = rows.filter(r => !existingPhones.has(r.phone))

        if (newRows.length > 0) {
          const inserts = newRows.map(r => ({
            lead_date: r.timestamp
              ? new Date(r.timestamp).toISOString().split('T')[0]
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
        tabs: tabs.length,
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
