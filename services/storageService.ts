/**
 * ==========================================
 * STORAGE SERVICE (Facade)
 * ==========================================
 * Mengatur LocalStorage dan IndexedDB (untuk data besar).
 */

import { Question, ModelConfig, AiProvider, StorageProvider, CloudNote, LibraryItem, DeepInsightData } from "../types";
import { summarizeMaterial } from "./geminiService";
import { get, set, update } from 'idb-keyval'; // IndexedDB Wrapper
import { auth, supabase, isSupabaseConfigured } from "../supabase";
import {
  cloudUpsertQuizRow,
  cloudSoftDeleteQuiz,
  runFullSync,
  registerNetworkSyncListener as registerSyncNetwork,
  startRealtimeSync,
  stopRealtimeSync,
} from "./syncService";

/** Cloud helpers (Supabase). Fail soft — local IDB always remains source of truth. */
const cloudEnabled = () => Boolean(isSupabaseConfigured && supabase && auth.currentUser);

async function cloudUpsertQuiz(quiz: any) {
  try {
    await cloudUpsertQuizRow({
      ...quiz,
      client_updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("[cloud quiz upsert]", e?.message || e);
  }
}

async function cloudDeleteQuiz(id: string) {
  try {
    await cloudSoftDeleteQuiz(id);
  } catch (e: any) {
    console.warn("[cloud quiz delete]", e?.message || e);
  }
}

async function cloudMergeProfile(config: Record<string, unknown>) {
  if (!cloudEnabled() || !supabase || !auth.currentUser) return;
  const { error } = await supabase.from("user_profiles").upsert({
    user_id: auth.currentUser.uid,
    config,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("[cloud profile]", error.message);
}

// Legacy no-ops for removed Firestore paths
const handleFirestoreError = (_e?: unknown, ..._rest: any[]) => {};
enum OperationType { CREATE="create", UPDATE="update", DELETE="delete", LIST="list", GET="get", WRITE="write" }
const db = null as any;
const serverTimestamp = () => new Date().toISOString();
const Timestamp = { now: () => new Date(), fromDate: (d: Date) => d } as any;
const doc = (..._a: any[]) => ({}) as any;
const setDoc = async (..._a: any[]) => {};
const getDoc = async (..._a: any[]) => ({ exists: () => false, data: () => null });
const updateDoc = async (..._a: any[]) => {};
const collection = (..._a: any[]) => ({}) as any;
const getDocs = async (..._a: any[]) => ({ empty: true, docs: [], forEach: (_: any) => {} });
const query = (..._a: any[]) => ({}) as any;
const where = (..._a: any[]) => ({}) as any;
const deleteDoc = async (..._a: any[]) => {};
const onSnapshot = (..._a: any[]) => () => {};
const orderBy = (..._a: any[]) => ({}) as any;
const limit = (..._a: any[]) => ({}) as any;
const writeBatch = (..._a: any[]) => ({ set: () => {}, commit: async () => {}, update: () => {}, delete: () => {} });



// Helper for Unique IDs
export const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) {
            // Fallback if randomUUID fails (e.g. insecure context)
        }
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Helper to remove undefined fields from Firestore payloads
export const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirestore(item));
    }
    const isPlainObject = (val: any): boolean => {
        if (typeof val !== 'object' || val === null) return false;
        const proto = Object.getPrototypeOf(val);
        return proto === Object.prototype || proto === null;
    };
    if (isPlainObject(obj)) {
        const cleaned: any = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val !== undefined) {
                cleaned[key] = sanitizeForFirestore(val);
            }
        }
        return cleaned;
    }
    return obj;
};

const HISTORY_KEY = 'glassquiz_history'; // Legacy key for migration
export const HISTORY_IDB_KEY = 'glassquiz_history_store'; // Key for IndexedDB
export const PENDING_UPLOADS_KEY = 'glassquiz_pending_uploads';
export const PENDING_DELETIONS_KEY = 'glassquiz_pending_deletions';
const LIBRARY_IDB_KEY = 'glassquiz_library_store'; // Key for IndexedDB
const GRAVEYARD_KEY = 'glassquiz_graveyard'; 
const GEMINI_KEY_STORAGE = 'glassquiz_api_key';
const STORAGE_PREF_KEY = 'glassquiz_storage_pref';
const HAND_TRACKING_ENABLED_KEY = 'noodl_hand_tracking_enabled';
const NOSE_TRACKING_ENABLED_KEY = 'noodl_nose_tracking_enabled';

// --- SETTINGS (GESTURE, EYE TRACKING, THEME, SRS) ---
export const saveHandTrackingEnabled = async (enabled: boolean) => {
    localStorage.setItem(HAND_TRACKING_ENABLED_KEY, JSON.stringify(enabled));
    if (auth.currentUser) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, sanitizeForFirestore({ config: { handTrackingEnabled: enabled } }), { merge: true });
        } catch (e) { console.error("Cloud Sync failed:", e); }
    }
};

