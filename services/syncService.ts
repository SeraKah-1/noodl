/**
 * Noodl cloud sync — local-first, event-driven (NOT bulk full-mirror).
 *
 * Fundamental model (small student data finishes in seconds):
 * 1. IndexedDB is always the UI source of truth
 * 2. On real login (uid change): pull missing/newer rows once
 * 3. On local write: push THAT quiz only (outbox if offline)
 * 4. Realtime: pull the changed id only — never re-upload everything
 * 5. Manual "Sync now": drain outbox + pull deltas
 *
 * See Documents/grok/noodl/SYNC_FUNDAMENTAL_AUDIT.md
 */
import { get, set, update } from 'idb-keyval';
import { auth, supabase, isSupabaseConfigured } from '../supabase';
import { KEYS } from './storageKeys';

export const HISTORY_IDB_KEY = KEYS.historyIdb;
export const PENDING_UPLOADS_KEY = KEYS.pendingUploads;
export const PENDING_DELETIONS_KEY = KEYS.pendingDeletions;
const LIBRARY_IDB_KEY = KEYS.libraryIdb;
const SRS_IDB_KEY = KEYS.srsIdb;
const DEVICE_KEY = 'noodl_device_id';

const REQ_MS = 15_000;
const MANUAL_BUDGET_MS = 30_000;

export type SyncReport = {
  synced: boolean;
  pushed: number;
  pulled: number;
  skipped: number;
  errors: string[];
  at: string;
  ms?: number;
  timedOut?: boolean;
  remainingDirty?: number;
};

export type SyncProgress = { phase: string; detail?: string };

type QuizRow = any;

let _pullPromise: Promise<SyncReport> | null = null;
let _manualPromise: Promise<SyncReport> | null = null;
let _realtimeUnsub: (() => void) | null = null;
let _networkHooked = false;
let _loginPullDoneForUid: string | null = null;
const _historyListeners = new Set<(quizzes: any[]) => void>();
const _progressListeners = new Set<(p: SyncProgress) => void>();

export function isSyncInProgress(): boolean {
  return _pullPromise != null || _manualPromise != null;
}

export function onSyncProgress(fn: (p: SyncProgress) => void): () => void {
  _progressListeners.add(fn);
  return () => _progressListeners.delete(fn);
}

function emitProgress(p: SyncProgress) {
  _progressListeners.forEach((fn) => {
    try {
      fn(p);
    } catch {
      /* ignore */
    }
  });
}

function cloudReady(): boolean {
  return Boolean(isSupabaseConfigured && supabase && auth.currentUser?.uid);
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
    row?.client_updated_at ||
    row?.updatedAt ||
    row?.updated_at ||
    row?.date ||
    row?.created_at ||
    new Date(0).toISOString()
  );
}

