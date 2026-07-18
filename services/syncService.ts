/**
 * Cross-device sync (offline-first + Supabase) — FAST PATH
 *
 * Why old sync took 20+ minutes:
 * - Re-uploaded EVERY quiz (full questions + meta + sim HTML) every time
 * - No per-request / global timeout → one hung upsert freezes forever
 * - select('*') pull of mega JSON rows
 * - Realtime re-triggered full re-upload storms
 *
 * New rules:
 * 1. Local IDB always usable; sync is best-effort background
 * 2. Light index pull (id + timestamps) first
 * 3. Push only dirty rows, slim payload, max N per cycle
 * 4. Soft-timeout whole sync + each request
 * 5. Never ship visualization HTML / graph HTML in cloud meta
 * 6. Single-flight; progress listeners for UI
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

const PUSH_CONCURRENCY = 4;
/** Hard cap so one cycle never runs 20 minutes */
const SYNC_BUDGET_MS = 45_000;
const REQUEST_TIMEOUT_MS = 12_000;
/** Max heavy rows pushed per cycle — rest waits for next sync */
const MAX_QUIZ_PUSH = 12;
const MAX_LIBRARY_PUSH = 8;
const MAX_SRS_PUSH = 40;
/** Soft payload limit (chars of JSON) — strip more if over */
const MAX_PAYLOAD_CHARS = 350_000;
const MAX_LIBRARY_CONTENT = 80_000;

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

export type SyncProgress = {
  phase: string;
  detail?: string;
  pushed?: number;
  skipped?: number;
};

let _syncPromise: Promise<SyncReport> | null = null;
let _realtimeUnsub: (() => void) | null = null;
let _networkHooked = false;
const _progressListeners = new Set<(p: SyncProgress) => void>();

