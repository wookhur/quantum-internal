#!/usr/bin/env node
/**
 * Contract Migration: Google Sheets "Existing Contract" tab → Supabase contracts table
 * Uses Supabase client (anon key) instead of Management API
 */

import { createClient } from '@supabase/supabase-js';

const SPREADSHEET_ID = '1KqsAGc8jdzKRPy7aMVGdNVywT33LOBJOCXSsptnc8lE';
const SUPABASE_URL = 'https://fojabxikzvykkscwckyf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvamFieGlrenZ5a2tzY3dja3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjAyMzUsImV4cCI6MjA5MTY5NjIzNX0.IIYiLMleFjC_Q2kkFkiAxTNvbnCXiNzknDcfrQs9lio';

// Auth credentials (admin user)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'wookhur@quantumadmissions.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('ERROR: Set ADMIN_PASSWORD environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

  // Auth
  console.log('0. Authenticating...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  console.log('   Authenticated as admin');

  // 1. Fetch data
  console.log('\n1. Fetching spreadsheet data...');
  const csv = await fetchCSV('Existing Contract');
  console.log(`   CSV: ${csv.length} chars`);

  // 2. Parse
  console.log('\n2. Parsing CSV...');
  const rows = parseCSV(csv);
  console.log(`   Rows: ${rows.length}`);

  // 3. Build records
  console.log('\n3. Building records...');
  const records = [];
  let skipped = 0;

  for (const row of rows) {
    const [contractor, student, school, grade, address, phone, contractDate, expiryDate, salesRep, serviceRep] = row;

    // Skip empty rows
    if ((!contractor || !contractor.trim()) && (!student || !student.trim())) {
      skipped++;
      continue;
    }

    const parsedContractDate = parseDate(contractDate);
    const parsedExpiryDate = parseDate(expiryDate);
    const status = determineStatus(parsedExpiryDate);

    const contractorName = contractor?.trim() || student?.trim() || '';
    if (!contractorName) { skipped++; continue; }

    records.push({
      contractor_name: contractorName,
      student_name: (student?.trim()) || '',
      school_name: (school?.trim()) || '',
      grade_at_contract: (grade?.trim()) || null,
      address: (address?.trim()) || null,
      phone: (phone?.trim()) || null,
      contract_date: parsedContractDate,
      expiry_date: parsedExpiryDate,
      status,
    });
  }

  console.log(`   Valid contracts: ${records.length}`);
  console.log(`   Skipped: ${skipped}`);

  // 4. Clear existing contracts
  console.log('\n4. Clearing existing contracts...');
  const { error: delInstErr } = await supabase.from('payment_installments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delInstErr) console.log('   payment_installments delete:', delInstErr.message);
  else console.log('   Cleared payment_installments');

  const { error: delErr } = await supabase.from('contracts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) console.log('   contracts delete:', delErr.message);
  else console.log('   Cleared contracts');

  // 5. Insert
  console.log('\n5. Inserting contracts...');
  const { data, error: insErr } = await supabase.from('contracts').insert(records).select();
  if (insErr) {
    console.error('   Batch insert failed:', insErr.message);
    // Try one by one
    let inserted = 0;
    for (const rec of records) {
      const { error: e } = await supabase.from('contracts').insert(rec);
      if (e) console.error(`   Failed: ${rec.contractor_name} - ${e.message}`);
      else inserted++;
    }
    console.log(`   Inserted ${inserted}/${records.length} individually`);
  } else {
    console.log(`   Inserted ${data.length} contracts`);
  }

  // 6. Verify
  console.log('\n6. Verifying...');
  const { count } = await supabase.from('contracts').select('*', { count: 'exact', head: true });
  console.log(`   Total contracts in DB: ${count}`);

  console.log('\n=== Contract migration complete! ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