export const getHandTrackingEnabled = (): boolean => {
    const raw = localStorage.getItem(HAND_TRACKING_ENABLED_KEY);
    return raw ? JSON.parse(raw) : false; 
};

export const saveNoseTrackingEnabled = async (enabled: boolean) => {
    localStorage.setItem(NOSE_TRACKING_ENABLED_KEY, JSON.stringify(enabled));
    if (auth.currentUser) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, sanitizeForFirestore({ config: { noseTrackingEnabled: enabled } }), { merge: true });
        } catch (e) { console.error("Cloud Sync failed:", e); }
    }
};

export const getNoseTrackingEnabled = (): boolean => {
    const raw = localStorage.getItem(NOSE_TRACKING_ENABLED_KEY);
    return raw ? JSON.parse(raw) : false; 
};

const THEME_KEY = 'glassquiz_theme';
export const saveTheme = async (theme: 'light' | 'dark' | 'glass') => {
    localStorage.setItem(THEME_KEY, theme);
    if (auth.currentUser) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, sanitizeForFirestore({ config: { theme } }), { merge: true });
        } catch (e) { console.error("Cloud Sync failed:", e); }
    }
};

export const getTheme = (): string => {
    return localStorage.getItem(THEME_KEY) || 'glass';
};

const SRS_ENABLED_KEY = 'neuro_srs_enabled';
export const saveSRSEnabled = async (enabled: boolean) => {
    localStorage.setItem(SRS_ENABLED_KEY, String(enabled));
    if (auth.currentUser) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, sanitizeForFirestore({ config: { srsEnabled: enabled } }), { merge: true });
        } catch (e) { console.error("Cloud Sync failed:", e); }
    }
};

export const getSRSEnabled = (): boolean => {
    return localStorage.getItem(SRS_ENABLED_KEY) !== 'false';
};

// --- MISTAKE GRAVEYARD ---
export const addToGraveyard = async (question: Question) => {
  try {
    const raw = localStorage.getItem(GRAVEYARD_KEY);
    let graveyard = raw ? JSON.parse(raw) : [];
    const exists = graveyard.find((q: Question) => q.text === question.text);
    
    if (!exists) {
      const newItem = { ...question, id: generateId(), buriedAt: Date.now() };
      graveyard.unshift(newItem);
      localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(graveyard));

      // Cloud Sync
      if (auth.currentUser) {
          const itemRef = doc(db, "users", auth.currentUser.uid, "graveyard", newItem.id);
          await setDoc(itemRef, sanitizeForFirestore(newItem));
      }
    }
  } catch (e) { console.error("Gagal mengubur soal:", e); }
};

export const getGraveyard = async (): Promise<any[]> => {
  try {
    const raw = localStorage.getItem(GRAVEYARD_KEY);
    let localGraveyard = raw ? JSON.parse(raw) : [];

    // Cloud Sync
    if (auth.currentUser) {
        try {
            const graveyardRef = collection(db, "users", auth.currentUser.uid, "graveyard");
            const q = query(graveyardRef);
            const querySnapshot = await getDocs(q);
            const cloudGraveyard: any[] = [];
            querySnapshot.forEach((doc) => {
                cloudGraveyard.push({ ...doc.data(), id: doc.id });
            });

            if (cloudGraveyard.length > 0) {
                // Merge logic
                const merged = [...cloudGraveyard];
                localGraveyard.forEach((local: any) => {
                    if (!merged.find(m => m.text === local.text)) {
                        merged.push(local);
                    }
                });
                localGraveyard = merged;
                localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(localGraveyard));
            }
        } catch (e) { console.error("Cloud Graveyard Fetch failed", e); }
    }

    return localGraveyard;
  } catch (e) { return []; }
};

export const removeFromGraveyard = async (text: string) => {
  try {
    const raw = localStorage.getItem(GRAVEYARD_KEY);
    if (raw) {
      const graveyard = JSON.parse(raw);
      const itemToDelete = graveyard.find((q: any) => q.text === text);
      const newGraveyard = graveyard.filter((q: any) => q.text !== text);
      localStorage.setItem(GRAVEYARD_KEY, JSON.stringify(newGraveyard));

      // Cloud Sync
      if (auth.currentUser && itemToDelete?.id) {
          const itemRef = doc(db, "users", auth.currentUser.uid, "graveyard", itemToDelete.id);
          await deleteDoc(itemRef);
      }
    }
  } catch (e) { console.error("Gagal membangkitkan soal", e); }
};

export const clearGraveyard = async () => {
  try {
    localStorage.removeItem(GRAVEYARD_KEY);

    // Cloud Sync Deletion
    if (auth.currentUser) {
        const graveyardRef = collection(db, "users", auth.currentUser.uid, "graveyard");
        const querySnapshot = await getDocs(query(graveyardRef));
        const deletions = querySnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletions);
    }
  } catch (e) { 
      console.error("Gagal mengosongkan kuburan", e);
      throw e;
  }
};

