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

function localBlueprints(materialText: string): VisualizationBlueprint[] {
  const candidates = materialText
    .split(/[\n.!?]+/)
    .map((line) => line.replace(/^Q?\d+[.):\s-]*/i, '').trim())
    .filter((line) => line.length >= 12 && line.length <= 100);
  const unique = [...new Map(candidates.map((line) => [line.toLocaleLowerCase(), line])).values()].slice(0, 3);
  const concepts = unique.length ? unique : [getLocale() === 'id' ? 'Eksplorasi konsep utama' : 'Explore the main concept'];
  return concepts.map((concept, index) => ({
    id: `viz-local-${Date.now()}-${index}`,
    concept,
    vizType: index === 1 ? 'PROCESS_FLOW' : 'SIMULATION',
    description: getLocale() === 'id'
      ? `Eksplorasi interaktif untuk memahami ${concept}.`
      : `An interactive exploration for understanding ${concept}.`,
    variables: getLocale() === 'id' ? ['Intensitas', 'Tahap'] : ['Intensity', 'Stage'],
    priority: index === 0 ? 'HIGH' : 'MODERATE',
    rationale: getLocale() === 'id' ? 'Konsep ini lebih mudah dipahami secara visual.' : 'This concept benefits from visual exploration.',
  }));
}

