import { AiProvider, ModelOption } from '../types';

export interface ProviderSetting {
  id: AiProvider;
  name: string;
  defaultBaseUrl: string;
  description: string;
  docsUrl: string;
  requiresKey: boolean;
  presetModels: ModelOption[];
}

export const PROVIDER_CATALOG: ProviderSetting[] = [
  {
    id: 'gemini',
    name: 'Google Gemini / Vertex AI',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    description: 'Proses tercepat, mendukung multimodalitas native & Firebase Vertex AI tanpa key (Express Mode).',
    docsUrl: 'https://aistudio.google.com/',
    requiresKey: false,
    presetModels: [
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Flagship)', provider: 'gemini', isVision: true },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview Reasoning)', provider: 'gemini', isVision: true },
      { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite (Ultra Fast)', provider: 'gemini', isVision: true },
      { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Multimodal)', provider: 'gemini', isVision: true },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', provider: 'gemini', isVision: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Stable)', provider: 'gemini', isVision: true },
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (AgnoStik AI Hub)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    description: 'Akses 200+ model AI (Claude 3.5, DeepSeek R1, Llama 3.3, GPT-4o) dari satu API Key.',
    docsUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
    presetModels: [
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (Anthropic)', provider: 'openrouter', isVision: true },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 (Reasoning Master)', provider: 'openrouter', isVision: false },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Meta)', provider: 'openrouter', isVision: false },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (via OpenRouter)', provider: 'openrouter', isVision: true },
      { id: 'openai/gpt-4o', label: 'GPT-4o (OpenAI)', provider: 'openrouter', isVision: true },
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (Direct)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    description: 'Koneksi langsung ke model flagship OpenAI GPT-4o, o3-mini, GPT-4o-mini.',
    docsUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
    presetModels: [
      { id: 'gpt-4o', label: 'GPT-4o (Flagship)', provider: 'openai', isVision: true },
      { id: 'gpt-4o-mini', label: 'GPT-4o-mini (Cepat & Hemat)', provider: 'openai', isVision: true },
      { id: 'o3-mini', label: 'o3-mini (Reasoning Model)', provider: 'openai', isVision: false },
    ]
  },
  {
    id: 'groq',
    name: 'Groq Cloud LPU',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    description: 'Kecepatan inferensi ultra tinggi (500+ tokens/detik) dengan Llama 3.3 & Mixtral.',
    docsUrl: 'https://console.groq.com/keys',
    requiresKey: true,
    presetModels: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Meta)', provider: 'groq', isVision: false },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Mistral AI)', provider: 'groq', isVision: false },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B (Google/Groq)', provider: 'groq', isVision: false },
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude Direct',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    description: 'Koneksi API langsung ke Anthropic Claude 3.5 Sonnet & Claude 3.5 Haiku.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
    presetModels: [
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Latest)', provider: 'anthropic', isVision: true },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (Speed)', provider: 'anthropic', isVision: true },
    ]
  },
  {
    id: 'ninerouter',
    name: '9Router Gateway (Cloudflare Tunnel)',
    defaultBaseUrl: 'http://localhost:8787/v1',
    description: 'Optional self-hosted OpenAI-compatible gateway (set your own base URL in Settings).',
    docsUrl: 'https://github.com/SeraKah-1/9router',
    requiresKey: true,
    presetModels: [
      { id: 'sv/mimo-v2.5-pro', label: 'MiMo v2.5 Pro (9Router)', provider: 'ninerouter', isVision: true },
      { id: 'sv/mimo-v2.5', label: 'MiMo v2.5 (9Router)', provider: 'ninerouter', isVision: true },
      { id: 'kr/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (9Router)', provider: 'ninerouter', isVision: true },
      { id: 'ag/gemini-3.5-flash-high', label: 'Gemini 3.5 Flash High (9Router)', provider: 'ninerouter', isVision: true },
      { id: 'ag/gemini-3-flash', label: 'Gemini 3 Flash (9Router)', provider: 'ninerouter', isVision: true },
    ]
  },
  {
    id: 'custom',
    name: 'Custom OpenAI REST API / Local Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    description: 'Hubungkan endpoint lokal Ollama, LM Studio, vLLM, atau proxy server REST API milik Anda.',
    docsUrl: 'https://ollama.com/',
    requiresKey: false,
    presetModels: [
      { id: 'qwen2.5:latest', label: 'Qwen 2.5 (Local Ollama)', provider: 'custom', isVision: false },
      { id: 'llama3:latest', label: 'Llama 3 (Local Ollama)', provider: 'custom', isVision: false },
      { id: 'custom-model', label: 'Custom Model Name', provider: 'custom', isVision: true },
    ]
  }
];

const STORAGE_ACTIVE_PROVIDER = 'mikir_active_provider';
const STORAGE_PREFIX_KEY = 'mikir_api_key_';
const STORAGE_PREFIX_BASEURL = 'mikir_base_url_';
const STORAGE_PREFIX_MODELS = 'mikir_fetched_models_';

