/**
 * Data migration script: old Supabase → new Supabase
 *
 * Usage:
 *   OLD_URL=https://ekjiutpaltcimkzutagt.supabase.co \
 *   OLD_SERVICE_KEY=<old-service-role-key> \
 *   NEW_URL=https://ivzfsahgobhaomvltkrg.supabase.co \
 *   NEW_SERVICE_KEY=<new-service-role-key> \
 *   node scripts/migrate-data.mjs
 *
 * Both service role keys are found in:
 *   Supabase Dashboard → Settings → API → service_role (secret key)
 *
 * NOTE: Service role keys bypass RLS — keep them private and never commit them.
 */

import { createClient } from '@supabase/supabase-js';

const OLD_URL      = process.env.OLD_URL;
const OLD_KEY      = process.env.OLD_SERVICE_KEY;
const NEW_URL      = process.env.NEW_URL;
const NEW_KEY      = process.env.NEW_SERVICE_KEY;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Missing required environment variables.');
  console.error('Required: OLD_URL, OLD_SERVICE_KEY, NEW_URL, NEW_SERVICE_KEY');
  process.exit(1);
}

const oldDb = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

// Tables in dependency order (parents before children)
const TABLES = [
  'users',
  'service_requests',
  'counter_proposals',
  'service_request_notifications',
];

async function fetchAll(client, table) {
  const { data, error } = await client.from(table).select('*');
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return data ?? [];
}

async function upsertAll(client, table, rows) {
  if (rows.length === 0) {
    console.log(`  ${table}: no rows to insert`);
    return;
  }

  // Insert in batches of 500 to avoid request size limits
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await client.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Failed to upsert ${table} (batch ${i}): ${error.message}`);
    inserted += batch.length;
  }
  console.log(`  ${table}: ${inserted} row(s) copied`);
}

async function migrate() {
  console.log('Starting data migration...\n');
  console.log(`  Source: ${OLD_URL}`);
  console.log(`  Target: ${NEW_URL}\n`);

  for (const table of TABLES) {
    process.stdout.write(`Reading ${table}...`);
    const rows = await fetchAll(oldDb, table);
    process.stdout.write(` ${rows.length} row(s) → writing...`);
    await upsertAll(newDb, table, rows);
  }

  console.log('\nMigration complete.');
}

migrate().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