// --- GLOBAL SYNC ---
export const syncAllFromCloud = async () => {
    if (!auth.currentUser) return;

    console.log("Starting full cloud synchronization...");
    
    // 1. Sync Config
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const config = userDoc.data().config;
            if (config) {
                if (config.geminiApiKey) localStorage.setItem(GEMINI_KEY_STORAGE, config.geminiApiKey);
                if (config.theme) localStorage.setItem(THEME_KEY, config.theme);
                if (config.srsEnabled !== undefined) localStorage.setItem(SRS_ENABLED_KEY, String(config.srsEnabled));
                if (config.handTrackingEnabled !== undefined) localStorage.setItem(HAND_TRACKING_ENABLED_KEY, JSON.stringify(config.handTrackingEnabled));
                if (config.noseTrackingEnabled !== undefined) localStorage.setItem(NOSE_TRACKING_ENABLED_KEY, JSON.stringify(config.noseTrackingEnabled));
                if (config.storageProvider) localStorage.setItem(STORAGE_PREF_KEY, config.storageProvider);
            }
        }
    } catch (e) { console.error("Config sync failed", e); }

    // 2. Sync Library
    await getLibraryItems();

    // 3. Sync Quizzes
    await getSavedQuizzes();

    // 4. Sync Graveyard
    await getGraveyard();

    console.log("Cloud synchronization complete.");
};

// --- API KEY MANAGEMENT ---
export const saveApiKey = async (provider: AiProvider, key: string) => {
  if (provider === 'gemini') {
    localStorage.setItem(GEMINI_KEY_STORAGE, key);
    
    // Cloud Sync
    if (auth.currentUser) {
        try {
            const userRef = doc(db, "users", auth.currentUser.uid);
            await setDoc(userRef, sanitizeForFirestore({
                config: { geminiApiKey: key }
            }), { merge: true });
        } catch (e) {
            console.error("Gagal sinkronisasi API Key ke cloud:", e);
        }
    }
  }
};

export const getApiKey = (provider: AiProvider = 'gemini'): string | null => {
  let storedKey = null;
  if (provider === 'gemini') storedKey = localStorage.getItem(GEMINI_KEY_STORAGE);

  if (storedKey) return storedKey;

  // Fallback to Environment Variables (.env)
  if (provider === 'gemini') {
      if (typeof process !== 'undefined' && process.env) {
          if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
          if (process.env.API_KEY) return process.env.API_KEY;
      }
      if (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
          return import.meta.env.VITE_GEMINI_API_KEY;
      }
  } 

  return null;
};

export const syncApiKeyFromCloud = async () => {
    if (!auth.currentUser) return;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const config = userDoc.data().config;
            if (config?.geminiApiKey) {
                localStorage.setItem(GEMINI_KEY_STORAGE, config.geminiApiKey);
                return config.geminiApiKey;
            }
        }
    } catch (e) {
        console.error("Gagal sinkronisasi API Key dari cloud:", e);
    }
    return null;
};

export const removeApiKey = async (provider: AiProvider) => {
  if (provider === 'gemini') {
     localStorage.removeItem(GEMINI_KEY_STORAGE);
     
     if (auth.currentUser) {
         try {
             const userRef = doc(db, "users", auth.currentUser.uid);
             await setDoc(userRef, sanitizeForFirestore({
                 config: { geminiApiKey: null }
             }), { merge: true });
         } catch (e) {
             console.error("Gagal menghapus API Key dari cloud:", e);
         }
     }
  }
};

// --- STORAGE CONFIGURATION ---
export const saveStorageConfig = (provider: StorageProvider) => {
  localStorage.setItem(STORAGE_PREF_KEY, provider);
};

export const getStorageProvider = (): StorageProvider => {
  return (localStorage.getItem(STORAGE_PREF_KEY) as StorageProvider) || 'local';
};

// --- LIBRARY MANAGEMENT (Smart Ingest Implementation) ---

export const processAndSaveToLibrary = async (title: string, rawContent: string | File, type: 'pdf' | 'text' | 'note' | 'image' | 'presentation') => {
    let processed = "";
    
    // Try to summarize using Gemini if Key is available
    const geminiKey = getApiKey('gemini');
    
    if (geminiKey) {
        try {
            // Only use heavy model if content justifies it (> 500 chars) or if it's a file
            if (typeof rawContent !== 'string' || rawContent.length > 500) {
                processed = await summarizeMaterial(geminiKey, rawContent);
            } else {
                processed = rawContent;
            }
        } catch (e) {
            console.warn("Auto-ingest failed, falling back to raw content", e);
            processed = typeof rawContent === 'string' ? rawContent : "Gagal memproses file.";
        }
    } else {
        processed = typeof rawContent === 'string' ? rawContent : "Gagal memproses file. API Key tidak ada."; // Fallback if no key
    }

    const finalRawContent = typeof rawContent === 'string' ? rawContent : `[File: ${rawContent.name}]\n\n` + processed;
    await saveToLibrary(title, finalRawContent, processed, type);
};

