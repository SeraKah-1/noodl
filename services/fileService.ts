import { fetchWithTimeout, readTextWithLimit } from './requestService';

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export const fetchUrlContent = async (value: string): Promise<string> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a complete http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are supported.');
  if (url.hostname.includes('youtube.com') || url.hostname === 'youtu.be') {
    throw new Error('YouTube blocks private browser extraction. Paste the transcript as text instead.');
  }

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'text/html, text/plain' } }, 20_000);
    if (!response.ok) throw new Error(`URL returned HTTP ${response.status}.`);
    const html = await readTextWithLimit(response, MAX_PAGE_BYTES);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/plain')) return html.trim();

    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, footer, header, aside, form').forEach((node) => node.remove());
    const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('The page did not contain readable text.');
    return text;
  } catch (error: any) {
    if (error?.name === 'TypeError') {
      throw new Error('This site blocks direct browser access (CORS). Paste its text or upload a file instead.');
    }
    throw new Error(error?.message || 'Could not read this URL.');
  }
};
