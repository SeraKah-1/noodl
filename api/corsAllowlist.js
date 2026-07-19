/**
 * Host allowlist for the optional CORS proxy (not an open relay).
 * Pure ESM — importable from Node tests and from cors-proxy.ts.
 */

/** Explicit LLM-related hosts Noodl may proxy. */
export const ALLOWED_PROXY_HOSTS = [
  'openrouter.ai',
  'api.openrouter.ai',
  'api.openai.com',
  'api.groq.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'aiplatform.googleapis.com',
  '9router.com',
  'api.9router.com',
];

/**
 * Returns true only for https (or http localhost) targets whose hostname
 * exactly matches an allowlisted host.
 */
export function isAllowedProxyTarget(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  let href = rawUrl.trim();
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) {
    href = 'https://' + href;
  }
  let u;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.protocol === 'http:') {
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'metadata.google.internal' ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return ALLOWED_PROXY_HOSTS.includes(host);
}

export function normalizeProxyTarget(rawUrl) {
  if (!isAllowedProxyTarget(rawUrl)) return null;
  let href = rawUrl.trim();
  if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
  try {
    return new URL(href).toString();
  } catch {
    return null;
  }
}

/** Only allow the app's own origin (plus localhost-to-localhost development). */
export function isAllowedProxyOrigin(origin, requestHost) {
  if (!origin || !requestHost) return false;
  try {
    const u = new URL(origin);
    const normalizedRequestHost = String(requestHost).toLowerCase();
    const originHost = u.host.toLowerCase();
    const localOrigin = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    const localRequest = normalizedRequestHost.startsWith('localhost:') || normalizedRequestHost.startsWith('127.0.0.1:');
    return originHost === normalizedRequestHost || (localOrigin && localRequest);
  } catch {
    return false;
  }
}