export function isSyncInProgress(): boolean {
  return _syncPromise != null;
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
    new Date(0).toISOString()
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Meta for cloud: drop megabyte blobs (sim HTML, graph HTML, huge context). */
function slimQuizMeta(q: any): Record<string, unknown> {
  if (!q || typeof q !== 'object') return {};
  const out: Record<string, unknown> = {};
  const keep = [
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
    'isPublic',
    'visibility',
    'accessCode',
    'date',
    'updatedAt',
    'client_updated_at',
    'authorId',
    'userId',
  ] as const;
  for (const k of keep) {
    if (q[k] !== undefined) out[k] = q[k];
  }
  // Keep AI overview (usually small JSON) — drop huge viz/graph HTML
  if (q.aiOverviewData) out.aiOverviewData = q.aiOverviewData;
  if (q.visualizationsData?.blueprints) {
    out.visualizationsData = {
      blueprints: q.visualizationsData.blueprints,
      // results html is multi-MB — keep only status stubs
      results: Array.isArray(q.visualizationsData.results)
        ? q.visualizationsData.results.map((r: any) => ({
            id: r.id,
            status: r.status,
            explanation: r.explanation,
            // htmlCode intentionally omitted from cloud
          }))
        : [],
    };
  }
  if (q.knowledgeGraphData?.data) {
    out.knowledgeGraphData = {
      data: q.knowledgeGraphData.data,
      generatedAt: q.knowledgeGraphData.generatedAt,
      // htmlCode rebuilt client-side
    };
  }
  // Cap libraryContext
  if (typeof q.libraryContext === 'string' && q.libraryContext.length) {
    out.libraryContext = q.libraryContext.slice(0, 20_000);
  }
  return out;
}

/** Cap questions array size for a single upsert */
function slimQuestions(questions: any[]): any[] {
  if (!Array.isArray(questions)) return [];
  // Hard limit: 200 questions max per cloud row
  return questions.slice(0, 200).map((q) => ({
    text: String(q.text || '').slice(0, 2000),
    options: Array.isArray(q.options)
      ? q.options.slice(0, 6).map((o: any) => String(o).slice(0, 500))
      : [],
    correctIndex: q.correctIndex ?? 0,
    explanation: String(q.explanation || '').slice(0, 1500),
    hint: String(q.hint || '').slice(0, 400),
    keyPoint: String(q.keyPoint || q.conceptName || '').slice(0, 120),
    conceptName: q.conceptName,
    conceptPriority: q.conceptPriority,
  }));
}

function buildQuizPayload(q: any, uid: string) {
  let questions = slimQuestions(q.questions || []);
  let meta = slimQuizMeta(q);
  let payload: any = {
    id: String(q.id),
    user_id: uid,
    title: q.title || q.fileName || q.file_name || 'Untitled',
    topic: q.topic || q.topicSummary || null,
    questions,
    meta,
    folder: q.folder || '',
    tags: Array.isArray(q.tags) ? q.tags : [],
    last_score: q.lastScore ?? q.last_score ?? null,
    visibility: q.visibility || (q.isPublic ? 'public' : 'private'),
    access_code: q.accessCode || q.access_code || '',
    client_updated_at: clientUpdated(q),
    deleted_at: q.deleted_at || null,
  };
  // If still huge, drop questions tails then meta AI
  let size = JSON.stringify(payload).length;
  if (size > MAX_PAYLOAD_CHARS) {
    questions = questions.slice(0, 80);
    payload.questions = questions;
    size = JSON.stringify(payload).length;
  }
  if (size > MAX_PAYLOAD_CHARS) {
    delete meta.aiOverviewData;
    delete meta.visualizationsData;
    delete meta.knowledgeGraphData;
    delete meta.libraryContext;
    payload.meta = meta;
  }
  return payload;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export async function registerDevice() {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  const id = getDeviceId();
  const label =
    typeof navigator !== 'undefined'
      ? `${navigator.platform || 'web'} · ${navigator.language}`
      : 'web';
  await withTimeout(
    supabase.from('devices').upsert({
      id,
      user_id: auth.currentUser.uid,
      label,
      platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : 'web',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'registerDevice'
  ).catch((e) => console.warn('[sync] device', e?.message || e));
}

type RemoteIndex = { id: string; client_updated_at: string; updated_at?: string };

async function pullQuizIndex(uid: string): Promise<RemoteIndex[]> {
  if (!supabase) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('quizzes')
      .select('id, client_updated_at, updated_at')
      .eq('user_id', uid)
      .is('deleted_at', null) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'pullQuizIndex'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: String(r.id),
    client_updated_at: r.client_updated_at || r.updated_at || '',
    updated_at: r.updated_at,
  }));
}

async function pullQuizRowsByIds(uid: string, ids: string[]): Promise<any[]> {
  if (!supabase || !ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const out: any[] = [];
  for (const chunk of chunks) {
    const { data, error } = await withTimeout(
      supabase
        .from('quizzes')
        .select('id, title, topic, questions, meta, folder, tags, last_score, visibility, access_code, client_updated_at, updated_at, created_at, user_id')
        .eq('user_id', uid)
        .in('id', chunk) as unknown as Promise<any>,
      REQUEST_TIMEOUT_MS,
      `pullQuizRows ${chunk.length}`
    );
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
      out.push({
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
      });
    }
  }
  return out;
}

function isLocalNewer(local: any, remoteTs: number): boolean {
  // +2s skew so same-second writes don't thrash
  return ts(clientUpdated(local)) > remoteTs + 2000;
}

async function pushQuizzes(
  local: any[],
  uid: string,
  remoteIndex: Map<string, number>,
  budgetEnd: number,
  force?: boolean
): Promise<{ pushed: number; skipped: number; remaining: number; errors: string[] }> {
  if (!supabase) return { pushed: 0, skipped: 0, remaining: 0, errors: [] };

  const dirty: any[] = [];
  let skipped = 0;
  for (const q of local) {
    if (q.deleted_at) {
      dirty.push(q);
      continue;
    }
    if (!force && remoteIndex.has(String(q.id))) {
      const rTs = remoteIndex.get(String(q.id)) || 0;
      if (!isLocalNewer(q, rTs)) {
        skipped++;
        continue;
      }
    }
    if (!force && !remoteIndex.has(String(q.id))) {
      // new local — dirty
      dirty.push(q);
      continue;
    }
    if (force || isLocalNewer(q, remoteIndex.get(String(q.id)) || 0)) dirty.push(q);
  }

  // Prefer smaller / newer first so cycle finishes with useful work
  dirty.sort((a, b) => {
    const sa = JSON.stringify(a.questions || []).length;
    const sb = JSON.stringify(b.questions || []).length;
    return sa - sb;
  });

  const batch = dirty.slice(0, MAX_QUIZ_PUSH);
  const remaining = Math.max(0, dirty.length - batch.length);
  const errors: string[] = [];
  let pushed = 0;

  emitProgress({
    phase: 'push-quizzes',
    detail: `${batch.length} of ${dirty.length} dirty (${skipped} up-to-date)`,
  });

  await mapPool(batch, PUSH_CONCURRENCY, async (q) => {
    if (Date.now() > budgetEnd) return;
    try {
      if (q.deleted_at) {
        await withTimeout(
          supabase!
            .from('quizzes')
            .update({ deleted_at: q.deleted_at, updated_at: new Date().toISOString() })
            .eq('id', String(q.id))
            .eq('user_id', uid) as unknown as Promise<any>,
          REQUEST_TIMEOUT_MS,
          `del quiz ${q.id}`
        );
        pushed++;
        return;
      }
      const payload = buildQuizPayload(q, uid);
      const { error } = await withTimeout(
        supabase!.from('quizzes').upsert(payload) as unknown as Promise<any>,
        REQUEST_TIMEOUT_MS,
        `upsert quiz ${q.id}`
      );
      if (error) throw new Error(error.message);
      pushed++;
      emitProgress({ phase: 'push-quizzes', detail: `pushed ${pushed}/${batch.length}`, pushed });
    } catch (e: any) {
      errors.push(`quiz ${q.id}: ${e?.message || e}`);
      console.warn('[sync] quiz push fail', q.id, e?.message || e);
    }
  });

  return { pushed, skipped, remaining, errors };
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
    if (ts(clientUpdated(l)) >= ts(clientUpdated(r))) {
      map.set(id, {
        ...r,
        ...l,
        // Prefer local heavy caches (not always on cloud)
        aiOverviewData: l.aiOverviewData || r.aiOverviewData,
        visualizationsData: l.visualizationsData || r.visualizationsData,
        knowledgeGraphData: l.knowledgeGraphData || r.knowledgeGraphData,
        libraryContext: l.libraryContext || r.libraryContext,
      });
    } else {
      map.set(id, {
        ...l,
        ...r,
        aiOverviewData: r.aiOverviewData || l.aiOverviewData,
        visualizationsData: l.visualizationsData || r.visualizationsData,
        knowledgeGraphData: l.knowledgeGraphData || r.knowledgeGraphData,
        libraryContext: l.libraryContext || r.libraryContext,
      });
    }
  }
  return Array.from(map.values());
}

