/**
 * Cross-device sync engine (offline-first + Supabase).
 *
 * Design goals:
 * 1. IndexedDB always usable — sync never blocks generate / UI
 * 2. Incremental: only push rows newer than remote (majority already synced → fast)
 * 3. Parallel upserts (bounded concurrency) — not 1-by-1 serial
 * 4. Slim payloads: do not double-ship questions inside meta
 * 5. Single-flight: concurrent callers share one in-flight promise
 */
import { get, set } from 'idb-keyval';
import { auth, supabase, isSupabaseConfigured } from '../supabase';
import { KEYS } from './storageKeys';

export const HISTORY_IDB_KEY = KEYS.historyIdb;
export const PENDING_UPLOADS_KEY = KEYS.pendingUploads;
export const PENDING_DELETIONS_KEY = KEYS.pendingDeletions;
const LIBRARY_IDB_KEY = KEYS.libraryIdb;
const SRS_IDB_KEY = KEYS.srsIdb;
const DEVICE_KEY = 'noodl_device_id';
const LAST_SYNC_KEY = 'noodl_last_full_sync_at';

/** Parallel upserts per table (keeps connection pool healthy). */
const PUSH_CONCURRENCY = 6;

export type SyncReport = {
  synced: boolean;
  pushed: number;
  pulled: number;
  skipped: number;
  errors: string[];
  at: string;
  ms?: number;
};

let _syncPromise: Promise<SyncReport> | null = null;
let _realtimeUnsub: (() => void) | null = null;
let _networkHooked = false;

export function isSyncInProgress(): boolean {
  return _syncPromise != null;
}

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

/** Drop fields already stored in dedicated columns / huge regenerable blobs when possible. */
function slimQuizMeta(q: any): Record<string, unknown> {
  if (!q || typeof q !== 'object') return {};
  const {
    questions: _q,
    // keep AI caches for cross-device — but avoid nesting circular junk
    ...rest
  } = q;
  // Strip nested duplicate of questions if any path re-added them
  const out: Record<string, unknown> = { ...rest };
  delete out.questions;
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
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

/**
 * Push only dirty quizzes (local newer than remote, or missing on remote).
 * Parallel with concurrency limit.
 */
async function pushQuizzes(
  local: any[],
  uid: string,
  remoteById?: Map<string, any>
): Promise<{ pushed: number; skipped: number }> {
  if (!supabase) return { pushed: 0, skipped: 0 };

  const dirty: any[] = [];
  let skipped = 0;
  for (const q of local) {
    const id = String(q.id);
    if (q.deleted_at) {
      dirty.push(q);
      continue;
    }
    if (remoteById) {
      const r = remoteById.get(id);
      if (r && ts(clientUpdated(q)) <= ts(clientUpdated(r))) {
        skipped++;
        continue;
      }
    }
    dirty.push(q);
  }

  if (!dirty.length) return { pushed: 0, skipped };

  await mapPool(dirty, PUSH_CONCURRENCY, async (q) => {
    if (q.deleted_at) {
      const { error } = await supabase!
        .from('quizzes')
        .update({ deleted_at: q.deleted_at, updated_at: new Date().toISOString() })
        .eq('id', String(q.id))
        .eq('user_id', uid);
      if (error) throw new Error(`quiz ${q.id}: ${error.message}`);
      return;
    }
    const payload = {
      id: String(q.id),
      user_id: uid,
      title: q.title || q.fileName || q.file_name || 'Untitled',
      topic: q.topic || q.topicSummary || null,
      questions: q.questions || [],
      meta: slimQuizMeta(q),
      folder: q.folder || '',
      tags: Array.isArray(q.tags) ? q.tags : [],
      last_score: q.lastScore ?? q.last_score ?? null,
      visibility: q.visibility || (q.isPublic ? 'public' : 'private'),
      access_code: q.accessCode || q.access_code || '',
      client_updated_at: clientUpdated(q),
      deleted_at: q.deleted_at || null,
    };
    const { error } = await supabase!.from('quizzes').upsert(payload);
    if (error) throw new Error(`quiz ${q.id}: ${error.message}`);
  });

  return { pushed: dirty.length, skipped };
}

async function pullQuizzes(uid: string): Promise<any[]> {
  if (!supabase) return [];
  // Prefer lighter select when possible; full rows needed for offline restore
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
      date: row.created_at || meta.date,
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
    // LWW — keep richer local caches if timestamps tie prefer local
    if (ts(clientUpdated(l)) >= ts(clientUpdated(r))) {
      map.set(id, {
        ...r,
        ...l,
        // Prefer non-empty AI caches
        aiOverviewData: l.aiOverviewData || r.aiOverviewData,
        visualizationsData: l.visualizationsData || r.visualizationsData,
        knowledgeGraphData: l.knowledgeGraphData || r.knowledgeGraphData,
      });
    } else {
      map.set(id, {
        ...l,
        ...r,
        aiOverviewData: r.aiOverviewData || l.aiOverviewData,
        visualizationsData: r.visualizationsData || l.visualizationsData,
        knowledgeGraphData: r.knowledgeGraphData || l.knowledgeGraphData,
      });
    }
  }
  return Array.from(map.values());
}

