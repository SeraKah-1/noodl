/**
 * Optional CORS proxy for OpenAI-compatible providers that block browser CORS.
 * NOT an open relay: host allowlist only; no wildcard origin for credentialed abuse.
 */
import { isAllowedProxyTarget, normalizeProxyTarget } from './corsAllowlist.js';

function allowedOrigin(req: any): string {
  const origin = (req.headers?.origin || req.headers?.Origin || '') as string;
  // Local dev + same-site production only
  if (!origin) return 'null';
  try {
    const u = new URL(origin);
    if (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname.endsWith('.vercel.app') ||
      u.hostname.endsWith('.noodl.app')
    ) {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return 'null';
}

export default async function handler(req: any, res: any) {
  const origin = allowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, HTTP-Referer, X-Title, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let targetUrl = req.query?.url as string | undefined;
  if (!targetUrl) {
    const rawUrl = req.url || '';
    const q = rawUrl.includes('?') ? new URL(rawUrl, 'http://local').searchParams.get('url') : null;
    targetUrl = q || undefined;
  }

  if (!targetUrl) {
    return res.status(200).json({
      status: 'online',
      message: 'Noodl CORS proxy (allowlisted hosts only)',
    });
  }

  if (!isAllowedProxyTarget(targetUrl)) {
    return res.status(403).json({
      error: 'Target host not allowlisted',
      hint: 'Only known LLM API hosts may be proxied.',
    });
  }

  const normalized = normalizeProxyTarget(targetUrl);
  if (!normalized) {
    return res.status(403).json({ error: 'Invalid or disallowed target URL' });
  }

  try {
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    for (const h of ['authorization', 'content-type', 'http-referer', 'x-title', 'accept']) {
      if (req.headers[h]) forwardHeaders[h] = String(req.headers[h]);
    }

    const bodyData =
      typeof req.body === 'string' ? req.body : req.body != null ? JSON.stringify(req.body) : undefined;

    const response = await fetch(normalized, {
      method: 'POST',
      headers: forwardHeaders,
      body: bodyData,
    });

    const responseText = await response.text();
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.send(responseText);
  } catch (err: any) {
    console.error('[Noodl CORS Proxy Error]:', err);
    return res.status(500).json({ error: err.message || 'CORS Proxy Error' });
  }
}
