/**
 * Canonical localStorage / IndexedDB keys + one-time migration from Mikir legacy names.
 * Call migrateLegacyKeys() once on app boot.
 */
import { get, set, del } from 'idb-keyval';

export const KEYS = {
  historyIdb: 'noodl_history_store',
  pendingUploads: 'noodl_pending_uploads',
  pendingDeletions: 'noodl_pending_deletions',
  libraryIdb: 'noodl_library_store',
  graveyard: 'noodl_graveyard',
  theme: 'noodl_theme',
  storagePref: 'noodl_storage_pref',
  srsEnabled: 'noodl_srs_enabled',
  handTracking: 'noodl_hand_tracking_enabled',
  noseTracking: 'noodl_nose_tracking_enabled',
  advancedHandsFree: 'noodl_advanced_handsfree',
  sessionIdb: 'noodl_active_session',
  srsIdb: 'noodl_srs_store',
  // provider
  activeProvider: 'noodl_active_provider',
  apiKeyPrefix: 'noodl_api_key_',
  baseUrlPrefix: 'noodl_base_url_',
  modelsPrefix: 'noodl_fetched_models_',
  geminiLegacyAlias: 'noodl_gemini_api_key',
} as const;

/** old → new (localStorage string keys) */
const LS_MIGRATIONS: Array<[string, string]> = [
  ['glassquiz_theme', KEYS.theme],
  ['glassquiz_storage_pref', KEYS.storagePref],
  ['glassquiz_graveyard', KEYS.graveyard],
  ['glassquiz_api_key', KEYS.geminiLegacyAlias],
  ['glassquiz_gesture_enabled', KEYS.handTracking],
  ['glassquiz_eye_tracking_enabled', KEYS.noseTracking],
  ['noodl_hand_tracking_enabled', KEYS.handTracking],
  ['noodl_nose_tracking_enabled', KEYS.noseTracking],
  ['neuro_srs_enabled', KEYS.srsEnabled],
  ['mikir_active_provider', KEYS.activeProvider],
  ['mikir_gemini_api_key', KEYS.geminiLegacyAlias],
  ['experimental_features_enabled', KEYS.advancedHandsFree],
];

const IDB_MIGRATIONS: Array<[string, string]> = [
  ['glassquiz_history_store', KEYS.historyIdb],
  ['glassquiz_pending_uploads', KEYS.pendingUploads],
  ['glassquiz_pending_deletions', KEYS.pendingDeletions],
  ['glassquiz_library_store', KEYS.libraryIdb],
  ['mikir_active_session', KEYS.sessionIdb],
  ['noodl_srs_store', KEYS.srsIdb],
];

const FLAG = 'noodl_keys_migrated_v2';

function migrateLsPrefix(oldPrefix: string, newPrefix: string) {
  if (typeof localStorage === 'undefined') return;
  const toMove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(oldPrefix) && !k.startsWith(newPrefix)) toMove.push(k);
  }
  for (const k of toMove) {
    const nk = newPrefix + k.slice(oldPrefix.length);
    if (localStorage.getItem(nk) == null) {
      localStorage.setItem(nk, localStorage.getItem(k)!);
    }
  }
}

export async function migrateLegacyKeys(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(FLAG) === '1') return;

  for (const [oldK, newK] of LS_MIGRATIONS) {
    const v = localStorage.getItem(oldK);
    if (v != null && localStorage.getItem(newK) == null) {
      localStorage.setItem(newK, v);
    }
  }

  migrateLsPrefix('mikir_api_key_', KEYS.apiKeyPrefix);
  migrateLsPrefix('mikir_base_url_', KEYS.baseUrlPrefix);
  migrateLsPrefix('mikir_fetched_models_', KEYS.modelsPrefix);

  // legacy glassquiz library in localStorage → idb
  try {
    const rawLib = localStorage.getItem('glassquiz_library');
    if (rawLib) {
      const existing = await get(KEYS.libraryIdb);
      if (!existing) {
        const parsed = JSON.parse(rawLib);
        await set(KEYS.libraryIdb, parsed);
      }
      localStorage.removeItem('glassquiz_library');
    }
  } catch {
    /* ignore */
  }

  for (const [oldK, newK] of IDB_MIGRATIONS) {
    try {
      const oldVal = await get(oldK);
      const newVal = await get(newK);
      if (oldVal != null && (newVal == null || (Array.isArray(newVal) && newVal.length === 0))) {
        await set(newK, oldVal);
      }
    } catch {
      /* ignore */
    }
  }

  // dual-read history: also try very old key
  try {
    const hist = await get(KEYS.historyIdb);
    if (!hist) {
      const legacy = await get('glassquiz_history_store');
      if (legacy) await set(KEYS.historyIdb, legacy);
    }
  } catch {
    /* ignore */
  }

  localStorage.setItem(FLAG, '1');
}

export function lsGet(key: string, ...fallbacks: string[]): string | null {
  const v = localStorage.getItem(key);
  if (v != null) return v;
  for (const f of fallbacks) {
    const x = localStorage.getItem(f);
    if (x != null) return x;
  }
  return null;
}
