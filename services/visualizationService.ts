/**
 * ==========================================
 * VISUALIZATION SERVICE — Noodl Visual Lab
 * ==========================================
 * Pattern adapted from MIKIREXP (2-phase AI pipeline):
 *   Phase 1 — scan material → pedagogical blueprints
 *   Phase 2 — generate self-contained interactive HTML5 sims
 *
 * Noodl adaptations:
 * - BYOK multi-provider via Settings (callAI)
 * - Language policy (outputLanguageRule)
 * - Light Noodl theme (not pure black UI)
 * - Sequential generation (quality > racey parallel)
 */

import { outputLanguageRule } from './languagePolicy';
import { getLocale } from './i18n';
import type { VisualizationBlueprint, VisualizationResult, VisualizationType } from '../types';
import {
  callAI,
  getActiveProvider,
  getActiveModel,
  resolveModelName,
  parseAIJsonObject,
} from './geminiService';
import { getProviderApiKey } from './providerService';

function globalModel(): string {
  const p = getActiveProvider();
  return resolveModelName(p, getActiveModel(p));
}

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
      systemInstruction,
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

function extractHtmlDocument(raw: string): string {
  let html = String(raw || '');
  if (html.includes('```')) {
    html = html.replace(/```html/gi, '').replace(/```/g, '').trim();
  }
  if (html.includes('<thinking>')) {
    html = html.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }

  // Prefer JSON { htmlCode } when models return schema-shaped output
  try {
    const obj = parseAIJsonObject(html);
    if (obj?.htmlCode && String(obj.htmlCode).length > 80) return String(obj.htmlCode);
    if (obj?.html && String(obj.html).length > 80) return String(obj.html);
  } catch {
    /* not pure json — continue */
  }

  // Brace-extract htmlCode string if nested in truncated JSON
  const htmlCodeKey = html.match(/"htmlCode"\s*:\s*"/);
  if (htmlCodeKey && htmlCodeKey.index != null) {
    const start = htmlCodeKey.index + htmlCodeKey[0].length;
    let out = '';
    let escaped = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (escaped) {
        out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch === '"' ? '"' : ch === '\\' ? '\\' : ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') break;
      out += ch;
    }
    if (out.length > 80 && out.includes('<')) return out;
  }

  const doctype = html.search(/<!DOCTYPE\s+html/i);
  if (doctype >= 0) return html.slice(doctype).trim();
  const htmlTag = html.search(/<html[\s>]/i);
  if (htmlTag >= 0) return html.slice(htmlTag).trim();
  if (html.includes('<') && html.length > 100) return html;
  throw new Error('No usable HTML in AI response');
}

function cleanAiJson(raw: string): string {
  let jsonStr = String(raw || '');
  if (jsonStr.includes('```')) {
    jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  }
  if (jsonStr.includes('<thinking>')) {
    jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }
  return jsonStr;
}

// ═══════════════════════════════════════════
// LOCAL FALLBACK (last resort only)
// ═══════════════════════════════════════════

function localBlueprints(materialText: string): VisualizationBlueprint[] {
  const candidates = materialText
    .split(/[\n.!?]+/)
    .map((line) => line.replace(/^Q?\d+[.):\s-]*/i, '').trim())
    .filter((line) => line.length >= 18 && line.length <= 90);
  const unique = [...new Map(candidates.map((line) => [line.toLocaleLowerCase(), line])).values()].slice(0, 4);
  const concepts = unique.length
    ? unique
    : [getLocale() === 'id' ? 'Eksplorasi konsep utama' : 'Explore the main concept'];
  const types: VisualizationType[] = ['SIMULATION', 'PROCESS_FLOW', 'DIAGRAM', 'CHART'];
  return concepts.map((concept, index) => ({
    id: `viz-local-${Date.now()}-${index}`,
    concept,
    vizType: types[index % types.length],
    description:
      getLocale() === 'id'
        ? `Lab interaktif untuk memahami: ${concept}`
        : `Interactive lab for understanding: ${concept}`,
    variables:
      getLocale() === 'id'
        ? ['Intensitas', 'Skala', 'Tahap']
        : ['Intensity', 'Scale', 'Stage'],
    priority: index === 0 ? 'HIGH' : 'MODERATE',
    rationale:
      getLocale() === 'id'
        ? 'Konsep ini lebih mudah dipahami jika dimanipulasi secara visual.'
        : 'This concept is easier to grasp when manipulated visually.',
  }));
}

