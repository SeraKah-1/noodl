import { outputLanguageRule } from "./languagePolicy";
import { getLocale } from "./i18n";
/**
 * ==========================================
 * VISUALIZATION SERVICE (2-PHASE AI PIPELINE)
 * ==========================================
 * Phase 1: Scan material → identify visualizable concepts
 * Phase 2: Generate self-contained interactive HTML simulations
 *
 * Uses the SAME multi-provider router as quiz generate (Settings → AI providers).
 */

import type { VisualizationBlueprint, VisualizationResult, VisualizationType } from "../types";
import {
  callAI,
  getActiveProvider,
  getActiveModel,
  resolveModelName,
} from "./geminiService";
import { getProviderApiKey } from "./providerService";

/** Always use the model selected in Settings (global, Vertex-style). */
function globalModel(): string {
  const p = getActiveProvider();
  return resolveModelName(p, getActiveModel(p));
}
function scanModel(): string {
  return globalModel();
}
function genModel(): string {
  return globalModel();
}
function fallbackModel(): string {
  return globalModel();
}

// ─── INTERNAL AI CALL → global Settings pipeline ───
async function callVisualizationAI(payload: {
  modelName: string;
  contents: any[];
  systemInstruction?: string;
  responseSchema?: any;
  temperature?: number;
  maxOutputTokens?: number;
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
        error: `API key for ${provider} is missing. Open Settings → AI providers, paste key, Save.`,
      };
    }
    // Flatten Gemini-style contents to text parts for OpenAI-compatible providers
    const data = await callAI('visualization', {
      apiKey: apiKey || undefined,
      modelName: resolved,
      contents,
      systemInstruction:
        typeof systemInstruction === 'string'
          ? systemInstruction
          : systemInstruction,
      responseSchema,
      temperature,
      maxOutputTokens: maxOutputTokens ?? 8192,
    });
    if (data?.error) return { result: '', error: String(data.error) };
    return { result: data?.result || '' };
  } catch (err: any) {
    console.error(`[VisualizationAI] Error with ${resolved}:`, err);
    return { result: '', error: err.message || 'Unknown AI error' };
  }
}

// ═══════════════════════════════════════════
// PHASE 1: SCAN FOR VISUALIZATIONS
// ═══════════════════════════════════════════

const scanSystemInstruction = (materialSample?: string) => `ROLE: You are an instructional designer specializing in educational visualizations.
TASK: Extract concepts from the material that are best explained visually.
${outputLanguageRule(materialSample)}
Return structured concept blueprints only.`;

const SCAN_SCHEMA = {
  type: "ARRAY" as const,
  items: {
    type: "OBJECT" as const,
    properties: {
      concept: { type: "STRING" as const, description: "Specific concept name (3-8 words). Follow OUTPUT LANGUAGE." },
      vizType: { type: "STRING" as const, description: "SIMULATION | DIAGRAM | CHART | PROCESS_FLOW | 3D_MODEL" },
      description: { type: "STRING" as const, description: "Short description of the visualization. Follow OUTPUT LANGUAGE." },
      variables: {
        type: "ARRAY" as const,
        items: { type: "STRING" as const },
        description: "Interactive parameters the user can change"
      },
      priority: { type: "STRING" as const, description: "HIGH | MODERATE | LOW" },
      rationale: { type: "STRING" as const, description: "Why this concept needs visualization. Follow OUTPUT LANGUAGE." }
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

  const langBlock = outputLanguageRule(materialText);
  const prompt = `Analyze the material and list concepts that benefit from interactive visualization.

MATERIAL:
"""
${materialText.substring(0, 100000)}
"""

${langBlock}
Return a JSON array of visualization concepts.`;

  const data = await callVisualizationAI({
    modelName: scanModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(materialText),
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
    const conceptFallback = getLocale() === 'id' ? 'Konsep' : 'Concept';

    return parsed.map((item: any, idx: number) => ({
      id: `viz-${Date.now()}-${idx}`,
      concept: String(item.concept || conceptFallback),
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

const generationSystemInstruction = (materialSample?: string) => `ROLE: You build single-file interactive HTML5 learning simulations.
Make them clear, responsive, and useful for studying.
${outputLanguageRule(materialSample)}
All control labels, instructions, button text, tooltips, and dynamic explanations in the HTML MUST follow the output language rule.`;

const GENERATION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    htmlCode: {
      type: "STRING" as const,
      description: "Complete self-contained HTML file with embedded CSS and JS"
    },
    explanation: {
      type: "STRING" as const,
      description: "Short explanation of what the visualization shows (follow OUTPUT LANGUAGE)"
    },
    interactionGuide: {
      type: "STRING" as const,
      description: "Short how-to-interact guide (follow OUTPUT LANGUAGE)"
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

  const langBlock = outputLanguageRule(materialContext || blueprint.description || blueprint.concept);
  const variablesStr = blueprint.variables.length > 0
    ? `\nINTERACTIVE VARIABLES (must include a control for each):\n${blueprint.variables.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
    : '';

  let prompt = '';
  if (userFeedback && existingHtmlCode) {
    prompt = `You are refining an existing single-file HTML5 interactive visualization based on user feedback.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
${variablesStr}

CURRENT HTML (use as the base; change only what feedback requires):
"""
${existingHtmlCode}
"""

USER FEEDBACK (apply precisely):
"""
${userFeedback}
"""

MATERIAL CONTEXT (use for factual accuracy):
"""
${materialContext.substring(0, 20000)}
"""

${langBlock}

Tasks:
1. Apply the feedback precisely.
2. Keep the HTML self-contained, responsive, and interactive.
3. Do not remove unrelated JS/CSS that still works.
4. Return full data matching the schema.`;
  } else {
    prompt = `Build an interactive visualization for:

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
${variablesStr}

MATERIAL CONTEXT (use for factual accuracy):
"""
${materialContext.substring(0, 30000)}
"""

${langBlock}

Generate complete, interactive, polished HTML. All visible UI text must follow OUTPUT LANGUAGE.`;
  }

  // Helper function to execute AI and parse the output
  const attemptGeneration = async (modelName: string) => {
    const data = await callVisualizationAI({
      modelName: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: generationSystemInstruction(materialContext),
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
    const parsedData = await attemptGeneration(genModel());
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: parsedData.htmlCode,
      explanation: parsedData.explanation,
      interactionGuide: parsedData.interactionGuide,
      status: 'success'
    };
  } catch (primaryErr: any) {
    console.warn(`[Phase 2] Primary model failed for "${blueprint.concept}": ${primaryErr.message}`);
    onProgress?.(getLocale() === 'id'
      ? `⚡ Mencoba model lanjutan untuk: ${blueprint.concept}…`
      : `⚡ Trying a stronger model for: ${blueprint.concept}…`);
    try {
      const fallbackData = await attemptGeneration(fallbackModel());
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: fallbackData.htmlCode,
        explanation: fallbackData.explanation,
        interactionGuide: fallbackData.interactionGuide,
        status: 'success'
      };
    } catch (fallbackErr: any) {
      console.error(`[Phase 2] Fallback model also failed for "${blueprint.concept}":`, fallbackErr);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: '',
        explanation: '',
        interactionGuide: '',
        status: 'error',
        error: `Gagal memproses visualisasi: ${fallbackErr.message || primaryErr.message}`
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
    modelName: scanModel(),
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
