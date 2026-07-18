import { outputLanguageRule } from "./languagePolicy";
import { getLocale } from "./i18n";
/**
 * ==========================================
 * VISUALIZATION SERVICE (scan + parallel gen)
 * ==========================================
 * Phase 1: Scan material → blueprints (small JSON)
 * Phase 2: Generate each sim in parallel waves (like quiz batches)
 *
 * Best practice (not oneshot mega-HTML for all sims):
 * - Small structured scan first
 * - Per-concept HTML generation with concurrency limit
 * - Direct HTML preferred over JSON-wrapped HTML (less truncate)
 * - Shared callAI + Settings model/key
 */

import type { VisualizationBlueprint, VisualizationResult, VisualizationType } from "../types";
import {
  callAI,
  getActiveProvider,
  getActiveModel,
  resolveModelName,
  parseAIJsonObject,
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

// ─── INTERNAL AI CALL → global Settings pipeline ───
async function callVisualizationAI(payload: {
  modelName: string;
  contents: any[];
  systemInstruction?: string;
  responseSchema?: any;
  temperature?: number;
  maxOutputTokens?: number;
  action?: string;
}): Promise<{ result: string; error?: string }> {
  const {
    modelName,
    contents,
    systemInstruction,
    responseSchema,
    temperature,
    maxOutputTokens,
    action = 'visualization',
  } = payload;
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
    const data = await callAI(action, {
      apiKey: apiKey || undefined,
      modelName: resolved,
      contents,
      systemInstruction:
        typeof systemInstruction === 'string'
          ? systemInstruction
          : systemInstruction,
      responseSchema,
      temperature,
      maxOutputTokens: maxOutputTokens ?? 4096,
    });
    if (data?.error) return { result: '', error: String(data.error) };
    return { result: data?.result || '' };
  } catch (err: any) {
    console.error(`[VisualizationAI] Error with ${resolved}:`, err);
    return { result: '', error: err.message || 'Unknown AI error' };
  }
}

function extractHtmlDocument(raw: string): string {
  let html = String(raw || '');
  if (html.includes('```')) {
    html = html.replace(/```html/gi, '').replace(/```/g, '').trim();
  }
  if (html.includes('<thinking>')) {
    html = html.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }
  // Prefer full document
  const doctype = html.search(/<!DOCTYPE\s+html/i);
  if (doctype >= 0) return html.slice(doctype).trim();
  const htmlTag = html.search(/<html[\s>]/i);
  if (htmlTag >= 0) return html.slice(htmlTag).trim();
  // JSON wrapper { htmlCode: "..." }
  try {
    const obj = parseAIJsonObject(html);
    if (obj.htmlCode && String(obj.htmlCode).length > 80) return String(obj.htmlCode);
    if (obj.html && String(obj.html).length > 80) return String(obj.html);
  } catch {
    /* not json */
  }
  if (html.includes('<') && html.length > 100) return html;
  throw new Error('No usable HTML in AI response');
}

// ═══════════════════════════════════════════
// PHASE 1: SCAN FOR VISUALIZATIONS
// ═══════════════════════════════════════════

const scanSystemInstruction = (materialSample?: string) => `ROLE: You are an instructional designer specializing in educational visualizations.
TASK: Extract concepts from the material that are best explained visually.
${outputLanguageRule(materialSample)}
Return ONE JSON object: {"concepts":[...]} — never a bare array.`;

const SCAN_SCHEMA = {
  type: "object" as const,
  properties: {
    concepts: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          concept: { type: "string" as const },
          vizType: { type: "string" as const },
          description: { type: "string" as const },
          variables: { type: "array" as const, items: { type: "string" as const } },
          priority: { type: "string" as const },
          rationale: { type: "string" as const },
        },
        required: ["concept", "vizType", "description", "variables", "priority", "rationale"] as const,
      },
    },
  },
  required: ["concepts"] as const,
};

