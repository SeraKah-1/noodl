/**
 * Optional CORS proxy for OpenAI-compatible providers that block browser CORS.
 * NOT an open relay: host allowlist only; no wildcard origin for credentialed abuse.
 */
import { isAllowedProxyOrigin, isAllowedProxyTarget, normalizeProxyTarget } from './corsAllowlist.js';

const MAX_REQUEST_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 6_000_000;

function allowedOrigin(req: any): string | null {
  const origin = (req.headers?.origin || req.headers?.Origin || '') as string;
  if (!origin) return null;
  const requestHost = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  if (isAllowedProxyOrigin(origin, requestHost)) return origin;
  return null;
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('Upstream response is too large');
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Upstream response is too large');
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export default async function handler(req: any, res: any) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, HTTP-Referer, X-Title, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    if (!origin) return res.status(403).json({ error: 'Origin not allowed' });
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!origin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return res.status(413).json({ error: 'Request body is too large' });
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

    if (bodyData && new TextEncoder().encode(bodyData).byteLength > MAX_REQUEST_BYTES) {
      return res.status(413).json({ error: 'Request body is too large' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 95_000);
    let response: Response;
    let responseText: string;
    try {
      response = await fetch(normalized, {
        method: 'POST',
        headers: forwardHeaders,
        body: bodyData,
        signal: controller.signal,
      });
      responseText = await readBoundedResponse(response);
    } finally {
      clearTimeout(timeout);
    }

    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.send(responseText);
  } catch (err: any) {
    console.error('[Noodl CORS Proxy Error]:', err);
    return res.status(500).json({ error: err.message || 'CORS Proxy Error' });
  }
}