async function pushLibrary(
  local: any[],
  uid: string,
  remoteById: Map<string, number>,
  budgetEnd: number,
  force?: boolean
): Promise<{ pushed: number; skipped: number; errors: string[] }> {
  if (!supabase) return { pushed: 0, skipped: 0, errors: [] };
  const dirty: any[] = [];
  let skipped = 0;
  for (const item of local) {
    if (!force && remoteById.has(String(item.id)) && !isLocalNewer(item, remoteById.get(String(item.id)) || 0)) {
      skipped++;
      continue;
    }
    dirty.push(item);
  }
  const batch = dirty.slice(0, MAX_LIBRARY_PUSH);
  const errors: string[] = [];
  let pushed = 0;

  await mapPool(batch, PUSH_CONCURRENCY, async (item) => {
    if (Date.now() > budgetEnd) return;
    try {
      const content = String(item.content || '').slice(0, MAX_LIBRARY_CONTENT);
      const processed = String(item.processedContent || item.processed_content || '').slice(
        0,
        MAX_LIBRARY_CONTENT
      );
      const payload = {
        id: String(item.id),
        user_id: uid,
        title: item.title || 'Untitled',
        content,
        processed_content: processed || null,
        type: item.type || 'text',
        tags: Array.isArray(item.tags) ? item.tags : [],
        client_updated_at: clientUpdated(item),
        deleted_at: item.deleted_at || null,
      };
      const { error } = await withTimeout(
        supabase!.from('library_items').upsert(payload) as unknown as Promise<any>,
        REQUEST_TIMEOUT_MS,
        `library ${item.id}`
      );
      if (error) throw new Error(error.message);
      pushed++;
    } catch (e: any) {
      errors.push(`library ${item.id}: ${e?.message || e}`);
    }
  });
  return { pushed, skipped, errors };
}

async function pullLibraryIndex(uid: string): Promise<RemoteIndex[]> {
  if (!supabase) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('library_items')
      .select('id, client_updated_at, updated_at')
      .eq('user_id', uid)
      .is('deleted_at', null) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'pullLibraryIndex'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: String(r.id),
    client_updated_at: r.client_updated_at || r.updated_at || '',
  }));
}

