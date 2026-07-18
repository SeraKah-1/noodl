/**
 * Cross-device sync engine (offline-first + Supabase).
 *
 * Strategy:
 * 1. IndexedDB is always writable (local source of truth while offline)
 * 2. On login / online → push local rows, pull remote, merge by client_updated_at (LWW)
 * 3. Soft-delete via deleted_at
 * 4. Realtime channels keep other devices fresh
 */
import { get, set, update } from 'idb-keyval';
import { auth, supabase, isSupabaseConfigured } from '../supabase';
// Shared IDB keys (keep in sync with storageService / srsService)
export const HISTORY_IDB_KEY = 'glassquiz_history_store';
export const PENDING_UPLOADS_KEY = 'glassquiz_pending_uploads';
export const PENDING_DELETIONS_KEY = 'glassquiz_pending_deletions';
const LIBRARY_IDB_KEY = 'glassquiz_library_store';
const SRS_IDB_KEY = 'noodl_srs_store';
const DEVICE_KEY = 'noodl_device_id';

export type SyncReport = {
  synced: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
  at: string;
};

let _syncing = false;
let _realtimeUnsub: (() => void) | null = null;
let _networkHooked = false;

function cloudReady() {
  return Boolean(isSupabaseConfigured && supabase && auth.currentUser);
}

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function ts(v: any): number {
  if (!v) return 0;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : 0;
}

function clientUpdated(row: any): string {
  return (
    row.client_updated_at ||
    row.updatedAt ||
    row.updated_at ||
    row.date ||
    row.created_at ||
    new Date().toISOString()
  );
}

/** Register / ping this browser as a device */
export async function registerDevice() {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  const id = getDeviceId();
  const label =
    typeof navigator !== 'undefined'
      ? `${navigator.platform || 'web'} · ${navigator.language}`
      : 'web';
  const { error } = await supabase.from('devices').upsert({
    id,
    user_id: auth.currentUser.uid,
    label,
    platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : 'web',
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('[sync] device', error.message);
}

async function pushQuizzes(local: any[], uid: string) {
  if (!supabase) return 0;
  let n = 0;
  for (const q of local) {
    if (q.deleted_at) {
      await supabase
        .from('quizzes')
        .update({ deleted_at: q.deleted_at, updated_at: new Date().toISOString() })
        .eq('id', String(q.id))
        .eq('user_id', uid);
      n++;
      continue;
    }
    const payload = {
      id: String(q.id),
      user_id: uid,
      title: q.title || q.fileName || q.file_name || 'Untitled',
      topic: q.topic || q.topicSummary || null,
      questions: q.questions || [],
      meta: q,
      folder: q.folder || '',
      tags: Array.isArray(q.tags) ? q.tags : [],
      last_score: q.lastScore ?? q.last_score ?? null,
      visibility: q.visibility || (q.isPublic ? 'public' : 'private'),
      access_code: q.accessCode || q.access_code || '',
      client_updated_at: clientUpdated(q),
      deleted_at: q.deleted_at || null,
    };
    const { error } = await supabase.from('quizzes').upsert(payload);
    if (error) throw new Error(`quiz ${q.id}: ${error.message}`);
    n++;
  }
  return n;
}

async function pullQuizzes(uid: string): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => {
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    return {
      ...meta,
      id: row.id,
      title: row.title,
      fileName: row.title || meta.fileName,
      file_name: row.title || meta.file_name,
      topic: row.topic,
      questions: row.questions || meta.questions || [],
      folder: row.folder || '',
      tags: row.tags || meta.tags || [],
      lastScore: row.last_score,
      visibility: row.visibility,
      accessCode: row.access_code,
      authorId: row.user_id,
      userId: row.user_id,
      date: row.created_at,
      updatedAt: row.client_updated_at || row.updated_at,
      client_updated_at: row.client_updated_at || row.updated_at,
    };
  });
}

