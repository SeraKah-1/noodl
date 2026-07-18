#!/usr/bin/env node
/**
 * Apply supabase/schema.sql to the linked project.
 *
 * Option A — Management API (needs personal access token):
 *   export SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/apply-schema.mjs
 *
 * Option B — paste manually:
 *   Dashboard → SQL Editor → paste supabase/schema.sql → Run
 *
 * Project ref default: xikribjyvqrilgbaxdel
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const schemaPath = resolve(root, 'supabase/schema.sql');
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
  'xikribjyvqrilgbaxdel';
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_TOKEN;

if (!existsSync(schemaPath)) {
  console.error('Missing', schemaPath);
  process.exit(1);
}

const sql = readFileSync(schemaPath, 'utf8');

if (!token) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Apply Noodl schema (one-time)                               ║
╚══════════════════════════════════════════════════════════════╝

1. Open SQL Editor:
   https://supabase.com/dashboard/project/${ref}/sql/new

2. Paste the entire file:
   supabase/schema.sql

3. Click Run.

4. Auth providers (GitHub / Google):
   https://supabase.com/dashboard/project/${ref}/auth/providers

5. Redirect URLs (add your deploys):
   http://localhost:5173/
   https://YOUR_VERCEL_DOMAIN/

6. Realtime: schema already tries to add tables to publication.
   Confirm under Database → Publications → supabase_realtime

Optional auto-apply with Management API:
  export SUPABASE_ACCESS_TOKEN=sbp_...   # Account → Access Tokens
  node scripts/apply-schema.mjs
`);
  process.exit(0);
}

const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
console.log('Applying schema to', ref, '…');

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error('Failed', res.status, text.slice(0, 800));
  process.exit(1);
}
console.log('Schema applied OK.');
console.log(text.slice(0, 400));
