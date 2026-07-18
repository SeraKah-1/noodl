import { outputLanguageRule } from "./languagePolicy";
import { getLocale } from "./i18n";

/**
 * ==========================================
 * GRAPH VIEW SERVICE (Knowledge Graph)
 * ==========================================
 * Same multi-provider AI pipeline as quiz generate (Settings → AI providers).
 */

import type { Question } from '../types';
import {
  callAI,
  getActiveProvider,
  defaultModelForProvider,
  resolveModelName,
} from './geminiService';
import { getProviderApiKey } from './providerService';

// ── TYPES ──

export interface GraphNode {
  id: string;
  label: string;           // Concept name
  category: string;        // Grouping
  importance: 'core' | 'supporting' | 'detail';
  questionCount: number;   // Related questions
  accuracy?: number;       // % correct answers (if result available)
}

export interface GraphEdge {
  source: string;          // Node ID
  target: string;          // Node ID
  relationship: string;    // "menyebabkan", "bagian dari", etc.
  strength: 'strong' | 'moderate' | 'weak';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;         // AI summary
  generatedAt: string;
}

export interface GraphViewResult {
  data: GraphData;
  htmlCode: string;        // Self-contained interactive HTML
  status: 'success' | 'error';
  error?: string;
}

// ── AI CONFIG (resolved per active provider) ──

function extractModel(): string {
  const p = getActiveProvider();
  return p === 'gemini' ? 'gemini-2.0-flash' : defaultModelForProvider(p);
}
function renderModel(): string {
  const p = getActiveProvider();
  return p === 'gemini' ? 'gemini-2.0-flash' : defaultModelForProvider(p);
}

async function callGraphAI(payload: {
  modelName: string;
  contents: any[];
  systemInstruction?: string;
  responseSchema?: any;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}): Promise<{ result: string; error?: string }> {
  const { modelName, contents, systemInstruction, responseSchema, temperature, maxOutputTokens } =
    payload;
  const provider = getActiveProvider();
  const apiKey = getProviderApiKey(provider);
  const resolved = resolveModelName(provider, modelName);

  try {
    if (!apiKey && provider !== 'gemini') {
      return {
        result: '',
        error: `API key for ${provider} is missing. Open Settings → AI providers.`,
      };
    }
    const data = await callAI('knowledgeGraph', {
      apiKey: apiKey || undefined,
      modelName: resolved,
      contents,
      systemInstruction,
      responseSchema,
      temperature: temperature ?? 0.3,
      maxOutputTokens: maxOutputTokens ?? 8192,
    });
    if (data?.error) return { result: '', error: String(data.error) };
    return { result: data?.result || '' };
  } catch (err: any) {
    console.error(`[GraphView AI] Error with ${resolved}:`, err);
    return { result: '', error: err.message || 'AI call failed' };
  }
}

// ── PHASE 1: EXTRACT GRAPH DATA ──

export async function extractGraphData(
  questions: Question[],
  materialContext?: string,
  onProgress?: (msg: string) => void
): Promise<GraphData> {
  onProgress?.(getLocale() === 'id' ? '🔍 Menganalisis konsep dan relasi antar soal…' : '🔍 Analyzing concepts and relationships…');

  if (questions.length < 3) {
    throw new Error('Minimal 3 soal diperlukan untuk membuat knowledge graph.');
  }

  // Build question summary for AI
  const questionSummary = questions.slice(0, 100).map((q, i) => {
    return `Soal ${i + 1}: ${q.text}\nKey Point: ${q.keyPoint || 'N/A'}\nPenjelasan: ${q.explanation || 'N/A'}`;
  }).join('\n\n');

  const prompt = `Analisis soal-soal berikut dan buat peta konsep (knowledge graph) dari materi yang diujikan.

SOAL-SOAL:
"""
${questionSummary}
"""

${materialContext ? `KONTEKS MATERI TAMBAHAN:\n"""\n${materialContext.substring(0, 50000)}\n"""` : ''}

INSTRUKSI:
1. Identifikasi semua konsep utama yang dibahas dalam soal-soal di atas.
2. Tentukan hubungan (relasi) antar konsep tersebut.
3. Kelompokkan konsep ke dalam kategori yang sesuai.
4. Hitung berapa soal yang berkaitan dengan setiap konsep.
5. Tentukan tingkat kepentingan (core/supporting/detail) berdasarkan frekuensi dan sentralitas.
6. Maksimal 40 nodes dan 60 edges.

Kembalikan response dalam format JSON yang tepat.`;

  const schema = {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            category: { type: 'string' },
            importance: { type: 'string', enum: ['core', 'supporting', 'detail'] },
            questionCount: { type: 'integer' }
          },
          required: ['id', 'label', 'category', 'importance', 'questionCount']
        }
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            relationship: { type: 'string' },
            strength: { type: 'string', enum: ['strong', 'moderate', 'weak'] }
          },
          required: ['source', 'target', 'relationship', 'strength']
        }
      },
      summary: { type: 'string' }
    },
    required: ['nodes', 'edges', 'summary']
  };

  const data = await callGraphAI({
    modelName: extractModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    responseSchema: schema as any,
    temperature: 0.2,
    maxOutputTokens: 8192
  });

  if (data.error) {
    throw new Error(`AI analysis failed: ${data.error}`);
  }

  const text = data.result;

  try {
    const parsed = JSON.parse(text);
    return {
      nodes: parsed.nodes || [],
      edges: parsed.edges || [],
      summary: parsed.summary || '',
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    // Try to extract JSON from text
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.substring(start, end + 1));
      return {
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        summary: parsed.summary || '',
        generatedAt: new Date().toISOString()
      };
    }
    throw new Error('Gagal parse graph data dari AI response.');
  }
}

