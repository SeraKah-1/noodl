/**
 * Client helper: verify Turnstile token via serverless endpoint.
 * Secret key never leaves the server.
 */

export type TurnstileVerifyResult = {
  ok: boolean;
  message?: string;
  /** When API is missing (local without vercel), allow soft-pass for UX */
  soft?: boolean;
};

export async function verifyTurnstileToken(token: string | null | undefined): Promise<TurnstileVerifyResult> {
  const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();
  if (!siteKey) {
    return { ok: true, soft: true, message: 'Turnstile not configured' };
  }
  if (!token) {
    return { ok: false, message: 'Complete the human check first' };
  }

  try {
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    // Local vite without serverless: endpoint 404 → soft allow with warning
    if (res.status === 404) {
      console.warn('[turnstile] /api/verify-turnstile missing — soft pass (use Vercel or `vercel dev`)');
      return { ok: true, soft: true, message: 'Verify endpoint unavailable (dev soft-pass)' };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return {
        ok: false,
        message: data.error || data['error-codes']?.join?.(', ') || 'Human check failed',
      };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Could not verify human check' };
  }
}
