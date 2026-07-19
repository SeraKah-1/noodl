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

/**
 * Local fallback simulation when AI is unavailable.
 * Type-aware (not bar-charts-only), light Noodl theme, meaningful cause→effect feedback.
 */
function buildLocalVisualization(blueprint: VisualizationBlueprint): string {
  const isId = getLocale() === 'id';
  const vars = blueprint.variables.length
    ? blueprint.variables.slice(0, 5)
    : (isId ? ['Intensitas', 'Skala', 'Durasi'] : ['Intensity', 'Scale', 'Duration']);
  const payload = JSON.stringify({
    concept: blueprint.concept,
    description: blueprint.description || blueprint.concept,
    type: blueprint.vizType || 'SIMULATION',
    variables: vars,
    labels: {
      live: isId ? 'Laboratorium konsep' : 'Concept lab',
      reset: isId ? 'Atur ulang' : 'Reset',
      insight: isId ? 'Wawasan' : 'Insight',
      controls: isId ? 'Kendali' : 'Controls',
      play: isId ? 'Jalankan' : 'Run',
      pause: isId ? 'Jeda' : 'Pause',
      next: isId ? 'Langkah berikutnya' : 'Next step',
      prev: isId ? 'Sebelumnya' : 'Previous',
      step: isId ? 'Langkah' : 'Step',
      of: isId ? 'dari' : 'of',
      low: isId ? 'rendah' : 'low',
      mid: isId ? 'sedang' : 'moderate',
      high: isId ? 'tinggi' : 'high',
      clickPart: isId ? 'Ketuk bagian untuk fokus' : 'Tap a part to focus',
      rotate: isId ? 'Seret untuk memutar' : 'Drag to rotate',
      formula: isId ? 'Hubungan model' : 'Model relationship',
    },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${isId ? 'id' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
:root{color-scheme:light;--ink:#1e293b;--muted:#64748b;--line:#e2e8f0;--panel:rgba(255,255,255,.92);--indigo:#4f46e5;--violet:#8b5cf6;--emerald:#10b981;--sky:#0ea5e9;--amber:#f59e0b;--rose:#f43f5e;--bg1:#eef2ff;--bg2:#fdf4ff;--bg3:#ecfeff}
html,body{margin:0;min-height:100%;background:
  radial-gradient(ellipse 80% 60% at 10% 0%,#c7d2fe 0%,transparent 55%),
  radial-gradient(ellipse 70% 50% at 90% 10%,#fbcfe8 0%,transparent 50%),
  radial-gradient(ellipse 60% 40% at 50% 100%,#a5f3fc 0%,transparent 45%),
  linear-gradient(160deg,var(--bg1),#fff 42%,var(--bg2));
color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
body{padding:clamp(10px,2vw,20px)}
.shell{max-width:1040px;margin:0 auto}
.hero{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;margin-bottom:12px}
.eyebrow{display:inline-flex;align-items:center;gap:7px;color:var(--indigo);font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
.eyebrow:before{content:"";width:8px;height:8px;border-radius:99px;background:linear-gradient(135deg,var(--emerald),var(--sky));box-shadow:0 0 0 4px #d1fae5}
h1{margin:4px 0 6px;font-size:clamp(18px,3.6vw,28px);letter-spacing:-.03em;line-height:1.15}
.desc{margin:0;max-width:640px;color:var(--muted);font-size:12px}
.chip{flex:0 0 auto;padding:7px 10px;border-radius:999px;border:1px solid #c7d2fe;background:linear-gradient(135deg,#eef2ff,#f5f3ff);color:#4338ca;font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(230px,.55fr);gap:12px}
.panel{background:var(--panel);border:1px solid rgba(79,70,229,.14);border-radius:20px;padding:14px;box-shadow:0 18px 40px rgba(49,46,129,.1);backdrop-filter:blur(10px)}
.stage{position:relative;min-height:260px;border-radius:16px;border:1px solid #e0e7ff;overflow:hidden;background:
  radial-gradient(circle at 30% 20%,#fff 0%,transparent 40%),
  radial-gradient(circle at 80% 70%,#e0e7ff 0%,transparent 45%),
  linear-gradient(145deg,#f8fafc,#eef2ff 60%,#faf5ff)}
.stage canvas,.stage svg{display:block;width:100%;height:100%;min-height:260px}
.metric{position:absolute;z-index:3;top:10px;right:10px;padding:6px 9px;border-radius:10px;border:1px solid #a7f3d0;background:rgba(236,253,245,.95);color:#047857;font-size:10px;font-weight:850;box-shadow:0 6px 14px rgba(16,185,129,.12)}
.insight{margin-top:11px;padding:11px 12px;border-radius:14px;border:1px solid #ddd6fe;background:linear-gradient(135deg,#f5f3ff,#eef2ff);color:#475569;font-size:12px;line-height:1.45}
.insight strong{color:#5b21b6;display:block;margin-bottom:3px;font-size:10px;text-transform:uppercase;letter-spacing:.08em}
.control-title{margin:0 0 10px;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}
.control{margin-bottom:12px}
.control label{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:750;margin-bottom:5px}
.control output{color:var(--indigo);font-variant-numeric:tabular-nums}
input[type=range]{width:100%;accent-color:var(--indigo);height:5px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
button{border:1px solid #c7d2fe;border-radius:12px;padding:9px 12px;background:linear-gradient(180deg,#fff,#eef2ff);color:#4338ca;font-size:11px;font-weight:850;cursor:pointer;transition:transform .08s,box-shadow .15s,background .15s}
button.primary{flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff;box-shadow:0 8px 18px rgba(99,102,241,.28)}
button:hover{filter:brightness(1.03)}button:active{transform:scale(.98)}
button:focus-visible,input:focus-visible{outline:3px solid #c7d2fe;outline-offset:2px}
.flow-steps{display:flex;flex-direction:column;gap:8px;padding:16px;min-height:260px;justify-content:center}
.flow-step{display:grid;grid-template-columns:36px 1fr;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;border:1px solid #e2e8f0;background:#fff;opacity:.45;transform:scale(.98);transition:all .25s ease}
.flow-step.active{opacity:1;transform:scale(1);border-color:#a5b4fc;background:linear-gradient(135deg,#eef2ff,#faf5ff);box-shadow:0 10px 22px rgba(99,102,241,.14)}
.flow-step .n{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:900;background:linear-gradient(135deg,var(--indigo),var(--violet))}
.flow-step .t{font-size:12px;font-weight:750}
.flow-step .s{font-size:10px;color:var(--muted)}
.diagram{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;padding:16px;min-height:260px;align-content:center}
.part{padding:14px 10px;border-radius:16px;border:1px solid #e0e7ff;background:#fff;text-align:center;cursor:pointer;transition:all .18s}
.part:hover,.part.active{border-color:#818cf8;background:linear-gradient(160deg,#eef2ff,#f5f3ff);box-shadow:0 12px 24px rgba(79,70,229,.15);transform:translateY(-2px)}
.part .ico{width:42px;height:42px;margin:0 auto 8px;border-radius:14px;display:grid;place-items:center;color:#fff;font-weight:900;font-size:14px;background:linear-gradient(135deg,var(--indigo),var(--sky))}
.part:nth-child(2n) .ico{background:linear-gradient(135deg,var(--emerald),var(--sky))}
.part:nth-child(3n) .ico{background:linear-gradient(135deg,var(--violet),var(--rose))}
.part .name{font-size:11px;font-weight:800}
.part .hint{font-size:10px;color:var(--muted);margin-top:3px}
.cube-wrap{perspective:700px;min-height:260px;display:grid;place-items:center}
.cube{width:120px;height:120px;position:relative;transform-style:preserve-3d;transition:transform .05s linear}
.face{position:absolute;inset:0;display:grid;place-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.55);font-size:11px;font-weight:850;color:#fff;backface-visibility:hidden;padding:8px;text-align:center}
.face.f{background:linear-gradient(135deg,#6366f1,#818cf8);transform:translateZ(60px)}
.face.b{background:linear-gradient(135deg,#8b5cf6,#a78bfa);transform:rotateY(180deg) translateZ(60px)}
.face.r{background:linear-gradient(135deg,#0ea5e9,#38bdf8);transform:rotateY(90deg) translateZ(60px)}
.face.l{background:linear-gradient(135deg,#10b981,#34d399);transform:rotateY(-90deg) translateZ(60px)}
.face.u{background:linear-gradient(135deg,#f59e0b,#fbbf24);transform:rotateX(90deg) translateZ(60px)}
.face.d{background:linear-gradient(135deg,#f43f5e,#fb7185);transform:rotateX(-90deg) translateZ(60px)}
@media(max-width:700px){.grid{grid-template-columns:1fr}.hero{flex-direction:column}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style></head>
<body><main class="shell">
<header class="hero"><div><div class="eyebrow" id="eyebrow"></div><h1 id="title"></h1><p class="desc" id="desc"></p></div><span class="chip" id="type"></span></header>
<div class="grid">
  <section class="panel"><div class="stage" id="stage"><span class="metric" id="metric"></span></div><div class="insight"><strong id="insightTitle"></strong><span id="insight"></span></div></section>
  <aside class="panel"><h2 class="control-title" id="controlTitle"></h2><div id="controls"></div><div class="btn-row" id="actions"></div></aside>
</div>
</main>
<script>
const D=${payload};
const values=D.variables.map(()=>48);
const stage=document.getElementById('stage');
const metric=document.getElementById('metric');
const insightEl=document.getElementById('insight');
document.getElementById('eyebrow').textContent=D.labels.live;
document.getElementById('title').textContent=D.concept;
document.getElementById('desc').textContent=D.description;
document.getElementById('type').textContent=String(D.type||'SIMULATION').replace(/_/g,' ');
document.getElementById('insightTitle').textContent=D.labels.insight;
document.getElementById('controlTitle').textContent=D.labels.controls;

function avg(){return Math.round(values.reduce((a,b)=>a+b,0)/Math.max(values.length,1))}
function band(v){return v<34?D.labels.low:v>66?D.labels.high:D.labels.mid}
function mix(a,b,t){return a+(b-a)*t}
function rgba(r,g,b,a){return 'rgba('+r+','+g+','+b+','+a+')'}

/* ── Controls ── */
const controls=document.getElementById('controls');
const outputs=[];
D.variables.forEach((name,i)=>{
  const wrap=document.createElement('div');wrap.className='control';
  const lab=document.createElement('label');lab.htmlFor='c'+i;
  const t=document.createElement('span');t.textContent=name;
  const o=document.createElement('output');o.textContent=values[i];outputs.push(o);
  lab.append(t,o);
  const input=document.createElement('input');input.id='c'+i;input.type='range';input.min=0;input.max=100;input.value=values[i];
  input.addEventListener('input',()=>{values[i]=+input.value;o.textContent=input.value;draw()});
  wrap.append(lab,input);controls.appendChild(wrap);
});
const actions=document.getElementById('actions');
function btn(label,cls,fn){const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',fn);actions.appendChild(b);return b}

/* ── Renderers ── */
const type=String(D.type||'SIMULATION').toUpperCase();
let canvas,ctx,raf=0,t0=performance.now(),playing=true,step=0,rotX=-22,rotY=28,drag=null;

function clearStageKeepMetric(){
  [...stage.children].forEach(ch=>{if(ch!==metric)ch.remove()});
}

function setupCanvas(){
  clearStageKeepMetric();
  canvas=document.createElement('canvas');
  stage.insertBefore(canvas,metric);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=stage.clientWidth||640,h=Math.max(stage.clientHeight,260);
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
  canvas.style.width=w+'px';canvas.style.height=h+'px';
  ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w,h};
}

function insightFromModel(){
  const a=avg();
  const parts=D.variables.map((n,i)=>n+': '+values[i]+'% ('+band(values[i])+')');
  const effect=a<34
    ? (D.labels.low+' — sistem di bawah ambang; coba naikkan faktor utama.')
    : a>66
      ? (D.labels.high+' — respons kuat; perhatikan trade-off antar variabel.')
      : (D.labels.mid+' — zona seimbang; perhatikan perubahan kecil.');
  insightEl.textContent=D.concept+' · '+effect+' · '+parts.join(' · ');
  metric.textContent=D.labels.formula+': '+a+'/100';
}

function drawSimulation(){
  const {w,h}=setupCanvas();
  const cx=w/2,cy=h/2;
  const energy=values[0]/100,scale=(values[1]??50)/100,dragF=(values[2]??50)/100;
  const n=Math.max(8,Math.round(10+energy*22));
  cancelAnimationFrame(raf);
  function frame(now){
    const t=(now-t0)/1000;
    ctx.clearRect(0,0,w,h);
    // soft orbs
    for(let i=0;i<n;i++){
      const ang=t*(0.35+energy*1.4)+i*(Math.PI*2/n);
      const r=40+scale*90+Math.sin(t*1.2+i)*18*(1-dragF*0.5);
      const x=cx+Math.cos(ang)*r*(0.7+scale*0.5);
      const y=cy+Math.sin(ang*0.9)*r*0.55;
      const rad=6+energy*14+Math.sin(t*2+i)*3;
      const g=ctx.createRadialGradient(x,y,0,x,y,rad*2.2);
      const hue=230+i*12+energy*40;
      g.addColorStop(0,rgba(99,102,241,0.85));
      g.addColorStop(0.45,rgba(139,92,246,0.45));
      g.addColorStop(1,rgba(14,165,233,0));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,rad*2.2,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.fillStyle='hsla('+hue+',85%,62%,0.95)';ctx.arc(x,y,rad*0.55,0,Math.PI*2);ctx.fill();
    }
    // center core reacts to average
    const core=18+avg()*0.35;
    const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,core*2);
    cg.addColorStop(0,rgba(255,255,255,0.95));
    cg.addColorStop(0.35,rgba(129,140,248,0.7));
    cg.addColorStop(1,rgba(99,102,241,0));
    ctx.fillStyle=cg;ctx.beginPath();ctx.arc(cx,cy,core*2,0,Math.PI*2);ctx.fill();
    if(playing)raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
  insightFromModel();
}

function drawChart(){
  const {w,h}=setupCanvas();
  ctx.clearRect(0,0,w,h);
  const pad=36,bw=(w-pad*2)/Math.max(values.length,1),base=h-36,maxH=h-80;
  values.forEach((v,i)=>{
    const bh=Math.max(8,(v/100)*maxH);
    const x=pad+i*bw+bw*0.18,y=base-bh,ww=bw*0.64;
    const grd=ctx.createLinearGradient(0,y,0,base);
    if(i%2===0){grd.addColorStop(0,'#8b5cf6');grd.addColorStop(1,'#4f46e5')}
    else{grd.addColorStop(0,'#34d399');grd.addColorStop(1,'#0ea5e9')}
    ctx.fillStyle=grd;
    const r=10;ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.arcTo(x+ww,y,x+ww,y+bh,r);ctx.arcTo(x+ww,base,x,base,r);ctx.arcTo(x,base,x,y,r);ctx.arcTo(x,y,x+ww,y,r);ctx.closePath();ctx.fill();
    ctx.fillStyle='#475569';ctx.font='700 11px Inter,system-ui';ctx.textAlign='center';
    ctx.fillText(v+'%',x+ww/2,y-8);
    ctx.fillStyle='#64748b';ctx.font='700 10px Inter,system-ui';
    const label=String(D.variables[i]||'').slice(0,12);
    ctx.fillText(label,x+ww/2,base+16);
  });
  // trend line
  ctx.strokeStyle='rgba(79,70,229,.45)';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();
  values.forEach((v,i)=>{const x=pad+i*bw+bw/2,y=base-(v/100)*maxH;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([]);
  insightFromModel();
}

function drawProcess(){
  clearStageKeepMetric();
  const steps=D.variables.length?D.variables:['Input','Proses','Output'];
  const wrap=document.createElement('div');wrap.className='flow-steps';
  steps.forEach((name,i)=>{
    const row=document.createElement('div');row.className='flow-step'+(i===step?' active':'');row.dataset.i=i;
    const n=document.createElement('div');n.className='n';n.textContent=String(i+1);
    const body=document.createElement('div');
    const t=document.createElement('div');t.className='t';t.textContent=name;
    const s=document.createElement('div');s.className='s';s.textContent=D.labels.step+' '+(i+1)+' '+D.labels.of+' '+steps.length;
    body.append(t,s);row.append(n,body);wrap.appendChild(row);
  });
  stage.insertBefore(wrap,metric);
  metric.textContent=D.labels.step+' '+(step+1)+'/'+steps.length;
  const active=steps[step];
  const strength=values[Math.min(step,values.length-1)]??50;
  insightEl.textContent=D.concept+': fokusus "'+active+'" · intensitas langkah '+strength+'% ('+band(strength)+'). Urutan proses memengaruhi hasil akhir.';
}

function drawDiagram(){
  clearStageKeepMetric();
  const parts=D.variables.length?D.variables:['A','B','C','D'];
  const wrap=document.createElement('div');wrap.className='diagram';
  parts.forEach((name,i)=>{
    const p=document.createElement('button');p.type='button';p.className='part'+(i===step?' active':'');
    const ico=document.createElement('div');ico.className='ico';ico.textContent=String(name).slice(0,2).toUpperCase();
    const nm=document.createElement('div');nm.className='name';nm.textContent=name;
    const hint=document.createElement('div');hint.className='hint';hint.textContent=band(values[Math.min(i,values.length-1)]??50);
    p.append(ico,nm,hint);
    p.addEventListener('click',()=>{step=i;draw()});
    wrap.appendChild(p);
  });
  stage.insertBefore(wrap,metric);
  metric.textContent=D.labels.clickPart;
  const focus=parts[step]||parts[0];
  const v=values[Math.min(step,values.length-1)]??50;
  insightEl.textContent=D.concept+' → bagian "'+focus+'" (bobot '+v+'%). Bandingkan peran tiap bagian terhadap keseluruhan sistem.';
}

function draw3d(){
  clearStageKeepMetric();
  const wrap=document.createElement('div');wrap.className='cube-wrap';
  const cube=document.createElement('div');cube.className='cube';cube.id='cube';
  const faces=[['f',D.variables[0]||'Core'],['b',D.variables[1]||'Back'],['r',D.variables[2]||'Right'],['l',D.variables[3]||'Left'],['u',D.variables[4]||'Top'],['d',D.concept.slice(0,10)]];
  faces.forEach(([cls,txt])=>{const f=document.createElement('div');f.className='face '+cls;f.textContent=txt;cube.appendChild(f)});
  wrap.appendChild(cube);stage.insertBefore(wrap,metric);
  const apply=()=>{cube.style.transform='rotateX('+rotX+'deg) rotateY('+rotY+'deg) scale('+(0.85+avg()/400)+')'};
  apply();
  wrap.onpointerdown=(e)=>{drag={x:e.clientX,y:e.clientY,rx:rotX,ry:rotY};wrap.setPointerCapture(e.pointerId)};
  wrap.onpointermove=(e)=>{if(!drag)return;rotY=drag.ry+(e.clientX-drag.x)*0.4;rotX=Math.max(-70,Math.min(70,drag.rx-(e.clientY-drag.y)*0.4));apply()};
  wrap.onpointerup=()=>{drag=null};
  metric.textContent=D.labels.rotate;
  insightEl.textContent=D.concept+': model 3D interaktif. Skala mengikuti rata-rata kontrol ('+avg()+'%). Putar untuk melihat sisi berbeda.';
}

function draw(){
  cancelAnimationFrame(raf);
  if(type==='PROCESS_FLOW')drawProcess();
  else if(type==='DIAGRAM')drawDiagram();
  else if(type==='3D_MODEL')draw3d();
  else if(type==='CHART')drawChart();
  else drawSimulation();
}

btn(D.labels.reset,'',()=>{
  values.fill(48);step=0;playing=true;rotX=-22;rotY=28;
  [...controls.querySelectorAll('input')].forEach((inp,i)=>{inp.value=48;outputs[i].textContent='48'});
  draw();
});
if(type==='PROCESS_FLOW'){
  btn(D.labels.prev,'',()=>{step=(step-1+D.variables.length)%Math.max(D.variables.length,1);draw()});
  btn(D.labels.next,'primary',()=>{step=(step+1)%Math.max(D.variables.length,1);draw()});
} else if(type==='SIMULATION'||type==='CHART'){
  btn(D.labels.pause,'',function(){playing=!playing;this.textContent=playing?D.labels.pause:D.labels.play;if(playing)draw()});
}
window.addEventListener('resize',()=>{if(type==='SIMULATION'||type==='CHART')draw()});
draw();
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
Max 6 concepts. Prefer SIMULATION and PROCESS_FLOW for dynamic ideas; DIAGRAM for structure; CHART only when comparing quantities; 3D_MODEL for spatial objects.
Each concept needs 2–5 interactive variables that map to real levers in the material (not generic "intensity" only).
vizType one of SIMULATION|DIAGRAM|CHART|PROCESS_FLOW|3D_MODEL.`;

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

const generationSystemInstruction = (materialSample?: string) => `ROLE: You are an expert educational simulation engineer.
TASK: Build ONE self-contained, generative HTML5 learning simulation that teaches a concept through interaction.

${outputLanguageRule(materialSample)}
All visible UI text (titles, labels, buttons, tooltips, insights) MUST follow the output language rule.

DESIGN SYSTEM (match Noodl app — NOT a black terminal):
- Light, airy backgrounds: soft indigo/violet/sky gradients (#eef2ff, #faf5ff, #ecfeff, white cards)
- Primary accent #4f46e5 / #6366f1, secondary #8b5cf6, success #10b981
- Rounded cards (16–24px), soft shadows, glass-like panels
- Readable dark slate text (#1e293b / #475569) — never pure black body on pure black
- FORBIDDEN: solid #000 backgrounds, gray-on-black dashboards, placeholder lorem, empty canvases

SIMULATION QUALITY (must be meaningful, not decorative only):
- Encode a real cause→effect model grounded in the material (equations, stages, flows, trade-offs)
- Controls must change the visual outcome AND an insight/explanation line
- Prefer canvas/SVG animation, process steppers, particle systems, force diagrams, or labeled anatomy — NOT a lone bar chart unless TYPE is CHART
- If TYPE is SIMULATION: interactive physics/math/system dynamics
- If TYPE is PROCESS_FLOW: multi-step animated process with next/prev
- If TYPE is DIAGRAM: clickable labeled parts with explanations
- If TYPE is 3D_MODEL: CSS 3D or canvas pseudo-3D the user can rotate
- If TYPE is CHART: multi-series comparison with trend insight, still light-themed

TECH:
- Single HTML file, inline CSS+JS only, no CDN/external assets
- Mobile responsive, works inside an iframe sandbox
- Keep under ~500 lines; working code over fluff
- Start output with <!DOCTYPE html>. No markdown fences. No JSON wrapper.`;

export async function generateVisualization(
  blueprint: VisualizationBlueprint,
  materialContext: string,
  onProgress?: (msg: string) => void,
  userFeedback?: string,
  existingHtmlCode?: string
): Promise<VisualizationResult> {
  const isId = getLocale() === 'id';
  onProgress?.(userFeedback
    ? (isId ? `⚡ Memperbarui visualisasi: ${blueprint.concept}…` : `⚡ Updating visualization: ${blueprint.concept}…`)
    : (isId ? `⚡ Membuat simulasi HTML5: ${blueprint.concept}…` : `⚡ Building HTML5 simulation: ${blueprint.concept}…`));

  const provider = getActiveProvider();
  const hasKey = !!getProviderApiKey(provider);

  // Offline / no key → meaningful local type-aware lab (not a dead placeholder).
  if (!hasKey && !userFeedback) {
    onProgress?.(isId
      ? 'Tidak ada API key; memakai laboratorium lokal interaktif.'
      : 'No API key; using an interactive local concept lab.');
    return {
      id: blueprint.id,
      blueprint,
      htmlCode: buildLocalVisualization(blueprint),
      explanation: blueprint.description || blueprint.concept,
      interactionGuide: isId
        ? 'Geser kontrol / jalankan langkah untuk melihat hubungan sebab–akibat.'
        : 'Use the controls or steps to explore cause and effect.',
      status: 'success',
    };
  }

  const langBlock = outputLanguageRule(materialContext || blueprint.description || blueprint.concept);
  const variablesStr = blueprint.variables.length > 0
    ? `\nINTERACTIVE VARIABLES (must include a working control for each):\n${blueprint.variables.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
    : `\nInvent 2–4 meaningful variables grounded in the material.`;

  let prompt = '';
  if (userFeedback && existingHtmlCode) {
    prompt = `Refine this single-file HTML5 learning simulation.

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

Keep the Noodl light indigo/violet theme. Make interactions teach a real relationship from the material.
OUTPUT: complete HTML document only. Start with <!DOCTYPE html>. No markdown. No JSON wrapper.`;
  } else {
    prompt = `Build one generative interactive HTML5 learning simulation.

CONCEPT: ${blueprint.concept}
TYPE: ${blueprint.vizType}
DESCRIPTION: ${blueprint.description}
RATIONALE: ${blueprint.rationale || 'Help learners internalize this concept.'}
${variablesStr}

MATERIAL CONTEXT (ground the model in this — do not invent contradicting facts):
"""
${materialContext.substring(0, 16000)}
"""

${langBlock}

REQUIREMENTS:
1. Single HTML file, inline CSS+JS, no CDN
2. Light Noodl theme (indigo/violet soft gradients + white cards) — never pure black UI
3. Meaningful generative simulation: changing controls must change visuals + insight text with a causal explanation
4. Type-faithful:
   - SIMULATION → animated system/canvas dynamics
   - PROCESS_FLOW → step machine
   - DIAGRAM → labeled interactive parts
   - 3D_MODEL → rotatable model
   - CHART → comparative chart with insight (only if type is CHART)
5. Title, short instruction, controls, live insight panel
6. Compact, working code that fits one response

OUTPUT: complete HTML document only. Start with <!DOCTYPE html>. No markdown. No JSON.`;
  }

  const attemptGeneration = async (promptText: string, action: string, maxTokens: number) => {
    const data = await callVisualizationAI({
      action,
      modelName: genModel(),
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      systemInstruction: generationSystemInstruction(materialContext),
      temperature: 0.45,
      maxOutputTokens: maxTokens,
    });
    if (data.error) throw new Error(data.error);
    const htmlCode = extractHtmlDocument(data.result);
    if (htmlCode.length < 120) throw new Error('Generated HTML is too short');
    // Reject obvious empty/black placeholders
    const lower = htmlCode.toLowerCase();
    if (!lower.includes('<body') && !lower.includes('<canvas') && !lower.includes('<svg') && !lower.includes('button')) {
      throw new Error('Generated HTML lacks interactive structure');
    }
    return htmlCode;
  };

  try {
    const htmlCode = await attemptGeneration(prompt, 'vizGenerate', 8192);
    return {
      id: blueprint.id,
      blueprint,
      htmlCode,
      explanation: isId
        ? `Simulasi HTML5 generatif: ${blueprint.concept}`
        : `Generative HTML5 simulation: ${blueprint.concept}`,
      interactionGuide: isId
        ? 'Ubah kontrol dan amati bagaimana model merespons — baca wawasan di bawah panggung.'
        : 'Change the controls and watch the model respond — read the insight under the stage.',
      status: 'success',
    };
  } catch (primaryErr: any) {
    console.warn(`[Phase 2] Failed for "${blueprint.concept}": ${primaryErr.message}`);
    try {
      onProgress?.(isId
        ? `⚡ Retry ringkas: ${blueprint.concept}…`
        : `⚡ Compact retry: ${blueprint.concept}…`);
      const shortPrompt = `Create a compact interactive HTML5 learning sim for "${blueprint.concept}" (${blueprint.vizType}).
Description: ${blueprint.description}
Variables: ${(blueprint.variables || []).join(', ') || 'choose 2–3 from the material'}
Material snippet:
"""
${materialContext.substring(0, 6000)}
"""
${langBlock}
Light indigo theme (not black). Canvas or SVG preferred. Controls change outcome + insight text with real cause-effect.
Single file, inline CSS/JS, no CDN. Start with <!DOCTYPE html>.`;
      const htmlCode = await attemptGeneration(shortPrompt, 'vizGenerateRetry', 6144);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode,
        explanation: blueprint.description || blueprint.concept,
        interactionGuide: isId ? 'Gunakan kontrol di layar.' : 'Use on-screen controls.',
        status: 'success',
      };
    } catch (fallbackErr: any) {
      console.warn(`[Phase 2] AI failed for "${blueprint.concept}"; using local generative lab:`, fallbackErr);
      return {
        id: blueprint.id,
        blueprint,
        htmlCode: buildLocalVisualization(blueprint),
        explanation: blueprint.description || blueprint.concept,
        interactionGuide: isId
          ? 'Mode lokal: kendali tetap interaktif meski AI gagal.'
          : 'Local mode: controls stay interactive even if AI failed.',
        status: 'success',
      };
    }
  }
}

// ─── BATCH GENERATION — small parallel waves (keep low for low-end devices) ───
const VIZ_CONCURRENCY = 2;

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