// Helper to re-process an existing item (e.g. triggered manually)
export const reprocessLibraryItem = async (item: LibraryItem): Promise<boolean> => {
    const geminiKey = getApiKey('gemini');
    if (!geminiKey) return false;

    try {
        const processed = await summarizeMaterial(geminiKey, item.content);
        await updateLibraryItem(item.id, { processedContent: processed });
        return true;
    } catch (e) {
        console.error("Reprocess failed", e);
        return false;
    }
};

export const updateLibraryItem = async (id: string | number, updates: Partial<LibraryItem>) => {
    // 1. Update Local (IndexedDB)
    try {
        await update(LIBRARY_IDB_KEY, (val) => {
            const library = val || [];
            return library.map((item: LibraryItem) => 
                String(item.id) === String(id) ? { ...item, ...updates } : item
            );
        });
    } catch(e) { console.error("IDB Update failed", e); }

    // 2. Update Cloud
    if (auth.currentUser) {
        try {
            const itemRef = doc(db, "users", auth.currentUser.uid, "library", String(id));
            await updateDoc(itemRef, sanitizeForFirestore(updates));
        } catch (e) {
            console.error("Cloud Library Update failed", e);
        }
    }
};

export const saveToLibrary = async (title: string, content: string, processedContent: string, type: 'pdf' | 'text' | 'note' | 'image' | 'presentation', tags: string[] = []) => {
  const newItem: LibraryItem = {
    id: generateId(),
    title,
    content, // Original Raw Text
    processedContent, // AI Summarized Text (Lightweight)
    type,
    tags,
    created_at: new Date().toISOString()
  };

  try {
    // 1. IndexedDB (Primary Local Storage)
    await update(LIBRARY_IDB_KEY, (val) => {
        const library = val || [];
        return [newItem, ...library];
    });

    // 2. Cloud Sync
    if (auth.currentUser) {
        const itemRef = doc(db, "users", auth.currentUser.uid, "library", String(newItem.id));
        await setDoc(itemRef, sanitizeForFirestore({
            ...newItem,
            userId: auth.currentUser.uid,
            created_at: serverTimestamp() // Use server timestamp for cloud
        }));
    }
  } catch (err) {
    console.error("Library Save Error:", err);
    alert("Gagal menyimpan materi. Cek memori browser.");
  }
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  let localItems: LibraryItem[] = [];

  // 1. Get Local (IndexedDB)
  try {
    localItems = (await get(LIBRARY_IDB_KEY)) || [];
  } catch (e) { 
      // Fallback for migration: try localstorage once
      const rawLib = localStorage.getItem('glassquiz_library');
      if (rawLib) {
          localItems = JSON.parse(rawLib);
          // Migrate to IDB
          await set(LIBRARY_IDB_KEY, localItems);
          localStorage.removeItem('glassquiz_library');
      }
  }

  // 2. Cloud Sync (Merge)
  if (auth.currentUser) {
      try {
          const libraryRef = collection(db, "users", auth.currentUser.uid, "library");
          const q = query(libraryRef);
          const querySnapshot = await getDocs(q);
          const cloudItems: LibraryItem[] = [];
          querySnapshot.forEach((doc) => {
              const data = doc.data();
              cloudItems.push({
                  ...data,
                  id: doc.id,
                  created_at: data.created_at instanceof Timestamp ? data.created_at.toDate().toISOString() : data.created_at
              } as LibraryItem);
          });

          // Merge logic: Cloud items take precedence or we just combine and deduplicate
          // For simplicity, let's update local with cloud data if local is empty or older
          if (cloudItems.length > 0) {
              // Deduplicate by ID
              const merged = [...cloudItems];
              localItems.forEach(local => {
                  if (!merged.find(m => String(m.id) === String(local.id))) {
                      merged.push(local);
                  }
              });
              localItems = merged;
              await set(LIBRARY_IDB_KEY, localItems);
          }
      } catch (e) {
          console.error("Cloud Library Fetch failed", e);
      }
  }

  return localItems.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
};

export const deleteLibraryItem = async (id: string | number) => {
  // 1. Delete from IDB
  await update(LIBRARY_IDB_KEY, (val) => {
      const library = val || [];
      return library.filter((item: LibraryItem) => String(item.id) !== String(id));
  });

  // 2. Delete from Cloud
  if (auth.currentUser) {
      try {
          const itemRef = doc(db, "users", auth.currentUser.uid, "library", String(id));
          await deleteDoc(itemRef);
      } catch (e) {
          console.error("Cloud Library Delete failed", e);
      }
  }
};