/** Normalize any thenable (Supabase builder) + hard timeout. */
async function sb<T = any>(query: any, label: string, ms = REQ_MS): Promise<T> {
  const run = Promise.resolve(query) as Promise<T>;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function emitHistory() {
  const history = ((await get(HISTORY_IDB_KEY)) as any[]) || [];
  _historyListeners.forEach((cb) => {
    try {
      cb(history);
    } catch {
      /* ignore */
    }
  });
}

/** UI subscribes to local history only — does NOT start cloud sync. */
export function subscribeLocalHistory(callback: (quizzes: any[]) => void): () => void {
  _historyListeners.add(callback);
  get(HISTORY_IDB_KEY)
    .then((h: any) => callback(h || []))
    .catch(() => callback([]));
  return () => {
    _historyListeners.delete(callback);
  };
}

// ── payload: keep normal quiz size; drop only known multi-MB regenerable HTML ──

function buildQuizPayload(q: QuizRow, uid: string) {
  const meta: Record<string, unknown> = {};
  for (const k of [
    'fileName',
    'file_name',
    'title',
    'topicSummary',
    'mode',
    'provider',
    'modelId',
    'folder',
    'tags',
    'lastScore',
    'lastPlayed',
    'questionCount',
    'visibility',
    'accessCode',
    'date',
    'aiOverviewData',
  ]) {
    if (q[k] !== undefined) meta[k] = q[k];
  }
  // Graph structure OK; HTML rebuilt client-side
  if (q.knowledgeGraphData?.data) {
    meta.knowledgeGraphData = {
      data: q.knowledgeGraphData.data,
      generatedAt: q.knowledgeGraphData.generatedAt,
    };
  }
  // Viz blueprints only — HTML sims are regenerable and optional
  if (q.visualizationsData?.blueprints) {
    meta.visualizationsData = {
      blueprints: q.visualizationsData.blueprints,
      results: [],
    };
  }
  if (typeof q.libraryContext === 'string') {
    meta.libraryContext = q.libraryContext.slice(0, 50_000);
  }

  return {
    id: String(q.id),
    user_id: uid,
    title: q.title || q.fileName || q.file_name || 'Untitled',
    topic: q.topic || q.topicSummary || null,
    questions: Array.isArray(q.questions) ? q.questions : [],
    meta,
    folder: q.folder || '',
    tags: Array.isArray(q.tags) ? q.tags : [],
    last_score: q.lastScore ?? q.last_score ?? null,
    visibility: q.visibility || (q.isPublic ? 'public' : 'private'),
    access_code: q.accessCode || q.access_code || '',
    client_updated_at: clientUpdated(q),
    deleted_at: q.deleted_at || null,
  };
}

function mapQuizRow(row: any): QuizRow {
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
}

function mergeQuiz(local: QuizRow | undefined, remote: QuizRow): QuizRow {
  if (!local) return remote;
  if (ts(clientUpdated(local)) >= ts(clientUpdated(remote))) {
    return {
      ...remote,
      ...local,
      // Keep richer local caches
      aiOverviewData: local.aiOverviewData || remote.aiOverviewData,
      visualizationsData: local.visualizationsData || remote.visualizationsData,
      knowledgeGraphData: local.knowledgeGraphData || remote.knowledgeGraphData,
      libraryContext: local.libraryContext || remote.libraryContext,
      questions:
        local.questions?.length >= (remote.questions?.length || 0)
          ? local.questions
          : remote.questions,
    };
  }
  return {
    ...local,
    ...remote,
    visualizationsData: local.visualizationsData || remote.visualizationsData,
    knowledgeGraphData: local.knowledgeGraphData || remote.knowledgeGraphData,
    libraryContext: local.libraryContext || remote.libraryContext,
  };
}

// ── single-row push (primary write path) ──

export async function cloudUpsertQuizRow(quiz: QuizRow): Promise<void> {
  if (!cloudReady() || !supabase || !auth.currentUser) {
    await queueQuiz(quiz);
    return;
  }
  const uid = auth.currentUser.uid;
  const payload = buildQuizPayload(
    {
      ...quiz,
      client_updated_at: quiz.client_updated_at || new Date().toISOString(),
    },
    uid
  );
  try {
    const { error } = await sb(
      supabase.from('quizzes').upsert(payload),
      `upsert quiz ${payload.id}`
    );
    if (error) throw new Error(error.message);
    console.log(`[Noodl sync] pushed quiz ${payload.id}`);
  } catch (e: any) {
    console.warn('[Noodl sync] push failed → outbox', payload.id, e?.message || e);
    await queueQuiz(quiz);
    throw e;
  }
}

export async function cloudSoftDeleteQuiz(id: string): Promise<void> {
  if (!cloudReady() || !supabase || !auth.currentUser) {
    await update(PENDING_DELETIONS_KEY, (val) => [...new Set([...(val || []), String(id)])]);
    return;
  }
  const { error } = await sb(
    supabase
      .from('quizzes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(id))
      .eq('user_id', auth.currentUser.uid),
    `delete quiz ${id}`
  );
  if (error) throw new Error(error.message);
}

async function queueQuiz(quiz: QuizRow) {
  await update(PENDING_UPLOADS_KEY, (val) => {
    const pending = (val || []).filter((p: any) => String(p.id) !== String(quiz.id));
    return [...pending, quiz];
  });
}

// ── pull path ──

async function pullQuizIndex(uid: string): Promise<{ id: string; t: number }[]> {
  if (!supabase) return [];
  const { data, error } = await sb(
    supabase
      .from('quizzes')
      .select('id, client_updated_at, updated_at')
      .eq('user_id', uid)
      .is('deleted_at', null),
    'quiz index'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: String(r.id),
    t: ts(r.client_updated_at || r.updated_at),
  }));
}

async function pullQuizzesByIds(uid: string, ids: string[]): Promise<QuizRow[]> {
  if (!supabase || !ids.length) return [];
  const { data, error } = await sb(
    supabase
      .from('quizzes')
      .select(
        'id, title, topic, questions, meta, folder, tags, last_score, visibility, access_code, client_updated_at, updated_at, created_at, user_id'
      )
      .eq('user_id', uid)
      .in('id', ids),
    `quiz rows x${ids.length}`
  );
  if (error) throw new Error(error.message);
  return (data || []).map(mapQuizRow);
}

