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
  getActiveModel,
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
  relationship: string;    // e.g. "causes", "part of"
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

// ── AI CONFIG: always Settings global model ──

function extractModel(): string {
  const p = getActiveProvider();
  return resolveModelName(p, getActiveModel(p));
}
function renderModel(): string {
  return extractModel();
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
    throw new Error(getLocale() === 'id'
      ? 'Minimal 3 soal diperlukan untuk membuat knowledge graph.'
      : 'At least 3 questions are needed for a knowledge graph.');
  }

  const questionSummary = questions.slice(0, 100).map((q, i) => {
    return `Q${i + 1}: ${q.text}\nKey Point: ${q.keyPoint || 'N/A'}\nExplanation: ${q.explanation || 'N/A'}`;
  }).join('\n\n');

  const materialSample = [
    questionSummary,
    materialContext || '',
  ].join('\n').slice(0, 8000);
  const langBlock = outputLanguageRule(materialSample);

  const prompt = `Analyze the following questions and build a concept map (knowledge graph) of the tested material.

QUESTIONS:
"""
${questionSummary}
"""

${materialContext ? `ADDITIONAL MATERIAL CONTEXT:\n"""\n${materialContext.substring(0, 50000)}\n"""` : ''}

INSTRUCTIONS:
1. Identify main concepts covered by the questions.
2. Determine relationships between concepts.
3. Group concepts into sensible categories.
4. Count how many questions relate to each concept.
5. Set importance (core/supporting/detail) by frequency and centrality.
6. Max 40 nodes and 60 edges.

${langBlock}

Node labels, relationship labels, categories, and the summary MUST follow OUTPUT LANGUAGE.
Return exact JSON.`;

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
    systemInstruction: `You extract educational knowledge graphs.\n${langBlock}`,
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
    throw new Error(getLocale() === 'id'
      ? 'Gagal parse graph data dari AI response.'
      : 'Could not parse graph data from the AI response.');
  }
}

// ── PHASE 2: GENERATE INTERACTIVE HTML ──

export async function generateGraphHTML(
  graphData: GraphData,
  title: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.(getLocale() === 'id' ? '🎨 Membuat visualisasi knowledge graph…' : '🎨 Building interactive knowledge graph…');

  const langSample = `${title}\n${graphData.summary || ''}\n${(graphData.nodes || []).map((n) => n.label).join(' ')}`;
  const langBlock = outputLanguageRule(langSample);

  const prompt = `Build an interactive HTML page that displays this knowledge graph (concept map).

GRAPH DATA (JSON):
"""
${JSON.stringify(graphData, null, 2)}
"""

TITLE: "${title}"

${langBlock}

REQUIREMENTS:
1. HTML5 Canvas graph (NO external libraries, NO CDN).
2. Nodes as circles/boxes with labels.
3. importance='core' nodes larger and more prominent.
4. Edges as connectors with relationship labels.
5. Distinct colors per category (aesthetic palette).
6. Draggable nodes.
7. Node hover tooltip (category, question count).
8. Edge hover shows relationship.
9. Zoom (scroll) and pan (drag background).
10. Simple force-directed initial layout.
11. Responsive / mobile-friendly.
12. Summary text under the graph.
13. Legend by category color.
14. Modern dark-mode friendly design.
15. ALL UI chrome, tooltips, legend titles, and summary must follow OUTPUT LANGUAGE.

OUTPUT: One complete HTML file with inline CSS/JS. HTML only — no markdown. Start with <!DOCTYPE html>.`;

  const data = await callGraphAI({
    modelName: renderModel(),
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: `You generate educational graph HTML visualizations.\n${langBlock}`,
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
      throw new Error(getLocale() === 'id'
        ? 'AI tidak menghasilkan HTML yang valid.'
        : 'AI did not produce valid HTML.');
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

    onProgress?.(
      getLocale() === 'id'
        ? `✅ Ditemukan ${graphData.nodes.length} konsep dan ${graphData.edges.length} relasi.`
        : `✅ Found ${graphData.nodes.length} concepts and ${graphData.edges.length} links.`
    );

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
