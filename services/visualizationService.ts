import { outputLanguageRule } from "./languagePolicy";
import { getLocale } from "./i18n";
/**
 * ==========================================
 * VISUALIZATION SERVICE (2-PHASE AI PIPELINE)
 * ==========================================
 * Phase 1: Scan material → identify visualizable concepts
 * Phase 2: Generate self-contained interactive HTML simulations
 * 
 * Uses Gemini 3+ models only via Firebase Vertex AI.
 */

import { getFirebaseVertexAIModel } from "../supabase";
type FirebaseGenerationConfig = Record<string, unknown>;
import type { VisualizationBlueprint, VisualizationResult, VisualizationType } from "../types";

// ─── CONFIG ───
const SCAN_MODEL: string = 'gemini-3.5-flash';
const GENERATION_MODEL: string = 'gemini-3.1-pro-preview';
const FALLBACK_GENERATION_MODEL: string = 'gemini-3.5-flash';

// ─── INTERNAL AI CALL (same routing as geminiService) ───
async function callVisualizationAI(payload: {
  modelName: string;
  contents: any[];
  systemInstruction?: string;
  responseSchema?: any;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<{ result: string; error?: string }> {
  const { modelName, contents, systemInstruction, responseSchema, temperature, maxOutputTokens } = payload;

  try {
    const genConfig: Partial<FirebaseGenerationConfig> = {};
    if (responseSchema) {
      genConfig.responseMimeType = "application/json";
      genConfig.responseSchema = responseSchema;
    }
    if (temperature !== undefined) genConfig.temperature = temperature;
    if (maxOutputTokens) genConfig.maxOutputTokens = maxOutputTokens;

    const model = getFirebaseVertexAIModel(
      modelName,
      genConfig,
      systemInstruction
    );

    const result = await model.generateContent({ contents });
    return { result: result.response.text() };
  } catch (err: any) {
    console.error(`[VisualizationAI] Error with ${modelName}:`, err);
    return { result: '', error: err.message || 'Unknown AI error' };
  }
}

// ═══════════════════════════════════════════
// PHASE 1: SCAN FOR VISUALIZATIONS
// ═══════════════════════════════════════════

const scanSystemInstruction = () => `ROLE: You are an instructional designer specializing in educational visualizations.
TASK: Extract concepts from the material that are best explained visually.
${outputLanguageRule()}
Return structured concept blueprints only.`;

const SCAN_SCHEMA = {
  type: "ARRAY" as const,
  items: {
    type: "OBJECT" as const,
    properties: {
      concept: { type: "STRING" as const, description: "Nama konsep spesifik (3-8 kata)" },
      vizType: { type: "STRING" as const, description: "SIMULATION | DIAGRAM | CHART | PROCESS_FLOW | 3D_MODEL" },
      description: { type: "STRING" as const, description: "Deskripsi singkat visualisasi yang akan dibuat" },
      variables: {
        type: "ARRAY" as const,
        items: { type: "STRING" as const },
        description: "Parameter interaktif yang bisa diubah user"
      },
      priority: { type: "STRING" as const, description: "HIGH | MODERATE | LOW" },
      rationale: { type: "STRING" as const, description: "Alasan mengapa konsep ini perlu divisualisasikan" }
    },
    required: ["concept", "vizType", "description", "variables", "priority", "rationale"] as const
  }
};

export async function scanForVisualizations(
  materialText: string,
  onProgress?: (msg: string) => void
): Promise<VisualizationBlueprint[]> {
  onProgress?.(getLocale() === 'id'
    ? "🔍 AI sedang memindai materi untuk konsep yang bisa divisualisasikan…"
    : "🔍 Scanning material for visualizable concepts…");

  const prompt = `Analyze the material and list concepts that benefit from interactive visualization.

MATERIAL:
"""
${materialText.substring(0, 100000)}
"""

${outputLanguageRule()}
Return a JSON array of visualization concepts.`;

  const data = await callVisualizationAI({
    modelName: SCAN_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 4096
  });

  if (data.error) {
    console.error("[Phase 1] Scan failed:", data.error);
    return [];
  }

  try {
    let jsonStr = data.result;
    // Clean up potential markdown wrapping
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
    // Remove thinking tags
    if (jsonStr.includes('<thinking>')) {
      jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    }

    const startIdx = jsonStr.indexOf('[');
    const endIdx = jsonStr.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error("No array found in response");

    const parsed = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
    if (!Array.isArray(parsed)) throw new Error("Parsed result is not an array");

    const validVizTypes: VisualizationType[] = ['SIMULATION', 'DIAGRAM', 'CHART', 'PROCESS_FLOW', '3D_MODEL'];

    return parsed.map((item: any, idx: number) => ({
      id: `viz-${Date.now()}-${idx}`,
      concept: String(item.concept || 'Konsep'),
      vizType: validVizTypes.includes(item.vizType) ? item.vizType as VisualizationType : 'DIAGRAM',
      description: String(item.description || ''),
      variables: Array.isArray(item.variables) ? item.variables.map(String) : [],
      priority: (['HIGH', 'MODERATE', 'LOW'].includes(item.priority) ? item.priority : 'MODERATE') as 'HIGH' | 'MODERATE' | 'LOW',
      rationale: String(item.rationale || '')
    }));
  } catch (err) {
    console.error("[Phase 1] Parse error:", err);
    return [];
  }
}


// ═══════════════════════════════════════════
// PHASE 2: GENERATE VISUALIZATION
// ═══════════════════════════════════════════

const generationSystemInstruction = () => `ROLE: You build single-file interactive HTML5 learning simulations.
Make them clear, responsive, and useful for studying.
${outputLanguageRule()}
All control labels, instructions, and dynamic explanations in the HTML must follow the output language rule.`;

const GENERATION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    htmlCode: {
      type: "STRING" as const,
      description: "Complete self-contained HTML file with embedded CSS and JS"
    },
    explanation: {
      type: "STRING" as const,
      description: "Penjelasan singkat apa yang ditunjukkan visualisasi ini (the required output language)"
    },
    interactionGuide: {
      type: "STRING" as const,
      description: "Panduan singkat cara berinteraksi (the required output language)"
    }
  },
  required: ["htmlCode", "explanation", "interactionGuide"] as const
};

