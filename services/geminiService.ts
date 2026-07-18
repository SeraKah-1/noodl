
/**
 * ==========================================
 * GEMINI AI SERVICE (SMART CACHING ARCHITECTURE)
 * ==========================================
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { getFirebaseVertexAIModel } from "../supabase";
type FirebaseGenerationConfig = Record<string, unknown>;
import { Question, QuizMode, ExamStyle, ConceptNode, ConceptPriority, DeepInsightData, ConceptCardData } from "../types";
import { getLocale } from './i18n';

import { 
  getActiveProvider as fetchActiveProvider, 
  getProviderApiKey, 
  getProviderBaseUrl 
} from "./providerService";
import { AiProvider } from "../types";
import { outputLanguageRule, outputLanguageOneLiner } from "./languagePolicy";

export function getActiveProvider(): AiProvider {
  return fetchActiveProvider();
}

// Default model IDs — MUST match the active provider (never force Gemini on OpenRouter).
const DEFAULT_GENERATION_MODEL = 'gemini-2.0-flash';

function defaultModelForProvider(provider: AiProvider): string {
  switch (provider) {
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'openai':
      return 'gpt-4o-mini';
    case 'groq':
      return 'llama-3.3-70b-versatile';
    case 'ninerouter':
      return 'sv/mimo-v2.5-pro';
    case 'anthropic':
      return 'claude-3-5-sonnet-latest';
    case 'custom':
      return 'gpt-4o-mini';
    case 'gemini':
    default:
      return DEFAULT_GENERATION_MODEL;
  }
}

/** Resolve a model id that is valid for the provider. Avoids sending "gemini-*" to OpenRouter. */
function resolveModelName(provider: AiProvider, modelName?: string): string {
  const raw = (modelName || '').trim();
  if (!raw) return defaultModelForProvider(provider);
  if (provider !== 'gemini' && /^gemini/i.test(raw)) {
    console.warn(`[AIService] Model "${raw}" is Gemini-only; falling back for provider=${provider}`);
    return defaultModelForProvider(provider);
  }
  return raw;
}

