/**
 * Robust JSON extraction from LLM text (markdown fences, trailing junk, etc.).
 */

export function stripCodeFences(text: string): string {
  let s = (text || '').trim();
  if (s.includes('<thinking>')) {
    s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }
  if (s.includes('```')) {
    s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  }
  return s;
}

export function extractJsonObject(text: string): any {
  const s = stripCodeFences(text);
  if (!s) throw new Error('Empty AI response (expected JSON object)');

  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object found in AI response');
  }

  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e: any) {
    // Try to repair common trailing-comma issues
    const repaired = slice
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error(`Invalid JSON from AI: ${e?.message || 'parse failed'}`);
    }
  }
}

export function extractJsonArray(text: string): any[] {
  const s = stripCodeFences(text);
  if (!s) throw new Error('Empty AI response (expected JSON array)');

  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.concepts)) return v.concepts;
    if (v && Array.isArray(v.items)) return v.items;
    if (v && Array.isArray(v.questions)) return v.questions;
  } catch {
    /* fall through */
  }

  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end <= start) {
    throw new Error('No JSON array found in AI response');
  }
  const slice = s.slice(start, end + 1);
  try {
    const v = JSON.parse(slice);
    if (!Array.isArray(v)) throw new Error('Parsed value is not an array');
    return v;
  } catch (e: any) {
    throw new Error(`Invalid JSON array from AI: ${e?.message || 'parse failed'}`);
  }
}
