import { outputLanguageRule } from "./languagePolicy";
import { getLocale } from "./i18n";

/**
 * ==========================================
 * GRAPH VIEW SERVICE (Knowledge Graph)
 * ==========================================
 * Phase 1: AI extracts structured nodes/edges (small JSON) via Settings pipeline
 * Phase 2: LOCAL deterministic HTML renderer (no AI oneshot HTML)
 *
 * Why no AI HTML? Oneshot full-page HTML is slow, often truncated, and fails
 * without ever looking "successful" in product UI. Structured data + local
 * renderer is the durable best practice (like quiz JSON → UI).
 */

import type { Question } from '../types';
import {
  callAI,
  getActiveProvider,
  getActiveModel,
  resolveModelName,
  parseAIJsonObject,
} from './geminiService';
import { getProviderApiKey } from './providerService';

// ── TYPES ──

export interface GraphNode {
  id: string;
  label: string;
  category: string;
  importance: 'core' | 'supporting' | 'detail';
  questionCount: number;
  accuracy?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: string;
  generatedAt: string;
}

export interface GraphViewResult {
  data: GraphData;
  htmlCode: string;
  status: 'success' | 'error';
  error?: string;
}

function extractModel(): string {
  const p = getActiveProvider();
  return resolveModelName(p, getActiveModel(p));
}

async function callGraphAI(payload: {
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
      maxOutputTokens: maxOutputTokens ?? 4096,
    });
    if (data?.error) return { result: '', error: String(data.error) };
    return { result: data?.result || '' };
  } catch (err: any) {
    console.error(`[GraphView AI] Error with ${resolved}:`, err);
    return { result: '', error: err.message || 'AI call failed' };
  }
}

// ── PHASE 1: EXTRACT GRAPH DATA (AI, small JSON) ──

export async function extractGraphData(
  questions: Question[],
  materialContext?: string,
  onProgress?: (msg: string) => void
): Promise<GraphData> {
  onProgress?.(getLocale() === 'id' ? '🔍 Menganalisis konsep dan relasi antar soal…' : '🔍 Analyzing concepts and relationships…');

  if (questions.length < 3) {
    throw new Error(getLocale() === 'id'
      ? 'Minimal 3 soal diperlukan untuk membuat knowledge graph.'
      : 'At least 3 questions are needed for a knowledge graph.');
  }

  // Compact payload — full dumps cause silent timeouts / empty logs on slow providers
  const questionSummary = questions.slice(0, 60).map((q, i) => {
    return `Q${i + 1}: ${String(q.text || '').slice(0, 220)}\nKP: ${String(q.keyPoint || q.conceptName || '').slice(0, 80)}`;
  }).join('\n');

  const materialSample = [questionSummary, materialContext || ''].join('\n').slice(0, 8000);
  const langBlock = outputLanguageRule(materialSample);

  const prompt = `Build a concept knowledge graph from these quiz questions.

QUESTIONS:
"""
${questionSummary}
"""

${materialContext ? `CONTEXT (truncated):\n"""\n${materialContext.substring(0, 20000)}\n"""` : ''}

Rules:
1. Max 25 nodes, 40 edges.
2. importance: core | supporting | detail
3. strength: strong | moderate | weak
4. node ids: short slug (n1, n2, …)
5. Labels/relationships/summary follow OUTPUT LANGUAGE.

${langBlock}

Return JSON object only:
{"nodes":[{"id","label","category","importance","questionCount"}],"edges":[{"source","target","relationship","strength"}],"summary":"..."}`;

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
            importance: { type: 'string' },
            questionCount: { type: 'integer' },
          },
          required: ['id', 'label', 'category', 'importance', 'questionCount'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            relationship: { type: 'string' },
            strength: { type: 'string' },
          },
          required: ['source', 'target', 'relationship', 'strength'],
        },
      },
      summary: { type: 'string' },
    },
    required: ['nodes', 'edges', 'summary'],
  };

  const data = await callGraphAI({
    modelName: extractModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: `You extract educational knowledge graphs as compact JSON.\n${langBlock}`,
    responseSchema: schema as any,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });

  if (data.error) {
    throw new Error(`AI analysis failed: ${data.error}`);
  }

  const parsed = parseAIJsonObject(data.result);
  const nodesRaw = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const edgesRaw = Array.isArray(parsed.edges) ? parsed.edges : [];

  const nodes: GraphNode[] = nodesRaw.map((n: any, i: number) => ({
    id: String(n.id || `n${i + 1}`),
    label: String(n.label || `Concept ${i + 1}`),
    category: String(n.category || 'General'),
    importance: (['core', 'supporting', 'detail'].includes(n.importance)
      ? n.importance
      : 'supporting') as GraphNode['importance'],
    questionCount: Number(n.questionCount) || 1,
  }));

  const idSet = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = edgesRaw
    .filter((e: any) => idSet.has(String(e.source)) && idSet.has(String(e.target)))
    .map((e: any) => ({
      source: String(e.source),
      target: String(e.target),
      relationship: String(e.relationship || 'related'),
      strength: (['strong', 'moderate', 'weak'].includes(e.strength)
        ? e.strength
        : 'moderate') as GraphEdge['strength'],
    }));

  return {
    nodes,
    edges,
    summary: String(parsed.summary || ''),
    generatedAt: new Date().toISOString(),
  };
}

