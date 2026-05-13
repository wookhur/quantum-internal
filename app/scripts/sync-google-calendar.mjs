import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://fojabxikzvykkscwckyf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvamFieGlrenZ5a2tzY3dja3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjAyMzUsImV4cCI6MjA5MTY5NjIzNX0.IIYiLMleFjC_Q2kkFkiAxTNvbnCXiNzknDcfrQs9lio';

const ADMIN_EMAIL = 'wookhur@quantumadmissions.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const EVENT_FILES = [
  '/tmp/samhan_events.json',
  '/tmp/seongwon_events.json',
  '/tmp/consulting_events.json',
];

const BATCH_SIZE = 500;

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is not set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Authenticate
  console.log(`Signing in as ${ADMIN_EMAIL}...`);
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

  if (authError) {
    console.error('Authentication failed:', authError.message);
    process.exit(1);
  }
  console.log('Authenticated successfully.');

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const filePath of EVENT_FILES) {
    console.log(`\nProcessing ${filePath}...`);

    let events;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      events = JSON.parse(raw);
    } catch (err) {
      console.warn(`  Skipping ${filePath}: ${err.message}`);
      totalSkipped++;
      continue;
    }

    if (!Array.isArray(events) || events.length === 0) {
      console.log(`  No events found in ${filePath}.`);
      continue;
    }

    console.log(`  Found ${events.length} events.`);

    // Process in batches
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);

      const rows = batch.map((e) => ({
        google_event_id: e.google_event_id,
        calendar_id: e.calendar_id,
        summary: e.summary,
        description: e.description || null,
        start_time: e.start_time,
        end_time: e.end_time,
        is_all_day: e.is_all_day ?? false,
        location: e.location || null,
        creator_email: e.creator_email || null,
        status: e.status || 'confirmed',
        conference_url: e.conference_url || null,
        synced_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('google_calendar_events')
        .upsert(rows, { onConflict: 'google_event_id' });

      if (error) {
        console.error(
          `  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`,
          error.message
        );
        totalErrors += batch.length;
      } else {
        totalInserted += batch.length;
        console.log(
          `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: upserted ${batch.length} events.`
        );
      }
    }
  }

  console.log('\n=== Sync Complete ===');
  console.log(`  Upserted: ${totalInserted}`);
  console.log(`  Files skipped: ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