// --- WORKSPACE (QUIZ HISTORY) ---
export const saveGeneratedQuiz = async (file: File | null, config: ModelConfig, questions: Question[]) => {
  let fileName = "Untitled Quiz";
  if (file) fileName = file.name;
  else if (config.topic) fileName = config.topic.split('\n')[0].substring(0, 50); 
  
  const topicSummary = questions.length > 0 ? (questions[0].keyPoint || "General") : "General";

  // Handle tags for array or single examStyle
  const styleTags = Array.isArray(config.examStyle) ? config.examStyle : [config.examStyle];

  const newEntry = {
    id: generateId(), // Safer ID as string
    fileName: fileName,
    file_name: fileName, 
    modelId: config.modelId,
    mode: config.mode,
    provider: config.provider,
    date: new Date().toISOString(),
    questionCount: questions.length,
    topicSummary: topicSummary,
    questions: questions,
    lastScore: null,
    tags: [config.mode, ...styleTags],
    folder: config.folder,
    authorId: auth.currentUser?.uid || 'local',
    title: fileName,
    isPublic: (config as any).visibility === 'public' || false,
    visibility: (config as any).visibility || 'private',
    accessCode: (config as any).accessCode || '',
    userId: auth.currentUser?.uid || 'local',
    libraryContext: config.libraryContext || ''
  };

  try {
    // 1. Save to IndexedDB (Primary)
    await update(HISTORY_IDB_KEY, (val) => {
        const history = val || [];
        const updated = [newEntry, ...history];
        return updated; // Removed 50 item limit
    });

    // 2. Cloud Sync (Auto-upload if logged in or queue for later)
    if (auth.currentUser) {
        try {
            newEntry.authorId = auth.currentUser.uid;
            newEntry.userId = auth.currentUser.uid;
            newEntry.client_updated_at = new Date().toISOString();
            newEntry.updatedAt = newEntry.client_updated_at;
            await cloudUpsertQuiz(newEntry);
        } catch (cloudErr) {
            console.error("Cloud save failed, queueing for offline upload", cloudErr);
            await update(PENDING_UPLOADS_KEY, (val) => [...(val || []), newEntry]);
        }
    } else {
        // Guest: keep local only (queue if they sign in later)
        await update(PENDING_UPLOADS_KEY, (val) => [...(val || []), newEntry]);
    }
  } catch (err) {
    console.error("Save Error:", err);
  }
};

export const flushPendingUploads = async () => {
    if (!auth.currentUser) return;
    const pending = await get(PENDING_UPLOADS_KEY) || [];
    if (pending.length === 0) return;

    const remaining = [];
    for (const entry of pending) {
        try {
            const patchedEntry = {
                ...entry,
                authorId: auth.currentUser.uid,
                userId: auth.currentUser.uid,
                client_updated_at: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await cloudUpsertQuiz(patchedEntry);
            
            await update(HISTORY_IDB_KEY, (val) => {
                const history = val || [];
                return history.map((item: any) => 
                    String(item.id) === String(entry.id) ? { ...item, authorId: auth.currentUser!.uid, userId: auth.currentUser!.uid } : item
                );
            });
        } catch (err) {
            console.error("Flush failed for quiz", entry.id, err);
            remaining.push(entry);
        }
    }
    await set(PENDING_UPLOADS_KEY, remaining);
    
    const pendingDeletions = await get(PENDING_DELETIONS_KEY) || [];
    if (pendingDeletions.length > 0) {
        const remainingDel = [];
        for (const id of pendingDeletions) {
            try {
                const quizRef = doc(db, "quizzes", String(id));
                await deleteDoc(quizRef);
            } catch (err) {
                remainingDel.push(id);
            }
        }
        await set(PENDING_DELETIONS_KEY, remainingDel);
    }
};

export const getSavedQuizzes = async (): Promise<any[]> => {
  let localHistory: any[] = [];
  try {
    localHistory = await get(HISTORY_IDB_KEY);
    if (!localHistory) {
        // Migration from LocalStorage
        const rawHistory = localStorage.getItem(HISTORY_KEY);
        if (rawHistory) {
            localHistory = JSON.parse(rawHistory);
            await set(HISTORY_IDB_KEY, localHistory);
            localStorage.removeItem(HISTORY_KEY);
        } else {
            localHistory = [];
        }
    }
  } catch (e) { localHistory = []; }

  // Cloud fallback: if local is empty and user is logged in, seed from Firestore
  if ((!localHistory || localHistory.length === 0) && auth.currentUser) {
    try {
      const quizzesRef = collection(db, "quizzes");
      const q = query(quizzesRef, where("authorId", "==", auth.currentUser.uid), limit(50));
      const snap = await getDocs(q);
      if (!snap.empty) {
        localHistory = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            date: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.date || new Date().toISOString())
          };
        });
        await set(HISTORY_IDB_KEY, localHistory);
      }
    } catch (e) {
      console.error("Cloud fallback fetch failed", e);
    }
  }

  return localHistory;
};