function mapScanItems(parsed: any[]): VisualizationBlueprint[] {
  const validVizTypes: VisualizationType[] = ['SIMULATION', 'DIAGRAM', 'CHART', 'PROCESS_FLOW', '3D_MODEL'];
  const conceptFallback = getLocale() === 'id' ? 'Konsep' : 'Concept';
  return parsed.map((item: any, idx: number) => ({
    id: `viz-${Date.now()}-${idx}`,
    concept: String(item.concept || conceptFallback),
    vizType: validVizTypes.includes(item.vizType) ? (item.vizType as VisualizationType) : 'DIAGRAM',
    description: String(item.description || ''),
    variables: Array.isArray(item.variables) ? item.variables.map(String) : [],
    priority: (['HIGH', 'MODERATE', 'LOW'].includes(item.priority)
      ? item.priority
      : 'MODERATE') as 'HIGH' | 'MODERATE' | 'LOW',
    rationale: String(item.rationale || ''),
  }));
}

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
${materialText.substring(0, 60000)}
"""

${langBlock}
Return JSON object: {"concepts":[{concept,vizType,description,variables,priority,rationale}, ...]}
Max 8 concepts. vizType one of SIMULATION|DIAGRAM|CHART|PROCESS_FLOW|3D_MODEL.`;

  const data = await callVisualizationAI({
    action: 'vizScan',
    modelName: scanModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(materialText),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.2,
    maxOutputTokens: 3072,
  });

  if (data.error) {
    console.error("[Phase 1] Scan failed:", data.error);
    throw new Error(data.error);
  }

  try {
    const obj = parseAIJsonObject(data.result);
    const arr = Array.isArray(obj)
      ? obj
      : Array.isArray(obj.concepts)
        ? obj.concepts
        : Array.isArray(obj.items)
          ? obj.items
          : Array.isArray(obj.visualizations)
            ? obj.visualizations
            : null;
    if (!arr) throw new Error('No concepts array in scan response');
    return mapScanItems(arr);
  } catch (err: any) {
    console.error("[Phase 1] Parse error:", err);
    throw new Error(err?.message || 'Failed to parse visualization scan');
  }
}


// ═══════════════════════════════════════════
// PHASE 2: GENERATE VISUALIZATION (per concept)
// ═══════════════════════════════════════════

const generationSystemInstruction = (materialSample?: string) => `ROLE: You build single-file interactive HTML5 learning simulations.
Make them clear, responsive, and useful for studying.
${outputLanguageRule(materialSample)}
All control labels, instructions, button text, tooltips, and dynamic explanations in the HTML MUST follow the output language rule.
Prefer compact, working code over decorative fluff. Keep total HTML under ~600 lines.`;

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
    prompt = `Refine this single-file HTML5 visualization.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
${variablesStr}

CURRENT HTML:
"""
${existingHtmlCode.substring(0, 24000)}
"""

USER FEEDBACK:
"""
${userFeedback}
"""

MATERIAL (accuracy):
"""
${materialContext.substring(0, 12000)}
"""

${langBlock}

OUTPUT: complete HTML document only. Start with <!DOCTYPE html>. No markdown. No JSON wrapper.`;
  } else {
    prompt = `Build one interactive visualization.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
${variablesStr}

MATERIAL CONTEXT:
"""
${materialContext.substring(0, 16000)}
"""

${langBlock}

REQUIREMENTS:
- Single HTML file, inline CSS+JS, no CDN
- Working interactive controls
- Visible UI text follows OUTPUT LANGUAGE
- Keep compact (fit in one response)

OUTPUT: complete HTML document only. Start with <!DOCTYPE html>. No markdown. No JSON.`;
  }

  const attemptGeneration = async () => {
    // Direct HTML (no responseSchema) — avoids double-encoding HTML inside JSON and token blowups
    const data = await callVisualizationAI({
      action: 'vizGenerate',
      modelName: genModel(),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: generationSystemInstruction(materialContext),
      temperature: 0.4,
      maxOutputTokens: 8192,
      // no responseSchema → free-form HTML (best practice for long HTML)
    });

    if (data.error) throw new Error(data.error);
    const htmlCode = extractHtmlDocument(data.result);
    if (htmlCode.length < 100) throw new Error('Generated HTML is too short');

    const isId = getLocale() === 'id';
    return {
      htmlCode,
      explanation: isId
        ? `Simulasi interaktif: ${blueprint.concept}`
        : `Interactive simulation: ${blueprint.concept}`,
      interactionGuide: isId
        ? 'Gunakan kontrol di layar untuk bereksperimen.'
        : 'Use on-screen controls to experiment.',
    };
  };

  try {
    const parsedData = await attemptGeneration();
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: parsedData.htmlCode,
      explanation: parsedData.explanation,
      interactionGuide: parsedData.interactionGuide,
      status: 'success',
    };
  } catch (primaryErr: any) {
    console.warn(`[Phase 2] Failed for "${blueprint.concept}": ${primaryErr.message}`);
    // One retry with shorter context
    try {
      onProgress?.(getLocale() === 'id'
        ? `⚡ Retry ringkas: ${blueprint.concept}…`
        : `⚡ Compact retry: ${blueprint.concept}…`);
      const shortPrompt = `Create a minimal interactive HTML demo for "${blueprint.concept}" (${blueprint.vizType}).
Description: ${blueprint.description}
Variables: ${(blueprint.variables || []).join(', ') || 'none'}
${langBlock}
Single HTML file, inline CSS/JS, no CDN. Start with <!DOCTYPE html>.`;
      const data = await callVisualizationAI({
        action: 'vizGenerateRetry',
        modelName: genModel(),
        contents: [{ role: 'user', parts: [{ text: shortPrompt }] }],
        systemInstruction: generationSystemInstruction(materialContext),
        temperature: 0.35,
        maxOutputTokens: 6144,
      });
      if (data.error) throw new Error(data.error);
      const htmlCode = extractHtmlDocument(data.result);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode,
        explanation: blueprint.description || blueprint.concept,
        interactionGuide: getLocale() === 'id' ? 'Gunakan kontrol di layar.' : 'Use on-screen controls.',
        status: 'success',
      };
    } catch (fallbackErr: any) {
      console.error(`[Phase 2] Retry also failed for "${blueprint.concept}":`, fallbackErr);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: '',
        explanation: '',
        interactionGuide: '',
        status: 'error',
        error: fallbackErr.message || primaryErr.message || 'Visualization failed',
      };
    }
  }
}

// ─── BATCH GENERATION — parallel waves (quiz-style), NOT sequential oneshot ───
const VIZ_CONCURRENCY = 3;

export async function generateVisualizations(
  blueprints: VisualizationBlueprint[],
  materialContext: string,
  onResult: (result: VisualizationResult, index: number, total: number) => void,
  onProgress?: (msg: string) => void
): Promise<VisualizationResult[]> {
  const results: VisualizationResult[] = new Array(blueprints.length);
  let done = 0;
  const total = blueprints.length;

  for (let i = 0; i < blueprints.length; i += VIZ_CONCURRENCY) {
    const slice = blueprints.slice(i, i + VIZ_CONCURRENCY);
    onProgress?.(
      getLocale() === 'id'
        ? `⚡ Parallel batch ${Math.floor(i / VIZ_CONCURRENCY) + 1}: ${slice.map((b) => b.concept).join(', ')}…`
        : `⚡ Parallel batch ${Math.floor(i / VIZ_CONCURRENCY) + 1}: ${slice.map((b) => b.concept).join(', ')}…`
    );

    const settled = await Promise.allSettled(
      slice.map((bp, j) =>
        generateVisualization(bp, materialContext, onProgress).then((result) => {
          const index = i + j;
          results[index] = result;
          done++;
          onResult(result, index, total);
          onProgress?.(
            getLocale() === 'id'
              ? `✅ ${done}/${total}: ${bp.concept}`
              : `✅ ${done}/${total}: ${bp.concept}`
          );
          return result;
        })
      )
    );

    // Fill errors for rejected promises (shouldn't happen — generateVisualization catches)
    settled.forEach((s, j) => {
      if (s.status === 'rejected') {
        const index = i + j;
        const bp = slice[j];
        const errResult: VisualizationResult = {
          id: bp.id,
          blueprint: bp,
          htmlCode: '',
          explanation: '',
          interactionGuide: '',
          status: 'error',
          error: String(s.reason?.message || s.reason || 'Unknown error'),
        };
        results[index] = errResult;
        done++;
        onResult(errResult, index, total);
      }
    });
  }

  return results.filter(Boolean);
}

// ─── SCAN FOR ADDITIONAL VISUALIZATIONS ───
export async function scanForAdditionalVisualizations(
  materialText: string,
  existingConcepts: string[],
  onProgress?: (msg: string) => void
): Promise<VisualizationBlueprint[]> {
  onProgress?.(getLocale() === 'id'
    ? '🔍 Mencari konsep tambahan yang belum divisualisasikan…'
    : '🔍 Looking for more concepts to visualize…');

  const existingList = existingConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const langBlock = outputLanguageRule(materialText);

  const prompt = `Find NEW visualizable concepts not already listed.

ALREADY MADE (do not repeat):
"""
${existingList}
"""

MATERIAL:
"""
${materialText.substring(0, 60000)}
"""

${langBlock}
Return JSON: {"concepts":[{concept,vizType,description,variables,priority,rationale}, ...]} max 5 new.`;

  const data = await callVisualizationAI({
    action: 'vizScanMore',
    modelName: scanModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(materialText),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  if (data.error) {
    console.error('[Phase 1 Additional] Scan failed:', data.error);
    return [];
  }

  try {
    const obj = parseAIJsonObject(data.result);
    const arr = Array.isArray(obj?.concepts) ? obj.concepts : Array.isArray(obj?.items) ? obj.items : [];
    const existingLower = new Set(existingConcepts.map((c) => c.toLowerCase().trim()));
    return mapScanItems(arr)
      .filter((item) => !existingLower.has(item.concept.toLowerCase().trim()))
      .map((item, idx) => ({ ...item, id: `viz-add-${Date.now()}-${idx}` }));
  } catch (err) {
    console.error('[Phase 1 Additional] Parse error:', err);
    return [];
  }
}
