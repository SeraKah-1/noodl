/**
 * Structural + behavior checks for critical review fixes.
 * Reads real source files (no hard-coded "fixed" without grepping ship path).
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const mo = readFileSync(join(root, 'components/MaterialOverview.tsx'), 'utf8');
ok(!mo.includes('\\${style.text}'), 'MaterialOverview has no escaped \\${style.text}');
ok(
  /className=\{`text-2xl font-black \$\{style\.text\}`\}/.test(mo) ||
    mo.includes('className={`text-2xl font-black ${style.text}`}'),
  'MaterialOverview interpolates style.text in className'
);

const app = readFileSync(join(root, 'App.tsx'), 'utf8');
ok(!app.includes('unsubQuizzes'), 'App.tsx has no unsubQuizzes symbol');
ok(app.includes('onSignedOut()'), 'App cleanup uses onSignedOut');
ok(!app.includes('isAiAvailableWithoutUserKey'), 'App does not pretend Vertex free path');

const proxy = readFileSync(join(root, 'api/cors-proxy.ts'), 'utf8');
ok(!/Access-Control-Allow-Origin',\s*'\*'/.test(proxy), 'CORS proxy is not Allow-Origin *');
ok(proxy.includes('isAllowedProxyTarget'), 'CORS proxy uses allowlist');
ok(proxy.includes('403'), 'CORS proxy returns 403 for bad hosts');

const gemini = readFileSync(join(root, 'services/geminiService.ts'), 'utf8');
ok(!gemini.includes('getFirebaseVertexAIModel'), 'callAI does not call getFirebaseVertexAIModel');
ok(
  gemini.includes('bring-your-own-key') || gemini.includes('BYOK') || gemini.includes('API key missing'),
  'callAI ends with clear missing-key / BYOK error'
);

const pkg = readFileSync(join(root, 'package.json'), 'utf8');
const supabaseServerHits = (pkg.match(/"@supabase\/server"/g) || []).length;
ok(supabaseServerHits <= 1, `package.json @supabase/server appears ≤1 time (got ${supabaseServerHits})`);
// Prefer zero — we removed it
ok(supabaseServerHits === 0, 'package.json has no @supabase/server (duplicate removed)');

const di = readFileSync(join(root, 'components/DynamicIsland.tsx'), 'utf8');
ok(!di.includes('const db = null'), 'DynamicIsland has no Firebase db=null stub');

const cfg = readFileSync(join(root, 'components/ConfigScreen.tsx'), 'utf8');
ok(
  !cfg.includes('isVertexBackendAvailable'),
  'ConfigScreen has zero isVertexBackendAvailable refs (BYOK only)'
);
ok(
  !cfg.includes('VITE_USE_FIREBASE_VERTEX_AI') && !cfg.includes('VITE_USE_VERTEX_EXPRESS'),
  'ConfigScreen does not gate on Vertex env free-path flags'
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll review-fix structural tests passed');
