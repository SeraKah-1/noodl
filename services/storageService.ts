/**
 * STORAGE SERVICE — local-first (IndexedDB) + Supabase via syncService.
 * No Firebase/Firestore.
 */
import { Question, ModelConfig, AiProvider, StorageProvider, LibraryItem, DeepInsightData } from "../types";
import { summarizeMaterial } from "./geminiService";
import { get, set, update } from "idb-keyval";
import { auth, isSupabaseConfigured } from "../supabase";
import {
  cloudUpsertQuizRow,
  cloudSoftDeleteQuiz,
  runFullSync,
  registerNetworkSyncListener as registerSyncNetwork,
  startRealtimeSync,
  stopRealtimeSync,
} from "./syncService";
import { KEYS, migrateLegacyKeys, lsGet } from "./storageKeys";
import { getProviderApiKey, setProviderApiKey } from "./providerService";

if (typeof window !== "undefined") {
  migrateLegacyKeys().catch(() => {});
}

export const HISTORY_IDB_KEY = KEYS.historyIdb;
export const PENDING_UPLOADS_KEY = KEYS.pendingUploads;
export const PENDING_DELETIONS_KEY = KEYS.pendingDeletions;
const LIBRARY_IDB_KEY = KEYS.libraryIdb;
const GRAVEYARD_KEY = KEYS.graveyard;
const THEME_KEY = KEYS.theme;
const STORAGE_PREF_KEY = KEYS.storagePref;
const HAND_TRACKING_ENABLED_KEY = KEYS.handTracking;
const NOSE_TRACKING_ENABLED_KEY = KEYS.noseTracking;
const SRS_ENABLED_KEY = KEYS.srsEnabled;

const cloudOn = () => Boolean(isSupabaseConfigured && auth.currentUser);

async function cloudUpsertQuiz(quiz: any) {
  try {
    await cloudUpsertQuizRow({
      ...quiz,
      client_updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("[cloud quiz]", e?.message || e);
  }
}

async function cloudDeleteQuiz(id: string) {
  try {
    await cloudSoftDeleteQuiz(id);
  } catch (e: any) {
    console.warn("[cloud delete]", e?.message || e);
  }
}

async function cloudMergeProfile(config: Record<string, unknown>) {
  if (!cloudOn()) return;
  try {
    const { supabase } = await import("../supabase");
    if (!supabase || !auth.currentUser) return;
    const { error } = await supabase.from("user_profiles").upsert({
      user_id: auth.currentUser.uid,
      config,
      updated_at: new Date().toISOString(),
    });
    if (error) console.warn("[profile]", error.message);
  } catch (e) {
    console.warn("[profile]", e);
  }
}

async function queueQuizUpload(item: any) {
  await update(PENDING_UPLOADS_KEY, (val) => {
    const pending = val || [];
    const filtered = pending.filter((p: any) => String(p.id) !== String(item.id));
    return [...filtered, item];
  });
}

async function pushQuizById(id: string | number) {
  if (!auth.currentUser) return;
  const history = (await get(HISTORY_IDB_KEY)) || [];
  const item = history.find((i: any) => String(i.id) === String(id));
  if (item) {
    try {
      await cloudUpsertQuiz({
        ...item,
        userId: auth.currentUser.uid,
        authorId: auth.currentUser.uid,
      });
    } catch {
      await queueQuizUpload(item);
    }
  }
}

export const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fallthrough */
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
};

/** Sanitize objects for cloud JSON (name kept for older imports) */
export const sanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeForFirestore(item));
  if (typeof obj === "object") {
    const proto = Object.getPrototypeOf(obj);
    if (proto === Object.prototype || proto === null) {
      const cleaned: any = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) cleaned[key] = sanitizeForFirestore(obj[key]);
      }
      return cleaned;
    }
  }
  return obj;
};

// ── Settings ──────────────────────────────────────────────
export const saveHandTrackingEnabled = async (enabled: boolean) => {
  localStorage.setItem(HAND_TRACKING_ENABLED_KEY, JSON.stringify(enabled));
  await cloudMergeProfile({ handTrackingEnabled: enabled });
};