async function pullLibraryFull(uid: string, ids: string[]): Promise<any[]> {
  if (!supabase || !ids.length) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('library_items')
      .select('*')
      .eq('user_id', uid)
      .in('id', ids.slice(0, 30)) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'pullLibraryFull'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
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
  remoteById: Map<string, number>,
  budgetEnd: number
): Promise<{ pushed: number; skipped: number; errors: string[] }> {
  if (!supabase) return { pushed: 0, skipped: 0, errors: [] };
  const dirty: any[] = [];
  let skipped = 0;
  for (const item of local) {
    if (remoteById.has(String(item.id)) && !isLocalNewer(item, remoteById.get(String(item.id)) || 0)) {
      skipped++;
      continue;
    }
    dirty.push(item);
  }
  const batch = dirty.slice(0, MAX_SRS_PUSH);
  const errors: string[] = [];
  let pushed = 0;
  await mapPool(batch, PUSH_CONCURRENCY, async (item) => {
    if (Date.now() > budgetEnd) return;
    try {
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
      const { error } = await withTimeout(
        supabase!.from('srs_items').upsert(payload) as unknown as Promise<any>,
        REQUEST_TIMEOUT_MS,
        `srs ${item.id}`
      );
      if (error) throw new Error(error.message);
      pushed++;
    } catch (e: any) {
      errors.push(`srs ${item.id}: ${e?.message || e}`);
    }
  });
  return { pushed, skipped, errors };
}

async function pullSrsIndex(uid: string): Promise<RemoteIndex[]> {
  if (!supabase) return [];
  const { data, error } = await withTimeout(
    supabase
      .from('srs_items')
      .select('id, client_updated_at, updated_at')
      .eq('user_id', uid)
      .is('deleted_at', null) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'pullSrsIndex'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: String(r.id),
    client_updated_at: r.client_updated_at || r.updated_at || '',
  }));
}