export const subscribeToQuizzes = (callback: (quizzes: any[]) => void) => {
  if (!auth.currentUser) return () => {};

  const quizzesRef = collection(db, "quizzes");
  // Single query: authorId only. Eliminates the dual-listener race condition
  // that caused INTERNAL ASSERTION FAILED in Firestore's WatchChangeAggregator.
  // We always set authorId on save, so this covers all user-owned quizzes.
  const q = query(quizzesRef, where("authorId", "==", auth.currentUser.uid));

  const cloudQuizzesMap = new Map();

  const notify = async () => {
      const cloudQuizzes: any[] = [];
      cloudQuizzesMap.forEach((data, id) => {
          cloudQuizzes.push({
              ...data,
              id,
              date: data.created_at && data.created_at.toDate ? data.created_at.toDate().toISOString() : data.date,
              updatedAt: data.updatedAt && data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : (data.lastUpdated || data.date)
          });
      });

      // Merge with local to preserve un-synced edits
      let localHistory = await get(HISTORY_IDB_KEY) || [];
      const pendingUploads = await get(PENDING_UPLOADS_KEY) || [];
      const pendingSet = new Set(pendingUploads.map((p: any) => String(p.id)));
      
      const mergedMap = new Map();
      cloudQuizzes.forEach(q => mergedMap.set(String(q.id), q));
      localHistory.forEach((local: any) => {
          const id = String(local.id);
          const cloud = mergedMap.get(id);
          if (!cloud) {
              if (pendingSet.has(id)) {
                  mergedMap.set(id, local);
              }
          } else {
              const localTime = new Date(local.updatedAt || local.date || 0).getTime();
              const cloudTime = new Date(cloud.updatedAt || cloud.date || 0).getTime();
              if (localTime > cloudTime) {
                  mergedMap.set(id, local);
              }
          }
      });
      const finalHistory = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      await set(HISTORY_IDB_KEY, finalHistory);
      callback(finalHistory);
  };

  const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
          if (change.type === 'removed') cloudQuizzesMap.delete(change.doc.id);
          else cloudQuizzesMap.set(change.doc.id, change.doc.data());
      });
      notify();
  }, (error) => {
      // Graceful recovery instead of crash
      console.error('[subscribeToQuizzes] Firestore listener error:', error.message);
  });

  return () => {
      unsub();
  };
};

export const deleteQuiz = async (id: number | string) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.filter((item: any) => String(item.id) !== String(id));
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await deleteDoc(quizRef);
      } catch (e) {
          console.error("Cloud Quiz Delete failed, queueing for offline deletion", e);
          await update(PENDING_DELETIONS_KEY, (val) => [...(val || []), String(id)]);
      }
  }
};

export const renameQuiz = async (id: number | string, newName: string) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, fileName: newName, file_name: newName } : item
      );
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await updateDoc(quizRef, sanitizeForFirestore({ 
              fileName: newName, 
              file_name: newName,
              updatedAt: serverTimestamp()
          }));
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `quizzes/${id}`);
      }
  }
};

export const moveQuizToFolder = async (id: number | string, newFolder: string) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, folder: newFolder } : item
      );
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await updateDoc(quizRef, sanitizeForFirestore({ 
              folder: newFolder,
              updatedAt: serverTimestamp()
          }));
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `quizzes/${id}`);
      }
  }
};

export const renameFolder = async (oldFolderName: string, newFolderName: string) => {
    // 1. Local
    await update(HISTORY_IDB_KEY, (val) => {
        const history = val || [];
        return history.map((item: any) => {
            const currentFolder = (item.folder || 'Uncategorized').trim();
            if (currentFolder === oldFolderName) {
                return { ...item, folder: newFolderName };
            }
            return item;
        });
    });

    // 2. Cloud
    if (auth.currentUser) {
        try {
            const quizzesRef = collection(db, "quizzes");
            const q = query(quizzesRef, where("authorId", "==", auth.currentUser.uid));
            const snap = await getDocs(q);
            
            const batch = writeBatch(db);
            let count = 0;
            
            snap.docs.forEach(d => {
                const data = d.data();
                const currentFolder = (data.folder || 'Uncategorized').trim();
                if (currentFolder === oldFolderName) {
                    batch.update(d.ref, { 
                        folder: newFolderName,
                        updatedAt: serverTimestamp()
                    });
                    count++;
                }
            });
            
            if (count > 0) {
                await batch.commit();
            }
        } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `quizzes folder batch rename`);
        }
    }
};


export const updateLocalQuizQuestions = async (id: number | string, newQuestions: Question[]) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, questions: newQuestions, questionCount: newQuestions.length } : item
      );
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await updateDoc(quizRef, sanitizeForFirestore({ 
              questions: newQuestions, 
              questionCount: newQuestions.length,
              updatedAt: serverTimestamp()
          }));
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `quizzes/${id}`);
      }
  }
};