function mergeById(local: any[], remote: any[], idKey = 'id'): any[] {
  const map = new Map<string, any>();
  for (const r of remote) map.set(String(r[idKey]), r);
  for (const l of local) {
    const id = String(l[idKey]);
    const r = map.get(id);
    if (!r) {
      map.set(id, l);
      continue;
    }
    if (ts(clientUpdated(l)) >= ts(clientUpdated(r))) map.set(id, { ...r, ...l });
    else map.set(id, { ...l, ...r });
  }
  return Array.from(map.values());
}

async function pushLibrary(local: any[], uid: string) {
  if (!supabase) return 0;
  let n = 0;
  for (const item of local) {
    const payload = {
      id: String(item.id),
      user_id: uid,
      title: item.title || 'Untitled',
      content: item.content || '',
      processed_content: item.processedContent || item.processed_content || null,
      type: item.type || 'text',
      tags: Array.isArray(item.tags) ? item.tags : [],
      client_updated_at: clientUpdated(item),
      deleted_at: item.deleted_at || null,
    };
    const { error } = await supabase.from('library_items').upsert(payload);
    if (error) throw new Error(`library ${item.id}: ${error.message}`);
    n++;
  }
  return n;
}

async function pullLibrary(uid: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('library_items')
    .select('*')
    .eq('user_id', uid)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    processedContent: row.processed_content,
    type: row.type,
    tags: row.tags || [],
    created_at: row.created_at,
    client_updated_at: row.client_updated_at || row.updated_at,
  }));
}

async function pushSrs(local: any[], uid: string) {
  if (!supabase) return 0;
  let n = 0;
  for (const item of local) {
    const payload = {
      id: String(item.id),
      user_id: uid,
      keycard_id: item.keycard_id || 'global',
      item_id: String(item.item_id),
      item_type: item.item_type || 'quiz_question',
      content: item.content,
      easiness: item.easiness ?? 2.5,
      interval: item.interval ?? 0,
      repetition: item.repetition ?? 0,
      next_review: item.next_review || new Date().toISOString(),
      client_updated_at: clientUpdated(item),
      deleted_at: item.deleted_at || null,
    };
    const { error } = await supabase.from('srs_items').upsert(payload);
    if (error) throw new Error(`srs ${item.id}: ${error.message}`);
    n++;
  }
  return n;
}

async function pullSrs(uid: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('srs_items')
    .select('*')
    .eq('user_id', uid)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    keycard_id: row.keycard_id,
    item_id: row.item_id,
    item_type: row.item_type,
    content: row.content,
    easiness: row.easiness,
    interval: row.interval,
    repetition: row.repetition,
    next_review: row.next_review,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client_updated_at: row.client_updated_at || row.updated_at,
  }));
}

async function touchSyncState(uid: string, phase: 'pull' | 'push') {
  if (!supabase) return;
  const device_id = getDeviceId();
  const patch: any = {
    user_id: uid,
    device_id,
    meta: { ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '' },
  };
  if (phase === 'pull') patch.last_pull_at = new Date().toISOString();
  if (phase === 'push') patch.last_push_at = new Date().toISOString();
  await supabase.from('sync_state').upsert(patch);
}

/**
 * Full bidirectional sync. Safe to call often (single-flight).
 */
