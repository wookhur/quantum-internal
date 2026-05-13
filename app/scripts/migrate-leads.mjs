#!/usr/bin/env node
/**
 * Data Migration Script: Google Sheets → Supabase
 * Imports leads from the QA Marketing/Sales spreadsheet into the leads table.
 */

const SPREADSHEET_ID = '1KqsAGc8jdzKRPy7aMVGdNVywT33LOBJOCXSsptnc8lE';
const PROJECT_REF = 'fojabxikzvykkscwckyf';

// Supabase Management API token (from dashboard localStorage)
const MGMT_TOKEN = process.env.SB_TOKEN;
if (!MGMT_TOKEN) {
  console.error('ERROR: Set SB_TOKEN environment variable');
  process.exit(1);
}

// ─── CSV Fetcher ────────────────────────────────────────────────────────────

async function fetchCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${sheetName}: ${res.status}`);
  return res.text();
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────

function parseCSV(csv) {
  const lines = csv.split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = [];
    let inQuote = false;
    let current = '';
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    parts.push(current);
    rows.push(parts);
  }
  return rows;
}

// ─── SQL Executor ───────────────────────────────────────────────────────────

async function execSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`SQL error: ${JSON.stringify(data)}`);
  return data;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s || !s.trim()) return 'NULL';
  return "'" + s.trim().replace(/'/g, "''") + "'";
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = dateStr.split(' ')[0]; // remove time part
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  let year = parts[2];
  if (year.length === 2) year = '20' + year;
  return `${year}-${month}-${day}`;
}

function mapSourceChannel(raw) {
  if (!raw) return 'Instagram';
  const s = raw.trim().toLowerCase();
  if (s.includes('instagram') || s.includes('insta') || s.includes('ig')) return 'Instagram';
  if (s.includes('카카오') || s.includes('katalk') || s.includes('kakao')) return '카카오톡';
  if (s.includes('gia') && s.includes('seminar')) return 'GIA Seminar';
  if (s.includes('서울') && s.includes('세미나')) return '서울 세미나';
  if (s.includes('부산') && s.includes('세미나')) return '부산 세미나';
  if (s.includes('제주') && s.includes('세미나')) return '제주 세미나';
  if (s.includes('소개') || s.includes('referral')) return '소개';
  if (s.includes('웹사이트') || s.includes('website') || s.includes('web')) return '웹사이트';
  if (s.includes('유튜브') || s.includes('youtube')) return '유튜브';
  if (s.includes('네이버') || s.includes('naver')) return '네이버';
  if (s.includes('블로그') || s.includes('blog')) return '블로그';
  if (s.includes('세미나') || s.includes('seminar') || s.includes('웨비나') || s.includes('webinar')) return '세미나';
  if (s.includes('ec&bio') || s.includes('ecbio')) return 'EC&BIO Webinar';
  return raw.trim() || 'Instagram';
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Lead Migration: Google Sheets → Supabase ===\n');

  // 1. Fetch data
  console.log('1. Fetching spreadsheet data...');
  const [rawCSV, contractCSV] = await Promise.all([
    fetchCSV('Raw'),
    fetchCSV('Existing Contract'),
  ]);
  console.log(`   Raw CSV: ${rawCSV.length} chars`);
  console.log(`   Contract CSV: ${contractCSV.length} chars`);

  // 2. Parse
  console.log('\n2. Parsing CSV data...');
  const rawRows = parseCSV(rawCSV);
  const contractRows = parseCSV(contractCSV);
  console.log(`   Raw rows: ${rawRows.length}`);
  console.log(`   Contract rows: ${contractRows.length}`);

  // 3. Build contract parent names set
  const contractParents = new Set();
  for (const c of contractRows) {
    const name = (c[0] || '').replace(/\(모\)|\(부\)|\(부\/모\)/g, '').trim();
    if (name) contractParents.add(name);
  }
  console.log(`   Contract parents: ${contractParents.size} (${[...contractParents].join(', ')})`);

  // 4. Map pipeline stage
  function getStage(colA, parentName) {
    const cleanName = parentName.replace(/\(모\)|\(부\)/g, '').trim();
    if (contractParents.has(cleanName)) return 'contracted';
    switch (colA.trim()) {
      case '1': return 'first_consultation';
      case '2': return 'second_consultation';
      case '3': return 'third_consultation';
      case '4': return 'third_consultation';
      default: return 'new_lead';
    }
  }

  // 5. Build SQL INSERT values
  console.log('\n3. Building SQL...');
  const sqlValues = [];
  let skipped = 0;

  for (const row of rawRows) {
    const [colA, date, parent, student, email, phone, school, grade, region, interest, channel, memo, reqAction] = row;
    if (!parent || !parent.trim()) { skipped++; continue; }
    const leadDate = parseDate(date);
    if (!leadDate) { skipped++; continue; }

    const stage = getStage(colA || '', parent);
    const sourceChannel = mapSourceChannel(channel);
    // phone has NOT NULL constraint — use empty string if missing
    const phoneVal = (phone && phone.trim()) ? esc(phone) : "''";

    sqlValues.push(
      `(${esc(leadDate)}, ${esc(parent)}, ${esc(student)}, ${esc(email)}, ${phoneVal}, ${esc(school)}, ${esc(grade)}, ${esc(region)}, ${esc(interest)}, ${esc(sourceChannel)}, ${esc(memo)}, ${esc(reqAction)}, '${stage}')`
    );
  }

  console.log(`   Valid leads: ${sqlValues.length}`);
  console.log(`   Skipped: ${skipped}`);

  // Stage distribution
  const stageCounts = {};
  for (const row of rawRows) {
    const [colA, date, parent] = row;
    if (!parent?.trim() || !parseDate(date)) continue;
    const stage = getStage(colA || '', parent);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }
  console.log('   Stage distribution:', stageCounts);

  // 6. Clean existing data
  console.log('\n4. Cleaning existing data...');
  await execSQL('DELETE FROM lead_activities;');
  console.log('   Deleted lead_activities');
  await execSQL('DELETE FROM leads;');
  console.log('   Deleted leads');

  // 7. Insert in batches
  console.log('\n5. Inserting leads...');
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < sqlValues.length; i += BATCH_SIZE) {
    const batch = sqlValues.slice(i, i + BATCH_SIZE);
    const sql = `INSERT INTO leads (lead_date, parent_name, student_name, email, phone, current_school, grade, region, interest_area, source_channel, memo, required_action, pipeline_stage) VALUES\n${batch.join(',\n')};`;

    try {
      await execSQL(sql);
      inserted += batch.length;
      console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${batch.length} rows (total: ${inserted})`);
    } catch (err) {
      console.error(`   Batch ${Math.floor(i / BATCH_SIZE) + 1} FAILED:`, err.message);
      // Try inserting one by one to find the problematic row
      for (let j = 0; j < batch.length; j++) {
        const singleSql = `INSERT INTO leads (lead_date, parent_name, student_name, email, phone, current_school, grade, region, interest_area, source_channel, memo, required_action, pipeline_stage) VALUES\n${batch[j]};`;
        try {
          await execSQL(singleSql);
          inserted++;
        } catch (e2) {
          console.error(`   Row ${i + j + 1} failed:`, e2.message);
        }
      }
    }
  }

  // 8. Verify
  console.log('\n6. Verifying...');
  const countResult = await execSQL('SELECT COUNT(*) as cnt FROM leads;');
  console.log(`   Total leads in DB: ${countResult[0]?.cnt}`);

  const stageResult = await execSQL('SELECT pipeline_stage, COUNT(*) as cnt FROM leads GROUP BY pipeline_stage ORDER BY cnt DESC;');
  console.log('   By stage:', stageResult);

  console.log('\n=== Migration complete! ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