async function pushLibrary(
  local: any[],
  uid: string,
  remoteById?: Map<string, any>
): Promise<{ pushed: number; skipped: number }> {
  if (!supabase) return { pushed: 0, skipped: 0 };
  const dirty: any[] = [];
  let skipped = 0;
  for (const item of local) {
    if (item.deleted_at) {
      dirty.push(item);
      continue;
    }
    if (remoteById) {
      const r = remoteById.get(String(item.id));
      if (r && ts(clientUpdated(item)) <= ts(clientUpdated(r))) {
        skipped++;
        continue;
      }
    }
    dirty.push(item);
  }
  if (!dirty.length) return { pushed: 0, skipped };

  await mapPool(dirty, PUSH_CONCURRENCY, async (item) => {
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
    const { error } = await supabase!.from('library_items').upsert(payload);
    if (error) throw new Error(`library ${item.id}: ${error.message}`);
  });
  return { pushed: dirty.length, skipped };
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

async function pushSrs(
  local: any[],
  uid: string,
  remoteById?: Map<string, any>
): Promise<{ pushed: number; skipped: number }> {
  if (!supabase) return { pushed: 0, skipped: 0 };
  const dirty: any[] = [];
  let skipped = 0;
  for (const item of local) {
    if (item.deleted_at) {
      dirty.push(item);
      continue;
    }
    if (remoteById) {
      const r = remoteById.get(String(item.id));
      if (r && ts(clientUpdated(item)) <= ts(clientUpdated(r))) {
        skipped++;
        continue;
      }
    }
    dirty.push(item);
  }
  if (!dirty.length) return { pushed: 0, skipped };

  await mapPool(dirty, PUSH_CONCURRENCY, async (item) => {
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
    const { error } = await supabase!.from('srs_items').upsert(payload);
    if (error) throw new Error(`srs ${item.id}: ${error.message}`);
  });
  return { pushed: dirty.length, skipped };
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
  // fire-and-forget-ish: don't fail whole sync if this table missing
  try {
    await supabase.from('sync_state').upsert(patch);
  } catch {
    /* ignore */
  }
}

async function doFullSync(_opts?: { force?: boolean }): Promise<SyncReport> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const report: SyncReport = {
    synced: false,
    pushed: 0,
    pulled: 0,
    skipped: 0,
    errors: [],
    at: new Date().toISOString(),
  };

  if (!cloudReady() || !supabase || !auth.currentUser) {
    report.errors.push('Not signed in or Supabase not configured');
    return report;
  }

  const uid = auth.currentUser.uid;
  const force = Boolean(_opts?.force);

  try {
    // Device registration shouldn't block critical path long — parallel with work later
    const deviceP = registerDevice().catch((e) =>
      report.errors.push(`device: ${e?.message || e}`)
    );

    // Pending queue from older storage paths
    try {
      const pending = ((await get(PENDING_UPLOADS_KEY)) as any[]) || [];
      if (pending.length) {
        const r = await pushQuizzes(pending, uid);
        report.pushed += r.pushed;
        await set(PENDING_UPLOADS_KEY, []);
      }
      const pendingDel = ((await get(PENDING_DELETIONS_KEY)) as string[]) || [];
      if (pendingDel.length) {
        await mapPool(pendingDel, PUSH_CONCURRENCY, async (id) => {
          await supabase!
            .from('quizzes')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', String(id))
            .eq('user_id', uid);
        });
        await set(PENDING_DELETIONS_KEY, []);
      }
    } catch (e: any) {
      report.errors.push(`pending: ${e.message}`);
    }

    // ── Quizzes: PULL first → push only dirty → merge to IDB ──
    // (Majority already on server → push skipped → fast)
    try {
      const localQ = ((await get(HISTORY_IDB_KEY)) as any[]) || [];
      const remoteQ = await pullQuizzes(uid);
      report.pulled += remoteQ.length;

      const remoteMap = new Map(remoteQ.map((r) => [String(r.id), r]));
      const pushResult = await pushQuizzes(
        localQ,
        uid,
        force ? undefined : remoteMap
      );
      report.pushed += pushResult.pushed;
      report.skipped += pushResult.skipped;

      const mergedQ = mergeById(localQ, remoteQ).sort(
        (a, b) => ts(b.date || b.updatedAt) - ts(a.date || a.updatedAt)
      );
      await set(HISTORY_IDB_KEY, mergedQ);
      await touchSyncState(uid, 'pull');
      if (pushResult.pushed) await touchSyncState(uid, 'push');
    } catch (e: any) {
      report.errors.push(`quizzes: ${e.message}`);
    }

    // ── Library ──
    try {
      const localL = ((await get(LIBRARY_IDB_KEY)) as any[]) || [];
      const remoteL = await pullLibrary(uid);
      report.pulled += remoteL.length;
      const remoteMap = new Map(remoteL.map((r) => [String(r.id), r]));
      const pushResult = await pushLibrary(localL, uid, force ? undefined : remoteMap);
      report.pushed += pushResult.pushed;
      report.skipped += pushResult.skipped;
      await set(LIBRARY_IDB_KEY, mergeById(localL, remoteL));
    } catch (e: any) {
      report.errors.push(`library: ${e.message}`);
    }

    // ── SRS ──
    try {
      const localS = ((await get(SRS_IDB_KEY)) as any[]) || [];
      const remoteS = await pullSrs(uid);
      report.pulled += remoteS.length;
      const remoteMap = new Map(remoteS.map((r) => [String(r.id), r]));
      const pushResult = await pushSrs(localS, uid, force ? undefined : remoteMap);
      report.pushed += pushResult.pushed;
      report.skipped += pushResult.skipped;
      await set(SRS_IDB_KEY, mergeById(localS, remoteS));
    } catch (e: any) {
      report.errors.push(`srs: ${e.message}`);
    }

    // Profile heartbeat (non-critical)
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

    await deviceP;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      }
    } catch {
      /* ignore */
    }

    report.synced = report.errors.length === 0;
    report.ms = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    );
    console.log(
      `[Noodl sync] ${report.ms}ms push=${report.pushed} skip=${report.skipped} pull=${report.pulled}`,
      report.errors.length ? report.errors : 'ok'
    );
    return report;
  } catch (e: any) {
    report.errors.push(e?.message || String(e));
    report.ms = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    );
    return report;
  }
}