function buildLocalVisualization(blueprint: VisualizationBlueprint): string {
  const isId = getLocale() === 'id';
  const payload = JSON.stringify({
    concept: blueprint.concept,
    description: blueprint.description,
    type: blueprint.vizType,
    variables: blueprint.variables.length ? blueprint.variables.slice(0, 6) : [isId ? 'Intensitas' : 'Intensity'],
    labels: {
      explore: isId ? 'Eksplorasi interaktif' : 'Interactive exploration',
      reset: isId ? 'Atur ulang' : 'Reset',
      insight: isId ? 'Apa yang terjadi?' : 'What is happening?',
      low: isId ? 'rendah' : 'low',
      balanced: isId ? 'seimbang' : 'balanced',
      high: isId ? 'tinggi' : 'high',
      live: isId ? 'Model interaktif' : 'Interactive model',
      controls: isId ? 'Variabel' : 'Variables',
      level: isId ? 'Level gabungan' : 'Combined level',
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${isId ? 'id' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}:root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#e4e7ec;--indigo:#6366f1;--violet:#8b5cf6;--emerald:#10b981}body{margin:0;min-height:100vh;background:linear-gradient(145deg,#f5f7ff,#fff 48%,#ecfdf5);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:clamp(12px,2.4vw,22px)}
.shell{max-width:980px;margin:auto}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.eyebrow{display:inline-flex;align-items:center;gap:7px;color:#4f46e5;text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:850}.eyebrow:before{content:"";width:7px;height:7px;border-radius:99px;background:var(--emerald);box-shadow:0 0 0 4px #d1fae5}h1{font-size:clamp(20px,4vw,32px);line-height:1.1;letter-spacing:-.03em;margin:5px 0 6px}.desc{max-width:650px;margin:0;color:var(--muted);font-size:12px}.type-chip{flex:0 0 auto;padding:6px 9px;border:1px solid #c7d2fe;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(220px,.55fr);gap:12px}
.panel{background:rgba(255,255,255,.94);border:1px solid rgba(99,102,241,.14);border-radius:18px;padding:13px;box-shadow:0 15px 34px rgba(43,50,95,.1)}.stage{position:relative;min-height:205px;display:flex;align-items:flex-end;justify-content:center;gap:clamp(8px,2vw,18px);padding:28px 20px 24px;border:1px solid #e0e7ff;border-radius:14px;background:radial-gradient(circle at 50% 35%,#fff,#f5f3ff 72%);overflow:hidden}.stage:after{content:"";position:absolute;left:18px;right:18px;bottom:23px;height:1px;background:#c7d2fe}.bar-wrap{position:relative;z-index:1;flex:1;max-width:86px;height:150px;display:flex;align-items:flex-end;justify-content:center}.bar{position:relative;width:min(54px,80%);min-height:20px;border-radius:14px 14px 7px 7px;background:linear-gradient(180deg,#8b5cf6,#6366f1);box-shadow:0 8px 18px rgba(99,102,241,.23);transition:height .22s cubic-bezier(.2,.8,.2,1),filter .12s}.bar-wrap:nth-child(2n) .bar{background:linear-gradient(180deg,#34d399,#10b981);box-shadow:0 8px 18px rgba(16,185,129,.2)}.bar-value{position:absolute;top:-20px;left:50%;transform:translateX(-50%);color:#475467;font-size:9px;font-weight:800}.bar-name{position:absolute;top:calc(100% + 6px);left:50%;width:84px;transform:translateX(-50%);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#667085;font-size:9px;font-weight:700}
.metric{position:absolute;right:10px;top:10px;padding:6px 8px;border:1px solid #d1fae5;border-radius:10px;background:#ecfdf5;color:#047857;font-size:9px;font-weight:850}.insight{margin-top:10px;padding:10px 11px;border:1px solid #ddd6fe;border-radius:12px;color:#475467;background:#f7f5ff;font-size:11px}.insight strong{color:#5b21b6;margin-right:4px}.control-title{margin:0 0 12px;color:#475467;font-size:10px;text-transform:uppercase;letter-spacing:.1em}.control{margin-bottom:13px}.control label{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:750;margin-bottom:6px}.control output{color:#4f46e5;font-variant-numeric:tabular-nums}.range-row{display:flex;align-items:center;gap:8px}input[type=range]{width:100%;height:5px;accent-color:var(--indigo)}button{width:100%;border:1px solid #c7d2fe;border-radius:11px;padding:8px 12px;background:#fff;color:#4338ca;font-size:11px;font-weight:850;cursor:pointer;transition:background .15s,transform .08s}button:hover{background:#eef2ff}button:active{transform:scale(.98)}button:focus-visible,input:focus-visible{outline:3px solid #c7d2fe;outline-offset:2px}
@media(max-width:650px){.hero{display:block}.type-chip{display:inline-flex;margin-top:8px}.grid{grid-template-columns:1fr}.stage{min-height:190px}.panel{border-radius:15px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body><main class="shell"><header class="hero"><div><div class="eyebrow" id="eyebrow"></div><h1 id="title"></h1><p class="desc" id="desc"></p></div><span class="type-chip" id="type"></span></header><div class="grid"><section class="panel"><div class="stage" id="stage"><span class="metric" id="metric"></span></div><div class="insight"><strong id="insightTitle"></strong><span id="insight"></span></div></section><aside class="panel"><h2 class="control-title" id="controlTitle"></h2><div id="controls"></div><button id="reset"></button></aside></div></main>
<script>
const D=${payload};const values=D.variables.map(()=>50);const stage=document.querySelector('#stage');const metric=document.querySelector('#metric');
document.querySelector('#eyebrow').textContent=D.labels.live;document.querySelector('#title').textContent=D.concept;document.querySelector('#desc').textContent=D.description;document.querySelector('#type').textContent=D.type.replace(/_/g,' ');document.querySelector('#insightTitle').textContent=D.labels.insight;document.querySelector('#controlTitle').textContent=D.labels.controls;document.querySelector('#reset').textContent=D.labels.reset;
const bars=D.variables.map((name,index)=>{const wrap=document.createElement('div');wrap.className='bar-wrap';const bar=document.createElement('div');bar.className='bar';const value=document.createElement('span');value.className='bar-value';const label=document.createElement('span');label.className='bar-name';label.textContent=name;bar.appendChild(value);wrap.append(bar,label);stage.insertBefore(wrap,metric);return{bar,value}});
function draw(){values.forEach((value,index)=>{bars[index].bar.style.height=(24+value*1.12)+'px';bars[index].bar.style.filter='saturate('+(0.7+value/130)+')';bars[index].value.textContent=value+'%'});const average=Math.round(values.reduce((sum,value)=>sum+value,0)/Math.max(values.length,1));metric.textContent=D.labels.level+': '+average+'%';const state=average<35?D.labels.low:average>65?D.labels.high:D.labels.balanced;document.querySelector('#insight').textContent=D.concept+' — '+state+' ('+average+'%).'}
const controls=document.querySelector('#controls');D.variables.forEach((name,index)=>{const wrap=document.createElement('div');wrap.className='control';const label=document.createElement('label');label.htmlFor='control-'+index;const text=document.createElement('span');text.textContent=name;const out=document.createElement('output');out.textContent='50%';label.append(text,out);const row=document.createElement('div');row.className='range-row';const input=document.createElement('input');input.id='control-'+index;input.type='range';input.min='0';input.max='100';input.value='50';input.addEventListener('input',()=>{values[index]=Number(input.value);out.textContent=input.value+'%';draw()});row.appendChild(input);wrap.append(label,row);controls.appendChild(wrap)});document.querySelector('#reset').addEventListener('click',()=>{values.fill(50);document.querySelectorAll('input').forEach(input=>input.value='50');document.querySelectorAll('output').forEach(out=>out.textContent='50%');draw()});draw();
</script></body></html>`;
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

  const provider = getActiveProvider();
  if (!getProviderApiKey(provider)) {
    onProgress?.(getLocale() === 'id'
      ? 'API key tidak tersedia; menyiapkan simulasi lokal dari materi.'
      : 'No API key is available; preparing local simulations from the material.');
    return localBlueprints(materialText);
  }

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
    console.warn('[Phase 1] AI scan failed; deriving safe local blueprints:', data.error);
    return localBlueprints(materialText);
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
    console.warn('[Phase 1] AI scan was incomplete; deriving safe local blueprints:', err);
    return localBlueprints(materialText);
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

  // The AI chooses the concept, type, variables, and explanation. Render that
  // structured blueprint locally so a provider output limit cannot break the UI.
  // Free-form AI HTML remains available only for an explicit user refinement.
  if (!userFeedback) {
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: buildLocalVisualization(blueprint),
      explanation: blueprint.description || blueprint.concept,
      interactionGuide: getLocale() === 'id'
        ? 'Ubah kontrol untuk melihat hubungan antar variabel.'
        : 'Adjust the controls to explore how the variables relate.',
      status: 'success',
    };
  }

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
      console.warn(`[Phase 2] AI refinement failed for "${blueprint.concept}"; preserving a working local simulation:`, fallbackErr);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: buildLocalVisualization(blueprint),
        explanation: blueprint.description || blueprint.concept,
        interactionGuide: getLocale() === 'id' ? 'Gunakan kontrol di layar.' : 'Use the on-screen controls.',
        status: 'success',
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