export const getHandTrackingEnabled = (): boolean => {
  const raw = lsGet(HAND_TRACKING_ENABLED_KEY, "glassquiz_gesture_enabled");
  return raw ? JSON.parse(raw) : false;
};

export const saveNoseTrackingEnabled = async (enabled: boolean) => {
  localStorage.setItem(NOSE_TRACKING_ENABLED_KEY, JSON.stringify(enabled));
  await cloudMergeProfile({ noseTrackingEnabled: enabled });
};

export const getNoseTrackingEnabled = (): boolean => {
  const raw = lsGet(NOSE_TRACKING_ENABLED_KEY, "glassquiz_eye_tracking_enabled");
  return raw ? JSON.parse(raw) : false;
};

export const saveAdvancedHandsFree = async (enabled: boolean) => {
  localStorage.setItem(KEYS.advancedHandsFree, JSON.stringify(enabled));
  if (!enabled) {
    localStorage.setItem(HAND_TRACKING_ENABLED_KEY, "false");
    localStorage.setItem(NOSE_TRACKING_ENABLED_KEY, "false");
  }
};

export const getAdvancedHandsFree = (): boolean => {
  const raw = lsGet(KEYS.advancedHandsFree, "experimental_features_enabled");
  if (raw == null) return false;
  try {
    if (raw === "true" || raw === "1") return true;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
};

export const saveTheme = async (theme: "light" | "dark" | "glass") => {
  localStorage.setItem(THEME_KEY, theme);
  await cloudMergeProfile({ theme });
};

export const getTheme = (): string => lsGet(THEME_KEY, "glassquiz_theme") || "glass";

export const saveSRSEnabled = async (enabled: boolean) => {
  localStorage.setItem(SRS_ENABLED_KEY, String(enabled));
  await cloudMergeProfile({ srsEnabled: enabled });
};

export const getSRSEnabled = (): boolean => lsGet(SRS_ENABLED_KEY, "neuro_srs_enabled") !== "false";

export const saveEyeTrackingEnabled = saveNoseTrackingEnabled;
export const getEyeTrackingEnabled = getNoseTrackingEnabled;
export const saveGestureEnabled = saveHandTrackingEnabled;
export const getGestureEnabled = getHandTrackingEnabled;

// ── Graveyard ─────────────────────────────────────────────
export const addToGraveyard = async (question: Question) => {
  try {
    const raw = localStorage.getItem(GRAVEYARD_KEY);
    const graveyard = raw ? JSON.parse(raw) : [];
    if (graveyard.find((q: Question) => q.text === question.text)) return;
    graveyard.unshift({ ...question, id: generateId(), buriedAt: Date.now() });
    localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(graveyard));
  } catch (e) {
    console.error(e);
  }
};