/** Compact but interactive offline lab — only used when AI is unavailable. */
function buildLocalVisualization(blueprint: VisualizationBlueprint): string {
  const isId = getLocale() === 'id';
  const vars = blueprint.variables.length
    ? blueprint.variables.slice(0, 4)
    : isId
      ? ['Intensitas', 'Skala']
      : ['Intensity', 'Scale'];
  const payload = JSON.stringify({
    concept: blueprint.concept,
    description: blueprint.description || blueprint.concept,
    type: blueprint.vizType || 'SIMULATION',
    variables: vars,
    labels: {
      live: isId ? 'Lab offline' : 'Offline lab',
      reset: isId ? 'Atur ulang' : 'Reset',
      insight: isId ? 'Umpan balik ilmiah' : 'Scientific feedback',
      controls: isId ? 'Variabel' : 'Variables',
      how: isId ? 'Cara belajar: geser kontrol, amati perubahan di canvas, baca umpan balik.' : 'How to learn: move controls, watch the canvas, read the feedback.',
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html><html lang="${isId ? 'id' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font:14px/1.5 system-ui,sans-serif;color:#1e293b;
background:radial-gradient(ellipse at 10% 0%,#c7d2fe,transparent 50%),radial-gradient(ellipse at 90% 20%,#fbcfe8,transparent 45%),linear-gradient(160deg,#eef2ff,#fff 50%,#ecfeff);padding:14px}
.shell{max-width:960px;margin:0 auto}.hero{margin-bottom:12px}h1{margin:4px 0;font-size:clamp(18px,3vw,26px);letter-spacing:-.02em}
.desc,.hint{color:#64748b;font-size:12px}.grid{display:grid;grid-template-columns:1.4fr .7fr;gap:12px}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
.panel{background:rgba(255,255,255,.94);border:1px solid rgba(79,70,229,.15);border-radius:18px;padding:12px;box-shadow:0 14px 32px rgba(49,46,129,.1)}
canvas{width:100%;height:260px;border-radius:14px;background:linear-gradient(145deg,#f8fafc,#eef2ff);display:block;border:1px solid #e0e7ff}
.insight{margin-top:10px;padding:10px;border-radius:12px;background:linear-gradient(135deg,#f5f3ff,#eef2ff);border:1px solid #ddd6fe;font-size:12px;color:#475569}
label{display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin:10px 0 4px}output{color:#4f46e5}
input[type=range]{width:100%;accent-color:#4f46e5}
button{width:100%;margin-top:10px;border:0;border-radius:12px;padding:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:800;cursor:pointer}
</style></head><body><main class="shell">
<header class="hero"><div class="hint" id="live"></div><h1 id="title"></h1><p class="desc" id="desc"></p><p class="hint" id="how"></p></header>
<div class="grid"><section class="panel"><canvas id="c"></canvas><div class="insight" id="insight"></div></section>
<aside class="panel" id="controls"></aside></div></main>
<script>
const D=${payload};const vals=D.variables.map(()=>45);
document.getElementById('live').textContent=D.labels.live+' · '+String(D.type).replace(/_/g,' ');
document.getElementById('title').textContent=D.concept;document.getElementById('desc').textContent=D.description;document.getElementById('how').textContent=D.labels.how;
const box=document.getElementById('controls');const outs=[];
D.variables.forEach((name,i)=>{const lab=document.createElement('label');const s=document.createElement('span');s.textContent=name;const o=document.createElement('output');o.textContent=vals[i];outs.push(o);lab.append(s,o);const inp=document.createElement('input');inp.type='range';inp.min=0;inp.max=100;inp.value=vals[i];
inp.oninput=()=>{vals[i]=+inp.value;o.textContent=inp.value;draw()};box.append(lab,inp)});
const b=document.createElement('button');b.textContent=D.labels.reset;b.onclick=()=>{vals.fill(45);[...box.querySelectorAll('input')].forEach((el,i)=>{el.value=45;outs[i].textContent='45'});draw()};box.appendChild(b);
const canvas=document.getElementById('c');const ctx=canvas.getContext('2d');
function resize(){const dpr=Math.min(devicePixelRatio||1,2);const w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function draw(){const w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);const a=vals.reduce((x,y)=>x+y,0)/vals.length;const cx=w/2,cy=h/2;
for(let i=0;i<vals.length;i++){const ang=-Math.PI/2+i*(Math.PI*2/vals.length);const r=40+vals[i]*0.9;const x=cx+Math.cos(ang)*r*0.55;const y=cy+Math.sin(ang)*r*0.4;
const g=ctx.createRadialGradient(x,y,0,x,y,28+vals[i]*0.2);g.addColorStop(0,'rgba(99,102,241,.9)');g.addColorStop(1,'rgba(14,165,233,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,28+vals[i]*0.2,0,Math.PI*2);ctx.fill();
ctx.beginPath();ctx.fillStyle='#4f46e5';ctx.arc(x,y,8+vals[i]*0.08,0,Math.PI*2);ctx.fill();ctx.fillStyle='#334155';ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText(D.variables[i].slice(0,14),x,y+36)}
ctx.beginPath();ctx.fillStyle='rgba(139,92,246,.25)';ctx.arc(cx,cy,18+a*0.25,0,Math.PI*2);ctx.fill();
const parts=D.variables.map((n,i)=>n+': '+vals[i]);
const effect=a<35?'below threshold — increase primary drivers':a>65?'strong response — watch trade-offs':'balanced regime — small changes still matter';
document.getElementById('insight').innerHTML='<strong>'+D.labels.insight+'</strong><br>'+D.concept+' · '+effect+' · '+parts.join(' · ')}
addEventListener('resize',resize);resize();
</script></body></html>`;
}

// ═══════════════════════════════════════════
// PHASE 1: SCAN (MIKIREXP pedagogical rules)
// ═══════════════════════════════════════════

const scanSystemInstruction = (materialSample?: string) => `ROLE: You are an instructional designer and educational visualization specialist.
TASK: Analyze the learning material and identify specific concepts that need interactive visualization to improve understanding. Extractions must REPRESENT the whole material, not one corner of it.

PEDAGOGICAL EXTRACTION RULES:
1. COVER THE ROADMAP: Scan start→end. Pick concepts from different sections so the set forms a roadmap of the material.
2. Match each concept to the best vizType:
   - Dynamic cause–effect systems (if X changes, how Y/Z react) → SIMULATION
   - Sequential/systemic processes (metabolism, algorithms, water cycle) → PROCESS_FLOW
   - Spatial/functional structure (organs, network layers, architecture) → DIAGRAM or 3D_MODEL
   - Comparisons / trends that are hard as prose → CHART
3. Do NOT invent concepts outside the material. Every concept MUST be grounded in the text.
4. Priority HIGH for core ideas; MODERATE/LOW for supporting details so coverage is even.
5. Propose 2–5 interactive variables that are educational levers (sliders, steps, options), not vanity knobs.
6. Be specific: "Pulmonary vs systemic circulation" not "Cardiovascular system".
7. Return 4–10 concepts (enough to represent the material, not cognitive overload).
8. ${outputLanguageRule(materialSample)}
   All concept names, descriptions, variables, and rationales MUST follow the output language rule.`;

const SCAN_SCHEMA = {
  type: 'object' as const,
  properties: {
    concepts: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          concept: { type: 'string' as const },
          vizType: { type: 'string' as const },
          description: { type: 'string' as const },
          variables: { type: 'array' as const, items: { type: 'string' as const } },
          priority: { type: 'string' as const },
          rationale: { type: 'string' as const },
        },
        required: ['concept', 'vizType', 'description', 'variables', 'priority', 'rationale'] as const,
      },
    },
  },
  required: ['concepts'] as const,
};

function mapScanItems(parsed: any[]): VisualizationBlueprint[] {
  const validVizTypes: VisualizationType[] = ['SIMULATION', 'DIAGRAM', 'CHART', 'PROCESS_FLOW', '3D_MODEL'];
  const conceptFallback = getLocale() === 'id' ? 'Konsep' : 'Concept';
  return parsed.map((item: any, idx: number) => ({
    id: `viz-${Date.now()}-${idx}`,
    concept: String(item.concept || conceptFallback),
    vizType: validVizTypes.includes(item.vizType) ? (item.vizType as VisualizationType) : 'SIMULATION',
    description: String(item.description || ''),
    variables: Array.isArray(item.variables) ? item.variables.map(String).slice(0, 6) : [],
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
  onProgress?.(
    getLocale() === 'id'
      ? '🔍 AI memindai materi untuk konsep yang layak divisualisasikan…'
      : '🔍 Scanning material for visualizable concepts…'
  );

  const provider = getActiveProvider();
  if (!getProviderApiKey(provider)) {
    onProgress?.(
      getLocale() === 'id'
        ? 'API key tidak ada; menyiapkan blueprint lokal dari materi.'
        : 'No API key; preparing local blueprints from the material.'
    );
    return localBlueprints(materialText);
  }

  const langBlock = outputLanguageRule(materialText);
  const prompt = `Analyze this learning material and list concepts that benefit from interactive visualization.

MATERIAL:
"""
${materialText.substring(0, 80000)}
"""

${langBlock}
Return ONE JSON object: {"concepts":[{concept,vizType,description,variables,priority,rationale}, ...]}
vizType ∈ SIMULATION|DIAGRAM|CHART|PROCESS_FLOW|3D_MODEL. Prefer 4–10 concepts spanning the whole material.`;

  const data = await callVisualizationAI({
    action: 'vizScan',
    modelName: globalModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(materialText),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.25,
    maxOutputTokens: 4096,
  });

  if (data.error) {
    console.warn('[Phase 1] AI scan failed; local blueprints:', data.error);
    return localBlueprints(materialText);
  }

  try {
    const cleaned = cleanAiJson(data.result);
    let arr: any[] | null = null;
    try {
      const obj = parseAIJsonObject(cleaned);
      arr = Array.isArray(obj)
        ? obj
        : Array.isArray(obj?.concepts)
          ? obj.concepts
          : Array.isArray(obj?.items)
            ? obj.items
            : Array.isArray(obj?.visualizations)
              ? obj.visualizations
              : null;
    } catch {
      const startIdx = cleaned.indexOf('[');
      const endIdx = cleaned.lastIndexOf(']');
      if (startIdx >= 0 && endIdx > startIdx) {
        arr = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      }
    }
    if (!arr?.length) throw new Error('No concepts array in scan response');
    return mapScanItems(arr);
  } catch (err) {
    console.warn('[Phase 1] Parse incomplete; local blueprints:', err);
    return localBlueprints(materialText);
  }
}

// ═══════════════════════════════════════════
// PHASE 2: GENERATE (MIKIREXP-style HTML5)
// ═══════════════════════════════════════════

const generationSystemInstruction = (materialSample?: string) => `ROLE: You are an elite educational web developer specializing in single-file interactive HTML5 teaching tools (simulations, diagrams, process explorers).

PEDAGOGICAL & TECHNICAL REQUIREMENTS (from the MIKIREXP visual lab standard, adapted for Noodl):
1. Output ONE complete self-contained HTML document (HTML+CSS+JS inline). No markdown fences. No JSON wrapper unless forced by schema.
2. FORBIDDEN: external CDNs, external scripts/styles/images, localStorage, cookies, fetch/XHR, network calls. Draw with Canvas API, inline SVG, CSS, or plain HTML.
3. MUST be interactive: sliders, buttons, step navigation, or toggles for every requested variable.
4. INSTANT PEDAGOGICAL FEEDBACK: a live insight panel that explains scientifically what changes when the learner moves a control (cause → effect in plain language). Not a decorative caption.
5. VISUAL DESIGN — Noodl premium light theme (NOT pure black):
   - Soft indigo/violet/sky mesh backgrounds (#eef2ff, #faf5ff, white cards)
   - Primary accent #4f46e5 / #6366f1, secondary #8b5cf6, success #10b981
   - Rounded cards (12–20px), soft shadows, clear contrast on controls
   - system-ui fonts, smooth transitions
6. RESPONSIVE for iframe: clean from ~360px mobile to desktop; avoid outer scrollbars.
7. Type-specific behavior:
   - PROCESS_FLOW → prev/next step machine with clear state transitions
   - DIAGRAM → clickable labeled parts with explanations/tooltips
   - SIMULATION → Canvas or SVG dynamics driven by variables (physics/chem/system)
   - 3D_MODEL → CSS 3D or canvas pseudo-3D the user can rotate/drag
   - CHART → multi-series comparison with trend insight (only when type is CHART)
8. Include a clear title and a short "How to learn" instruction block.
9. Provide a Reset control.
10. ${outputLanguageRule(materialSample)}
    All UI labels, instructions, tooltips, and dynamic explanations MUST follow the output language rule.
11. Ground numbers/facts in the provided material. Do not invent contradicting science.
12. Keep working code compact enough to fit one model response (~400–700 lines max). Prefer a solid interactive model over empty decoration.

CRITICAL: Must run inside iframe sandbox="allow-scripts".`;

const GENERATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    htmlCode: { type: 'string' as const },
    explanation: { type: 'string' as const },
    interactionGuide: { type: 'string' as const },
  },
  required: ['htmlCode', 'explanation', 'interactionGuide'] as const,
};

export async function generateVisualization(
  blueprint: VisualizationBlueprint,
  materialContext: string,
  onProgress?: (msg: string) => void,
  userFeedback?: string,
  existingHtmlCode?: string
): Promise<VisualizationResult> {
  const isId = getLocale() === 'id';
  onProgress?.(
    userFeedback
      ? isId
        ? `⚡ Memperbarui simulasi: ${blueprint.concept}…`
        : `⚡ Updating simulation: ${blueprint.concept}…`
      : isId
        ? `⚡ Membuat simulasi HTML5: ${blueprint.concept}…`
        : `⚡ Building HTML5 simulation: ${blueprint.concept}…`
  );

  const provider = getActiveProvider();
  const hasKey = !!getProviderApiKey(provider);

  if (!hasKey && !userFeedback) {
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: buildLocalVisualization(blueprint),
      explanation: blueprint.description || blueprint.concept,
      interactionGuide: isId
        ? 'Mode offline: geser kontrol dan baca umpan balik di bawah canvas.'
        : 'Offline mode: move the controls and read the feedback under the canvas.',
      status: 'success',
    };
  }

  const langBlock = outputLanguageRule(materialContext || blueprint.description || blueprint.concept);
  const variablesStr = blueprint.variables.length
    ? `\nINTERACTIVE VARIABLES (must include a working control for each):\n${blueprint.variables.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
    : `\nInvent 2–4 educational variables grounded in the material.`;

  let prompt = '';
  if (userFeedback && existingHtmlCode) {
    prompt = `Refine this single-file interactive HTML5 learning simulation.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
${variablesStr}

CURRENT HTML (base — keep working pieces that are not related to the feedback):
"""
${existingHtmlCode.substring(0, 28000)}
"""

USER FEEDBACK (apply precisely):
"""
${userFeedback}
"""

MATERIAL (accuracy):
"""
${materialContext.substring(0, 20000)}
"""

${langBlock}

Return JSON with keys htmlCode, explanation, interactionGuide. htmlCode must be a full HTML document.`;
  } else {
    prompt = `Build one generative interactive HTML5 learning simulation.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
RATIONALE: ${blueprint.rationale || 'Help learners internalize this concept by manipulating it.'}
${variablesStr}

MATERIAL CONTEXT (ground the model — do not contradict facts):
"""
${materialContext.substring(0, 30000)}
"""

${langBlock}

REQUIREMENTS:
- Self-contained HTML5, Canvas/SVG preferred for SIMULATION
- Live scientific feedback panel on every control change
- Noodl light indigo theme (not pure black)
- Type-faithful interactions
- Reset button + How to learn tip

Return JSON: {"htmlCode":"<!DOCTYPE html>...","explanation":"...","interactionGuide":"..."}`;
  }

  const attemptGeneration = async (mode: 'schema' | 'free') => {
    const data = await callVisualizationAI({
      action: mode === 'schema' ? 'vizGenerate' : 'vizGenerateFree',
      modelName: globalModel(),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: generationSystemInstruction(materialContext),
      responseSchema: mode === 'schema' ? GENERATION_SCHEMA : undefined,
      temperature: 0.4,
      maxOutputTokens: mode === 'schema' ? 12288 : 8192,
    });
    if (data.error) throw new Error(data.error);
    if (!data.result?.trim()) throw new Error('Empty response from AI');

    let htmlCode = '';
    let explanation = blueprint.description || blueprint.concept;
    let interactionGuide = isId
      ? 'Gunakan kontrol di layar untuk bereksperimen.'
      : 'Use on-screen controls to experiment.';

    if (mode === 'schema') {
      try {
        const parsed = parseAIJsonObject(cleanAiJson(data.result));
        htmlCode = String(parsed.htmlCode || parsed.html || '');
        if (parsed.explanation) explanation = String(parsed.explanation);
        if (parsed.interactionGuide) interactionGuide = String(parsed.interactionGuide);
      } catch {
        htmlCode = extractHtmlDocument(data.result);
      }
    } else {
      htmlCode = extractHtmlDocument(data.result);
    }

    if (!htmlCode || htmlCode.length < 120) throw new Error('Generated HTML is too short or empty');
    // Minimal structure check — reject empty shells
    const lower = htmlCode.toLowerCase();
    if (!lower.includes('<body') && !lower.includes('<canvas') && !lower.includes('<svg')) {
      throw new Error('Generated HTML lacks a visible body/canvas/svg');
    }
    return { htmlCode, explanation, interactionGuide };
  };

  try {
    const parsed = await attemptGeneration('schema');
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: parsed.htmlCode,
      explanation: parsed.explanation,
      interactionGuide: parsed.interactionGuide,
      status: 'success',
    };
  } catch (primaryErr: any) {
    console.warn(`[Phase 2] Schema gen failed for "${blueprint.concept}":`, primaryErr?.message);
    try {
      onProgress?.(
        isId
          ? `⚡ Retry free-form HTML: ${blueprint.concept}…`
          : `⚡ Free-form HTML retry: ${blueprint.concept}…`
      );
      // Free-form retry prompt forces raw HTML (MIKIREXP fallback style)
      prompt = `Create a complete interactive HTML5 learning simulation for "${blueprint.concept}" (${blueprint.vizType}).
Description: ${blueprint.description}
Variables: ${(blueprint.variables || []).join(', ') || 'choose 2–3 from material'}
Material:
"""
${materialContext.substring(0, 12000)}
"""
${langBlock}
Single file, inline CSS/JS, no CDN. Canvas or SVG dynamics + live scientific feedback. Noodl light theme.
OUTPUT: start with <!DOCTYPE html>. No markdown. No JSON.`;
      const parsed = await attemptGeneration('free');
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: parsed.htmlCode,
        explanation: parsed.explanation,
        interactionGuide: parsed.interactionGuide,
        status: 'success',
      };
    } catch (fallbackErr: any) {
      console.warn(`[Phase 2] AI failed for "${blueprint.concept}"; offline lab:`, fallbackErr?.message);
      // Prefer surfacing error when user explicitly regenerated, else offline lab
      if (userFeedback) {
        return {
          id: blueprint.id,
          blueprint,
          htmlCode: existingHtmlCode || buildLocalVisualization(blueprint),
          explanation: '',
          interactionGuide: '',
          status: 'error',
          error: fallbackErr?.message || primaryErr?.message || 'Visualization generation failed',
        };
      }
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: buildLocalVisualization(blueprint),
        explanation: blueprint.description || blueprint.concept,
        interactionGuide: isId
          ? 'AI gagal; lab offline interaktif ditampilkan sebagai cadangan.'
          : 'AI failed; showing an interactive offline lab as a fallback.',
        status: 'success',
      };
    }
  }
}

// Sequential batch — MIKIREXP quality pattern (avoids rate limits / partial races)
export async function generateVisualizations(
  blueprints: VisualizationBlueprint[],
  materialContext: string,
  onResult: (result: VisualizationResult, index: number, total: number) => void,
  onProgress?: (msg: string) => void
): Promise<VisualizationResult[]> {
  const results: VisualizationResult[] = [];
  const total = blueprints.length;

  for (let i = 0; i < blueprints.length; i++) {
    const bp = blueprints[i];
    onProgress?.(
      getLocale() === 'id'
        ? `⚡ Membuat simulasi ${i + 1}/${total}: ${bp.concept}…`
        : `⚡ Building simulation ${i + 1}/${total}: ${bp.concept}…`
    );
    const result = await generateVisualization(bp, materialContext, onProgress);
    results.push(result);
    onResult(result, i, total);
  }

  return results;
}

export async function scanForAdditionalVisualizations(
  materialText: string,
  existingConcepts: string[],
  onProgress?: (msg: string) => void
): Promise<VisualizationBlueprint[]> {
  onProgress?.(
    getLocale() === 'id'
      ? '🔍 Mencari konsep tambahan yang belum divisualisasikan…'
      : '🔍 Looking for more concepts to visualize…'
  );

  const existingList = existingConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const langBlock = outputLanguageRule(materialText);

  const prompt = `Find NEW visualizable concepts not already listed.

ALREADY MADE (do not repeat):
"""
${existingList}
"""

MATERIAL:
"""
${materialText.substring(0, 80000)}
"""

${langBlock}
Return JSON: {"concepts":[{concept,vizType,description,variables,priority,rationale}, ...]} max 6 new, from uncovered subtopics.`;

  const data = await callVisualizationAI({
    action: 'vizScanMore',
    modelName: globalModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: scanSystemInstruction(materialText),
    responseSchema: SCAN_SCHEMA,
    temperature: 0.3,
    maxOutputTokens: 3072,
  });

  if (data.error) {
    console.error('[Phase 1 Additional] Scan failed:', data.error);
    return [];
  }

  try {
    const obj = parseAIJsonObject(cleanAiJson(data.result));
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