// Internal helper for AI Call Routing
async function callAI(action: string, payload: any): Promise<any> {
  const { apiKey: customApiKey, modelName, parts, contents, systemInstruction, responseSchema, temperature, maxOutputTokens, provider: explicitProvider } = payload;

  const provider = explicitProvider || getActiveProvider();
  const apiKey = customApiKey || getProviderApiKey(provider);
  const baseUrl = getProviderBaseUrl(provider);
  const resolvedModel = resolveModelName(provider, modelName);

  console.log(`[AIService] Routing ${action} via provider: ${provider} (model: ${resolvedModel})...`);

  // 1. OPENAI-COMPATIBLE PROVIDERS (OpenRouter, OpenAI, Groq, 9Router, Custom REST, Ollama)
  if (provider === 'openai' || provider === 'openrouter' || provider === 'groq' || provider === 'ninerouter' || provider === 'custom') {
    if (!apiKey) {
      throw new Error(`[${provider}] API key missing. Open Settings → AI providers, paste the key for ${provider}, Save.`);
    }
    let endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://noodl.app',
      'X-Title': 'Noodl'
    };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // Extract text from parts / contents (binary PDF/images are Gemini-only for now)
    let userPromptText = '';
    let droppedBinary = false;
    if (parts && Array.isArray(parts)) {
      userPromptText = parts.map((p: any) => {
        if (typeof p === 'string') return p;
        if (p?.text) return p.text;
        if (p?.inlineData) { droppedBinary = true; return ''; }
        return '';
      }).join('\n');
    } else if (contents && Array.isArray(contents)) {
      userPromptText = contents.map((c: any) => {
        if (c.parts && Array.isArray(c.parts)) {
          return c.parts.map((p: any) => {
            if (typeof p === 'string') return p;
            if (p?.text) return p.text;
            if (p?.inlineData) { droppedBinary = true; return ''; }
            return '';
          }).join('\n');
        }
        return c.text || '';
      }).join('\n');
    }

    if (droppedBinary && !userPromptText.trim()) {
      throw new Error(
        `[${provider}] This provider path only accepts text. Paste notes as text/topic, or switch to Gemini for PDF/image upload.`
      );
    }
    if (droppedBinary) {
      console.warn(`[AIService] ${provider}: binary file parts were dropped; using text/topic only.`);
    }

    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: typeof systemInstruction === 'string' ? systemInstruction : (systemInstruction.parts?.[0]?.text || String(systemInstruction)) });
    }
    messages.push({ role: 'user', content: userPromptText || 'Generate a response following the system instructions.' });

    // Cap completion tokens — many OpenRouter/Groq models reject huge max_tokens
    // or truncate mid-JSON, which often surfaces as a late "Smart Overflow" failure.
    const safeMaxTokens = Math.min(
      Math.max(1024, maxOutputTokens || 4096),
      provider === 'groq' ? 8192 : provider === 'openrouter' ? 12000 : 16384
    );

    const reqBody: any = {
      model: resolvedModel,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: safeMaxTokens,
      stream: false // non-stream JSON is more reliable across proxies
    };

    if (responseSchema) {
      // json_object requires a top-level object (not a raw array). Models that
      // ignore this often fail only on large late-stage overflow calls.
      reqBody.response_format = { type: 'json_object' };
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody)
      });
    } catch (fetchErr: any) {
      if (typeof window !== 'undefined' && window.location && !endpoint.includes('localhost')) {
        console.warn(`[AIService] Direct fetch failed for ${provider} (${fetchErr.message}). Retrying via CORS proxy...`);
        const proxyUrl = `${window.location.origin}/api/cors-proxy?url=${encodeURIComponent(endpoint)}`;
        response = await fetch(proxyUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(reqBody)
        });
      } else {
        throw fetchErr;
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[${provider.toUpperCase()}] HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const bodyText = await response.text();
    if (bodyText.trim().startsWith('data:')) {
      let reconstructed = '';
      const lines = bodyText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data:')) {
          try {
            const chunkJson = JSON.parse(trimmed.replace(/^data:\s*/, ''));
            const content = chunkJson.choices?.[0]?.delta?.content || chunkJson.choices?.[0]?.message?.content || '';
            reconstructed += content;
          } catch (e) {}
        }
      }
      return { result: reconstructed };
    }

    const jsonRes = JSON.parse(bodyText.replace('data: [DONE]', ''));
    const resultText = jsonRes.choices?.[0]?.message?.content || '';
    return { result: resultText };
  }

  // 2. ANTHROPIC CLAUDE DIRECT
  if (provider === 'anthropic') {
    if (!apiKey) {
      throw new Error('[anthropic] API key missing. Add it in Settings → AI providers.');
    }
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/messages`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
      'anthropic-version': '2023-06-01'
    };

    let userPromptText = '';
    if (parts && Array.isArray(parts)) {
      userPromptText = parts.map((p: any) => typeof p === 'string' ? p : (p.text || '')).join('\n');
    }

    const reqBody: any = {
      model: resolvedModel,
      max_tokens: maxOutputTokens || 4096,
      system: systemInstruction ? (typeof systemInstruction === 'string' ? systemInstruction : systemInstruction.parts?.[0]?.text) : undefined,
      messages: [{ role: 'user', content: userPromptText }]
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[Anthropic] HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const jsonRes = await response.json();
    const resultText = jsonRes.content?.[0]?.text || '';
    return { result: resultText };
  }

  // 3. GOOGLE GEMINI DIRECT API (WITH USER KEY)
  if (provider === 'gemini' && apiKey) {
    console.log(`[Gemini] Routing ${action} via Direct GoogleGenAI Client...`);
    const ai = new GoogleGenAI({ apiKey });
    const reqContents = contents || [{ role: 'user', parts }];
    const config: any = {};
    if (temperature !== undefined) config.temperature = temperature;
    if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }

    try {
      const response = await ai.models.generateContent({
        model: resolvedModel,
        contents: reqContents,
        config
      });
      return { result: response.text };
    } catch (err: any) {
      // Retry once with a widely available model if the selected id is unknown
      const msg = String(err?.message || err || '');
      if (/not found|404|INVALID_ARGUMENT|model/i.test(msg) && resolvedModel !== 'gemini-2.0-flash') {
        console.warn(`[Gemini] Model ${resolvedModel} failed (${msg.slice(0, 120)}). Retrying gemini-2.0-flash…`);
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: reqContents,
          config
        });
        return { result: response.text };
      }
      throw err;
    }
  }

  // 4. GOOGLE GEMINI FALLBACK (Firebase/Vertex) — stubbed in Noodl public build
  console.log(`[Gemini] Routing ${action} via Firebase Vertex AI (Express Mode)...`);
  const genConfig: Partial<FirebaseGenerationConfig> = {};
  if (responseSchema) {
    genConfig.responseMimeType = "application/json";
    genConfig.responseSchema = responseSchema;
  }
  if (temperature !== undefined) genConfig.temperature = temperature;
  if (maxOutputTokens) genConfig.maxOutputTokens = maxOutputTokens;

  const model = getFirebaseVertexAIModel(
    resolvedModel,
    genConfig,
    systemInstruction
  ) as any;

  // Noodl replaced Firebase with Supabase: getFirebaseVertexAIModel() always returns null.
  // Without a user Gemini key this path used to crash as "Cannot read properties of null".
  if (!model || typeof model.generateContent !== 'function') {
    throw new Error(
      'Gemini needs an API key in this build (Vertex/Firebase AI was removed). ' +
      'Settings → AI providers → Gemini → paste Google AI Studio key, Save. ' +
      'Or switch provider to OpenRouter / OpenAI / Groq and use that key.'
    );
  }

  const requestContents = contents || [{ role: 'user', parts }];
  const result = await model.generateContent({ contents: requestContents });
  return { result: result.response.text() };
}

// --- CONFIGURATION ---

// Prioritas Model untuk Ingestion (Meringkas). 
const INGESTION_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
];

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } } | { text: string }> => {
  // SAFETY: Limit individual file size to 15MB (inline base64 expands ~33%, Google API limit is 20MB encoded)
  if (file.size > 15 * 1024 * 1024) {
    throw new Error(`File ${file.name} terlalu besar (>15MB). Harap gunakan file yang lebih kecil.`);
  }

  return new Promise((resolve, reject) => {
    const lowerName = file.name.toLowerCase();
    const inferredMimeType =
      file.type ||
      (lowerName.endsWith('.pptx')
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : lowerName.endsWith('.ppt')
          ? 'application/vnd.ms-powerpoint'
          : lowerName.endsWith('.pdf')
            ? 'application/pdf'
            : 'application/octet-stream');

    // Simple text files
    if (file.type === "text/markdown" || file.type === "text/plain" || lowerName.endsWith('.md') || lowerName.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({ text: result });
      };
      reader.onerror = (err) => reject(new Error(`Gagal membaca file text ${file.name}`));
      reader.readAsText(file);
    } else {
      // PDF / Images - Use readAsDataURL which is native, async, and much faster/memory-efficient
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the Data-URL prefix (e.g. "data:image/png;base64,") to get raw base64
        const base64Data = result.split(',')[1];
        
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: inferredMimeType,
          },
        });
      };
      reader.onerror = (err) => {
        console.error("FileReader Error:", err);
        reject(new Error(`Gagal membaca file ${file.name}`));
      };
      reader.readAsDataURL(file);
    }
  });
};

// Attempt lightweight JSON repair on a string fragment
const repairJSON = (fragment: string): string => {
  let s = fragment;
  // Replace JavaScript `undefined` with JSON null
  s = s.replace(/:\s*undefined/g, ': null');
  // Remove trailing commas before ] or }
  s = s.replace(/,(\s*[}\]])/g, '$1');
  return s;
};

const cleanAndParseJSON = (rawText: string): any[] => {
  if (!rawText) return [];

  console.log("Raw AI Response (First 500 chars):", rawText.substring(0, 500));

  // 1. Remove <thinking> tags (Crucial for Gemini 2.0/3.0 Thinking models)
  let text = rawText;
  if (text && text.includes("<thinking>")) {
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
  }

  // 2. Cleanup Markdown blocks
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Helper: try parsing a string, applying repair if needed
  const tryParse = (s: string): any | null => {
    try { return JSON.parse(s); } catch (_) {}
    try { return JSON.parse(repairJSON(s)); } catch (_) {}
    return null;
  };

  // Helper: extract questions array from a parsed value
  const extractArray = (parsed: any): any[] | null => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.questions)) return parsed.questions;
      if (Array.isArray(parsed.data)) return parsed.data;
      if (Array.isArray(parsed.items)) return parsed.items;
      for (const key in parsed) {
        if (Array.isArray(parsed[key])) return parsed[key];
      }
      if (parsed.text && parsed.options) return [parsed];
    }
    return null;
  };

  // 3. Try Direct Parsing First (Best Case)
  const directParsed = tryParse(text);
  if (directParsed !== null) {
    const arr = extractArray(directParsed);
    if (arr) return arr;
  }

  // 4. Heuristic Extraction (Find Array)
  const firstOpen = text.indexOf('[');
  const lastClose = text.lastIndexOf(']');

  if (firstOpen !== -1 && lastClose !== -1) {
    const jsonContent = text.substring(firstOpen, lastClose + 1);
    const arrParsed = tryParse(jsonContent);
    if (Array.isArray(arrParsed)) return arrParsed;
  }

  // 5. Heuristic Extraction (Find Object with Array)
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    const jsonContent = text.substring(firstBrace, lastBrace + 1);
    const objParsed = tryParse(jsonContent);
    if (objParsed !== null) {
      const arr = extractArray(objParsed);
      if (arr) return arr;
    }
  }

  // 6. Truncated JSON recovery: extract complete question objects by scanning balanced braces
  const questionObjects: any[] = [];
  let depth = 0;
  let objStart = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const fragment = text.substring(objStart, i + 1);
        const parsed = tryParse(fragment);
        if (parsed && parsed.text && Array.isArray(parsed.options)) {
          questionObjects.push(parsed);
        }
        objStart = -1;
      }
    }
  }
  if (questionObjects.length > 0) {
    console.warn(`cleanAndParseJSON: recovered ${questionObjects.length} question(s) via brace-scan fallback.`);
    return questionObjects;
  }

  console.error("Failed to parse JSON. Raw text:", text);
  throw new Error("Gagal memproses data kuis. Format AI tidak valid.");
};

const sanitizeQuestion = (q: any): Omit<Question, 'id'> => {
  let options = Array.isArray(q.options) ? q.options : ["A", "B", "C", "D"];
  options = options.map((o: any) => String(o)).slice(0, 4);
  while (options.length < 4) options.push(`Opsi ${options.length + 1}`);

  let correctIndex = Number(q.correctIndex);
  if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) correctIndex = 0;

  const originalOptions = [...options];
  const originalCorrectText = options[correctIndex]; // Usually index 0 from AI prompt instruction
  
  // Fisher-Yates Shuffle
  for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
  }
  
  const newCorrectIndex = options.indexOf(originalCorrectText);

  // Map old indices to new letters (A -> new letter, B -> new letter, etc.)
  const mapping: Record<string, string> = {};
  originalOptions.forEach((opt, originalIdx) => {
      const newIdx = options.indexOf(opt);
      const originalLetter = String.fromCharCode(65 + originalIdx); // A, B, C, D
      const newLetter = String.fromCharCode(65 + newIdx); // A, B, C, D
      mapping[originalLetter] = newLetter;
  });

  // Safely translate option letters in explanation text using word boundaries
  let adjustedExplanation = String(q.explanation || "Pembahasan tidak tersedia.");
  adjustedExplanation = adjustedExplanation.replace(/\b([A-D])\b/g, (match, letter) => {
      return mapping[letter] || match;
  });

  return {
    text: String(q.text || "Soal Kosong"),
    options: options,
    correctIndex: newCorrectIndex,
    explanation: adjustedExplanation,
    hint: String(q.hint || "Coba ingat kembali konsep utamanya."),
    keyPoint: String(q.keyPoint || "Umum").substring(0, 50), // Increased limit
    difficulty: "Medium"
  };
};

const normalizeForDedup = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ── MULTI-LAYER ANTI-DUPLICATION SYSTEM ──
const buildNgrams = (text: string, n: number = 3): Set<string> => {
  const normalized = normalizeForDedup(text);
  const words = normalized.split(' ').filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  // Also add bigrams for short questions
  if (words.length < 8) {
    for (let i = 0; i <= words.length - 2; i++) {
      ngrams.add(words.slice(i, i + 2).join(' '));
    }
  }
  return ngrams;
};

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
};

const DUPLICATE_THRESHOLD = 0.40;

// Secondary check: keyword overlap (catches short rephrased questions)
const keywordOverlap = (a: string, b: string): number => {
  const wordsA = new Set(normalizeForDedup(a).split(' ').filter(w => w.length > 3));
  const wordsB = new Set(normalizeForDedup(b).split(' ').filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.min(wordsA.size, wordsB.size);
};

const isDuplicateQuestion = (newQ: string, existingTexts: string[], existingNgrams: Array<Set<string>>): boolean => {
  const newNgrams = buildNgrams(newQ);
  for (let i = 0; i < existingNgrams.length; i++) {
    if (jaccardSimilarity(newNgrams, existingNgrams[i]) > DUPLICATE_THRESHOLD) return true;
    if (keywordOverlap(newQ, existingTexts[i]) > 0.65) return true;
  }
  return false;
};

// Concept rotation: each batch gets a different slice of concepts
const getConceptSlice = (concepts: ConceptNode[], batchIdx: number): ConceptNode[] => {
  if (concepts.length === 0) return [];
  const sliceSize = Math.max(2, Math.ceil(concepts.length / 3));
  const startIdx = (batchIdx * sliceSize) % concepts.length;
  const slice: ConceptNode[] = [];
  for (let i = 0; i < sliceSize; i++) {
    slice.push(concepts[(startIdx + i) % concepts.length]);
  }
  return slice;
};

/**
 * SMART INGESTION (SIMPLIFIED)
 * Menggunakan satu model cepat (Flash) untuk meringkas materi.
 * Tidak ada looping model lain agar cepat dan hemat kuota.
 */
export const summarizeMaterial = async (apiKey: string, content: string | File): Promise<string> => {
  if (!content) return "";
  
  const isLongText = typeof content === 'string' && content.length > 100_000;
  const modelName = (typeof content !== 'string' || isLongText)
    ? 'gemini-3.5-flash'
    : DEFAULT_GENERATION_MODEL;
  
  const prompt = `
    GOAL: Extract ALL exam-testable information from this material for university-level quiz generation.
    
    CONTEXT: Dosen/profesor sering menguji dari DETAIL KECIL yang mahasiswa abaikan.
    Kamu HARUS menangkap SETIAP detail kecil karena detail inilah yang paling sering diujikan.
    
    INSTRUKSI EKSTRAKSI (3-PASS):
    
    PASS 1 — STRUKTUR MAKRO:
    1. Identifikasi semua TOPIK UTAMA dan sub-topik
    2. Untuk setiap topik, ekstrak: definisi, prinsip dasar, dan hubungan antar konsep
    3. Catat semua RUMUS, PERSAMAAN, dan KONSTANTA dengan konteks penggunaannya
    
    PASS 2 — DETAIL MIKRO (EXAM-CRITICAL):
    4. Ekstrak SEMUA angka spesifik (contoh: "pH optimal 6.8", "suhu 37°C", "konsentrasi 0.1M", "diameter 7-8 μm")
    5. Catat SEMUA pengecualian dan kasus khusus ("Namun pada [kondisi], [X] justru...", "Kecuali [Y]...")
    6. Salin informasi dari TABEL, DIAGRAM, dan GAMBAR secara VERBATIM — jangan ringkas, salin apa adanya
    7. Catat PERBANDINGAN: setiap kali materi membandingkan 2+ konsep, buat tabel perbandingan
    8. Identifikasi URUTAN/TAHAPAN: setiap proses bertahap harus dicatat urutannya secara LENGKAP
    9. Catat semua AKRONIM dan SINGKATAN beserta kepanjangannya
    10. Ekstrak CONTOH SPESIFIK yang diberikan dalam materi
    11. Catat HUBUNGAN SEBAB-AKIBAT: "[X] menyebabkan [Y] karena [Z]"
    12. Perhatikan CATATAN KAKI dan KETERANGAN GAMBAR — sering berisi detail ujian
    
    PASS 3 — SCAN ULANG DETAIL YANG TERLEWAT:
    13. Baca ulang materi dari awal sampai akhir. Cari detail yang BELUM tercatat di Pass 1-2:
        - Angka/nilai yang disebut sambil lalu (contoh: "...sekitar 120/80 mmHg...")
        - Nama struktur/organ/senyawa yang disebut dalam kalimat, bukan heading
        - Keterangan dalam kurung (informasi dalam tanda kurung sering diujikan)
        - Kata "yaitu", "seperti", "misalnya", "contohnya" — apa yang mengikuti kata ini?
        - Klausa pengecualian: "kecuali", "namun", "tetapi", "berbeda dengan"
        - Lokasi spesifik: "terletak di", "ditemukan pada", "berada di"
        - Fungsi spesifik yang disebut langsung: "berfungsi untuk", "berperan dalam"
    14. Jika materi menyebut jenis/tipe/klasifikasi, DAFTAR LENGKAP semua item yang disebut
    15. Jika materi menyebut lapisan/bagian/komponen, DAFTAR LENGKAP dengan urutan yang benar
    
    FORMAT OUTPUT:
    Gunakan format terstruktur dengan heading dan bullet points.
    Setiap fakta harus atomic (satu fakta per bullet point).
    Tandai detail yang kemungkinan besar diujikan dengan [EXAM-LIKELY].
    SALIN data verbatim dari materi — JANGAN meringkas atau memparafrase angka/nama/urutan.
    
    ${outputLanguageRule()}
  `;

  try {
      console.log(`[Smart Ingest] Summarizing with ${modelName}...`);
      
      const parts: any[] = [];
      if (typeof content === 'string') {
        parts.push({ text: prompt + `\n\nRAW TEXT:\n"${content.substring(0, 500000)}"` });
      } else {
        const filePart = await fileToGenerativePart(content);
        parts.push(filePart);
        parts.push({ text: prompt });
      }

      const data = await callAI('summarize', {
        apiKey,
        modelName,
        parts,
        temperature: 0.2,
        maxOutputTokens: 16384
      });

      if (data.error) throw new Error(data.error);
      
      const result = data.result;
      if (!result) return typeof content === 'string' ? content.substring(0, 10000) : "Gagal mengekstrak PDF."; // Fallback to raw if empty
      
      return `[SUMMARY]\n${result}`;
  } catch (e: any) {
      console.warn(`[Smart Ingest] Failed:`, e.message);
      return typeof content === 'string' ? content.substring(0, 10000) : "Gagal mengekstrak PDF."; // Fallback to raw on error
  }
};

/**
 * PHASE 1: MATERIAL ANALYSIS (High-Yield Concept Pipeline)
 * Reads material and extracts concepts ranked by educational yield.
 */
export const analyzeMaterialConcepts = async (
  apiKey: string,
  parts: any[],
  modelId: string,
  onProgress: (msg: string) => void
): Promise<ConceptNode[]> => {
  onProgress(getLocale() === 'id'
      ? "Analisis materi (fase 1): mengekstrak konsep high-yield…"
      : "Material analysis (phase 1): extracting high-yield concepts…");
  
  const systemInstruction = `ROLE: You are an expert educator analyzing study material for exam preparation. Respond using the same language as the source material for concept names and reasons when natural; priority labels stay HIGH/MODERATE/FILLER.
TASK: Read the provided material and extract ALL distinct concepts/topics. You MUST be EXTREMELY granular — each testable fact should be its own concept.
For each concept, assign a priority based on educational importance:
- HIGH: Core mechanism, clinical pearl, must-know for exams, fundamental principle, specific numbers/values/thresholds, definitions, pengecualian penting
- MODERATE: Supporting detail, secondary pathway, context that enhances understanding
- FILLER: Historical trivia, rare exceptions, peripheral information unlikely to be tested

CRITICAL RULES:
1. Be EXTREMELY granular — extract specific sub-topics, not broad categories.
   BAD: "Sistem Pencernaan" (terlalu luas)
   GOOD: "Enzim Pepsin di Lambung", "pH Lambung 1.5-3.5", "Fungsi HCl Lambung", "Sel Parietal vs Sel Chief"
2. SETIAP angka, nilai, dan threshold dalam materi harus menjadi konsep HIGH tersendiri.
   Contoh: "Tekanan darah normal 120/80" → konsep HIGH tersendiri
3. SETIAP pengecualian ("kecuali", "namun", "berbeda dengan") harus menjadi konsep HIGH tersendiri.
   Contoh: "Plica vocalis dilapisi epitel gepeng (bukan respiratorius)" → konsep HIGH
4. Jika materi menyebut tabel/perbandingan, SETIAP baris/pasangan perbandingan = 1 konsep terpisah.
5. Jika materi menyebut daftar/klasifikasi, setiap item dalam daftar = 1 konsep terpisah.
6. Concept names should be 3-7 words, SPECIFIC enough to be testable.
7. Sort within each tier from foundational → complex.
8. If material is too short/simple, just output the main concept as HIGH.
9. Kalimat dalam kurung, catatan kaki, keterangan gambar → biasanya HIGH karena sering diujikan.
10. TARGET: Extract minimum 2x more concepts than you normally would. Err on the side of TOO MANY, not too few.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        concept: { type: Type.STRING },
        priority: { type: Type.STRING }, // HIGH, MODERATE, FILLER
        reason: { type: Type.STRING },
      },
      required: ["concept", "priority", "reason"],
    },
  };

  try {
    const data = await callAI('analyzeConcepts', {
      apiKey,
      modelName: modelId || DEFAULT_GENERATION_MODEL,
      parts: [...parts, { text: "Analyze this material and return a JSON array of ranked ConceptNodes." }],
      systemInstruction,
      responseSchema: schema,
      temperature: 0.2,
      maxOutputTokens: 8192
    });

    if (data.error) throw new Error(data.error);
    
    const jsonStr = data.result;
    const startIndex = jsonStr.indexOf('[');
    const endIndex = jsonStr.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      const cleanJson = jsonStr.substring(startIndex, endIndex + 1);
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => ({
          concept: String(p.concept),
          priority: (['HIGH', 'MODERATE', 'FILLER'].includes(p.priority) ? p.priority : 'MODERATE') as ConceptPriority,
          reason: String(p.reason)
        }));
      }
    }
    throw new Error("Format JSON Phase 1 salah");
  } catch (e: any) {
    console.warn("Phase 1 Analysis Failed:", e);
    return []; // Return empty on fail so Phase 2 can fallback
  }
};

