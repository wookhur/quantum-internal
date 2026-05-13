#!/usr/bin/env node
/**
 * Contract Migration: Google Sheets "Existing Contract" tab → Supabase contracts table
 */

const SPREADSHEET_ID = '1KqsAGc8jdzKRPy7aMVGdNVywT33LOBJOCXSsptnc8lE';
const PROJECT_REF = 'fojabxikzvykkscwckyf';

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
  if (!dateStr || !dateStr.trim()) return null;
  const d = dateStr.trim().split(' ')[0];
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  let [yy, mm, dd] = parts;
  if (yy.length === 2) yy = '20' + yy;
  mm = mm.padStart(2, '0');
  dd = dd.padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function determineStatus(expiryDateStr) {
  if (!expiryDateStr) return 'active';
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiry < now) return 'expired';
  if (expiry < thirtyDaysFromNow) return 'expiring_soon';
  return 'active';
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Contract Migration: Google Sheets → Supabase ===\n');

  // 1. Fetch data
  console.log('1. Fetching spreadsheet data...');
  const csv = await fetchCSV('Existing Contract');
  console.log(`   CSV: ${csv.length} chars`);

  // 2. Parse
  console.log('\n2. Parsing CSV...');
  const rows = parseCSV(csv);
  console.log(`   Rows: ${rows.length}`);

  // 3. Build SQL
  console.log('\n3. Building SQL...');
  const sqlValues = [];
  let skipped = 0;

  for (const row of rows) {
    const [contractor, student, school, grade, address, phone, contractDate, expiryDate, salesRep, serviceRep] = row;

    // Skip empty rows (no contractor AND no student)
    if ((!contractor || !contractor.trim()) && (!student || !student.trim())) {
      skipped++;
      continue;
    }

    const parsedContractDate = parseDate(contractDate);
    const parsedExpiryDate = parseDate(expiryDate);
    const status = determineStatus(parsedExpiryDate);

    // For rows with no contractor (sub-students under same parent), use student name as contractor
    const contractorName = contractor?.trim() || student?.trim() || '';
    if (!contractorName) { skipped++; continue; }

    sqlValues.push(
      `(${esc(contractorName)}, ${esc(student)}, ${esc(school)}, ${esc(grade)}, ${esc(address)}, ${esc(phone)}, ${parsedContractDate ? esc(parsedContractDate) : 'NULL'}, ${parsedExpiryDate ? esc(parsedExpiryDate) : 'NULL'}, '${status}')`
    );
  }

  console.log(`   Valid contracts: ${sqlValues.length}`);
  console.log(`   Skipped: ${skipped}`);

  // 4. Clear existing contracts
  console.log('\n4. Clearing existing contracts...');
  await execSQL('DELETE FROM payment_installments;');
  console.log('   Deleted payment_installments');
  await execSQL('DELETE FROM contracts;');
  console.log('   Deleted contracts');

  // 5. Insert
  console.log('\n5. Inserting contracts...');
  const sql = `INSERT INTO contracts (contractor_name, student_name, school_name, grade_at_contract, address, phone, contract_date, expiry_date, status) VALUES\n${sqlValues.join(',\n')};`;

  try {
    await execSQL(sql);
    console.log(`   Inserted ${sqlValues.length} contracts`);
  } catch (err) {
    console.error('   Batch insert failed:', err.message);
    // Try one by one
    let inserted = 0;
    for (let i = 0; i < sqlValues.length; i++) {
      const singleSql = `INSERT INTO contracts (contractor_name, student_name, school_name, grade_at_contract, address, phone, contract_date, expiry_date, status) VALUES\n${sqlValues[i]};`;
      try {
        await execSQL(singleSql);
        inserted++;
      } catch (e2) {
        console.error(`   Row ${i + 1} failed:`, e2.message);
      }
    }
    console.log(`   Inserted ${inserted}/${sqlValues.length} individually`);
  }

  // 6. Verify
  console.log('\n6. Verifying...');
  const count = await execSQL('SELECT COUNT(*) as cnt FROM contracts;');
  console.log(`   Total contracts in DB: ${count[0]?.cnt}`);

  const statusDist = await execSQL('SELECT status, COUNT(*) as cnt FROM contracts GROUP BY status ORDER BY cnt DESC;');
  console.log('   By status:', statusDist);

  console.log('\n=== Contract migration complete! ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