// Get Current Active Provider
export const getActiveProvider = (): AiProvider => {
  const stored = localStorage.getItem(STORAGE_ACTIVE_PROVIDER) as AiProvider;
  if (stored && PROVIDER_CATALOG.some(p => p.id === stored)) return stored;
  return 'gemini';
};

// Set Active Provider
export const setActiveProvider = (provider: AiProvider): void => {
  localStorage.setItem(STORAGE_ACTIVE_PROVIDER, provider);
};

// Get API Key for provider
export const getProviderApiKey = (provider: AiProvider): string | null => {
  const key = localStorage.getItem(`${STORAGE_PREFIX_KEY}${provider}`);
  if (key) return key;

  // Fallbacks for Gemini
  if (provider === 'gemini') {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
      if (process.env.API_KEY) return process.env.API_KEY;
    }
    if (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
    const oldKey = localStorage.getItem('mikir_gemini_api_key');
    if (oldKey) return oldKey;
  }
  return null;
};

// Save API Key for provider
export const setProviderApiKey = (provider: AiProvider, key: string): void => {
  localStorage.setItem(`${STORAGE_PREFIX_KEY}${provider}`, key);
  if (provider === 'gemini') {
    localStorage.setItem('mikir_gemini_api_key', key);
  }
};

// Get Custom Base URL
export const getProviderBaseUrl = (provider: AiProvider): string => {
  const stored = localStorage.getItem(`${STORAGE_PREFIX_BASEURL}${provider}`);
  if (stored) return stored;
  const catalog = PROVIDER_CATALOG.find(p => p.id === provider);
  return catalog?.defaultBaseUrl || '';
};

// Save Custom Base URL
export const setProviderBaseUrl = (provider: AiProvider, url: string): void => {
  localStorage.setItem(`${STORAGE_PREFIX_BASEURL}${provider}`, url);
};

// Get Saved Fetched Models
export const getCachedModels = (provider: AiProvider): ModelOption[] => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_MODELS}${provider}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[ProviderService] Failed to read cached models:', e);
  }
  const catalog = PROVIDER_CATALOG.find(p => p.id === provider);
  return catalog?.presetModels || [];
};

// Auto-Fetch Models Agnostik from Provider Endpoint
export const autoFetchModels = async (
  provider: AiProvider,
  apiKeyOverride?: string,
  baseUrlOverride?: string
): Promise<{ models: ModelOption[]; error?: string }> => {
  const apiKey = apiKeyOverride ?? getProviderApiKey(provider);
  const baseUrl = (baseUrlOverride ?? getProviderBaseUrl(provider)).replace(/\/+$/, '');

  console.log(`[ProviderService] Auto-fetching models for ${provider} from ${baseUrl}...`);

  try {
    let fetchedList: ModelOption[] = [];

    if (provider === 'gemini') {
      const targetKey = apiKey || import.meta.env.VITE_GEMINI_API_KEY;
      if (!targetKey) {
        return { models: getCachedModels('gemini'), error: 'Menggunakan model bawaan Gemini Vertex AI (Express Mode).' };
      }
      const url = `${baseUrl}/models?key=${targetKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (Array.isArray(data.models)) {
        fetchedList = data.models
          .filter((m: any) => m.name && m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => {
            const cleanId = m.name.replace(/^models\//, '');
            return {
              id: cleanId,
              label: `${m.displayName || cleanId}`,
              provider: 'gemini',
              isVision: Boolean(m.supportedGenerationMethods?.includes('generateContent'))
            };
          });
      }
    } else if (provider === 'openrouter' || provider === 'openai' || provider === 'groq' || provider === 'ninerouter' || provider === 'custom') {
      const url = `${baseUrl}/models`;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const rawList = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);

      if (rawList.length > 0) {
        fetchedList = rawList.slice(0, 50).map((m: any) => {
          const modelId = m.id || m.name;
          return {
            id: modelId,
            label: m.name ? `${m.name} (${modelId})` : modelId,
            provider,
            isVision: true
          };
        });
      }
    }

    if (fetchedList.length > 0) {
      localStorage.setItem(`${STORAGE_PREFIX_MODELS}${provider}`, JSON.stringify(fetchedList));
      return { models: fetchedList };
    }

    // Fallback to presets if list empty
    const presets = getCachedModels(provider);
    return { models: presets, error: 'Endpoint tidak mengembalikan daftar model, menggunakan daftar preset.' };
  } catch (err: any) {
    console.error(`[ProviderService] Auto-fetch error for ${provider}:`, err);
    const presets = getCachedModels(provider);
    return {
      models: presets,
      error: `Gagal auto-fetch (${err.message || 'Error koneksi'}). Menggunakan model preset.`
    };
  }
};