export async function runFullSync(): Promise<SyncReport> {
  const report: SyncReport = {
    synced: false,
    pushed: 0,
    pulled: 0,
    errors: [],
    at: new Date().toISOString(),
  };

  if (!cloudReady() || !supabase || !auth.currentUser) {
    report.errors.push('Not signed in or Supabase not configured');
    return report;
  }
  if (_syncing) {
    report.errors.push('Sync already running');
    return report;
  }

  _syncing = true;
  const uid = auth.currentUser.uid;

  try {
    await registerDevice();

    // Pending queue from older storage paths
    try {
      const pending = ((await get(PENDING_UPLOADS_KEY)) as any[]) || [];
      if (pending.length) {
        report.pushed += await pushQuizzes(pending, uid);
        await set(PENDING_UPLOADS_KEY, []);
      }
      const pendingDel = ((await get(PENDING_DELETIONS_KEY)) as string[]) || [];
      for (const id of pendingDel) {
        await supabase
          .from('quizzes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', String(id))
          .eq('user_id', uid);
      }
      if (pendingDel.length) await set(PENDING_DELETIONS_KEY, []);
    } catch (e: any) {
      report.errors.push(`pending: ${e.message}`);
    }

    // Quizzes
    try {
      const localQ = ((await get(HISTORY_IDB_KEY)) as any[]) || [];
      report.pushed += await pushQuizzes(localQ, uid);
      await touchSyncState(uid, 'push');
      const remoteQ = await pullQuizzes(uid);
      const mergedQ = mergeById(localQ, remoteQ).sort(
        (a, b) => ts(b.date || b.updatedAt) - ts(a.date || a.updatedAt)
      );
      await set(HISTORY_IDB_KEY, mergedQ);
      report.pulled += remoteQ.length;
      await touchSyncState(uid, 'pull');
    } catch (e: any) {
      report.errors.push(`quizzes: ${e.message}`);
    }

    // Library
    try {
      const localL = ((await get(LIBRARY_IDB_KEY)) as any[]) || [];
      report.pushed += await pushLibrary(localL, uid);
      const remoteL = await pullLibrary(uid);
      await set(LIBRARY_IDB_KEY, mergeById(localL, remoteL));
      report.pulled += remoteL.length;
    } catch (e: any) {
      report.errors.push(`library: ${e.message}`);
    }

    // SRS
    try {
      const localS = ((await get(SRS_IDB_KEY)) as any[]) || [];
      report.pushed += await pushSrs(localS, uid);
      const remoteS = await pullSrs(uid);
      await set(SRS_IDB_KEY, mergeById(localS, remoteS));
      report.pulled += remoteS.length;
    } catch (e: any) {
      report.errors.push(`srs: ${e.message}`);
    }

    // Profile heartbeat
    try {
      await supabase.from('user_profiles').upsert({
        user_id: uid,
        last_device_id: getDeviceId(),
        last_seen_at: new Date().toISOString(),
        display_name: auth.currentUser.displayName,
        avatar_url: auth.currentUser.photoURL,
      });
    } catch (e: any) {
      report.errors.push(`profile: ${e.message}`);
    }

    report.synced = report.errors.length === 0;
    console.log('[Noodl sync]', report);
    return report;
  } finally {
    _syncing = false;
  }
}

/** Live updates from other devices (debounced — avoids sync storms) */
export function startRealtimeSync(onChange?: () => void) {
  stopRealtimeSync();
  if (!cloudReady() || !supabase || !auth.currentUser) return () => {};

  const uid = auth.currentUser.uid;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runFullSync().then(() => onChange?.());
    }, 900);
  };

  const channel = supabase
    .channel(`noodl-sync-${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quizzes', filter: `user_id=eq.${uid}` },
      schedule
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'srs_items', filter: `user_id=eq.${uid}` },
      schedule
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'library_items', filter: `user_id=eq.${uid}` },
      schedule
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[Noodl realtime] subscribed');
    });

  _realtimeUnsub = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
  return _realtimeUnsub;
}

export function stopRealtimeSync() {
  _realtimeUnsub?.();
  _realtimeUnsub = null;
}

export function registerNetworkSyncListener() {
  if (_networkHooked || typeof window === 'undefined') return;
  _networkHooked = true;
  window.addEventListener('online', () => {
    setTimeout(() => runFullSync(), 800);
  });
  // visibility resume (mobile tab switch)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.currentUser) {
      runFullSync();
    }
  });
}

/** Immediate upsert helpers used by storageService */
export async function cloudUpsertQuizRow(quiz: any) {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  await pushQuizzes(
    [{ ...quiz, client_updated_at: clientUpdated(quiz) || new Date().toISOString() }],
    auth.currentUser.uid
  );
}

export async function cloudSoftDeleteQuiz(id: string) {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  await supabase
    .from('quizzes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', String(id))
    .eq('user_id', auth.currentUser.uid);
}