export async function generateVisualization(
  blueprint: VisualizationBlueprint,
  materialContext: string,
  onProgress?: (msg: string) => void,
  userFeedback?: string,
  existingHtmlCode?: string
): Promise<VisualizationResult> {
  onProgress?.(userFeedback
    ? (getLocale() === 'id' ? `⚡ Memperbarui visualisasi: ${blueprint.concept}…` : `⚡ Updating visualization: ${blueprint.concept}…`)
    : (getLocale() === 'id' ? `⚡ Membuat visualisasi: ${blueprint.concept}…` : `⚡ Building visualization: ${blueprint.concept}…`));

  const variablesStr = blueprint.variables.length > 0
    ? `\nINTERACTIVE VARIABLES (wajib ada kontrol untuk masing-masing):\n${blueprint.variables.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
    : '';

  let prompt = '';
  if (userFeedback && existingHtmlCode) {
    prompt = `Anda sedang memperbarui dan menyempurnakan visualisasi interaktif (HTML5 single-file) yang sudah ada berdasarkan umpan balik pengguna.

KONSEP: ${blueprint.concept}
TIPE: ${blueprint.vizType}
DESKRIPSI: ${blueprint.description}
${variablesStr}

KODE HTML SAAT INI (Gunakan kode ini sebagai dasar, perbaiki bagian yang diminta secara presisi):
"""
${existingHtmlCode}
"""

UMPAN BALIK PERBAIKAN PENGGUNA (Terapkan perubahan ini secara tepat):
"""
${userFeedback}
"""

KONTEKS MATERI (gunakan data/fakta dari sini untuk akurasi):
"""
${materialContext.substring(0, 20000)}
"""

Tugas Anda:
1. Pahami umpan balik perbaikan pengguna secara presisi.
2. Perbarui kode HTML saat ini dengan menerapkan umpan balik tersebut secara kreatif.
3. Pastikan kode HTML baru tetap mandiri (self-contained), responsif, dan mempertahankan fungsionalitas, interaktivitas, serta visualisasi data yang sudah ada sebelumnya.
4. JANGAN menghapus kode JS atau CSS yang tidak berkaitan dengan perbaikan.
5. Kembalikan data lengkap sesuai skema.`;
  } else {
    prompt = `Buatkan visualisasi interaktif untuk konsep berikut:

KONSEP: ${blueprint.concept}
TIPE: ${blueprint.vizType}
DESKRIPSI: ${blueprint.description}
${variablesStr}

KONTEKS MATERI (gunakan data/fakta dari sini untuk akurasi):
"""
${materialContext.substring(0, 30000)}
"""

Generate kode HTML yang lengkap, interaktif, dan indah.`;
  }

  // Helper function to execute AI and parse the output
  const attemptGeneration = async (modelName: string) => {
    const data = await callVisualizationAI({
      modelName: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: generationSystemInstruction(),
      responseSchema: GENERATION_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 16384
    });

    if (data.error) {
      throw new Error(data.error);
    }

    let jsonStr = data.result;
    if (!jsonStr) {
      throw new Error("Empty response from AI");
    }

    // Clean up potential markdown code block backticks
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
    if (jsonStr.includes('<thinking>')) {
      jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    }

    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("No object found in response");
    }

    const parsed = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
    const htmlCode = String(parsed.htmlCode || '');
    if (!htmlCode || htmlCode.length < 100) {
      throw new Error("Generated HTML is too short or empty");
    }

    return {
      htmlCode,
      explanation: String(parsed.explanation || 'Visualisasi interaktif'),
      interactionGuide: String(parsed.interactionGuide || 'Gunakan kontrol di layar untuk berinteraksi')
    };
  };

  try {
    // Try primary model first
    const parsedData = await attemptGeneration(GENERATION_MODEL);
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: parsedData.htmlCode,
      explanation: parsedData.explanation,
      interactionGuide: parsedData.interactionGuide,
      status: 'success'
    };
  } catch (primaryErr: any) {
    console.warn(`[Phase 2] Primary model (${GENERATION_MODEL}) failed for "${blueprint.concept}": ${primaryErr.message}`);
    
    if (GENERATION_MODEL !== FALLBACK_GENERATION_MODEL) {
      onProgress?.(getLocale() === 'id'
        ? `⚡ Mencoba model lanjutan untuk: ${blueprint.concept}…`
        : `⚡ Trying a stronger model for: ${blueprint.concept}…`);
      try {
        const fallbackData = await attemptGeneration(FALLBACK_GENERATION_MODEL);
        return {
          id: blueprint.id,
          blueprint,
          htmlCode: fallbackData.htmlCode,
          explanation: fallbackData.explanation,
          interactionGuide: fallbackData.interactionGuide,
          status: 'success'
        };
      } catch (fallbackErr: any) {
        console.error(`[Phase 2] Fallback model (${FALLBACK_GENERATION_MODEL}) also failed for "${blueprint.concept}":`, fallbackErr);
        return {
          id: blueprint.id,
          blueprint,
          htmlCode: '',
          explanation: '',
          interactionGuide: '',
          status: 'error',
          error: `Gagal memproses visualisasi: ${fallbackErr.message}`
        };
      }
    } else {
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: '',
        explanation: '',
        interactionGuide: '',
        status: 'error',
        error: `Gagal memproses visualisasi: ${primaryErr.message}`
      };
    }
  }
}

// ─── BATCH GENERATION (Progressive) ───
export async function generateVisualizations(
  blueprints: VisualizationBlueprint[],
  materialContext: string,
  onResult: (result: VisualizationResult, index: number, total: number) => void,
  onProgress?: (msg: string) => void
): Promise<VisualizationResult[]> {
  const results: VisualizationResult[] = [];

  // Generate sequentially (not parallel) to avoid rate limits and provide progressive loading
  for (let i = 0; i < blueprints.length; i++) {
    onProgress?.(getLocale() === 'id'
      ? `⚡ Membuat visualisasi ${i + 1}/${blueprints.length}: ${blueprints[i].concept}…`
      : `⚡ Building visualization ${i + 1}/${blueprints.length}: ${blueprints[i].concept}…`);
    const result = await generateVisualization(blueprints[i], materialContext, onProgress);
    results.push(result);
    onResult(result, i, blueprints.length);
  }

  return results;
}

// ─── FITUR 4: SCAN FOR ADDITIONAL VISUALIZATIONS ───
// Scans material for NEW concepts not already visualized
export async function scanForAdditionalVisualizations(
  materialText: string,
  existingConcepts: string[],
  onProgress?: (msg: string) => void
): Promise<VisualizationBlueprint[]> {
  onProgress?.(getLocale() === 'id'
    ? '🔍 Mencari konsep tambahan yang belum divisualisasikan…'
    : '🔍 Looking for more concepts to visualize…');

  const existingList = existingConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const prompt = `Analisis materi berikut dan identifikasi konsep-konsep BARU yang bisa divisualisasikan.

KONSEP YANG SUDAH DIBUAT (JANGAN ULANGI):
"""
${existingList}
"""

MATERI:
"""
${materialText.substring(0, 100000)}
"""

Cari konsep yang BERBEDA dari yang sudah ada di atas. Fokus pada sub-topik, detail, atau perspektif yang belum di-cover.
Kembalikan array JSON berisi konsep-konsep BARU yang bisa divisualisasikan.`;

  const data = await callVisualizationAI({
    modelName: SCAN_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.3,
    maxOutputTokens: 4096
  });

  if (data.error) {
    console.error('[Phase 1 Additional] Scan failed:', data.error);
    return [];
  }

  try {
    let jsonStr = data.result;
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
    if (jsonStr.includes('<thinking>')) {
      jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    }

    const startIdx = jsonStr.indexOf('[');
    const endIdx = jsonStr.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) throw new Error('No array found');

    const parsed = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
    if (!Array.isArray(parsed)) throw new Error('Not an array');

    const validVizTypes: VisualizationType[] = ['SIMULATION', 'DIAGRAM', 'CHART', 'PROCESS_FLOW', '3D_MODEL'];

    // Filter out any that match existing concepts (case-insensitive)
    const existingLower = new Set(existingConcepts.map(c => c.toLowerCase().trim()));

    return parsed
      .filter((item: any) => !existingLower.has(String(item.concept || '').toLowerCase().trim()))
      .map((item: any, idx: number) => ({
        id: `viz-add-${Date.now()}-${idx}`,
        concept: String(item.concept || 'Konsep'),
        vizType: validVizTypes.includes(item.vizType) ? item.vizType as VisualizationType : 'DIAGRAM',
        description: String(item.description || ''),
        variables: Array.isArray(item.variables) ? item.variables.map(String) : [],
        priority: (['HIGH', 'MODERATE', 'LOW'].includes(item.priority) ? item.priority : 'MODERATE') as 'HIGH' | 'MODERATE' | 'LOW',
        rationale: String(item.rationale || '')
      }));
  } catch (err) {
    console.error('[Phase 1 Additional] Parse error:', err);
    return [];
  }
}
