import type { Question } from '../types';
import { getLocale } from './i18n';

export interface GraphReviewItem {
  question: string;
  answer: string;
  explanation: string;
  difficulty: string;
}

export interface GraphNode {
  id: string;
  label: string;
  category: string;
  importance: 'core' | 'supporting' | 'detail';
  questionCount: number;
  reviewItems: GraphReviewItem[];
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface GraphData {
  version: 2;
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

const STOP_WORDS = new Set([
  'yang', 'dan', 'atau', 'dari', 'untuk', 'pada', 'dengan', 'adalah', 'dalam', 'sebagai',
  'the', 'and', 'or', 'from', 'for', 'with', 'into', 'that', 'this', 'what', 'which', 'when',
  'mengapa', 'bagaimana', 'apakah', 'berikut', 'tentang', 'sebuah', 'suatu', 'paling',
]);

function cleanText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function normalizeConcept(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conceptTokens(value: string): Set<string> {
  return new Set(
    normalizeConcept(value)
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

function answerFor(question: Question): string {
  if (question.correctAnswer) return cleanText(question.correctAnswer);
  const option = question.options?.[question.correctIndex];
  if (option) return cleanText(option);
  if (question.proposedAnswer) return cleanText(question.proposedAnswer);
  return getLocale() === 'id' ? 'Jawaban tidak tersedia' : 'Answer unavailable';
}

function conceptFor(question: Question): string {
  const explicit = cleanText(question.conceptName || question.keyPoint);
  if (explicit) return explicit;
  const text = cleanText(question.text);
  const phrase = text.split(/[?:.;]/)[0] || text;
  return shorten(phrase, 72);
}

function dominantDifficulty(items: GraphReviewItem[]): string {
  const count = new Map<string, number>();
  items.forEach((item) => count.set(item.difficulty, (count.get(item.difficulty) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Medium';
}

/** Build a compact review graph directly from quiz data. No AI call is involved. */
export function buildGraphDataLocal(questions: Question[]): GraphData {
  const groups = new Map<string, { label: string; priority?: string; order: number; items: GraphReviewItem[] }>();

  questions.forEach((question, questionIndex) => {
    const label = conceptFor(question);
    if (!label) return;
    const key = normalizeConcept(label) || `question-${question.id}`;
    const group = groups.get(key) || {
      label: shorten(label, 72),
      priority: question.conceptPriority,
      order: questionIndex,
      items: [],
    };
    group.items.push({
      question: cleanText(question.text),
      answer: answerFor(question),
      explanation: cleanText(
        question.explanation,
        getLocale() === 'id' ? 'Belum ada penjelasan untuk soal ini.' : 'No explanation is available for this question.'
      ),
      difficulty: cleanText(question.difficulty, 'Medium'),
    });
    if (question.conceptPriority === 'HIGH') group.priority = 'HIGH';
    groups.set(key, group);
  });

  const ranked = [...groups.values()]
    .sort((a, b) => {
      const priority = (value?: string) => value === 'HIGH' ? 2 : value === 'MODERATE' ? 1 : 0;
      return priority(b.priority) - priority(a.priority) || b.items.length - a.items.length || a.order - b.order;
    })
    .slice(0, 32);

  const coreCount = Math.max(1, Math.min(4, Math.ceil(ranked.length * 0.15)));
  const nodes: GraphNode[] = ranked.map((group, index) => ({
    id: `n${index + 1}`,
    label: group.label,
    category: dominantDifficulty(group.items),
    importance: index < coreCount || group.priority === 'HIGH'
      ? 'core'
      : group.items.length > 1 || group.priority === 'MODERATE'
        ? 'supporting'
        : 'detail',
    questionCount: group.items.length,
    reviewItems: group.items.slice(0, 8),
  }));

  const candidates: Array<GraphEdge & { score: number }> = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const left = conceptTokens(`${nodes[i].label} ${nodes[i].reviewItems[0]?.explanation || ''}`);
    for (let j = i + 1; j < nodes.length; j += 1) {
      const right = conceptTokens(`${nodes[j].label} ${nodes[j].reviewItems[0]?.explanation || ''}`);
      const shared = [...left].filter((token) => right.has(token));
      const union = new Set([...left, ...right]).size || 1;
      const score = shared.length / union;
      if (shared.length > 0) {
        candidates.push({
          source: nodes[i].id,
          target: nodes[j].id,
          relationship: shorten(shared.slice(0, 2).join(' · '), 30),
          strength: score >= 0.18 ? 'strong' : score >= 0.08 ? 'moderate' : 'weak',
          score,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const edges: GraphEdge[] = [];
  candidates.forEach(({ score: _score, ...edge }) => {
    if (edges.length >= Math.min(44, nodes.length * 2)) return;
    if ((degree.get(edge.source) || 0) >= 3 || (degree.get(edge.target) || 0) >= 3) return;
    edges.push(edge);
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });

  // Guarantee that every concept is reachable, even when quiz wording shares no useful token.
  nodes.slice(1).forEach((node, index) => {
    if ((degree.get(node.id) || 0) > 0) return;
    const parent = nodes[Math.max(0, Math.floor(index / 3))];
    edges.push({
      source: parent.id,
      target: node.id,
      relationship: getLocale() === 'id' ? 'alur review' : 'review path',
      strength: 'weak',
    });
    degree.set(parent.id, (degree.get(parent.id) || 0) + 1);
    degree.set(node.id, 1);
  });

  return {
    version: 2,
    nodes,
    edges,
    summary: getLocale() === 'id'
      ? `${nodes.length} konsep diringkas dari ${questions.length} soal. Pilih node untuk membaca soal, jawaban, dan penjelasannya.`
      : `${nodes.length} concepts summarized from ${questions.length} questions. Select a node to review its question, answer, and explanation.`,
    generatedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character] || character));
}

/** Render a self-contained, deterministic review map. */
export function buildGraphHtmlLocal(graphData: GraphData, title: string): string {
  const isId = getLocale() === 'id';
  const safeTitle = escapeHtml(cleanText(title, 'Knowledge Graph'));
  const payload = JSON.stringify({
    title: cleanText(title, 'Knowledge Graph'),
    summary: graphData.summary || '',
    nodes: graphData.nodes,
    edges: graphData.edges,
    labels: {
      reviewMap: isId ? 'Peta review cepat' : 'Quick review map',
      concepts: isId ? 'Konsep' : 'Concepts',
      questions: isId ? 'soal' : 'questions',
      search: isId ? 'Cari konsep…' : 'Search concepts…',
      empty: isId ? 'Tidak ada konsep yang cocok.' : 'No matching concepts.',
      select: isId ? 'Pilih sebuah node untuk mulai review.' : 'Select a node to start reviewing.',
      question: isId ? 'Pertanyaan' : 'Question',
      answer: isId ? 'Jawaban' : 'Answer',
      explanation: isId ? 'Mengapa?' : 'Why?',
      focus: isId ? 'Fokus cabang ini' : 'Focus this branch',
      showAll: isId ? 'Tampilkan semua' : 'Show all',
      previous: isId ? 'Sebelumnya' : 'Previous',
      next: isId ? 'Berikutnya' : 'Next',
      review: isId ? 'Review' : 'Review',
      hint: isId ? 'Scroll/pinch zoom · seret untuk pan · klik node' : 'Scroll/pinch zoom · drag to pan · click a node',
      core: isId ? 'Inti' : 'Core',
      supporting: isId ? 'Pendukung' : 'Supporting',
      detail: isId ? 'Detail' : 'Detail',
      related: isId ? 'konsep terkait' : 'related concepts',
      zoomIn: isId ? 'Perbesar' : 'Zoom in',
      zoomOut: isId ? 'Perkecil' : 'Zoom out',
      zoomReset: isId ? 'Reset zoom' : 'Reset zoom',
      zoomLabel: isId ? 'Zoom' : 'Zoom',
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${isId ? 'id' : 'en'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle} — Knowledge Graph</title>
<style>
  :root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#e5e7eb;--panel:#ffffff;--canvas:#f7f7ff;--indigo:#6366f1;--violet:#8b5cf6;--emerald:#10b981;--amber:#f59e0b;--shadow:0 18px 45px rgba(43,50,95,.11)}
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;min-height:0;overflow:hidden;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#f8fafc}button,input{font:inherit}
  button{cursor:pointer}.app{width:100%;height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr)}
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px clamp(16px,3vw,28px);border-bottom:1px solid var(--line);background:rgba(255,255,255,.94)}
  .identity{min-width:0}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--indigo);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.eyebrow:before{content:"";width:8px;height:8px;border-radius:99px;background:linear-gradient(135deg,var(--indigo),var(--violet));box-shadow:0 0 0 5px #eef2ff}
  h1{margin:3px 0 0;font-size:clamp(18px,2.3vw,25px);line-height:1.2;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary{max-width:620px;color:var(--muted);font-size:12px;text-align:right}
  .layout{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(310px,370px);gap:14px;padding:14px;background:linear-gradient(145deg,#f5f7ff,#f8fafc 45%,#f0fdfa)}
  .map-card,.review-card{min-height:0;background:var(--panel);border:1px solid rgba(99,102,241,.13);border-radius:24px;box-shadow:var(--shadow);overflow:hidden}
  .map-card{display:grid;grid-template-rows:auto minmax(250px,1fr)}.map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .stats{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:#f8fafc;border:1px solid var(--line);font-size:11px;font-weight:750;color:#475467}.chip i{width:7px;height:7px;border-radius:99px;background:var(--indigo)}.hint{font-size:11px;color:var(--muted)}
  .zoom-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .zoom-tools button{width:34px;height:34px;border:1px solid #c7d2fe;border-radius:10px;background:linear-gradient(180deg,#fff,#eef2ff);color:#4338ca;font-size:16px;font-weight:850;line-height:1;padding:0;display:grid;place-items:center}
  .zoom-tools button:hover{background:#e0e7ff}.zoom-tools button:active{transform:scale(.96)}.zoom-tools button:focus-visible{outline:3px solid #c7d2fe;outline-offset:2px}
  .zoom-readout{min-width:52px;text-align:center;font-size:11px;font-weight:800;color:#475467;font-variant-numeric:tabular-nums}
  .stage{position:relative;min-height:250px;overflow:hidden;cursor:grab;background:radial-gradient(circle at 48% 43%,#fff 0,#f8f7ff 45%,#eef2ff 100%)}.stage:before{content:"";position:absolute;inset:0;background-image:radial-gradient(#c7d2fe 1px,transparent 1px);background-size:24px 24px;opacity:.45;pointer-events:none}.stage.panning{cursor:grabbing}
  svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none}.edge{stroke:#c7d2fe;stroke-width:1.5;vector-effect:non-scaling-stroke}.edge.strong{stroke:#a5b4fc;stroke-width:2.4}.edge.focused{stroke:var(--indigo);opacity:.75}
  .node{outline:none;cursor:pointer}.node .halo{fill:transparent;stroke:transparent;stroke-width:8}.node .orb{stroke:#fff;stroke-width:4;filter:drop-shadow(0 8px 10px rgba(71,64,153,.2));transition:transform .16s ease-out,filter .16s ease-out}.node:hover .orb,.node:focus .orb,.node.selected .orb{transform:scale(1.12);filter:drop-shadow(0 10px 16px rgba(79,70,229,.32))}.node.selected .halo{stroke:#c7d2fe}.node.muted{opacity:.16}.node text.initials{fill:#fff;font-weight:850;font-size:12px;text-anchor:middle;dominant-baseline:central;pointer-events:none}.node .node-label{fill:#344054;font-size:11px;font-weight:750;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round;pointer-events:none}
  .tooltip{position:absolute;z-index:5;width:min(280px,calc(100% - 24px));padding:11px 12px;border:1px solid #d9ddff;border-radius:14px;background:rgba(255,255,255,.97);box-shadow:0 14px 32px rgba(34,40,90,.18);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .14s ease-out,transform .14s ease-out}.tooltip.visible{opacity:1;transform:none}.tooltip strong{display:block;font-size:12px;color:#3730a3;margin-bottom:3px}.tooltip span{display:block;color:#475467;font-size:11px;line-height:1.45}
  .review-card{display:grid;grid-template-rows:auto minmax(0,1fr)}.search-wrap{padding:14px;border-bottom:1px solid var(--line)}.search{width:100%;height:40px;border-radius:12px;border:1px solid #d0d5dd;background:#f8fafc;padding:0 12px;color:var(--ink);outline:none}.search:focus{background:#fff;border-color:#818cf8;box-shadow:0 0 0 3px #e0e7ff}
  .review-body{min-height:0;overflow:auto;padding:14px}.empty{padding:28px 16px;text-align:center;color:var(--muted);border:1px dashed #cbd5e1;border-radius:16px;background:#f8fafc}.concept-list{display:grid;gap:7px}.concept-btn{width:100%;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:9px;padding:9px;border:1px solid transparent;border-radius:14px;background:transparent;text-align:left;color:var(--ink)}.concept-btn:hover,.concept-btn:focus{background:#f5f3ff;border-color:#ddd6fe;outline:none}.concept-btn.active{background:#eef2ff;border-color:#c7d2fe}.concept-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;color:white;font-size:10px;font-weight:850;background:linear-gradient(135deg,var(--indigo),var(--violet))}.concept-copy{min-width:0}.concept-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.concept-copy span,.count{color:var(--muted);font-size:10px}.count{font-variant-numeric:tabular-nums}
  .detail{display:grid;gap:12px}.detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.detail-head h2{font-size:18px;line-height:1.25;letter-spacing:-.02em;margin:0}.badge{display:inline-flex;margin-top:6px;padding:4px 8px;border-radius:99px;background:#ecfdf3;color:#047857;font-size:10px;font-weight:800}.focus-btn{flex:0 0 auto;border:0;border-radius:11px;padding:8px 10px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:800}.focus-btn:hover{background:#e0e7ff}
  .review-index{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:10px}.review-nav{display:flex;gap:5px}.review-nav button{width:30px;height:30px;border:1px solid var(--line);border-radius:9px;background:#fff;color:#475467}.review-nav button:disabled{opacity:.35;cursor:default}
  .study-block{padding:12px;border:1px solid var(--line);border-radius:15px;background:#fbfcff}.study-block.answer{border-color:#a7f3d0;background:#f0fdf4}.study-block.explanation{border-color:#ddd6fe;background:#f7f5ff}.study-block h3{margin:0 0 5px;color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.09em}.study-block p{margin:0;font-size:12px;line-height:1.55;white-space:pre-wrap}.relation-label{color:#667085;font-size:11px;font-weight:750;margin-bottom:4px}.related{display:flex;flex-wrap:wrap;gap:6px}.related button{border:1px solid #e4e7ec;border-radius:999px;background:#fff;padding:5px 8px;color:#475467;font-size:10px}.related button:hover{border-color:#a5b4fc;color:#4338ca}
  @media(max-width:860px){html,body{overflow:auto}.app{height:auto;min-height:100%}.topbar{align-items:flex-start}.summary{display:none}.layout{grid-template-columns:1fr;overflow:visible}.map-card{min-height:56dvh}.review-card{min-height:360px}.review-body{max-height:56dvh}}
  @media(max-width:520px){.layout{padding:8px;gap:8px}.map-card,.review-card{border-radius:18px}.map-toolbar{align-items:flex-start}.hint{max-width:145px;text-align:right}.stage,.map-card{min-height:50dvh}.topbar{padding:12px 14px}}
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>
</head>
<body>
<main class="app">
  <header class="topbar"><div class="identity"><div class="eyebrow" id="eyebrow"></div><h1 id="title"></h1></div><div class="summary" id="summary"></div></header>
  <div class="layout">
    <section class="map-card"><div class="map-toolbar"><div class="stats" id="stats"></div><div class="zoom-tools" role="group" aria-label="Zoom"><button type="button" id="zoomOut" title="">−</button><span class="zoom-readout" id="zoomReadout">100%</span><button type="button" id="zoomIn" title="">+</button><button type="button" id="zoomReset" title="" style="width:auto;padding:0 10px;font-size:11px">Reset</button></div><div class="hint" id="hint"></div></div><div class="stage" id="stage"><svg id="graph" aria-label="Knowledge graph"></svg><div class="tooltip" id="tooltip"><strong></strong><span></span></div></div></section>
    <aside class="review-card"><div class="search-wrap"><input class="search" id="search" type="search" autocomplete="off" /></div><div class="review-body" id="review"></div></aside>
  </div>
</main>
<script>
const DATA=${payload};
const NS='http://www.w3.org/2000/svg';
const graph=document.querySelector('#graph');const review=document.querySelector('#review');const tooltip=document.querySelector('#tooltip');const stage=document.querySelector('#stage');
const byId=Object.fromEntries(DATA.nodes.map(node=>[node.id,node]));
const adjacency=Object.fromEntries(DATA.nodes.map(node=>[node.id,new Set()]));DATA.edges.forEach(edge=>{if(adjacency[edge.source]&&adjacency[edge.target]){adjacency[edge.source].add(edge.target);adjacency[edge.target].add(edge.source)}});
let selectedId=null;let focusId=null;let reviewIndex=0;let hoverTimer=null;
let zoom=1;const ZOOM_MIN=0.4;const ZOOM_MAX=3.2;const ZOOM_STEP=1.18;
let panX=0;let panY=0;let baseExtent=280;let worldPos=null;
let isPanning=false;let panOrigin=null;let pinchStart=null;let suppressClick=false;
const colors={core:['#6366f1','#8b5cf6'],supporting:['#10b981','#14b8a6'],detail:['#f59e0b','#fb7185']};
const labelFor=value=>DATA.labels[value]||value;const short=(value,max=22)=>value.length>max?value.slice(0,max-1).trim()+'…':value;
const initials=value=>value.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toLocaleUpperCase()||'•';
document.querySelector('#eyebrow').textContent=DATA.labels.reviewMap;document.querySelector('#title').textContent=DATA.title;document.querySelector('#summary').textContent=DATA.summary;document.querySelector('#hint').textContent=DATA.labels.hint;document.querySelector('#search').placeholder=DATA.labels.search;
const zoomInBtn=document.querySelector('#zoomIn');const zoomOutBtn=document.querySelector('#zoomOut');const zoomResetBtn=document.querySelector('#zoomReset');const zoomReadout=document.querySelector('#zoomReadout');
zoomInBtn.title=DATA.labels.zoomIn;zoomOutBtn.title=DATA.labels.zoomOut;zoomResetBtn.title=DATA.labels.zoomReset;zoomResetBtn.textContent=DATA.labels.zoomReset;
zoomInBtn.setAttribute('aria-label',DATA.labels.zoomIn);zoomOutBtn.setAttribute('aria-label',DATA.labels.zoomOut);zoomResetBtn.setAttribute('aria-label',DATA.labels.zoomReset);
const stats=document.querySelector('#stats');[['core','core'],['supporting','supporting'],['detail','detail']].forEach(([key,kind])=>{const count=DATA.nodes.filter(node=>node.importance===kind).length;if(!count)return;const chip=document.createElement('span');chip.className='chip';const dot=document.createElement('i');dot.style.background=colors[kind][0];chip.append(dot,document.createTextNode(count+' '+labelFor(key)));stats.appendChild(chip)});
function visibleNodes(){if(!focusId)return DATA.nodes;const allowed=new Set([focusId,...(adjacency[focusId]||[])]);return DATA.nodes.filter(node=>allowed.has(node.id))}
function positions(nodes){if(!nodes.length)return{};const output={};output[nodes[0].id]={x:0,y:0};let cursor=1,ring=1;while(cursor<nodes.length){const radius=112+(ring-1)*108;const capacity=Math.max(6,Math.floor(2*Math.PI*radius/116));const take=Math.min(capacity,nodes.length-cursor);for(let index=0;index<take;index+=1){const angle=-Math.PI/2+(index/take)*Math.PI*2+(ring%2?0:.18);output[nodes[cursor+index].id]={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius}}cursor+=take;ring+=1}return output}
function svgEl(name,attrs={}){const element=document.createElementNS(NS,name);Object.entries(attrs).forEach(([key,value])=>element.setAttribute(key,String(value)));return element}
function updateZoomReadout(){zoomReadout.textContent=Math.round(zoom*100)+'%';zoomInBtn.disabled=zoom>=ZOOM_MAX-0.001;zoomOutBtn.disabled=zoom<=ZOOM_MIN+0.001}
function applyViewBox(){const size=(baseExtent*2)/zoom;const half=size/2;graph.setAttribute('viewBox',[(panX-half),(panY-half),size,size].join(' '));updateZoomReadout()}
function clampZoom(next){return Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,next))}
function clientToWorld(clientX,clientY){const rect=stage.getBoundingClientRect();const size=(baseExtent*2)/zoom;const half=size/2;const nx=(clientX-rect.left)/Math.max(rect.width,1);const ny=(clientY-rect.top)/Math.max(rect.height,1);return{x:panX-half+nx*size,y:panY-half+ny*size}}
function setZoomAt(nextZoom,clientX,clientY){const target=clampZoom(nextZoom);if(Math.abs(target-zoom)<0.001)return;const anchor=clientToWorld(clientX,clientY);zoom=target;const after=clientToWorld(clientX,clientY);panX+=anchor.x-after.x;panY+=anchor.y-after.y;applyViewBox()}
function zoomBy(factor){const rect=stage.getBoundingClientRect();setZoomAt(zoom*factor,rect.left+rect.width/2,rect.top+rect.height/2)}
function resetView(){zoom=1;panX=0;panY=0;applyViewBox()}
function showTooltip(node,event){const item=node.reviewItems?.[0];tooltip.querySelector('strong').textContent=node.label;tooltip.querySelector('span').textContent=short(item?.explanation||DATA.labels.select,180);const rect=stage.getBoundingClientRect();const width=280;let left=event.clientX-rect.left+14;let top=event.clientY-rect.top+14;if(left+width>rect.width-8)left=Math.max(8,left-width-28);if(top+110>rect.height)top=Math.max(8,top-115);tooltip.style.left=left+'px';tooltip.style.top=top+'px';tooltip.classList.add('visible')}
function hideTooltip(){clearTimeout(hoverTimer);tooltip.classList.remove('visible')}
function selectNode(id){if(suppressClick){suppressClick=false;return}selectedId=id;reviewIndex=0;hideTooltip();renderGraph();renderReview()}
function renderGraph(){const nodes=visibleNodes();worldPos=positions(nodes);const rings=Math.max(1,Math.ceil((nodes.length-1)/8));baseExtent=Math.max(215,125+rings*105);const pos=worldPos;graph.replaceChildren();
  DATA.edges.forEach(edge=>{if(!pos[edge.source]||!pos[edge.target])return;const left=pos[edge.source],right=pos[edge.target];const focused=selectedId&&(edge.source===selectedId||edge.target===selectedId);graph.appendChild(svgEl('line',{x1:left.x,y1:left.y,x2:right.x,y2:right.y,class:'edge '+edge.strength+(focused?' focused':'')}))});
  nodes.forEach((node)=>{const point=pos[node.id];const group=svgEl('g',{class:'node'+(selectedId===node.id?' selected':'')+(selectedId&&selectedId!==node.id&&!adjacency[selectedId]?.has(node.id)?' muted':''),transform:'translate('+point.x+' '+point.y+')',tabindex:'0',role:'button','aria-label':node.label});const size=node.importance==='core'?25:node.importance==='supporting'?21:18;const gradientId='gradient-'+node.id;const defs=svgEl('defs');const gradient=svgEl('linearGradient',{id:gradientId,x1:'0',y1:'0',x2:'1',y2:'1'});gradient.append(svgEl('stop',{offset:'0','stop-color':colors[node.importance][0]}),svgEl('stop',{offset:'1','stop-color':colors[node.importance][1]}));defs.append(gradient);group.append(defs,svgEl('circle',{class:'halo',r:size+6}),svgEl('circle',{class:'orb',r:size,fill:'url(#'+gradientId+')'}));const initial=svgEl('text',{class:'initials',x:0,y:1});initial.textContent=initials(node.label);group.append(initial);
    if(nodes.length<=12||node.importance==='core'||selectedId===node.id||zoom>=1.25){const label=svgEl('text',{class:'node-label',x:0,y:size+20});label.textContent=short(node.label,node.importance==='core'?24:18);group.append(label)}
    group.addEventListener('pointerenter',event=>{if(isPanning)return;clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>showTooltip(node,event),280)});group.addEventListener('pointermove',event=>{if(tooltip.classList.contains('visible')&&!isPanning)showTooltip(node,event)});group.addEventListener('pointerleave',hideTooltip);group.addEventListener('focus',event=>showTooltip(node,{clientX:event.target.getBoundingClientRect().left,clientY:event.target.getBoundingClientRect().bottom}));group.addEventListener('blur',hideTooltip);group.addEventListener('click',()=>selectNode(node.id));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(node.id)}if(event.key==='Escape')hideTooltip()});graph.appendChild(group)
  });
  applyViewBox();
}
zoomInBtn.addEventListener('click',()=>zoomBy(ZOOM_STEP));
zoomOutBtn.addEventListener('click',()=>zoomBy(1/ZOOM_STEP));
zoomResetBtn.addEventListener('click',()=>resetView());
stage.addEventListener('wheel',event=>{event.preventDefault();const factor=event.deltaY>0?1/ZOOM_STEP:ZOOM_STEP;setZoomAt(zoom*factor,event.clientX,event.clientY)},{passive:false});
stage.addEventListener('pointerdown',event=>{if(event.target.closest&&event.target.closest('.node'))return;if(event.pointerType==='touch'&&event.isPrimary===false)return;isPanning=true;suppressClick=false;panOrigin={x:event.clientX,y:event.clientY,panX,panY,id:event.pointerId};stage.classList.add('panning');stage.setPointerCapture(event.pointerId);hideTooltip()});
stage.addEventListener('pointermove',event=>{if(!isPanning||!panOrigin||event.pointerId!==panOrigin.id)return;const rect=stage.getBoundingClientRect();const size=(baseExtent*2)/zoom;const dx=(event.clientX-panOrigin.x)/Math.max(rect.width,1)*size;const dy=(event.clientY-panOrigin.y)/Math.max(rect.height,1)*size;if(Math.hypot(event.clientX-panOrigin.x,event.clientY-panOrigin.y)>4)suppressClick=true;panX=panOrigin.panX-dx;panY=panOrigin.panY-dy;applyViewBox()});
function endPan(event){if(!isPanning||!panOrigin||event.pointerId!==panOrigin.id)return;isPanning=false;panOrigin=null;stage.classList.remove('panning')}
stage.addEventListener('pointerup',endPan);stage.addEventListener('pointercancel',endPan);
stage.addEventListener('gesturestart',event=>event.preventDefault());
let lastTouchDist=0;
stage.addEventListener('touchstart',event=>{if(event.touches.length===2){const a=event.touches[0],b=event.touches[1];lastTouchDist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);pinchStart={dist:lastTouchDist,zoom};isPanning=false;panOrigin=null}},{passive:true});
stage.addEventListener('touchmove',event=>{if(event.touches.length===2&&pinchStart){event.preventDefault();const a=event.touches[0],b=event.touches[1];const dist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);const midX=(a.clientX+b.clientX)/2,midY=(a.clientY+b.clientY)/2;setZoomAt(pinchStart.zoom*(dist/Math.max(pinchStart.dist,1)),midX,midY)}},{passive:false});
stage.addEventListener('touchend',()=>{pinchStart=null});
document.addEventListener('keydown',event=>{if(event.target&&(event.target.tagName==='INPUT'||event.target.tagName==='TEXTAREA'))return;if(event.key==='+'||event.key==='='){event.preventDefault();zoomBy(ZOOM_STEP)}if(event.key==='-'||event.key==='_'){event.preventDefault();zoomBy(1/ZOOM_STEP)}if(event.key==='0'&&(event.ctrlKey||event.metaKey)){event.preventDefault();resetView()}});
function relatedButtons(node){const wrap=document.createElement('div');wrap.className='related';[...(adjacency[node.id]||[])].slice(0,6).forEach(id=>{const target=byId[id];if(!target)return;const button=document.createElement('button');button.type='button';button.textContent=target.label;button.addEventListener('click',()=>selectNode(id));wrap.appendChild(button)});return wrap}
function renderDetail(node){const items=node.reviewItems?.length?node.reviewItems:[{question:node.label,answer:'—',explanation:DATA.labels.select,difficulty:node.category}];reviewIndex=Math.min(reviewIndex,items.length-1);const item=items[reviewIndex];const detail=document.createElement('div');detail.className='detail';const head=document.createElement('div');head.className='detail-head';const titleWrap=document.createElement('div');const heading=document.createElement('h2');heading.textContent=node.label;const badge=document.createElement('span');badge.className='badge';badge.textContent=node.category+' · '+node.questionCount+' '+DATA.labels.questions;titleWrap.append(heading,badge);const focus=document.createElement('button');focus.type='button';focus.className='focus-btn';focus.textContent=focusId?DATA.labels.showAll:DATA.labels.focus;focus.addEventListener('click',()=>{focusId=focusId?null:node.id;renderGraph();renderReview()});head.append(titleWrap,focus);detail.appendChild(head);
  if(items.length>1){const index=document.createElement('div');index.className='review-index';index.appendChild(document.createTextNode(DATA.labels.review+' '+(reviewIndex+1)+' / '+items.length));const nav=document.createElement('div');nav.className='review-nav';const previous=document.createElement('button');previous.type='button';previous.textContent='←';previous.title=DATA.labels.previous;previous.disabled=reviewIndex===0;previous.addEventListener('click',()=>{reviewIndex-=1;renderReview()});const next=document.createElement('button');next.type='button';next.textContent='→';next.title=DATA.labels.next;next.disabled=reviewIndex===items.length-1;next.addEventListener('click',()=>{reviewIndex+=1;renderReview()});nav.append(previous,next);index.appendChild(nav);detail.appendChild(index)}
  [['question','study-block'],['answer','study-block answer'],['explanation','study-block explanation']].forEach(([key,className])=>{const block=document.createElement('section');block.className=className;const h=document.createElement('h3');h.textContent=DATA.labels[key];const p=document.createElement('p');p.textContent=item[key]||'—';block.append(h,p);detail.appendChild(block)});const relation=document.createElement('div');const label=document.createElement('div');label.className='relation-label';label.textContent=(adjacency[node.id]?.size||0)+' '+DATA.labels.related;relation.append(label,relatedButtons(node));detail.appendChild(relation);review.replaceChildren(detail)}
function renderList(query=''){const filtered=DATA.nodes.filter(node=>node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));if(!filtered.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=DATA.labels.empty;review.replaceChildren(empty);return}const list=document.createElement('div');list.className='concept-list';filtered.forEach(node=>{const button=document.createElement('button');button.type='button';button.className='concept-btn'+(selectedId===node.id?' active':'');const icon=document.createElement('span');icon.className='concept-icon';icon.style.background='linear-gradient(135deg,'+colors[node.importance].join(',')+')';icon.textContent=initials(node.label);const copy=document.createElement('span');copy.className='concept-copy';const strong=document.createElement('strong');strong.textContent=node.label;const meta=document.createElement('span');meta.textContent=node.category+' · '+labelFor(node.importance);copy.append(strong,meta);const count=document.createElement('span');count.className='count';count.textContent=node.questionCount+'×';button.append(icon,copy,count);button.addEventListener('click',()=>selectNode(node.id));list.appendChild(button)});review.replaceChildren(list)}
function renderReview(){if(selectedId&&byId[selectedId])renderDetail(byId[selectedId]);else renderList(document.querySelector('#search').value)}
document.querySelector('#search').addEventListener('input',event=>{selectedId=null;focusId=null;renderGraph();renderList(event.target.value)});renderGraph();renderReview();
</script>
</body>
</html>`;
}

export async function generateGraphHTML(
  graphData: GraphData,
  title: string,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.(getLocale() === 'id' ? 'Merender peta review lokal…' : 'Rendering the local review map…');
  return buildGraphHtmlLocal(graphData, title);
}

export async function generateKnowledgeGraph(
  questions: Question[],
  title: string,
  _materialContext?: string,
  onProgress?: (message: string) => void
): Promise<GraphViewResult> {
  try {
    if (questions.length < 3) {
      throw new Error(getLocale() === 'id'
        ? 'Minimal 3 soal diperlukan untuk membuat knowledge graph.'
        : 'At least 3 questions are needed for a knowledge graph.');
    }
    onProgress?.(getLocale() === 'id'
      ? 'Menyusun peta review langsung dari soal dan penjelasan…'
      : 'Building a review map directly from questions and explanations…');
    const data = buildGraphDataLocal(questions);
    if (!data.nodes.length) throw new Error(getLocale() === 'id' ? 'Tidak ada konsep yang dapat dipetakan.' : 'No concepts could be mapped.');
    const htmlCode = buildGraphHtmlLocal(data, title);
    onProgress?.(getLocale() === 'id' ? 'Peta review siap.' : 'Review map ready.');
    return { data, htmlCode, status: 'success' };
  } catch (error: any) {
    return {
      data: { version: 2, nodes: [], edges: [], summary: '', generatedAt: new Date().toISOString() },
      htmlCode: '',
      status: 'error',
      error: error?.message || String(error),
    };
  }
}