/** Pull remote quizzes that are missing or newer than local. */
export async function pullQuizDeltas(): Promise<SyncReport> {
  const report: SyncReport = {
    synced: false,
    pushed: 0,
    pulled: 0,
    skipped: 0,
    errors: [],
    at: new Date().toISOString(),
  };
  const t0 = Date.now();

  if (!cloudReady() || !supabase || !auth.currentUser) {
    report.errors.push('Not signed in');
    return report;
  }

  // Single-flight pull
  if (_pullPromise) return _pullPromise;

  _pullPromise = (async () => {
    try {
      emitProgress({ phase: 'pull', detail: 'index' });
      const uid = auth.currentUser!.uid;
      const local = ((await get(HISTORY_IDB_KEY)) as QuizRow[]) || [];
      const localMap = new Map(local.map((q) => [String(q.id), q]));

      const index = await pullQuizIndex(uid);
      const need = index
        .filter((r) => {
          const l = localMap.get(r.id);
          if (!l) return true;
          return r.t > ts(clientUpdated(l)) + 1500;
        })
        .map((r) => r.id);

      report.skipped = index.length - need.length;

      // Chunk pulls (avoid giant IN lists)
      const chunkSize = 30;
      const remoteRows: QuizRow[] = [];
      for (let i = 0; i < need.length; i += chunkSize) {
        emitProgress({ phase: 'pull', detail: `${Math.min(i + chunkSize, need.length)}/${need.length}` });
        const part = await pullQuizzesByIds(uid, need.slice(i, i + chunkSize));
        remoteRows.push(...part);
      }
      report.pulled = remoteRows.length;

      if (remoteRows.length) {
        const map = new Map(localMap);
        for (const r of remoteRows) {
          map.set(String(r.id), mergeQuiz(map.get(String(r.id)), r));
        }
        const merged = Array.from(map.values()).sort(
          (a, b) => ts(b.date || b.updatedAt) - ts(a.date || a.updatedAt)
        );
        await set(HISTORY_IDB_KEY, merged);
        await emitHistory();
      }

      report.synced = true;
      report.ms = Date.now() - t0;
      console.log(
        `[Noodl sync] pull ${report.ms}ms got=${report.pulled} unchanged=${report.skipped}`
      );
      emitProgress({ phase: 'pull-done', detail: `${report.ms}ms` });
      return report;
    } catch (e: any) {
      report.errors.push(e?.message || String(e));
      report.ms = Date.now() - t0;
      console.warn('[Noodl sync] pull failed', report.errors);
      return report;
    } finally {
      _pullPromise = null;
    }
  })();

  return _pullPromise;
}

/** Drain outbox: pending uploads + deletions only (not whole library). */
export async function drainOutbox(): Promise<{ pushed: number; errors: string[] }> {
  const errors: string[] = [];
  let pushed = 0;
  if (!cloudReady() || !supabase || !auth.currentUser) {
    return { pushed: 0, errors: ['Not signed in'] };
  }
  const uid = auth.currentUser.uid;

  const pending = ((await get(PENDING_UPLOADS_KEY)) as QuizRow[]) || [];
  const still: QuizRow[] = [];
  for (const q of pending) {
    try {
      const payload = buildQuizPayload(q, uid);
      const { error } = await sb(supabase.from('quizzes').upsert(payload), `outbox ${payload.id}`);
      if (error) throw new Error(error.message);
      pushed++;
    } catch (e: any) {
      errors.push(e?.message || String(e));
      still.push(q);
    }
  }
  await set(PENDING_UPLOADS_KEY, still);

  const dels = ((await get(PENDING_DELETIONS_KEY)) as string[]) || [];
  const stillDel: string[] = [];
  for (const id of dels) {
    try {
      await cloudSoftDeleteQuiz(id);
      pushed++;
    } catch (e: any) {
      errors.push(e?.message || String(e));
      stillDel.push(id);
    }
  }
  await set(PENDING_DELETIONS_KEY, stillDel);

  if (pushed) console.log(`[Noodl sync] outbox drained pushed=${pushed}`);
  return { pushed, errors };
}

/**
 * Login hook: pull once per uid. Idempotent.
 * Does NOT re-upload all local quizzes.
 */
