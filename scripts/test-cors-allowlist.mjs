/**
 * Unit tests for the shipped api/corsAllowlist.js (real module, no reimplementation).
 */
import {
  ALLOWED_PROXY_HOSTS,
  isAllowedProxyOrigin,
  isAllowedProxyTarget,
  normalizeProxyTarget,
} from '../api/corsAllowlist.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

assert(typeof isAllowedProxyTarget === 'function', 'isAllowedProxyTarget exported');
assert(Array.isArray(ALLOWED_PROXY_HOSTS) && ALLOWED_PROXY_HOSTS.length > 0, 'allowlist non-empty');

// Allow known LLM hosts (real shipped function)
assert(isAllowedProxyTarget('https://openrouter.ai/api/v1/chat/completions') === true, 'openrouter.ai allowed');
assert(isAllowedProxyTarget('https://api.openai.com/v1/chat/completions') === true, 'api.openai.com allowed');
assert(isAllowedProxyTarget('https://api.groq.com/openai/v1/chat/completions') === true, 'api.groq.com allowed');
assert(isAllowedProxyTarget('api.anthropic.com/v1/messages') === true, 'anthropic host without scheme allowed');

// Deny open-relay / SSRF-ish targets
assert(isAllowedProxyTarget('https://evil.example.com/steal') === false, 'random host denied');
assert(isAllowedProxyTarget('https://169.254.169.254/latest/meta-data/') === false, 'link-local not allowlisted');
assert(isAllowedProxyTarget('http://192.168.1.1/') === false, 'private http denied');
assert(isAllowedProxyTarget('https://metadata.google.internal/') === false, 'GCP metadata denied');
assert(isAllowedProxyTarget('') === false, 'empty denied');
assert(isAllowedProxyTarget('not a url') === false, 'garbage denied');

const norm = normalizeProxyTarget('openrouter.ai/api/v1');
assert(!!norm && norm.startsWith('https://openrouter.ai/'), 'normalize adds https for allowlisted host');
assert(normalizeProxyTarget('https://evil.com') === null, 'normalize rejects non-allowlisted');
assert(isAllowedProxyOrigin('https://noodl.example', 'noodl.example'), 'same origin accepted');
assert(isAllowedProxyOrigin('http://localhost:5173', 'localhost:3000'), 'localhost dev origin accepted');
assert(!isAllowedProxyOrigin('https://attacker.vercel.app', 'noodl.vercel.app'), 'different Vercel project denied');
assert(!isAllowedProxyOrigin('', 'noodl.example'), 'missing origin denied');

if (process.exitCode) {
  console.error('\nSome cors allowlist tests FAILED');
  process.exit(1);
}
console.log('\nAll cors allowlist tests passed');