export const getGraveyard = async (): Promise<any[]> => {
  try {
    const raw = lsGet(GRAVEYARD_KEY, "glassquiz_graveyard");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const removeFromGraveyard = async (text: string) => {
  const raw = localStorage.getItem(GRAVEYARD_KEY);
  if (!raw) return;
  const next = JSON.parse(raw).filter((q: any) => q.text !== text);
  localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(next));
};

export const clearGraveyard = async () => {
  localStorage.removeItem(GRAVEYARD_KEY);
};

export const syncAllFromCloud = async () => runFullSync();

// ── API keys (delegate providerService; dual-read legacy) ──
export const saveApiKey = async (provider: AiProvider, key: string) => {
  setProviderApiKey(provider, key);
  if (provider === "gemini") localStorage.setItem(KEYS.geminiLegacyAlias, key);
};

export const getApiKey = (provider: AiProvider = "gemini"): string | null => {
  return getProviderApiKey(provider);
};

export const syncApiKeyFromCloud = async () => {
  /* intentional: we do not sync raw LLM keys to cloud by default */
};

export const removeApiKey = async (provider: AiProvider) => {
  setProviderApiKey(provider, "");
};

export const saveStorageConfig = (provider: StorageProvider) => {
  localStorage.setItem(STORAGE_PREF_KEY, provider);
};

export const getStorageProvider = (): StorageProvider => {
  const v = lsGet(STORAGE_PREF_KEY, "glassquiz_storage_pref");
  return (v as StorageProvider) || "local";
};

// ── Library ───────────────────────────────────────────────
export const processAndSaveToLibrary = async (
  title: string,
  rawContent: string | File,
  type: "pdf" | "text" | "note" | "image" | "presentation"
) => {
  let processed = "";
  const anyKey =
    getProviderApiKey("gemini") ||
    getProviderApiKey("openrouter") ||
    getProviderApiKey("openai") ||
    getProviderApiKey("anthropic") ||
    getProviderApiKey("groq");
  if (anyKey) {
    try {
      if (typeof rawContent !== "string" || rawContent.length > 500) {
        processed = await summarizeMaterial(anyKey, rawContent);
      } else processed = rawContent;
    } catch {
      processed = typeof rawContent === "string" ? rawContent : "Could not process file.";
    }
  } else {
    processed = typeof rawContent === "string" ? rawContent : "Could not process file. Add an API key in Settings.";
  }
  const finalRaw = typeof rawContent === "string" ? rawContent : `[File: ${rawContent.name}]\n\n` + processed;
  await saveToLibrary(title, finalRaw, processed, type);
};

export const reprocessLibraryItem = async (item: LibraryItem): Promise<boolean> => {
  const key = getProviderApiKey("gemini") || getProviderApiKey("openrouter");
  if (!key) return false;
  try {
    const processed = await summarizeMaterial(key, item.content);
    await updateLibraryItem(item.id, { processedContent: processed });
    return true;
  } catch {
    return false;
  }
};

export const updateLibraryItem = async (id: string | number, updates: Partial<LibraryItem>) => {
  await update(LIBRARY_IDB_KEY, (val) => {
    const library = val || [];
    return library.map((item: LibraryItem) =>
      String(item.id) === String(id) ? { ...item, ...updates } : item
    );
  });
  // library cloud push via full sync
  if (auth.currentUser) runFullSync().catch(() => {});
};

export const saveToLibrary = async (
  title: string,
  content: string,
  processedContent: string,
  type: "pdf" | "text" | "note" | "image" | "presentation",
  tags: string[] = []
) => {
  const newItem: LibraryItem = {
    id: generateId(),
    title,
    content,
    processedContent,
    type,
    tags,
    created_at: new Date().toISOString(),
  };
  try {
    await update(LIBRARY_IDB_KEY, (val) => [newItem, ...(val || [])]);
    if (auth.currentUser) runFullSync().catch(() => {});
  } catch (err) {
    console.error(err);
    alert("Could not save material. Check browser storage.");
  }
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  let localItems: LibraryItem[] = [];
  try {
    localItems = (await get(LIBRARY_IDB_KEY)) || [];
  } catch {
    localItems = [];
  }
  if ((!localItems || localItems.length === 0) && auth.currentUser) {
    try {
      await runFullSync();
      localItems = (await get(LIBRARY_IDB_KEY)) || [];
    } catch {
      /* ignore */
    }
  }
  return (localItems || []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export const deleteLibraryItem = async (id: string | number) => {
  await update(LIBRARY_IDB_KEY, (val) =>
    (val || []).filter((item: LibraryItem) => String(item.id) !== String(id))
  );
  if (auth.currentUser) runFullSync().catch(() => {});
};

// ── Quizzes ───────────────────────────────────────────────
export const saveGeneratedQuiz = async (
  file: File | null,
  config: ModelConfig,
  questions: Question[]
) => {
  let fileName = "Untitled Quiz";
  if (file) fileName = file.name;
  else if (config.topic) fileName = config.topic.split("\n")[0].substring(0, 50);

  const topicSummary = questions.length > 0 ? questions[0].keyPoint || "General" : "General";
  const styleTags = Array.isArray(config.examStyle) ? config.examStyle : [config.examStyle];

  const newEntry: any = {
    id: generateId(),
    fileName,
    file_name: fileName,
    modelId: config.modelId,
    mode: config.mode,
    provider: config.provider,
    date: new Date().toISOString(),
    questionCount: questions.length,
    topicSummary,
    questions,
    lastScore: null,
    tags: [config.mode, ...styleTags],
    folder: config.folder,
    authorId: auth.currentUser?.uid || "local",
    title: fileName,
    isPublic: (config as any).visibility === "public" || false,
    visibility: (config as any).visibility || "private",
    accessCode: (config as any).accessCode || "",
    userId: auth.currentUser?.uid || "local",
    libraryContext: config.libraryContext || "",
    client_updated_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await update(HISTORY_IDB_KEY, (val) => [newEntry, ...(val || [])]);
    if (auth.currentUser) {
      try {
        newEntry.authorId = auth.currentUser.uid;
        newEntry.userId = auth.currentUser.uid;
        await cloudUpsertQuiz(newEntry);
      } catch {
        await queueQuizUpload(newEntry);
      }
    } else {
      await queueQuizUpload(newEntry);
    }
  } catch (err) {
    console.error("Save Error:", err);
  }
};

export const flushPendingUploads = async () => {
  if (!auth.currentUser) return;
  const pending = (await get(PENDING_UPLOADS_KEY)) || [];
  const remaining = [];
  for (const entry of pending) {
    try {
      await cloudUpsertQuiz({
        ...entry,
        authorId: auth.currentUser.uid,
        userId: auth.currentUser.uid,
        client_updated_at: new Date().toISOString(),
      });
    } catch {
      remaining.push(entry);
    }
  }
  await set(PENDING_UPLOADS_KEY, remaining);

  const pendingDel = (await get(PENDING_DELETIONS_KEY)) || [];
  const remainingDel = [];
  for (const id of pendingDel) {
    try {
      await cloudDeleteQuiz(String(id));
    } catch {
      remainingDel.push(id);
    }
  }
  await set(PENDING_DELETIONS_KEY, remainingDel);
};

export const getSavedQuizzes = async (): Promise<any[]> => {
  let localHistory: any[] = (await get(HISTORY_IDB_KEY)) || [];
  if ((!localHistory || localHistory.length === 0) && auth.currentUser) {
    try {
      await runFullSync();
      localHistory = (await get(HISTORY_IDB_KEY)) || [];
    } catch (e) {
      console.error(e);
    }
  }
  return localHistory || [];
};

export const subscribeToQuizzes = (callback: (quizzes: any[]) => void) => {
  if (!auth.currentUser) {
    get(HISTORY_IDB_KEY).then((h: any) => callback(h || []));
    return () => {};
  }
  let cancelled = false;
  const emit = async () => {
    const history = (await get(HISTORY_IDB_KEY)) || [];
    if (!cancelled) callback(history);
  };
  emit();
  runFullSync().then(emit).catch(() => {});
  const stop = startRealtimeSync(() => emit());
  return () => {
    cancelled = true;
    stop?.();
  };
};

export const deleteQuiz = async (id: number | string) => {
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).filter((item: any) => String(item.id) !== String(id))
  );
  if (auth.currentUser) {
    try {
      await cloudDeleteQuiz(String(id));
    } catch {
      await update(PENDING_DELETIONS_KEY, (val) => [...(val || []), String(id)]);
    }
  }
};

export const renameQuiz = async (id: number | string, newName: string) => {
  let updated: any = null;
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) => {
      if (String(item.id) !== String(id)) return item;
      updated = {
        ...item,
        fileName: newName,
        title: newName,
        file_name: newName,
        updatedAt: new Date().toISOString(),
        client_updated_at: new Date().toISOString(),
      };
      return updated;
    })
  );
  if (updated && auth.currentUser) await cloudUpsertQuiz(updated);
};