/**
 * Full bidirectional sync. Safe to call often (single-flight).
 * Concurrent callers await the same promise — never stack full uploads.
 */
export async function runFullSync(opts?: { force?: boolean }): Promise<SyncReport> {
  if (_syncPromise) {
    // Share in-flight work; force waits then re-runs
    if (!opts?.force) return _syncPromise;
    await _syncPromise.catch(() => {});
  }
  _syncPromise = doFullSync(opts).finally(() => {
    _syncPromise = null;
  });
  return _syncPromise;
}

/** Background sync — never throws to caller, never blocks UI */
export function runFullSyncBackground(opts?: { force?: boolean }): void {
  runFullSync(opts).catch((e) => console.warn('[Noodl sync bg]', e));
}

/** Live updates from other devices (debounced — avoids sync storms) */
export function startRealtimeSync(onChange?: () => void) {
  stopRealtimeSync();
  if (!cloudReady() || !supabase || !auth.currentUser) return () => {};

  const uid = auth.currentUser.uid;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    // Longer debounce: own pushes used to re-trigger full re-upload storms
    debounceTimer = setTimeout(() => {
      runFullSync().then(() => onChange?.()).catch(() => onChange?.());
    }, 2500);
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
    setTimeout(() => runFullSyncBackground(), 800);
  });
  // visibility resume — background only, don't freeze UI
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.currentUser) {
      runFullSyncBackground();
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