/**
 * QUIZ GENERATION (DIRECT MODE)
 * Tanpa "Subsidi" (Fallback Model). Model yang dipilih adalah model yang dieksekusi.
 */
export const generateQuiz = async (
  apiKey: string, 
  files: File[] | File | null, 
  topic: string | undefined, 
  modelId: string, // User selected model
  questionCount: number,
  mode: QuizMode,
  examStyles: ExamStyle[] = [ExamStyle.C2_CONCEPT],
  onProgress: (status: string) => void,
  existingQuestionsContext: string[] = [],
  customPrompt: string = "",
  libraryContext: string = "",
  cachedConceptMap?: ConceptNode[],
  userBloomPercentages?: Record<string, number>
): Promise<{ questions: Question[], contextText: string, conceptMap?: ConceptNode[] }> => {
  const isVertexExpress = import.meta.env.VITE_USE_VERTEX_EXPRESS === 'true';
  const isFirebaseVertexAI = import.meta.env.VITE_USE_FIREBASE_VERTEX_AI === 'true';
  const activeProv = getActiveProvider();
  // Vertex env flags only help Gemini when a real Vertex client exists (not in Noodl stub).
  if (!apiKey) {
    if (activeProv !== 'gemini' || (!isVertexExpress && !isFirebaseVertexAI)) {
      throw new Error(
        getLocale() === 'id'
          ? `API key ${activeProv} belum diisi. Buka Setelan → Provider AI.`
          : `API key for ${activeProv} is not set. Open Settings → AI providers.`
      );
    }
  }
  
  // --- PREPARE CONTEXT ---
  const baseParts: any[] = [];
  let contextText = ""; 

  // 1. Handle Library Context
  if (libraryContext) {
     onProgress(getLocale() === 'id' ? "Memuat konteks…" : "Loading context…");
     baseParts.push({ text: `LIBRARY MATERIAL:\n${libraryContext}\n\nEND OF LIBRARY MATERIAL` }); 
     contextText = "[Library Source]";
  }

  // 2. Handle File Uploads
  const fileArray = Array.isArray(files) ? files : (files ? [files] : []);
  if (fileArray.length > 0) {
    for (const file of fileArray) {
      onProgress(getLocale() === 'id' ? `Memproses file ${file.name}…` : `Processing ${file.name}…`);
      const part = await fileToGenerativePart(file);
      baseParts.push(part);
    }
    contextText += ` [Files: ${fileArray.map(f => f.name).join(', ')}]`; 
  } 
  
  // 3. Topic Focus
  if (topic) {
    baseParts.push({ text: `IMPORTANT: FOCUS ONLY ON THIS TOPIC: "${topic}".` });
    if (!contextText) contextText = topic;
  }

  // --- LANGUAGE: app UI locale is source of truth for learner-facing text ---
  baseParts.push({
    text: [
      outputLanguageRule(),
      topic ? `User topic sample: """${String(topic).slice(0, 280)}"""` : '',
      libraryContext ? `Material sample: """${String(libraryContext).slice(0, 280)}"""` : '',
      'If material language differs from the required output language, still write questions in the required output language, grounded in the material facts.',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  // --- PHASE 1: CONCEPT ANALYSIS ---
  let conceptMap = cachedConceptMap || [];
  if (conceptMap.length === 0 && (contextText || baseParts.length > 0)) {
     // Use topic as a part if no files/library were provided
     const analysisParts = baseParts.length > 0 ? baseParts : [{ text: topic || 'General Topic' }];
     conceptMap = await analyzeMaterialConcepts(apiKey, analysisParts, modelId, onProgress);
  }

  // --- BLOOM'S TAXONOMY PROMPT BUILDER ---
  const getBloomPromptSingle = (style: ExamStyle): string => {
    const map: Record<ExamStyle, string> = {
      [ExamStyle.C1_RECALL]: `COGNITIVE LEVEL: C1 – Mengingat (Remember)

BLOOM'S ACTION VERBS untuk C1: menyebutkan, mendefinisikan, mengidentifikasi, mengenali, menamakan, mengurutkan, menuliskan, mengingat kembali.

PRINSIP UTAMA C1: Soal harus SINGKAT, LANGSUNG, dan menguji SATU fakta spesifik.
JANGAN membuat soal panjang atau berbelit-belit. Langsung tanya faktanya.

POLA SOAL WAJIB (pilih salah satu per soal):
1. DEFINISI LANGSUNG: "Apa yang dimaksud dengan [istilah]?" atau "[Istilah] adalah..."
2. FAKTA SPESIFIK: "Berapa nilai [X]?", "Apa nama [Y]?", "Di mana letak [Z]?"
3. IDENTIFIKASI KOMPONEN: "Mana yang TERMASUK dalam [kategori]?", "Yang merupakan bagian dari [X] adalah..."
4. PASANGAN TEPAT: "[Singkatan] kepanjangan dari...", "[Istilah A] dikenal juga sebagai..."
5. URUTAN/DAFTAR: "Urutan yang benar dari [proses] adalah...", "Langkah pertama dalam [prosedur] adalah..."
6. DETAIL MIKRO: "Epitel yang melapisi [organ] adalah...", "pH normal [cairan] adalah...", "Jumlah [X] pada manusia adalah..."

WAJIB: Prioritaskan menguji DETAIL KECIL dari materi:
- Angka/nilai spesifik yang disebut di materi
- Nama struktur/lapisan/jenis yang disebutkan
- Lokasi/posisi suatu hal ("terletak di...", "ditemukan pada...")
- Pengecualian yang disebutkan di materi

DILARANG di C1:
- Soal panjang dengan kalimat pembuka yang berbelit
- Soal yang meminta penjelasan/analisis
- Soal skenario/kasus
- Menambahkan konteks yang tidak perlu sebelum pertanyaan inti

CONTOH SOAL C1 YANG BENAR:
✅ "Epitel yang melapisi plica vocalis adalah..." (langsung, 1 fakta)
✅ "Berapa pH normal cairan lambung?" (langsung, 1 angka)
✅ "Enzim yang memecah protein di lambung adalah..." (langsung, 1 nama)
❌ "Dalam sistem pencernaan manusia, terdapat berbagai macam enzim yang berperan penting. Salah satu enzim yang berfungsi..." (TERLALU PANJANG)

DISTRACTOR RULES untuk C1:
- Opsi B: Istilah yang mirip secara fonetis atau ejaan (contoh: mitosis vs meiosis)
- Opsi C: Fakta dari sub-topik yang berdekatan tapi berbeda
- Opsi D: Fakta yang benar tapi menjawab pertanyaan yang berbeda`,

      [ExamStyle.C2_CONCEPT]: `COGNITIVE LEVEL: C2 – Memahami (Understand)

BLOOM'S ACTION VERBS untuk C2: menjelaskan, menafsirkan, merangkum, mengklasifikasikan, membandingkan, memberi contoh, mengaitkan, menyimpulkan, memparafrase.

PRINSIP UTAMA C2: Soal harus menguji PEMAHAMAN, bukan hafalan. Tapi tetap SINGKAT dan FOKUS.
JANGAN membuat soal terlalu panjang atau filosofis. Tanyakan pemahaman terhadap FAKTA SPESIFIK dari materi.

POLA SOAL WAJIB (pilih salah satu per soal):
1. ALASAN/MENGAPA: "Mengapa [organ/proses] memiliki [karakteristik]?" — jawaban harus ada di materi
2. CONTOH vs BUKAN CONTOH: "Yang BUKAN termasuk [kategori] adalah..."
3. KLASIFIKASI: "[X] termasuk dalam kategori...", "[Contoh] ini merupakan jenis..."
4. HUBUNGAN KONSEP: "Hubungan antara [A] dan [B] adalah..."
5. PERBANDINGAN: "Perbedaan [X] dan [Y] terletak pada..."
6. SEBAB-AKIBAT: "[X] terjadi karena...", "Akibat dari [Y] adalah..."
7. FUNGSI/PERAN: "Fungsi [X] dalam [konteks] adalah..." — menguji pemahaman kenapa, bukan sekedar apa

WAJIB: Soal C2 HARUS tetap merujuk detail spesifik dari materi:
- Jika materi menjelaskan ALASAN suatu fenomena, buat soal tentang alasannya
- Jika materi menyebut pengecualian, buat soal tentang MENGAPA itu pengecualian
- Jika materi membandingkan 2 hal, buat soal tentang perbedaan spesifik yang disebut
- JANGAN mengarang konteks/alasan yang TIDAK ADA di materi

DILARANG di C2:
- Soal dengan pembuka berbelit ("Dalam konteks ilmu kedokteran modern, seiring perkembangan...")
- Soal yang membutuhkan pengetahuan di luar materi
- Soal analisis multi-variabel yang kompleks
- Opsi jawaban yang terlalu panjang (>20 kata per opsi)

CONTOH SOAL C2 YANG BENAR:
✅ "Mengapa plica vocalis dilapisi epitel gepeng berlapis, bukan epitel respiratorius?" (langsung, merujuk fakta materi)
✅ "Perbedaan fungsi sel parietal dan sel chief di lambung adalah..." (perbandingan spesifik)
❌ "Dalam konteks histologi laring yang merupakan bagian penting dari sistem pernapasan, jelaskan mengapa..." (TERLALU BERBELIT)

DISTRACTOR RULES untuk C2:
- Opsi B: Pemahaman parsial (benar sebagian tapi tidak lengkap)
- Opsi C: Miskonsepsi umum (inversi sebab-akibat, tukar fungsi)
- Opsi D: Pernyataan yang benar secara faktual tapi tidak menjawab pertanyaan
- SEMUA opsi harus singkat dan jelas, max 15-20 kata per opsi`,

      [ExamStyle.C3_APPLICATION]: `COGNITIVE LEVEL: C3 – Menerapkan (Apply)

BLOOM'S ACTION VERBS: menerapkan, menghitung, menggunakan, mendemonstrasikan, memecahkan, melaksanakan.

POLA SOAL WAJIB:
1. SKENARIO/KASUS: Mulai dengan "Seorang [peran] menghadapi [situasi]..." lalu tanya solusi yang tepat
2. KALKULASI: Berikan data numerik, minta menghitung menggunakan rumus yang tepat
3. PROSEDURAL: "Langkah yang tepat untuk menangani [situasi] adalah..."
4. PENERAPAN ATURAN: "Berdasarkan prinsip [X], maka tindakan yang benar adalah..."

DILARANG di C3:
- Soal definisi murni tanpa konteks penerapan
- Soal yang hanya meminta penjelasan teori

DISTRACTOR RULES untuk C3:
- Opsi B: Penerapan rumus/prinsip yang salah (miscalculation)
- Opsi C: Prosedur yang benar untuk situasi yang berbeda
- Opsi D: Tindakan yang logis tapi tidak sesuai protokol/prinsip`,

      [ExamStyle.C4_ANALYSIS]: `COGNITIVE LEVEL: C4 – Menganalisis (Analyze)

BLOOM'S ACTION VERBS: menganalisis, membedakan, mengidentifikasi pola, mengevaluasi hubungan, menemukan kelemahan.

POLA SOAL WAJIB:
1. ANALISIS PENYEBAB: "Faktor yang PALING MUNGKIN menyebabkan [fenomena] adalah..."
2. BANDINGKAN & KONTRAS: "Perbedaan MENDASAR antara [X] dan [Y] dilihat dari aspek [Z] adalah..."
3. IDENTIFIKASI KELEMAHAN: "Kelemahan dari argumen berikut adalah...", "Pernyataan yang SALAH tentang [X] adalah..."
4. INTERPRETASI DATA: Sajikan tabel/grafik/data, tanya kesimpulan analitis
5. HUBUNGAN MULTI-VARIABEL: "Jika [variabel A] meningkat dan [variabel B] menurun, maka dampaknya terhadap [C] adalah..."

DISTRACTOR RULES untuk C4:
- Opsi B: Analisis yang dangkal/permukaan saja
- Opsi C: Korelasi yang salah (correlation ≠ causation)
- Opsi D: Kesimpulan yang terlalu luas (overgeneralization)`,

      [ExamStyle.C5_EVALUATION]: `COGNITIVE LEVEL: C5 – Mengevaluasi (Evaluate)

BLOOM'S ACTION VERBS: menilai, mengkritik, mempertahankan, memprioritaskan, merekomendasikan, memutuskan.

POLA SOAL WAJIB:
1. PILIHAN TERBAIK: "Di antara opsi berikut, pendekatan yang PALING EFEKTIF untuk [masalah] adalah..."
2. EVALUASI ARGUMEN: "Argumen yang PALING KUAT untuk mendukung [posisi] adalah..."
3. PRIORITISASI: "Dalam situasi [X], langkah yang harus DIPRIORITASKAN adalah..."
4. KRITIK: "Kelemahan PALING SIGNIFIKAN dari metode [X] adalah..."
5. JUSTIFIKASI: Semua opsi harus terlihat masuk akal, tetapi hanya satu yang paling tepat dengan justifikasi

DISTRACTOR RULES untuk C5:
- Semua opsi harus terlihat reasonable dan defensible
- Opsi B: Solusi yang baik tapi bukan yang optimal
- Opsi C: Solusi yang populer tapi memiliki trade-off serius
- Opsi D: Solusi yang benar dalam konteks berbeda`,
    };
    return map[style] || map[ExamStyle.C2_CONCEPT];
  };

  // --- PERCENTAGE ALLOCATION per Bloom level ---
  const sortedStyles = examStyles.length > 0 ? [...examStyles] : [ExamStyle.C2_CONCEPT];
  let bloomPercentages = userBloomPercentages;
  
  if (!bloomPercentages || Object.keys(bloomPercentages).length === 0) {
      bloomPercentages = {};
      const equalPct = Math.floor(100 / sortedStyles.length);
      let pctRemaining = 100;
      sortedStyles.forEach((style, idx) => {
        const pct = idx === sortedStyles.length - 1 ? pctRemaining : equalPct;
        bloomPercentages![style] = pct;
        pctRemaining -= pct;
      });
  }

  // --- BATCHING STRATEGY ---
  const BATCH_SIZE = 10;
  const PARALLEL_BATCHES = 5;
  const MAX_TOP_UP_ROUNDS = 3;
  const BATCH_FOCUS_AREAS = [
    'definisi inti dan terminologi',
    'penerapan konsep pada studi kasus singkat',
    'analisis perbandingan antar konsep',
    'kesalahan umum dan miskonsepsi',
    'hubungan sebab-akibat dan implikasi',
    'interpretasi data/fakta dalam konteks materi',
    'evaluasi argumen dan pengambilan keputusan',
    'urutan proses, tahapan, dan alur kerja',
    'validasi konsep dengan contoh kontra',
    'sintesis beberapa konsep menjadi solusi'
  ];
  let allGeneratedQuestions: Question[] = [];

  // Model yang dipilih user; if empty / wrong family, resolve per active provider.
  const activeProvider = getActiveProvider();
  const selectedModel = resolveModelName(activeProvider, modelId);
  
  // Define Schema
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            hint: { type: Type.STRING },
            keyPoint: { type: Type.STRING },
          },
          required: ["text", "options", "correctIndex", "explanation", "hint", "keyPoint"],
        },
      },
    },
    required: ["questions"],
  };

  // Helper function to generate a batch
  const generateBatch = async (
    batchIndex: number,
    count: number,
    knownQuestionTexts: string[],
    bloomLevel?: ExamStyle,
    conceptTier?: ConceptPriority,
    tierConcepts?: ConceptNode[]
  ): Promise<Question[]> => {
      // Anti-repetition logic (Enhanced multi-layer)
      let avoidancePrompt = "";
      const allContext = [...existingQuestionsContext, ...knownQuestionTexts];
      if (allContext.length > 0) {
          const prevSummaries = allContext.map((q, i) => {
            const stem = q.replace(/\?$/, '').substring(0, 80);
            return `- ${stem}`;
          }).slice(-30).join('\n');
          avoidancePrompt = `
ANTI-DUPLICATION DIRECTIVE:
The following ${allContext.length} questions have ALREADY been generated.
You MUST NOT create questions that test the same fact, concept, or relationship.
Each new question must test a DIFFERENT angle, sub-concept, or application.

ALREADY GENERATED:
${prevSummaries}

VIOLATION EXAMPLES (DO NOT DO THIS):
- If existing: "Apa fungsi mitokondria?" → DO NOT ask "Mitokondria berfungsi untuk..."
- If existing: "Perbedaan X dan Y" → DO NOT ask "Persamaan X dan Y" (same pair)
- If existing asks about a specific number → DO NOT ask about the same number differently
`;
      }
      const focusArea = BATCH_FOCUS_AREAS[batchIndex % BATCH_FOCUS_AREAS.length];
      const bloomLevelPrompt = bloomLevel ? getBloomPromptSingle(bloomLevel) : getBloomPromptSingle(ExamStyle.C2_CONCEPT);
      
      // Concept rotation: each batch gets different subset of concepts
      let conceptsPrompt = "";
      if (tierConcepts && tierConcepts.length > 0) {
          const rotatedConcepts = getConceptSlice(tierConcepts, batchIndex);
          const conceptNames = rotatedConcepts.map(c => c.concept).join(", ");
          conceptsPrompt = `\nPRIORITY CONCEPTS TO TEST (${conceptTier}): ${conceptNames}\nRULE: Focus on these concepts. Test different aspects than what was already tested.`;
      }

      const batchPrompt = `
        GOAL: Create ${count} multiple-choice questions about: "${topic || 'Context'}".
        BATCH FOCUS AREA: "${focusArea}".
        ${conceptsPrompt}
        
        ${bloomLevelPrompt}
        STRICT: ALL ${count} questions in this batch MUST be at this EXACT cognitive level. Do NOT mix levels.
        USER DIRECTIVES: "${customPrompt}"
    
        ═══ ANTI-OVERCOMPLIFICATION RULES (SANGAT PENTING) ═══
        
        MASALAH UTAMA: Kamu cenderung membuat soal TERLALU RUMIT dan BERBELIT-BELIT.
        Ini HARUS dihindari. Ikuti aturan berikut:
        
        1. SOAL HARUS SINGKAT: Stem soal idealnya 1-2 kalimat. Max 3 kalimat untuk C3-C5.
           ❌ SALAH: "Dalam konteks biologi sel modern, organel yang berperan penting dalam metabolisme energi dan sering disebut sebagai powerhouse of the cell, yang memiliki membran ganda dan DNA sendiri, adalah..."
           ✅ BENAR: "Organel sel yang memiliki DNA sendiri dan membran ganda adalah..."
        
        2. SATU SOAL = SATU FAKTA: Setiap soal menguji TEPAT SATU detail dari materi.
           Jangan gabungkan 2-3 konsep dalam 1 soal.
        
        3. OPSI JAWABAN SINGKAT: Setiap opsi max 10-15 kata. Jangan buat paragraf.
           ❌ SALAH: "Mitokondria yang merupakan organel bermembran ganda dan berfungsi dalam fosforilasi oksidatif"
           ✅ BENAR: "Mitokondria"
        
        4. KUTIP DETAIL DARI MATERI: Setiap soal HARUS berdasarkan fakta SPESIFIK yang ada di materi.
           Jangan mengarang fakta atau konteks yang tidak disebutkan.
        
        5. PRIORITASKAN DETAIL MIKRO: Buat soal tentang angka, nama, lokasi, pengecualian, dan fakta kecil
           yang ada di materi sebelum membuat soal konseptual yang luas.
        
        6. JANGAN TAMBAHKAN KONTEKS TIDAK PERLU: Langsung tanya. Jangan awali dengan kalimat pembuka panjang.
        
        ═══ END ANTI-OVERCOMPLIFICATION ═══

        INSTRUCTIONS:
        1. GENERATE EXACTLY ${count} questions.
        2. USE the provided material strictly. Every question must be answerable from the material.
        3. SEQUENCE: Mix micro-detail questions (numbers, names, locations) with conceptual ones.
        4. STRUCTURE & DIAGNOSTIC QUALITY:
           - Option A: Must be the Correct Option.
           - Option B, C, D: Must be DIAGNOSTIC DISTRACTORS.
           - FORBIDDEN OPTIONS: Do NOT use "Semua jawaban benar", "Tidak ada jawaban yang benar", or "A dan B benar".
        5. FEEDBACK (EXPLANATION):
           - Explain exactly why Option A is correct, REFERENCING the material.
           - Briefly explain why B, C, D are wrong.
           - CRITICAL: Do NOT mention option letters like "Pilihan A", "Opsi B", "C", "D" in the explanation text because the options will be shuffled. Refer directly to the text of the options instead.
        6. KEYPOINT FIELD:
           - The 'keyPoint' field MUST be a specific, granular sub-topic name (e.g., "Fiksasi Karbon", NOT just "Fotosintesis"). Max 3-4 words.
        7. ${outputLanguageRule()}
           - Keep technical terms/abbreviations as they appear in the source when natural.
    
        OUTPUT: one JSON object shaped as {"questions":[ ... ${count} items ... ]}. No markdown.
        ${avoidancePrompt}
      `;

      const parts = [...baseParts, { text: batchPrompt }];

      const attemptGenerate = async (useFallbackPrompt: boolean): Promise<Question[]> => {
         const JSON_SHAPE_HINT = `\n\nCRITICAL OUTPUT SHAPE: Return ONE JSON object: {"questions":[...exactly ${count} items...]}. Each item needs text, options (4 strings), correctIndex (0-3), explanation, hint, keyPoint. No markdown.`;
         const FALLBACK_JSON_INSTRUCTION = `\n\nIMPORTANT: Output ONLY valid JSON as {"questions":[{"text":...,"options":[...],"correctIndex":0,"explanation":"...","hint":"...","keyPoint":"..."}]}. No markdown fences.`;
         const promptExtra = useFallbackPrompt ? (FALLBACK_JSON_INSTRUCTION + JSON_SHAPE_HINT) : JSON_SHAPE_HINT;
         const data = await callAI('generateQuizBatch', { 
            apiKey, 
            modelName: selectedModel, 
            parts: [...baseParts, { text: batchPrompt + promptExtra }], 
            // Prefer schema on first try; fallback drops schema so free-form JSON still parses
            responseSchema: useFallbackPrompt ? undefined : responseSchema, 
            temperature: Math.min(0.5 + (batchIndex * 0.05), 0.85),
            maxOutputTokens: Math.min(8192, 1200 + count * 700)
         });

         if (data.error) throw new Error(data.error);

         const responseText = data.result;
         if (!responseText) throw new Error("Empty Response");

         const rawQuestions = cleanAndParseJSON(responseText);
         if (!Array.isArray(rawQuestions)) throw new Error("Format AI salah.");
         
         const validQuestions = rawQuestions.filter((q: any) => q.text && q.options && q.options.length > 1);
         if (validQuestions.length === 0) throw new Error("No valid questions in AI response");
         return validQuestions.map((q: any) => {
            const sanitized = sanitizeQuestion(q);
            return {
               ...sanitized,
               conceptPriority: conceptTier || 'MODERATE' // tag with tier
            };
         }) as any[];
      };

      try {
         return await attemptGenerate(false);
      } catch (err: any) {
         console.warn(`Batch ${batchIndex} failed (${selectedModel}): ${err.message}. Retrying with fallback prompt...`);
         try {
            return await attemptGenerate(true);
         } catch (retryErr: any) {
            console.error(`Batch ${batchIndex} retry also failed:`, retryErr.message);
            // Soft-fail: empty batch is better than killing the whole generation wave
            return [];
         }
      }
  };

  // Pre-seed dedup data from existing context
  const allExistingTexts: string[] = [...existingQuestionsContext];
  const allExistingNgrams: Array<Set<string>> = existingQuestionsContext.map(t => buildNgrams(t));

  const addUniqueQuestions = (questions: Question[]) => {
    for (const q of questions) {
      if (isDuplicateQuestion(q.text, allExistingTexts, allExistingNgrams)) {
        console.log(`[Dedup] Rejected duplicate: "${q.text.substring(0, 60)}..."`);
        continue;
      }
      allExistingTexts.push(q.text);
      allExistingNgrams.push(buildNgrams(q.text));
      allGeneratedQuestions.push(q);
    }
  };

  // Parallel waves must not hard-fail the whole quiz if one batch dies (rate limit / JSON).
  const runWave = async (plans: Array<{ batchIndex: number; count: number; bloomLevel?: ExamStyle; conceptTier?: ConceptPriority; tierConcepts?: ConceptNode[] }>, waveLabel: string) => {
    if (plans.length === 0) return;
    onProgress(getLocale() === 'id'
      ? `${waveLabel}: menjalankan ${plans.length} batch paralel…`
      : `${waveLabel}: running ${plans.length} parallel batches…`);
    const knownQuestionTexts = allGeneratedQuestions.map(q => q.text);
    const settled = await Promise.allSettled(
      plans.map(plan => generateBatch(plan.batchIndex, plan.count, knownQuestionTexts, plan.bloomLevel, plan.conceptTier, plan.tierConcepts))
    );
    const flattened: Question[] = [];
    let failCount = 0;
    for (const r of settled) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        flattened.push(...(r.value as Question[]));
      } else if (r.status === 'rejected') {
        failCount += 1;
        console.warn(`[runWave] ${waveLabel} batch rejected:`, r.reason?.message || r.reason);
      }
    }
    if (failCount > 0) {
      console.warn(`[runWave] ${waveLabel}: ${failCount}/${plans.length} batch(es) failed; keeping partial results.`);
    }
    addUniqueQuestions(flattened);
  };

  // --- EXECUTE: 2-PHASE PRIORITY PIPELINE ---
  try {
      let globalBatchIdx = 0;

      if (conceptMap.length > 0) {
        // ── CONCEPT-AWARE PATH: route through HIGH → MODERATE → FILLER ──
        const tiers: ConceptPriority[] = ['HIGH', 'MODERATE', 'FILLER'];
        let remainingQuota = questionCount;

        for (const tier of tiers) {
            if (remainingQuota <= 0) break;
            
            const tierConcepts = conceptMap.filter(c => c.priority === tier);
            if (tierConcepts.length === 0) continue;
            
            let tierTarget = remainingQuota;
            const totalConcepts = conceptMap.length;
            if (tier === 'HIGH') {
               const prop = Math.ceil((tierConcepts.length / totalConcepts) * questionCount);
               tierTarget = Math.max(prop, Math.floor(questionCount * 0.5));
            } else if (tier === 'MODERATE') {
               const prop = Math.ceil((tierConcepts.length / totalConcepts) * questionCount);
               tierTarget = Math.max(prop, Math.floor(questionCount * 0.3));
            }
            tierTarget = Math.min(tierTarget, remainingQuota);
            
            onProgress(getLocale() === 'id'
      ? `Generating ${tier}-YIELD (${tierTarget} soal)…`
      : `Generating ${tier}-YIELD (${tierTarget} questions)…`);

            const tierLevelCounts: Array<{ style: ExamStyle; count: number }> = [];
            let tierAllocated = 0;
            sortedStyles.forEach((style, idx) => {
              const count = idx === sortedStyles.length - 1
                ? tierTarget - tierAllocated
                : Math.round((bloomPercentages[style] / 100) * tierTarget);
              tierLevelCounts.push({ style, count: Math.max(0, count) });
              tierAllocated += count;
            });

            for (const levelPlan of tierLevelCounts) {
                if (levelPlan.count <= 0) continue;
                
                const levelTarget = levelPlan.count;
                const levelBatches = Math.ceil(levelTarget / BATCH_SIZE);
                let levelCursor = 0;
                
                while (levelCursor < levelBatches) {
                    const plans: Array<{ batchIndex: number; count: number; bloomLevel?: ExamStyle; conceptTier?: ConceptPriority; tierConcepts?: ConceptNode[] }> = [];
                    const waveSize = Math.min(PARALLEL_BATCHES, levelBatches - levelCursor);
                    for (let slot = 0; slot < waveSize; slot++) {
                      const localIdx = levelCursor + slot;
                      const countForBatch = Math.min(BATCH_SIZE, levelTarget - (localIdx * BATCH_SIZE));
                      if (countForBatch > 0) {
                        plans.push({ 
                          batchIndex: globalBatchIdx, 
                          count: countForBatch, 
                          bloomLevel: levelPlan.style,
                          conceptTier: tier,
                          tierConcepts: tierConcepts
                        });
                        globalBatchIdx++;
                      }
                    }
                    await runWave(plans, `[${tier}] ${levelPlan.style}`);
                    levelCursor += waveSize;
                }
            }
            remainingQuota = questionCount - allGeneratedQuestions.length;
        }
      } else {
        // ── FLAT FALLBACK: Phase 1 failed or no material — generate per Bloom level directly ──
        console.log('[QuizGen] No concept map available, using flat Bloom-level generation.');
        const levelQuestionCounts: Array<{ style: ExamStyle; count: number }> = [];
        let allocated = 0;
        sortedStyles.forEach((style, idx) => {
          const count = idx === sortedStyles.length - 1
            ? questionCount - allocated
            : Math.round((bloomPercentages[style] / 100) * questionCount);
          levelQuestionCounts.push({ style, count: Math.max(1, count) });
          allocated += count;
        });

        for (const levelPlan of levelQuestionCounts) {
            const levelTarget = levelPlan.count;
            const levelBatches = Math.ceil(levelTarget / BATCH_SIZE);
            let levelCursor = 0;
            
            onProgress(getLocale() === 'id'
      ? `Generating ${levelPlan.style} (${levelTarget} soal)…`
      : `Generating ${levelPlan.style} (${levelTarget} questions)…`);

            while (levelCursor < levelBatches) {
                const plans: Array<{ batchIndex: number; count: number; bloomLevel?: ExamStyle }> = [];
                const waveSize = Math.min(PARALLEL_BATCHES, levelBatches - levelCursor);
                for (let slot = 0; slot < waveSize; slot++) {
                  const localIdx = levelCursor + slot;
                  const countForBatch = Math.min(BATCH_SIZE, levelTarget - (localIdx * BATCH_SIZE));
                  if (countForBatch > 0) {
                    plans.push({ batchIndex: globalBatchIdx, count: countForBatch, bloomLevel: levelPlan.style });
                    globalBatchIdx++;
                  }
                }
                await runWave(plans, `${levelPlan.style}`);
                levelCursor += waveSize;
            }
        }
      }

      // Top-up if deduplication removed too many questions (never abort whole quiz)
      let topUpRound = 0;
      let syntheticBatchIndex = globalBatchIdx;
      while (allGeneratedQuestions.length < questionCount && topUpRound < MAX_TOP_UP_ROUNDS) {
        topUpRound += 1;
        let madeProgressInRound = false;
        while (allGeneratedQuestions.length < questionCount) {
          const remaining = questionCount - allGeneratedQuestions.length;
          // Smaller waves late-stage: lower rate-limit / truncated-JSON risk
          const topUpBatchSize = Math.min(BATCH_SIZE, 6);
          const waveSize = Math.min(Math.min(PARALLEL_BATCHES, 3), Math.ceil(remaining / topUpBatchSize));
          if (waveSize <= 0) break;

          const plans: Array<{ batchIndex: number; count: number }> = [];
          for (let slot = 0; slot < waveSize; slot++) {
            const slotRemaining = remaining - (slot * topUpBatchSize);
            const countForBatch = Math.min(topUpBatchSize, slotRemaining);
            if (countForBatch > 0) {
              plans.push({ batchIndex: syntheticBatchIndex, count: countForBatch });
              syntheticBatchIndex += 1;
            }
          }

          if (plans.length === 0) break;
          const beforeWaveCount = allGeneratedQuestions.length;
          try {
            await runWave(plans, `Top-up ${topUpRound}`);
          } catch (topUpErr: any) {
            console.warn(`[Top-up ${topUpRound}] soft-fail:`, topUpErr?.message || topUpErr);
            break;
          }
          const addedThisWave = allGeneratedQuestions.length - beforeWaveCount;
          if (addedThisWave <= 0) {
            break;
          }
          madeProgressInRound = true;
        }
        if (!madeProgressInRound) break;
      }

      // Smart Overflow: still short → escalate Bloom, but in SMALL batches via generateBatch
      // (old path requested ALL remaining in one 16k-token call → JSON truncate / rate limit → hard fail)
      if (allGeneratedQuestions.length < questionCount) {
         const remainingTotal = questionCount - allGeneratedQuestions.length;
         onProgress(getLocale() === 'id'
           ? `Materi hampir habis. Membuat ${remainingTotal} soal tambahan (Smart Overflow)…`
           : `Material nearly exhausted. Adding ${remainingTotal} more questions (Smart Overflow)…`);
         
         const escalateBloom = (styles: ExamStyle[]): ExamStyle => {
            if (styles.includes(ExamStyle.C5_EVALUATION)) return ExamStyle.C5_EVALUATION;
            if (styles.includes(ExamStyle.C4_ANALYSIS)) return ExamStyle.C5_EVALUATION;
            if (styles.includes(ExamStyle.C3_APPLICATION)) return ExamStyle.C4_ANALYSIS;
            if (styles.includes(ExamStyle.C2_CONCEPT)) return ExamStyle.C3_APPLICATION;
            return ExamStyle.C2_CONCEPT; // C1 -> C2
         };
         
         const overflowStyle = escalateBloom(examStyles);
         const OVERFLOW_BATCH = 5;
         const OVERFLOW_ROUNDS = 4;
         let overflowRound = 0;
         let stagnant = 0;

         while (allGeneratedQuestions.length < questionCount && overflowRound < OVERFLOW_ROUNDS && stagnant < 2) {
           overflowRound += 1;
           const remaining = questionCount - allGeneratedQuestions.length;
           const countForBatch = Math.min(OVERFLOW_BATCH, remaining);
           const before = allGeneratedQuestions.length;
           try {
             onProgress(getLocale() === 'id'
               ? `Smart Overflow ${overflowRound}: +${countForBatch} soal (${overflowStyle})…`
               : `Smart Overflow ${overflowRound}: +${countForBatch} questions (${overflowStyle})…`);
             const known = allGeneratedQuestions.map(q => q.text);
             const more = await generateBatch(
               syntheticBatchIndex++,
               countForBatch,
               known,
               overflowStyle,
               'FILLER'
             );
             addUniqueQuestions(more as Question[]);
           } catch (e: any) {
             console.warn(`Smart Overflow round ${overflowRound} failed:`, e?.message || e);
             stagnant += 1;
             continue;
           }
           if (allGeneratedQuestions.length <= before) {
             stagnant += 1;
           } else {
             stagnant = 0;
           }
         }

         if (allGeneratedQuestions.length < questionCount) {
           onProgress(getLocale() === 'id'
             ? `Smart Overflow selesai partial: ${allGeneratedQuestions.length}/${questionCount} soal.`
             : `Smart Overflow finished partial: ${allGeneratedQuestions.length}/${questionCount} questions.`);
         }
      }

      if (allGeneratedQuestions.length < 1) {
         throw new Error(
           getLocale() === 'id'
             ? `Gagal generate soal dengan model ${selectedModel}. Coba ganti model, kurangi jumlah soal, atau perjelas materi.`
             : `Could not generate questions with model ${selectedModel}. Try another model, fewer questions, or clearer material.`
         );
      }

      // Partial success is OK — never throw just because count < target
      if (allGeneratedQuestions.length < questionCount) {
        console.warn(
          `[QuizGen] Returning ${allGeneratedQuestions.length}/${questionCount} questions (partial fill after top-up/overflow).`
        );
      }

      const finalQuestions = allGeneratedQuestions.slice(0, questionCount).map((q, index) => ({
        ...q,
        id: index + 1
      }));

      return { questions: finalQuestions, contextText, conceptMap };

  } catch (err: any) {
      console.error("Gemini Fatal Error:", err);
      // Last-chance salvage: if we already collected some questions, return them
      // instead of showing a full failure after a long successful run.
      if (allGeneratedQuestions.length > 0) {
        console.warn(
          `[QuizGen] Recovering ${allGeneratedQuestions.length} questions after late error:`,
          err?.message || err
        );
        onProgress(getLocale() === 'id'
          ? `Menyimpan ${allGeneratedQuestions.length} soal yang berhasil…`
          : `Saving ${allGeneratedQuestions.length} questions that succeeded…`);
        const finalQuestions = allGeneratedQuestions.slice(0, questionCount).map((q, index) => ({
          ...q,
          id: index + 1
        }));
        return { questions: finalQuestions, contextText, conceptMap };
      }
      throw err;
  }
};