async function pullSrsFull(uid: string, ids: string[]): Promise<any[]> {
  if (!supabase || !ids.length) return [];
  const { data, error } = await withTimeout(
    supabase.from('srs_items').select('*').eq('user_id', uid).in('id', ids.slice(0, 80)) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    'pullSrsFull'
  );
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
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

async function doFullSync(opts?: { force?: boolean }): Promise<SyncReport> {
  const t0 = Date.now();
  const budgetEnd = t0 + SYNC_BUDGET_MS;
  const report: SyncReport = {
    synced: false,
    pushed: 0,
    pulled: 0,
    skipped: 0,
    errors: [],
    at: new Date().toISOString(),
    remainingDirty: 0,
  };

  if (!cloudReady() || !supabase || !auth.currentUser) {
    report.errors.push('Not signed in or Supabase not configured');
    return report;
  }

  const uid = auth.currentUser.uid;
  const force = Boolean(opts?.force);

  try {
    emitProgress({ phase: 'start', detail: force ? 'force' : 'incremental' });
    registerDevice().catch(() => {});

    // Pending queue (capped)
    try {
      const pending = ((await get(PENDING_UPLOADS_KEY)) as any[]) || [];
      if (pending.length && Date.now() < budgetEnd) {
        const emptyIdx = new Map<string, number>();
        const r = await pushQuizzes(pending.slice(0, MAX_QUIZ_PUSH), uid, emptyIdx, budgetEnd, true);
        report.pushed += r.pushed;
        report.errors.push(...r.errors);
        if (r.pushed >= pending.length) await set(PENDING_UPLOADS_KEY, []);
        else await set(PENDING_UPLOADS_KEY, pending.slice(r.pushed));
      }
      const pendingDel = ((await get(PENDING_DELETIONS_KEY)) as string[]) || [];
      if (pendingDel.length && Date.now() < budgetEnd) {
        await mapPool(pendingDel.slice(0, 20), 4, async (id) => {
          try {
            await withTimeout(
              supabase!
                .from('quizzes')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', String(id))
                .eq('user_id', uid) as unknown as Promise<any>,
              REQUEST_TIMEOUT_MS,
              `pending del ${id}`
            );
          } catch (e: any) {
            report.errors.push(`del ${id}: ${e?.message || e}`);
          }
        });
        await set(PENDING_DELETIONS_KEY, pendingDel.slice(20));
      }
    } catch (e: any) {
      report.errors.push(`pending: ${e.message}`);
    }

    // ── QUIZZES: light index → push dirty slim → pull only missing/newer ──
    if (Date.now() < budgetEnd) {
      try {
        emitProgress({ phase: 'quiz-index' });
        const localQ = ((await get(HISTORY_IDB_KEY)) as any[]) || [];
        const index = await pullQuizIndex(uid);
        const remoteTs = new Map(index.map((r) => [r.id, ts(r.client_updated_at)]));

        const pushResult = await pushQuizzes(localQ, uid, remoteTs, budgetEnd, force);
        report.pushed += pushResult.pushed;
        report.skipped += pushResult.skipped;
        report.remainingDirty = (report.remainingDirty || 0) + pushResult.remaining;
        report.errors.push(...pushResult.errors);

        // Pull only: remote ids missing locally OR remote newer
        const localMap = new Map(localQ.map((q) => [String(q.id), q]));
        const needPull = index
          .filter((r) => {
            const l = localMap.get(r.id);
            if (!l) return true;
            return ts(r.client_updated_at) > ts(clientUpdated(l)) + 2000;
          })
          .map((r) => r.id)
          .slice(0, 25);

        emitProgress({ phase: 'quiz-pull', detail: `${needPull.length} rows` });
        const remoteFull = needPull.length
          ? await pullQuizRowsByIds(uid, needPull)
          : [];
        report.pulled += remoteFull.length;

        if (remoteFull.length || pushResult.pushed) {
          // Re-read local in case UI wrote during sync
          const localNow = ((await get(HISTORY_IDB_KEY)) as any[]) || localQ;
          const merged = mergeById(localNow, remoteFull).sort(
            (a, b) => ts(b.date || b.updatedAt) - ts(a.date || a.updatedAt)
          );
          await set(HISTORY_IDB_KEY, merged);
        }
      } catch (e: any) {
        report.errors.push(`quizzes: ${e.message}`);
      }
    }

    // ── LIBRARY ──
    if (Date.now() < budgetEnd) {
      try {
        emitProgress({ phase: 'library' });
        const localL = ((await get(LIBRARY_IDB_KEY)) as any[]) || [];
        const idx = await pullLibraryIndex(uid);
        const remoteTs = new Map(idx.map((r) => [r.id, ts(r.client_updated_at)]));
        const pushResult = await pushLibrary(localL, uid, remoteTs, budgetEnd, force);
        report.pushed += pushResult.pushed;
        report.skipped += pushResult.skipped;
        report.errors.push(...pushResult.errors);

        const localMap = new Map(localL.map((x) => [String(x.id), x]));
        const need = idx
          .filter((r) => {
            const l = localMap.get(r.id);
            return !l || ts(r.client_updated_at) > ts(clientUpdated(l)) + 2000;
          })
          .map((r) => r.id)
          .slice(0, 15);
        const remoteFull = await pullLibraryFull(uid, need);
        report.pulled += remoteFull.length;
        if (remoteFull.length || pushResult.pushed) {
          const localNow = ((await get(LIBRARY_IDB_KEY)) as any[]) || localL;
          await set(LIBRARY_IDB_KEY, mergeById(localNow, remoteFull));
        }
      } catch (e: any) {
        report.errors.push(`library: ${e.message}`);
      }
    }

    // ── SRS ──
    if (Date.now() < budgetEnd) {
      try {
        emitProgress({ phase: 'srs' });
        const localS = ((await get(SRS_IDB_KEY)) as any[]) || [];
        const idx = await pullSrsIndex(uid);
        const remoteTs = new Map(idx.map((r) => [r.id, ts(r.client_updated_at)]));
        const pushResult = await pushSrs(localS, uid, remoteTs, budgetEnd);
        report.pushed += pushResult.pushed;
        report.skipped += pushResult.skipped;
        report.errors.push(...pushResult.errors);

        const localMap = new Map(localS.map((x) => [String(x.id), x]));
        const need = idx
          .filter((r) => {
            const l = localMap.get(r.id);
            return !l || ts(r.client_updated_at) > ts(clientUpdated(l)) + 2000;
          })
          .map((r) => r.id)
          .slice(0, 60);
        const remoteFull = await pullSrsFull(uid, need);
        report.pulled += remoteFull.length;
        if (remoteFull.length || pushResult.pushed) {
          const localNow = ((await get(SRS_IDB_KEY)) as any[]) || localS;
          await set(SRS_IDB_KEY, mergeById(localNow, remoteFull));
        }
      } catch (e: any) {
        report.errors.push(`srs: ${e.message}`);
      }
    }

    // Profile heartbeat (optional, short timeout)
    if (Date.now() < budgetEnd) {
      try {
        await withTimeout(
          supabase.from('user_profiles').upsert({
            user_id: uid,
            last_device_id: getDeviceId(),
            last_seen_at: new Date().toISOString(),
            display_name: auth.currentUser.displayName,
            avatar_url: auth.currentUser.photoURL,
          }) as unknown as Promise<any>,
          5000,
          'profile'
        );
      } catch {
        /* non-critical */
      }
    }

    if (Date.now() >= budgetEnd) {
      report.timedOut = true;
      report.errors.push(`Sync budget ${SYNC_BUDGET_MS}ms reached (will continue next cycle)`);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      }
    } catch {
      /* ignore */
    }

    report.ms = Date.now() - t0;
    // "synced" means cycle finished without hard failure — partial is OK
    report.synced = !report.errors.some((e) => e.startsWith('Not signed'));
    emitProgress({
      phase: 'done',
      detail: `${report.ms}ms push=${report.pushed} skip=${report.skipped} pull=${report.pulled}`,
      pushed: report.pushed,
      skipped: report.skipped,
    });
    console.log(
      `[Noodl sync] ${report.ms}ms push=${report.pushed} skip=${report.skipped} pull=${report.pulled}` +
        (report.remainingDirty ? ` remainingDirty=${report.remainingDirty}` : '') +
        (report.timedOut ? ' BUDGET' : ''),
      report.errors.length ? report.errors.slice(0, 5) : 'ok'
    );

    // Schedule leftover dirty pushes soon (non-blocking)
    if ((report.remainingDirty || 0) > 0 && auth.currentUser) {
      setTimeout(() => runFullSyncBackground(), 3000);
    }

    return report;
  } catch (e: any) {
    report.errors.push(e?.message || String(e));
    report.ms = Date.now() - t0;
    emitProgress({ phase: 'error', detail: e?.message });
    return report;
  }
}

