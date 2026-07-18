/**
 * Vercel Serverless: verify Cloudflare Turnstile token.
 * Env (server only, NO VITE_ prefix):
 *   TURNSTILE_SECRET_KEY=0x4A...
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const secret = (
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    ''
  ).trim();
  if (!secret) {
    // 503 so clients can soft-pass instead of hard-failing all logins
    return res.status(503).json({
      success: false,
      error: 'TURNSTILE_SECRET_KEY not set on server',
      'error-codes': ['missing-input-secret'],
    });
  }

  let token = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    token = (body.token || body['cf-turnstile-response'] || '').trim();
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' });
  }

  const ip =
    (req.headers['cf-connecting-ip'] as string) ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined;

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);

    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await cf.json();

    if (!data.success) {
      return res.status(403).json({
        success: false,
        error: 'Turnstile verification failed',
        'error-codes': data['error-codes'] || [],
      });
    }

    return res.status(200).json({
      success: true,
      hostname: data.hostname,
      challenge_ts: data.challenge_ts,
    });
  } catch (e: any) {
    return res.status(502).json({
      success: false,
      error: e?.message || 'Upstream Turnstile error',
    });
  }
}