export async function onSignedIn(): Promise<SyncReport> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return {
      synced: false,
      pushed: 0,
      pulled: 0,
      skipped: 0,
      errors: ['No user'],
      at: new Date().toISOString(),
    };
  }

  startRealtimeSync();

  if (_loginPullDoneForUid === uid && !_manualPromise) {
    // Already pulled this session — only drain outbox quietly
    const out = await drainOutbox().catch((e) => ({
      pushed: 0,
      errors: [e?.message || String(e)],
    }));
    return {
      synced: out.errors.length === 0,
      pushed: out.pushed,
      pulled: 0,
      skipped: 0,
      errors: out.errors,
      at: new Date().toISOString(),
      ms: 0,
    };
  }

  emitProgress({ phase: 'login-sync' });
  const outbox = await drainOutbox();
  const pull = await pullQuizDeltas();
  // Light library/SRS optional — don't block if tables missing
  await pullLibraryLight().catch((e) => console.warn('[sync] library', e));
  await pullSrsLight().catch((e) => console.warn('[sync] srs', e));

  _loginPullDoneForUid = uid;
  registerDevice().catch(() => {});

  return {
    synced: pull.synced,
    pushed: outbox.pushed,
    pulled: pull.pulled,
    skipped: pull.skipped,
    errors: [...outbox.errors, ...pull.errors],
    at: new Date().toISOString(),
    ms: pull.ms,
  };
}

export function onSignedOut() {
  _loginPullDoneForUid = null;
  stopRealtimeSync();
}

async function registerDevice() {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  await sb(
    supabase.from('devices').upsert({
      id: getDeviceId(),
      user_id: auth.currentUser.uid,
      label:
        typeof navigator !== 'undefined'
          ? `${navigator.platform || 'web'} · ${navigator.language}`
          : 'web',
      platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : 'web',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    'device',
    8000
  ).catch(() => {});
}

async function pullLibraryLight() {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const local = ((await get(LIBRARY_IDB_KEY)) as any[]) || [];
  const localIds = new Set(local.map((x) => String(x.id)));
  const { data, error } = await sb(
    supabase
      .from('library_items')
      .select('id, client_updated_at, updated_at')
      .eq('user_id', uid)
      .is('deleted_at', null),
    'library index',
    10000
  );
  if (error) throw new Error(error.message);
  const need = (data || [])
    .filter((r: any) => !localIds.has(String(r.id)))
    .map((r: any) => String(r.id))
    .slice(0, 20);
  if (!need.length) return;
  const full = await sb(
    supabase.from('library_items').select('*').eq('user_id', uid).in('id', need),
    'library rows',
    15000
  );
  if (full.error) throw new Error(full.error.message);
  const rows = (full.data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    processedContent: row.processed_content,
    type: row.type,
    tags: row.tags || [],
    created_at: row.created_at,
    client_updated_at: row.client_updated_at || row.updated_at,
  }));
  await set(LIBRARY_IDB_KEY, [...rows, ...local]);
}

async function pullSrsLight() {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const local = ((await get(SRS_IDB_KEY)) as any[]) || [];
  if (local.length > 0) return; // already have SRS locally — skip bulk
  const { data, error } = await sb(
    supabase.from('srs_items').select('*').eq('user_id', uid).is('deleted_at', null).limit(200),
    'srs pull',
    12000
  );
  if (error) throw new Error(error.message);
  if (data?.length) {
    await set(
      SRS_IDB_KEY,
      data.map((row: any) => ({
        id: row.id,
        keycard_id: row.keycard_id,
        item_id: row.item_id,
        item_type: row.item_type,
        content: row.content,
        easiness: row.easiness,
        interval: row.interval,
        repetition: row.repetition,
        next_review: row.next_review,
        client_updated_at: row.client_updated_at || row.updated_at,
      }))
    );
  }
}

/**
 * Manual "Sync now" / legacy runFullSync API.
 * = drain outbox + pull deltas. Never re-uploads entire history.
 */
