// Vercel Serverless Function: CORS Proxy for 9Router & External LLM Providers in MikirEXP
export default async function handler(req: any, res: any) {
  // 1. Set wildcard CORS headers for browser preflight & cross-origin access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');

  // 2. Handle HTTP OPTIONS preflight immediately with 200 OK
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Extract target URL from query param (url) or pathname
  let targetUrl = req.query?.url;
  if (!targetUrl) {
    const rawUrl = req.url || '';
    targetUrl = rawUrl.replace(/^\/api\/cors-proxy\/?(\?url=)?/, '').replace(/^\/cors-proxy\//, '');
  }

  if (!targetUrl || targetUrl === '/' || targetUrl === '/api/cors-proxy') {
    return res.status(200).json({ status: 'online', message: '9Router & MikirEXP CORS Proxy active' });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const forwardHeaders: Record<string, string> = {};
    const headersToForward = ['authorization', 'content-type', 'http-referer', 'x-title', 'accept'];
    for (const h of headersToForward) {
      if (req.headers[h]) forwardHeaders[h] = req.headers[h];
    }
    if (!forwardHeaders['content-type']) forwardHeaders['content-type'] = 'application/json';

    const bodyData = ['GET', 'HEAD'].includes(req.method) 
      ? undefined 
      : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: bodyData,
    });

    const responseText = await response.text();
    res.status(response.status);

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    return res.send(responseText);
  } catch (err: any) {
    console.error('[MikirEXP CORS Proxy Error]:', err);
    return res.status(500).json({ error: err.message || 'CORS Proxy Error' });
  }
}
