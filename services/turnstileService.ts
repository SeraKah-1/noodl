/**
 * Client helper: verify Turnstile token via serverless endpoint.
 * Secret key never leaves the server.
 *
 * Soft-pass rules (so login is not bricked by misconfig):
 * - No site key configured
 * - Verify API 404 (local Vite without Vercel)
 * - Server 500 missing TURNSTILE_SECRET_KEY
 * - Network failure in DEV
 */

export type TurnstileVerifyResult = {
  ok: boolean;
  message?: string;
  /** Soft pass = UI may still proceed; show as warning, not hard block */
  soft?: boolean;
  codes?: string[];
};

const siteKey = () =>
  ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();

export function isTurnstileSiteKeySet(): boolean {
  const k = siteKey();
  return Boolean(k && !k.includes('YOUR_') && k.length > 10);
}

export async function verifyTurnstileToken(
  token: string | null | undefined
): Promise<TurnstileVerifyResult> {
  if (!isTurnstileSiteKeySet()) {
    return { ok: true, soft: true, message: 'Turnstile not configured' };
  }

  if (!token) {
    return { ok: false, message: 'Complete the human check first (wait for the checkbox / success mark).' };
  }

  try {
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    // Local vite without serverless
    if (res.status === 404) {
      console.warn(
        '[turnstile] /api/verify-turnstile missing — soft pass. Deploy API on Vercel or run `vercel dev`.'
      );
      return {
        ok: true,
        soft: true,
        message: 'Verify API missing (dev soft-pass)',
      };
    }

    const data = await res.json().catch(() => ({} as any));
    const codes: string[] = data['error-codes'] || data.errorCodes || [];

    // Server secret not set → don't brick OAuth
    if (
      (res.status === 500 || res.status === 503) &&
      /SECRET|not set|missing-input-secret/i.test(String(data.error || '') + codes.join(' '))
    ) {
      console.warn(
        '[turnstile] Server secret missing — soft pass. Set TURNSTILE_SECRET_KEY on Vercel (must match site key).'
      );
      return {
        ok: true,
        soft: true,
        message:
          'Server Turnstile secret not set (soft-pass). Add TURNSTILE_SECRET_KEY on Vercel.',
        codes,
      };
    }

    if (!res.ok || !data.success) {
      const human = explainTurnstileCodes(codes, data.error);
      // Common domain/key mismatch: soft-pass in DEV only
      if (import.meta.env.DEV && codes.some((c) => /hostname|domain|invalid-input-secret|internal-error/i.test(c))) {
        console.warn('[turnstile] DEV soft-pass after CF error:', codes);
        return { ok: true, soft: true, message: human, codes };
      }
      return {
        ok: false,
        message: human,
        codes,
      };
    }

    return { ok: true };
  } catch (e: any) {
    if (import.meta.env.DEV) {
      console.warn('[turnstile] network error soft-pass (dev)', e);
      return {
        ok: true,
        soft: true,
        message: e?.message || 'Could not reach verify API (dev soft-pass)',
      };
    }
    return { ok: false, message: e?.message || 'Could not verify human check' };
  }
}

function explainTurnstileCodes(codes: string[], fallback?: string): string {
  const c = codes.join(' ').toLowerCase();
  if (/invalid-input-secret|missing-input-secret/.test(c)) {
    return 'Turnstile secret key wrong/missing on server. Set TURNSTILE_SECRET_KEY (pair with site key) on Vercel.';
  }
  if (/invalid-input-response|timeout|duplicate/.test(c)) {
    return 'Challenge expired or already used. Refresh the check and try again.';
  }
  if (/hostname|domain|not-allowed/.test(c)) {
    return 'This site hostname is not allowed for the Turnstile widget. In Cloudflare Dashboard → Turnstile → your widget → add localhost and your Vercel domain.';
  }
  if (/bad-request|internal-error/.test(c)) {
    return 'Cloudflare rejected the challenge. Check site key + allowed hostnames, then reload.';
  }
  if (fallback) return String(fallback);
  if (codes.length) return `Human check failed: ${codes.join(', ')}`;
  return 'Human check failed. Reload and try again.';
}