export async function runFullSync(_opts?: { force?: boolean }): Promise<SyncReport> {
  if (_manualPromise) return _manualPromise;

  const t0 = Date.now();
  _manualPromise = (async () => {
    const report: SyncReport = {
      synced: false,
      pushed: 0,
      pulled: 0,
      skipped: 0,
      errors: [],
      at: new Date().toISOString(),
    };
    try {
      if (!cloudReady()) {
        report.errors.push('Not signed in or Supabase not configured');
        return report;
      }
      emitProgress({ phase: 'manual', detail: 'outbox' });
      const budget = t0 + MANUAL_BUDGET_MS;

      const outbox = await drainOutbox();
      report.pushed = outbox.pushed;
      report.errors.push(...outbox.errors);

      if (Date.now() < budget) {
        emitProgress({ phase: 'manual', detail: 'pull' });
        const pull = await pullQuizDeltas();
        report.pulled = pull.pulled;
        report.skipped = pull.skipped;
        report.errors.push(...pull.errors);
      }

      // Optional: push local quizzes that were never on server (missing from index)
      if (Date.now() < budget && _opts?.force) {
        await pushMissingLocalOnly(report, budget);
      } else if (Date.now() < budget) {
        await pushMissingLocalOnly(report, budget);
      }

      report.synced = report.errors.length === 0;
      report.ms = Date.now() - t0;
      report.timedOut = Date.now() >= budget;
      emitProgress({ phase: 'done', detail: `${report.ms}ms` });
      console.log(
        `[Noodl sync] manual ${report.ms}ms push=${report.pushed} pull=${report.pulled} skip=${report.skipped}`,
        report.errors.length ? report.errors.slice(0, 3) : 'ok'
      );
      return report;
    } catch (e: any) {
      report.errors.push(e?.message || String(e));
      report.ms = Date.now() - t0;
      return report;
    } finally {
      _manualPromise = null;
    }
  })();

  return _manualPromise;
}

/** Push local quizzes whose ids are absent on server (true first-time upload). */
async function pushMissingLocalOnly(report: SyncReport, budget: number) {
  if (!supabase || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const local = ((await get(HISTORY_IDB_KEY)) as QuizRow[]) || [];
  if (!local.length) return;
  const index = await pullQuizIndex(uid);
  const remoteIds = new Set(index.map((r) => r.id));
  const missing = local.filter((q) => !remoteIds.has(String(q.id)) && !q.deleted_at);
  report.skipped += local.length - missing.length;

  for (const q of missing) {
    if (Date.now() > budget) {
      report.remainingDirty = (report.remainingDirty || 0) + 1;
      continue;
    }
    try {
      await cloudUpsertQuizRow(q);
      report.pushed++;
    } catch (e: any) {
      report.errors.push(`push ${q.id}: ${e?.message || e}`);
    }
  }
}

export function runFullSyncBackground(opts?: { force?: boolean }): void {
  runFullSync(opts).catch((e) => console.warn('[Noodl sync bg]', e));
}

// ── realtime: single channel, pull one id ──

export function startRealtimeSync(onChange?: () => void) {
  if (!cloudReady() || !supabase || !auth.currentUser) return () => {};
  // Already subscribed
  if (_realtimeUnsub) {
    return _realtimeUnsub;
  }

  const uid = auth.currentUser.uid;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const pendingIds = new Set<string>();

  const flush = () => {
    const ids = Array.from(pendingIds);
    pendingIds.clear();
    if (!ids.length) {
      onChange?.();
      return;
    }
    pullQuizzesByIds(uid, ids)
      .then(async (rows) => {
        if (!rows.length) return;
        const local = ((await get(HISTORY_IDB_KEY)) as QuizRow[]) || [];
        const map = new Map(local.map((q) => [String(q.id), q]));
        for (const r of rows) map.set(String(r.id), mergeQuiz(map.get(String(r.id)), r));
        await set(
          HISTORY_IDB_KEY,
          Array.from(map.values()).sort(
            (a, b) => ts(b.date || b.updatedAt) - ts(a.date || a.updatedAt)
          )
        );
        await emitHistory();
        onChange?.();
        console.log(`[Noodl sync] realtime merged ${rows.length} quiz(es)`);
      })
      .catch((e) => console.warn('[Noodl sync] realtime pull', e));
  };

  const channel = supabase
    .channel(`noodl-quiz-${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quizzes', filter: `user_id=eq.${uid}` },
      (payload: any) => {
        const id = payload.new?.id || payload.old?.id;
        if (id) pendingIds.add(String(id));
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(flush, 800);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[Noodl realtime] quizzes subscribed');
    });

  _realtimeUnsub = () => {
    if (debounce) clearTimeout(debounce);
    supabase.removeChannel(channel);
    _realtimeUnsub = null;
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
    setTimeout(() => {
      drainOutbox().catch(() => {});
      pullQuizDeltas().catch(() => {});
    }, 500);
  });
}
