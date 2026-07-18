import { GoogleGenAI } from "@google/genai";

// Increase Vercel's default body-parser limit (default is 1MB) to handle large inline file payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

// Preview model identifiers used only for model name normalization
const PREVIEW_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
];

// Resolve model name (normalise gemini-3 references to stable aliases)
function resolveModel(modelName: string | undefined): string {
  if (!modelName) return 'gemini-3.5-flash';
  if (PREVIEW_MODELS.includes(modelName)) return modelName;
  if (modelName.startsWith('gemini-3.5')) return 'gemini-3.5-flash';
  if (modelName.startsWith('gemini-3.1-pro')) return 'gemini-3.1-pro-preview';
  if (modelName.startsWith('gemini-3.1-flash')) return 'gemini-3.1-flash-lite-preview';
  if (modelName.startsWith('gemini-3')) return 'gemini-3.5-flash';
  return modelName;
}

// === MANUAL REST CLENT UNTUK VERTEX AI EXPRESS MODE ===
// Menjamin pemetaan 1:1 sempurna untuk Curl yang diinstruksikan dokumentasi Cloud
async function callVertexExpress(model: string, contents: any, config: any, apiKey: string) {
  // Vertex AI Express menggunakan aiplatform.googleapis.com (Tanpa format Region atau Project ID)
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`;

  const payload: any = { contents };
  
  // Format config jika tersedia
  if (config) {
    if (config.temperature !== undefined || config.responseMimeType || config.responseSchema) {
      payload.generationConfig = {};
      if (config.temperature !== undefined) payload.generationConfig.temperature = config.temperature;
      if (config.responseMimeType) payload.generationConfig.responseMimeType = config.responseMimeType;
      if (config.responseSchema) payload.generationConfig.responseSchema = config.responseSchema;
      if (config.maxOutputTokens) payload.generationConfig.maxOutputTokens = config.maxOutputTokens;
    }
    if (config.systemInstruction) {
       payload.systemInstruction = { parts: [{ text: config.systemInstruction }] };
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex Express Error: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const textResponse = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) throw new Error("Empty response from Vertex Express");
  
  return textResponse;
}

// === VERCEL SERVERLESS FUNCTION ===
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { action, payload } = req.body;
  if (!action || !payload) return res.status(400).json({ error: 'Missing action or payload' });

  try {
    const env = process.env as any;
    const isVertexAIEnabled = env.VITE_USE_VERTEX_AI === 'true';
    const useVertexExpress = env.VITE_USE_VERTEX_EXPRESS === 'true';
    const vertexApiKey = env.VITE_VERTEX_API_KEY;
    const aiStudioKey = payload.apiKey || process.env.GEMINI_API_KEY;

    const { modelName, contents, parts, responseSchema, temperature, systemInstruction, maxOutputTokens } = payload;
    const resolvedModel = resolveModel(modelName);

    // Standarisasi form content (Menangani masalah INVALID_ARGUMENT role user/model)
    const requestContents = contents || [{ role: 'user', parts }];

    // Siapkan parameter GenerationConfig yang spesifik dari sistem kita
    let genConfig: any = {};
    if (action === 'generateQuizBatch') {
       genConfig = { responseMimeType: "application/json", responseSchema, temperature: temperature ?? 0.5, maxOutputTokens: maxOutputTokens ?? 16384 };
    } else if (action === 'summarize') {
       genConfig = { temperature: temperature ?? 0.2, maxOutputTokens: maxOutputTokens ?? 12288 };
    } else if (action === 'chat') {
       genConfig = { systemInstruction, temperature: temperature ?? 0.3, maxOutputTokens: maxOutputTokens ?? 8192 };
    }

    let result;

    // STRATEGI ROUTING 1: VERTEX AI via ADC (Application Default Credentials)
    if (isVertexAIEnabled) {
      const project = env.VITE_GCP_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT;
      if (!project) {
        return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT (atau VITE_GCP_PROJECT_ID) belum diatur' });
      }
      const location = env.VITE_GCP_LOCATION || env.GOOGLE_CLOUD_LOCATION || 'global';
      console.log(`[Backend API] Routing via Vertex AI ADC (project=${project}, location=${location}, model=${resolvedModel})...`);
      const ai = new GoogleGenAI({ vertexai: true, project, location });
      const response = await ai.models.generateContent({
        model: resolvedModel,
        contents: requestContents,
        config: Object.keys(genConfig).length > 0 ? genConfig : undefined,
      });
      result = response.text;
    }
    // STRATEGI ROUTING 2: VERTEX AI EXPRESS
    else if (useVertexExpress && vertexApiKey) {
      console.log(`[Backend API] Routing via Vertex AI Express Mode -> ${resolvedModel}`);
      result = await callVertexExpress(resolvedModel, requestContents, Object.keys(genConfig).length > 0 ? genConfig : null, vertexApiKey);
    } 
    // STRATEGI ROUTING 3: GOOGLE AI STUDIO (FALLBACK/STANDARD)
    else if (aiStudioKey) {
      console.log(`[Backend API] Routing via standard Google AI Studio -> ${resolvedModel}`);
      const ai = new GoogleGenAI({ apiKey: aiStudioKey });
      const response = await ai.models.generateContent({
        model: resolvedModel,
        contents: requestContents,
        config: Object.keys(genConfig).length > 0 ? genConfig : undefined
      });
      result = response.text;
    } 
    else {
      return res.status(401).json({ error: 'Belum ada kredensial AI (Vertex ADC, Vertex Express, maupun AI Studio) yang dikonfigurasi di Server.' });
    }

    // Response Sukses
    return res.status(200).json({ result });

  } catch (error: any) {
    console.error("Vercel API Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