export const chatWithDocument = async (apiKey: string, modelId: string, history: any[], message: string, contextText: string, file: File | null) => {
  const isVertexExpress = import.meta.env.VITE_USE_VERTEX_EXPRESS === 'true';
  const isFirebaseVertexAI = import.meta.env.VITE_USE_FIREBASE_VERTEX_AI === 'true';
  if (!apiKey && !isVertexExpress && !isFirebaseVertexAI) throw new Error("API key is not set.");

  const finalParts: any[] = [];

  const systemInstruction = `
    GOAL: Answer the user's question based ONLY on the provided CONTEXT MATERIAL or FILE.
    INSTRUCTIONS:
    1. Use only the provided context. Do not invent answers.
    2. If the answer is not in the context, politely state so.
    3. Be concise, helpful, and format with Markdown.
    ${outputLanguageRule()}
  `;

  // Bangun konteks materi sebagai bagian dari pesan user
  if (contextText) {
    finalParts.push({ text: `CONTEXT MATERIAL:\n${contextText}\n\nEND OF CONTEXT MATERIAL` });
  }

  if (file) {
    const filePart = await fileToGenerativePart(file);
    finalParts.push(filePart);
  }

  // Tambahkan pesan user yang sebenarnya
  finalParts.push({ text: message });

  const contents = [...history, { role: 'user', parts: finalParts }];

  try {
    const data = await callAI('chat', {
       apiKey,
       modelName: modelId || 'gemini-3.5-flash',
       contents: contents,
       systemInstruction,
       temperature: 0.3,
       maxOutputTokens: 8192
    });

    if (data.error) throw new Error(data.error);

    return data.result || "…";
  } catch (err: any) {
    console.error("Chat Error:", err);
    throw new Error("Could not process the message. Check connection or API key.");
  }
};