// ── PHASE 2: GENERATE INTERACTIVE HTML ──

export async function generateGraphHTML(
  graphData: GraphData,
  title: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.(getLocale() === 'id' ? '🎨 Membuat visualisasi knowledge graph…' : '🎨 Building interactive knowledge graph…');

  const prompt = `Buat halaman HTML interaktif yang menampilkan knowledge graph (peta konsep) berikut.

DATA GRAPH (JSON):
"""
${JSON.stringify(graphData, null, 2)}
"""

JUDUL: "${title}"

REQUIREMENTS:
1. Buat graph visualization menggunakan HTML5 Canvas (TANPA library eksternal, TANPA CDN).
2. Setiap node ditampilkan sebagai lingkaran/kotak dengan label.
3. Node dengan importance='core' harus lebih besar dan berwarna lebih mencolok.
4. Edges ditampilkan sebagai garis penghubung dengan label relasi.
5. Warna node berbeda per category (gunakan palette yang estetik).
6. Node bisa di-drag untuk mengatur posisi.
7. Hover pada node menampilkan tooltip dengan detail (category, jumlah soal).
8. Hover pada edge menampilkan label relasi.
9. Zoom (scroll) dan pan (click-drag background) support.
10. Layout awal menggunakan force-directed algorithm sederhana.
11. Responsive dan berfungsi di mobile.
12. Tampilkan summary text di bawah graph.
13. Tampilkan legend (warna per category).
14. Desain modern, clean, dark-mode friendly dengan background gelap.

OUTPUT: Satu file HTML lengkap dengan inline CSS dan JavaScript. HANYA HTML, tanpa markdown, tanpa penjelasan. Mulai dengan <!DOCTYPE html>.`;

  const data = await callGraphAI({
    modelName: renderModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    temperature: 0.4,
    maxOutputTokens: 32768
  });

  if (data.error) {
    throw new Error(`Graph HTML generation failed: ${data.error}`);
  }

  let html = data.result;
  
  // Clean up response
  if (html.includes('```html')) {
    html = html.replace(/```html/gi, '').replace(/```/g, '').trim();
  }
  if (html.includes('```')) {
    html = html.replace(/```/g, '').trim();
  }

  // Validate it starts with HTML
  if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
    const htmlStart = html.indexOf('<!DOCTYPE');
    if (htmlStart !== -1) {
      html = html.substring(htmlStart);
    } else {
      throw new Error('AI tidak menghasilkan HTML yang valid.');
    }
  }

  return html;
}

// ── FULL PIPELINE ──

export async function generateKnowledgeGraph(
  questions: Question[],
  title: string,
  materialContext?: string,
  onProgress?: (msg: string) => void
): Promise<GraphViewResult> {
  try {
    // Phase 1: Extract data
    const graphData = await extractGraphData(questions, materialContext, onProgress);
    
    if (graphData.nodes.length === 0) {
      return {
        data: graphData,
        htmlCode: '',
        status: 'error',
        error: 'AI tidak menemukan konsep yang cukup untuk membuat graph.'
      };
    }

    onProgress?.(`✅ Ditemukan ${graphData.nodes.length} konsep dan ${graphData.edges.length} relasi.`);

    // Phase 2: Generate HTML
    const htmlCode = await generateGraphHTML(graphData, title, onProgress);

    onProgress?.('🎉 Knowledge Graph berhasil dibuat!');

    return {
      data: graphData,
      htmlCode,
      status: 'success'
    };
  } catch (err: any) {
    return {
      data: { nodes: [], edges: [], summary: '', generatedAt: new Date().toISOString() },
      htmlCode: '',
      status: 'error',
      error: err.message || 'Gagal membuat knowledge graph.'
    };
  }
}