// ── PHASE 2: LOCAL HTML (no AI) — always works, instant, cacheable ──

export function buildGraphHtmlLocal(graphData: GraphData, title: string): string {
  const isId = getLocale() === 'id';
  const safeTitle = String(title || 'Knowledge Graph').replace(/</g, '');
  const payload = JSON.stringify({
    title: safeTitle,
    summary: graphData.summary || '',
    nodes: graphData.nodes,
    edges: graphData.edges,
    labels: {
      summary: isId ? 'Ringkasan' : 'Summary',
      legend: isId ? 'Kategori' : 'Categories',
      drag: isId ? 'Seret node · scroll zoom · pan background' : 'Drag nodes · scroll zoom · pan background',
      empty: isId ? 'Tidak ada node' : 'No nodes',
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${isId ? 'id' : 'en'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle} — Graph</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  header { padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #111827; }
  h1 { margin:0; font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; }
  .sub { margin-top: 4px; font-size: 12px; color: #94a3b8; }
  .wrap { display: grid; grid-template-columns: 1fr 260px; gap: 0; height: calc(100vh - 64px); }
  @media (max-width: 800px) { .wrap { grid-template-columns: 1fr; height: auto; } aside { border-left:0; border-top:1px solid #1e293b; } }
  #stage { position: relative; overflow: hidden; background: radial-gradient(ellipse at 30% 20%, #1e293b 0%, #0f172a 55%); }
  canvas { display:block; width:100%; height:100%; min-height: 420px; cursor: grab; touch-action: none; }
  canvas:active { cursor: grabbing; }
  aside { padding: 12px 14px; background: #111827; border-left: 1px solid #1e293b; overflow: auto; }
  .card { background: #1e293b88; border: 1px solid #334155; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; }
  .card h2 { margin:0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; }
  .card p { margin:0; font-size: 13px; line-height: 1.45; color: #cbd5e1; }
  .legend-item { display:flex; align-items:center; gap:8px; font-size:12px; margin:6px 0; }
  .dot { width:10px; height:10px; border-radius:999px; flex-shrink:0; }
  .hint { font-size: 11px; color: #64748b; margin-top: 8px; }
</style>
</head>
<body>
<header>
  <h1>${safeTitle}</h1>
  <div class="sub" id="hint"></div>
</header>
<div class="wrap">
  <div id="stage"><canvas id="c"></canvas></div>
  <aside>
    <div class="card"><h2 id="sumTitle"></h2><p id="summary"></p></div>
    <div class="card"><h2 id="legTitle"></h2><div id="legend"></div></div>
  </aside>
</div>
<script>
const DATA = ${payload};
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
let W = 0, H = 0;
let scale = 1, ox = 0, oy = 0;
let dragNode = null, pan = null;

const palette = ['#818cf8','#34d399','#fbbf24','#f472b6','#22d3ee','#a78bfa','#fb7185','#4ade80'];
const cats = [...new Set(DATA.nodes.map(n => n.category || 'General'))];
const catColor = Object.fromEntries(cats.map((c,i) => [c, palette[i % palette.length]]));

document.getElementById('hint').textContent = DATA.labels.drag;
document.getElementById('sumTitle').textContent = DATA.labels.summary;
document.getElementById('legTitle').textContent = DATA.labels.legend;
document.getElementById('summary').textContent = DATA.summary || DATA.labels.empty;
const leg = document.getElementById('legend');
cats.forEach(c => {
  const row = document.createElement('div');
  row.className = 'legend-item';
  row.innerHTML = '<span class="dot" style="background:'+catColor[c]+'"></span><span>'+c+'</span>';
  leg.appendChild(row);
});

const nodes = DATA.nodes.map((n,i) => {
  const ang = (i / Math.max(DATA.nodes.length,1)) * Math.PI * 2;
  const r = 120 + (n.importance === 'core' ? 20 : n.importance === 'detail' ? -20 : 0);
  return {
    ...n,
    x: Math.cos(ang) * r,
    y: Math.sin(ang) * r,
    vx: 0, vy: 0,
    r: n.importance === 'core' ? 22 : n.importance === 'detail' ? 14 : 18
  };
});
const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
const edges = DATA.edges.filter(e => byId[e.source] && byId[e.target]);

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  W = Math.max(320, rect.width);
  H = Math.max(420, rect.height);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function screenToWorld(sx, sy) {
  return { x: (sx - W/2 - ox) / scale, y: (sy - H/2 - oy) / scale };
}

function step() {
  // simple force layout
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.hypot(dx,dy) || 0.01;
      const rep = 1800 / (dist*dist);
      dx /= dist; dy /= dist;
      a.vx -= dx * rep; a.vy -= dy * rep;
      b.vx += dx * rep; b.vy += dy * rep;
    }
  }
  edges.forEach(e => {
    const a = byId[e.source], b = byId[e.target];
    let dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx,dy) || 0.01;
    const want = e.strength === 'strong' ? 90 : e.strength === 'weak' ? 150 : 120;
    const f = (dist - want) * 0.01;
    dx /= dist; dy /= dist;
    a.vx += dx * f; a.vy += dy * f;
    b.vx -= dx * f; b.vy -= dy * f;
  });
  nodes.forEach(n => {
    n.vx += (-n.x) * 0.002;
    n.vy += (-n.y) * 0.002;
    n.vx *= 0.85; n.vy *= 0.85;
    if (dragNode !== n) { n.x += n.vx; n.y += n.vy; }
  });
}

function draw() {
  step();
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2 + ox, H/2 + oy);
  ctx.scale(scale, scale);

  edges.forEach(e => {
    const a = byId[e.source], b = byId[e.target];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = e.strength === 'strong' ? '#64748b' : '#334155';
    ctx.lineWidth = e.strength === 'strong' ? 2 : 1;
    ctx.stroke();
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(e.relationship || '', mx, my - 4);
  });

  nodes.forEach(n => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
    ctx.fillStyle = catColor[n.category] || '#818cf8';
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = n.importance === 'core' ? 3 : 1.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = (n.importance === 'core' ? 'bold 12px' : '11px') + ' system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = n.label.length > 22 ? n.label.slice(0,20)+'…' : n.label;
    ctx.fillText(label, n.x, n.y + n.r + 12);
  });
  ctx.restore();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function hit(sx, sy) {
  const w = screenToWorld(sx, sy);
  for (let i = nodes.length-1; i>=0; i--) {
    const n = nodes[i];
    if (Math.hypot(w.x - n.x, w.y - n.y) <= n.r + 4) return n;
  }
  return null;
}

canvas.addEventListener('pointerdown', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
  const n = hit(sx, sy);
  if (n) { dragNode = n; n.vx = n.vy = 0; }
  else { pan = { x: ev.clientX, y: ev.clientY, ox, oy }; }
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (dragNode) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    dragNode.x = w.x; dragNode.y = w.y;
  } else if (pan) {
    ox = pan.ox + (ev.clientX - pan.x);
    oy = pan.oy + (ev.clientY - pan.y);
  }
});
canvas.addEventListener('pointerup', () => { dragNode = null; pan = null; });
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const factor = ev.deltaY > 0 ? 0.92 : 1.08;
  scale = Math.min(3, Math.max(0.35, scale * factor));
}, { passive: false });
</script>
</body>
</html>`;
}

/** @deprecated name kept — now local render, no AI */
export async function generateGraphHTML(
  graphData: GraphData,
  title: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.(getLocale() === 'id' ? '🎨 Merender graph (lokal, tanpa AI)…' : '🎨 Rendering graph (local, no AI)…');
  return buildGraphHtmlLocal(graphData, title);
}

// ── FULL PIPELINE ──

export async function generateKnowledgeGraph(
  questions: Question[],
  title: string,
  materialContext?: string,
  onProgress?: (msg: string) => void
): Promise<GraphViewResult> {
  try {
    const graphData = await extractGraphData(questions, materialContext, onProgress);

    if (graphData.nodes.length === 0) {
      return {
        data: graphData,
        htmlCode: '',
        status: 'error',
        error: getLocale() === 'id'
          ? 'AI tidak menemukan konsep yang cukup untuk membuat graph.'
          : 'AI did not find enough concepts for a graph.',
      };
    }

    onProgress?.(
      getLocale() === 'id'
        ? `✅ ${graphData.nodes.length} konsep, ${graphData.edges.length} relasi — merender…`
        : `✅ ${graphData.nodes.length} concepts, ${graphData.edges.length} links — rendering…`
    );

    const htmlCode = buildGraphHtmlLocal(graphData, title);
    onProgress?.(getLocale() === 'id' ? '🎉 Knowledge graph siap!' : '🎉 Knowledge graph ready!');

    return {
      data: graphData,
      htmlCode,
      status: 'success',
    };
  } catch (err: any) {
    console.error('[KnowledgeGraph] pipeline failed:', err);
    return {
      data: { nodes: [], edges: [], summary: '', generatedAt: new Date().toISOString() },
      htmlCode: '',
      status: 'error',
      error: err.message || (getLocale() === 'id' ? 'Gagal membuat knowledge graph.' : 'Could not build knowledge graph.'),
    };
  }
}