export const generateDeepInsight = async (
  groupedData: Record<string, { priority: string; questions: any[]; totalAnswers: number; correctAnswers: number }>,
  apiKey: string,
  onProgress?: (progress: number, total: number) => void
): Promise<DeepInsightData> => {
  const topics = Object.keys(groupedData);
  const resultData: Record<string, ConceptCardData> = {};
  
  const systemInstruction = `You are a sharp study tutor for Noodl. Be clear and practical. Output JSON only.\n${outputLanguageRule()}`;

  const CONCEPT_SCHEMA = {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 kalimat penjelasan konsep inti. Sederhana, tanpa jargon." },
      insights: {
        type: "array",
        items: {
          type: "object",
          properties: {
            point: { type: "string" },
            evidence: { type: "string", description: "Penjelasan atau bukti dari data soal" },
            formula: { type: "string", description: "Opsional: rumus atau kode yang relevan" }
          },
          required: ["point"]
        },
        description: "2-4 insight spesifik berdasarkan data soal"
      },
      traps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            trap: { type: "string", description: "Miskonsepsi atau jebakan umum" },
            correction: { type: "string", description: "Koreksi yang benar" }
          },
          required: ["trap", "correction"]
        },
        description: "1-2 jebakan umum berdasarkan opsi salah di data soal"
      },
      mnemonic: { type: "string", description: "Satu kalimat punchline, analogi, atau mnemonik jitu" },
      connections: { type: "array", items: { type: "string" }, description: "Konsep lain yang saling terkait" }
    },
    required: ["summary", "insights", "traps", "mnemonic", "connections"]
  };

  let completed = 0;
  
  // Phase 1: Generate concepts in parallel (batches of 3)
  const batchSize = 3;
  for (let i = 0; i < topics.length; i += batchSize) {
    const batch = topics.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (topic) => {
      const data = groupedData[topic];
      const accuracy = data.totalAnswers > 0 ? Math.round((data.correctAnswers / data.totalAnswers) * 100) : null;
      
      const prompt = `Buatkan deep insight untuk topik "${topic}".
DATA SOAL:
${JSON.stringify(data.questions, null, 2)}`;

      try {
        const response = await callAI('generateContent', {
          apiKey,
          modelName: 'gemini-3.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: CONCEPT_SCHEMA
        });
        
        if (response.error) throw new Error(response.error);
        
        let parsed = JSON.parse(response.result || "{}");
        resultData[topic] = {
          topic,
          priority: data.priority,
          accuracy,
          ...parsed
        };
      } catch (err) {
        console.error(`Failed to generate insight for \${topic}`, err);
        // Fallback card
        resultData[topic] = {
          topic, priority: data.priority, accuracy,
          summary: "Gagal memuat insight untuk topik ini.",
          insights: [], traps: [], mnemonic: "", connections: []
        };
      }
      
      completed++;
      if (onProgress) onProgress(completed, topics.length + 1);
    }));
  }

  // Phase 2: Overall Summary
  const SUMMARY_SCHEMA = {
    type: "object",
    properties: {
      overallAssessment: { type: "string", description: "Analisis singkat kemampuan user secara keseluruhan" },
      strongAreas: { type: "array", items: { type: "string" } },
      weakAreas: { type: "array", items: { type: "string" } },
      studyPlan: { type: "string", description: "Saran belajar konkret" },
      motivationalQuote: { type: "string" }
    },
    required: ["overallAssessment", "strongAreas", "weakAreas", "studyPlan", "motivationalQuote"]
  };

  let summaryData: any = {
      overallAssessment: "Kuis selesai dianalisis.",
      strongAreas: [], weakAreas: [], studyPlan: "Terus semangat belajar!", motivationalQuote: "Kamu pasti bisa!"
  };

  try {
    const summaryPrompt = `Buatkan kesimpulan akhir untuk hasil kuis ini.
DATA TOPIK & AKURASI:
${JSON.stringify(
    Object.values(resultData).map(d => ({ topic: d.topic, accuracy: d.accuracy, priority: d.priority })), null, 2
)}`;

    const response = await callAI('generateContent', {
      apiKey,
      modelName: 'gemini-3.5-flash',
      contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: SUMMARY_SCHEMA
    });

    if (!response.error) {
       summaryData = JSON.parse(response.result || "{}");
    }
  } catch (err) {
    console.error("Failed to generate overall summary", err);
  }
  
  if (onProgress) onProgress(topics.length + 1, topics.length + 1);

  return {
    summary: summaryData,
    topics: resultData
  };
};