/**
 * Single-flight sync. Concurrent callers share the same promise.
 * Hard outer timeout so UI never waits > ~50s.
 */
export async function runFullSync(opts?: { force?: boolean }): Promise<SyncReport> {
  if (_syncPromise) {
    if (!opts?.force) return _syncPromise;
    await _syncPromise.catch(() => {});
  }

  const work = doFullSync(opts);
  _syncPromise = withTimeout(work, SYNC_BUDGET_MS + 8_000, 'runFullSync outer')
    .catch((e: any) => {
      console.warn('[Noodl sync] outer stop', e?.message || e);
      return {
        synced: false,
        pushed: 0,
        pulled: 0,
        skipped: 0,
        errors: [e?.message || 'Sync stopped'],
        at: new Date().toISOString(),
        ms: SYNC_BUDGET_MS,
        timedOut: true,
      } as SyncReport;
    })
    .finally(() => {
      _syncPromise = null;
    });

  return _syncPromise;
}

export function runFullSyncBackground(opts?: { force?: boolean }): void {
  runFullSync(opts).catch((e) => console.warn('[Noodl sync bg]', e));
}

export function startRealtimeSync(onChange?: () => void) {
  stopRealtimeSync();
  if (!cloudReady() || !supabase || !auth.currentUser) return () => {};

  const uid = auth.currentUser.uid;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    // Long debounce — avoid storm after our own pushes
    debounceTimer = setTimeout(() => {
      runFullSync()
        .then(() => onChange?.())
        .catch(() => onChange?.());
    }, 5000);
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.currentUser) {
      runFullSyncBackground();
    }
  });
}

/** Immediate single-quiz upsert (used by save) — slim + timeout */
export async function cloudUpsertQuizRow(quiz: any) {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  const payload = buildQuizPayload(
    { ...quiz, client_updated_at: clientUpdated(quiz) || new Date().toISOString() },
    auth.currentUser.uid
  );
  const { error } = await withTimeout(
    supabase.from('quizzes').upsert(payload) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    `cloudUpsert ${payload.id}`
  );
  if (error) throw new Error(error.message);
}

export async function cloudSoftDeleteQuiz(id: string) {
  if (!cloudReady() || !supabase || !auth.currentUser) return;
  await withTimeout(
    supabase
      .from('quizzes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(id))
      .eq('user_id', auth.currentUser.uid) as unknown as Promise<any>,
    REQUEST_TIMEOUT_MS,
    `softDelete ${id}`
  );
}