export const uploadQuizToCloud = async (quiz: any) => {
    if (!auth.currentUser) throw new Error("Silakan login terlebih dahulu.");

    const quizId = String(quiz.id);
    const quizRef = doc(db, "quizzes", quizId);
    
    // Clean up data to match firestore.rules isValidQuiz
    const uploadData: any = {
        id: quizId,
        authorId: auth.currentUser.uid,
        userId: auth.currentUser.uid,
        title: quiz.title || quiz.fileName || "Untitled Quiz",
        questions: quiz.questions || [],
        isPublic: quiz.isPublic !== undefined ? quiz.isPublic : false, 
        visibility: quiz.visibility || 'link', 
        updatedAt: serverTimestamp(),
        created_at: quiz.date ? Timestamp.fromDate(new Date(quiz.date)) : serverTimestamp()
    };

    // Optional fields
    if (quiz.description) uploadData.description = quiz.description;
    if (quiz.fileName) uploadData.fileName = quiz.fileName;
    if (quiz.file_name) uploadData.file_name = quiz.file_name;
    if (quiz.modelId) uploadData.modelId = quiz.modelId;
    if (quiz.mode) uploadData.mode = quiz.mode;
    if (quiz.provider) uploadData.provider = quiz.provider;
    if (quiz.date) uploadData.date = quiz.date;
    if (quiz.questionCount) uploadData.questionCount = quiz.questionCount;
    if (quiz.topicSummary) uploadData.topicSummary = quiz.topicSummary;
    if (quiz.lastScore !== undefined) uploadData.lastScore = quiz.lastScore;
    if (quiz.lastPlayed) uploadData.lastPlayed = quiz.lastPlayed;
    if (quiz.tags) uploadData.tags = quiz.tags;
    if (quiz.folder) uploadData.folder = quiz.folder;
    if (quiz.visualizationsData) uploadData.visualizationsData = quiz.visualizationsData;

    try {
        await setDoc(quizRef, sanitizeForFirestore(uploadData), { merge: true });
        return true;
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `quizzes/${quizId}`);
    }
};

export const downloadQuizFromCloud = async (quiz: any) => {
    try {
        // 1. Save to IndexedDB (Primary)
        await update(HISTORY_IDB_KEY, (val) => {
            const history = val || [];
            // Check if already exists
            if (history.find((h: any) => String(h.id) === String(quiz.id))) {
                return history;
            }
            const updated = [{ ...quiz, authorId: auth.currentUser?.uid || 'local', userId: auth.currentUser?.uid || 'local' }, ...history];
            return updated.slice(0, 50);
        });
        return true;
    } catch (err) {
        console.error("Download Error:", err);
        throw err;
    }
};

export const getCloudQuizzes = async (filter: 'public' | 'mine' = 'public'): Promise<any[]> => {
    try {
        const quizzesRef = collection(db, "quizzes");
        let q;
        if (filter === 'mine') {
            if (!auth.currentUser) return [];
            q = query(quizzesRef, where("authorId", "==", auth.currentUser.uid), limit(50));
        } else {
            q = query(quizzesRef, where("isPublic", "==", true), limit(50));
        }
        
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
                ...data,
                id: doc.id,
                isCloud: true,
                date: data.created_at instanceof Timestamp ? data.created_at.toDate().toISOString() : data.date
            };
        });
    } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "quizzes");
        return [];
    }
};

export const searchCloudQuiz = async (code: string) => {
    try {
        // Search by ID or accessCode
        const quizzesRef = collection(db, "quizzes");
        
        // Try searching by ID first
        const docRef = doc(db, "quizzes", code);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isPublic === true || (data.visibility === 'unlisted' && data.accessCode === code) || data.authorId === auth.currentUser?.uid) {
                return { ...data, id: docSnap.id };
            }
        }

        // Try searching by accessCode for unlisted
        const q = query(quizzesRef, where("accessCode", "==", code), where("visibility", "==", "unlisted"));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { ...doc.data(), id: doc.id };
        }

        // Try searching by public visibility if code matches title/topic (basic search)
        const qPublic = query(quizzesRef, where("isPublic", "==", true));
        const publicSnapshot = await getDocs(qPublic);
        const found = publicSnapshot.docs.find(d => {
            const data = d.data();
            return (data.title?.toLowerCase().includes(code.toLowerCase()) || 
                    data.fileName?.toLowerCase().includes(code.toLowerCase()) || 
                    d.id === code);
        });
        if (found) return { ...found.data(), id: found.id };

        throw new Error("Kuis tidak ditemukan atau akses ditolak.");
    } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "quizzes");
    }
};

export const createMultiplayerRoom = async (quiz: any, hostName: string) => {
    if (!auth.currentUser) throw new Error("Login required");
    
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const roomId = generateId();
    const roomRef = doc(db, "rooms", roomId);
    
    const roomData = {
        id: roomId,
        code: roomCode,
        hostId: auth.currentUser.uid,
        hostName: hostName,
        quizId: String(quiz.id),
        quizData: quiz.questions,
        status: 'waiting',
        currentQuestionIndex: 0,
        createdAt: serverTimestamp(),
        players: [
            { id: auth.currentUser.uid, name: hostName, isHost: true, joinedAt: Date.now() }
        ]
    };
    
    try {
        await setDoc(roomRef, sanitizeForFirestore(roomData));
        return { roomId, roomCode };
    } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `rooms/${roomId}`);
    }
};

