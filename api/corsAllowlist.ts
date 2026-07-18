/**
 * Re-export JS allowlist so Vite/TS consumers keep a .ts import path if needed.
 * Canonical implementation: ./corsAllowlist.js (unit-tested).
 */
export {
  ALLOWED_PROXY_HOSTS,
  isAllowedProxyTarget,
  normalizeProxyTarget,
} from './corsAllowlist.js';