export const moveQuizToFolder = async (id: number | string, newFolder: string) => {
  let updated: any = null;
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) => {
      if (String(item.id) !== String(id)) return item;
      updated = { ...item, folder: newFolder, updatedAt: new Date().toISOString() };
      return updated;
    })
  );
  if (updated && auth.currentUser) await cloudUpsertQuiz(updated);
};

export const renameFolder = async (oldFolderName: string, newFolderName: string) => {
  const touched: any[] = [];
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) => {
      if ((item.folder || "").trim() !== oldFolderName.trim()) return item;
      const u = { ...item, folder: newFolderName, updatedAt: new Date().toISOString() };
      touched.push(u);
      return u;
    })
  );
  for (const u of touched) {
    if (auth.currentUser) await cloudUpsertQuiz(u);
  }
};

export const updateLocalQuizQuestions = async (id: number | string, newQuestions: Question[]) => {
  let updated: any = null;
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) => {
      if (String(item.id) !== String(id)) return item;
      updated = {
        ...item,
        questions: newQuestions,
        questionCount: newQuestions.length,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    })
  );
  if (updated && auth.currentUser) await cloudUpsertQuiz(updated);
};

export const uploadQuizToCloud = async (quiz: any) => {
  if (!auth.currentUser) throw new Error("Sign in to upload.");
  const patched = {
    ...quiz,
    authorId: auth.currentUser.uid,
    userId: auth.currentUser.uid,
    client_updated_at: new Date().toISOString(),
  };
  await cloudUpsertQuiz(patched);
  return patched;
};

