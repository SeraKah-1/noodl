import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202607190001_harden_sync_schema.sql', import.meta.url), 'utf8');

function check(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exitCode = 1;
  } else {
    console.log('ok:', message);
  }
}

for (const table of ['user_profiles', 'quizzes', 'library_items', 'srs_items', 'devices', 'sync_state']) {
  check(schema.includes(`alter table public.${table} enable row level security`), `${table} has RLS enabled`);
}

check(schema.includes('unique (user_id, keycard_id, item_id)'), 'SRS uniqueness is scoped to keycard');
check(schema.includes('with (security_invoker = true)'), 'due-count view uses caller RLS');
check(schema.includes('create or replace function private.handle_new_user()'), 'signup trigger function is private');
check(schema.includes('set search_path = \'\''), 'security-definer function has an empty search path');
check(!/grant\s+all\s+on\s+table/i.test(schema), 'schema never grants broad ALL table privileges');
check(/grant select on table public\.quizzes to anon/i.test(schema), 'anonymous access is read-only and quiz-scoped');

for (const policy of ['profiles_update', 'quizzes_update', 'library_update', 'srs_update']) {
  const policyPattern = new RegExp(`create policy ${policy}[\\s\\S]{0,220}using[\\s\\S]{0,120}with check`, 'i');
  check(policyPattern.test(schema), `${policy} has USING and WITH CHECK`);
  check(policyPattern.test(migration), `${policy} hardening is included in migration`);
}

check(migration.includes('unique (user_id, keycard_id, item_id)'), 'migration upgrades SRS uniqueness');
check(migration.includes('alter view public.srs_due_counts set (security_invoker = true)'), 'migration hardens existing due-count view');

if (process.exitCode) process.exit(1);
console.log('\nAll Supabase schema security checks passed');