export const joinMultiplayerRoom = async (roomCode: string, playerName: string) => {
    try {
        const roomsRef = collection(db, "rooms");
        const q = query(roomsRef, where("code", "==", roomCode.toUpperCase()), where("status", "==", "waiting"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) throw new Error("Ruangan tidak ditemukan atau sudah dimulai.");
        
        const roomDoc = querySnapshot.docs[0];
        const roomId = roomDoc.id;
        const roomData = roomDoc.data();
        
        const playerId = generateId();
        const newPlayer = { id: playerId, name: playerName, isHost: false, joinedAt: Date.now() };
        
        const updatedPlayers = [...(roomData.players || []), newPlayer];
        await updateDoc(doc(db, "rooms", roomId), sanitizeForFirestore({ players: updatedPlayers }));
        
        return { roomId, playerId, quizData: roomData.quizData };
    } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, "rooms");
    }
};

export const updateHistoryStats = async (id: number | string, score: number) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, lastScore: score, lastPlayed: new Date().toISOString() } : item
      );
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await updateDoc(quizRef, sanitizeForFirestore({ 
              lastScore: score, 
              lastPlayed: serverTimestamp(),
              updatedAt: serverTimestamp()
          }));
      } catch (e) {
          console.error("Cloud update failed, queueing for offline upload", e);
          const history = await get(HISTORY_IDB_KEY);
          const localItem = history?.find((i: any) => String(i.id) === String(id));
          if (localItem) {
             await update(PENDING_UPLOADS_KEY, (val) => {
                const pending = val || [];
                // Replace if already pending to avoid duplicates
                const filtered = pending.filter((p: any) => String(p.id) !== String(id));
                return [...filtered, localItem];
             });
          }
      }
  }
};

export const saveQuizAiOverview = async (id: number | string, aiOverviewData: DeepInsightData) => {
  // 1. Local
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, aiOverviewData } : item
      );
  });

  // 2. Cloud
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await updateDoc(quizRef, sanitizeForFirestore({ aiOverviewData, updatedAt: serverTimestamp() }));
      } catch (e) {
          console.error("Cloud update failed, queueing for offline upload", e);
          const history = await get(HISTORY_IDB_KEY);
          const localItem = history?.find((i: any) => String(i.id) === String(id));
          if (localItem) {
             await update(PENDING_UPLOADS_KEY, (val) => {
                const pending = val || [];
                const filtered = pending.filter((p: any) => String(p.id) !== String(id));
                return [...filtered, localItem];
             });
          }
      }
  }
};

export const saveQuizVisualizations = async (id: number | string, visualizationsData: { blueprints: any[], results: any[] }) => {
  // 1. Local (IndexedDB)
  await update(HISTORY_IDB_KEY, (val) => {
      const history = val || [];
      return history.map((item: any) => 
        String(item.id) === String(id) ? { ...item, visualizationsData } : item
      );
  });
  
  // 2. Cloud Sync (Save directly to Firestore quiz document!)
  if (auth.currentUser) {
      try {
          const quizRef = doc(db, "quizzes", String(id));
          await setDoc(quizRef, sanitizeForFirestore({
              visualizationsData,
              updatedAt: serverTimestamp()
          }), { merge: true });
      } catch (e) {
          console.error("Gagal sinkronisasi visualisasi ke cloud:", e);
          // Queue for offline upload by updating PENDING_UPLOADS with the latest quiz state
          const history = await get(HISTORY_IDB_KEY);
          const localItem = history?.find((i: any) => String(i.id) === String(id));
          if (localItem) {
             await update(PENDING_UPLOADS_KEY, (val) => {
                const pending = val || [];
                const filtered = pending.filter((p: any) => String(p.id) !== String(id));
                return [...filtered, localItem];
             });
          }
      }
  }
};

export const getSharedQuiz = async (quizId: string) => {
    try {
        const quizRef = doc(db, "quizzes", quizId);
        const docSnap = await getDoc(quizRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Allow if visibility is link or it's public (for legacy reasons)
            if (data.visibility === 'link' || data.isPublic) {
                return { ...data, id: docSnap.id };
            } else {
                throw new Error("Kuis ini bersifat private dan tidak dapat dibagikan.");
            }
        } else {
            throw new Error("Kuis tidak ditemukan.");
        }
    } catch (err) {
        handleFirestoreError(err, OperationType.GET, `quizzes/${quizId}`);
    }
};

// ============================================
// UNIFIED SYNC ENGINE (Offline-First)
// ============================================
// Single function to sync ALL entity types between IndexedDB and Firestore.
// Handles: pending uploads, pending deletions, bi-directional merge.
// Call this on app launch and when network status changes.

let _syncInProgress = false;
let _networkListenerRegistered = false;

export const unifiedSync = async (): Promise<{ synced: boolean; errors: string[] }> => {
    const report = await runFullSync();
    return { synced: report.synced, errors: report.errors };
};

export { startRealtimeSync, stopRealtimeSync };

// Register a network listener to auto-sync when coming back online
export const registerNetworkSyncListener = () => {
    if (_networkListenerRegistered) return;
    _networkListenerRegistered = true;
    registerSyncNetwork();
};



// Back-compat aliases
export const saveEyeTrackingEnabled = saveNoseTrackingEnabled;
export const getEyeTrackingEnabled = getNoseTrackingEnabled;
export const saveGestureEnabled = saveHandTrackingEnabled;
export const getGestureEnabled = getHandTrackingEnabled;