export const downloadQuizFromCloud = async (quiz: any) => {
  await update(HISTORY_IDB_KEY, (val) => {
    const history = val || [];
    if (history.some((h: any) => String(h.id) === String(quiz.id))) return history;
    return [{ ...quiz, date: quiz.date || new Date().toISOString() }, ...history];
  });
  return quiz;
};

export const getCloudQuizzes = async (filter: "public" | "mine" = "public"): Promise<any[]> => {
  if (!auth.currentUser) return [];
  await runFullSync();
  const all = (await get(HISTORY_IDB_KEY)) || [];
  if (filter === "mine") {
    return all.filter(
      (q: any) => q.userId === auth.currentUser?.uid || q.authorId === auth.currentUser?.uid
    );
  }
  return all;
};

export const searchCloudQuiz = async (code: string) => {
  const all = (await get(HISTORY_IDB_KEY)) || [];
  const hit = all.find((q: any) => String(q.id) === String(code) || q.accessCode === code);
  if (!hit) throw new Error("Quiz not found");
  return hit;
};

export const createMultiplayerRoom = async () => {
  throw new Error("Multiplayer was removed from Noodl.");
};

export const joinMultiplayerRoom = async () => {
  throw new Error("Multiplayer was removed from Noodl.");
};

export const updateHistoryStats = async (id: number | string, score: number) => {
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) =>
      String(item.id) === String(id)
        ? { ...item, lastScore: score, lastPlayed: new Date().toISOString() }
        : item
    )
  );
  await pushQuizById(id);
};

export const saveQuizAiOverview = async (id: number | string, aiOverviewData: DeepInsightData) => {
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) =>
      String(item.id) === String(id) ? { ...item, aiOverviewData } : item
    )
  );
  await pushQuizById(id);
};

export const saveQuizVisualizations = async (
  id: number | string,
  visualizationsData: { blueprints: any[]; results: any[] }
) => {
  await update(HISTORY_IDB_KEY, (val) =>
    (val || []).map((item: any) =>
      String(item.id) === String(id) ? { ...item, visualizationsData } : item
    )
  );
  await pushQuizById(id);
};

export const getSharedQuiz = async (quizId: string) => searchCloudQuiz(quizId);

export const unifiedSync = async (): Promise<{ synced: boolean; errors: string[] }> => {
  const report = await runFullSync();
  return { synced: report.synced, errors: report.errors };
};

export { startRealtimeSync, stopRealtimeSync };

let _networkListenerRegistered = false;
export const registerNetworkSyncListener = () => {
  if (_networkListenerRegistered) return;
  _networkListenerRegistered = true;
  registerSyncNetwork();
};
