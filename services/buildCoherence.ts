/**
 * Release coherence (Option B)
 * ────────────────────────────
 * Vite content-hashes every lazy chunk. After a deploy, a long-lived tab can
 * still hold an old entry module that imports deleted hashes
 * (HistoryScreen-OLD.js → 404).
 *
 * This module forces a single hard navigation when the *live* deploy id
 * (version.json, always network) disagrees with the id baked into the
 * currently running JS bundle. That replaces the whole module graph at once
 * instead of retrying one dynamic import.
 */

declare const __NOODL_BUILD_ID__: string;

export type LiveVersion = {
  buildId: string;
  builtAt?: string;
};

const RELOAD_FOR_KEY = 'noodl_reloaded_for_build';
const SW_RELOAD_KEY = 'noodl_sw_controller_reload';

export function getEmbeddedBuildId(): string {
  try {
    if (typeof __NOODL_BUILD_ID__ === 'string' && __NOODL_BUILD_ID__) {
      return __NOODL_BUILD_ID__;
    }
  } catch {
    /* define missing in some test runners */
  }
  // Fallback: meta tag injected into index.html at build time
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="noodl-build-id"]');
    const content = meta?.getAttribute('content');
    if (content) return content;
  }
  return '';
}

/** Fetch deploy version without using any HTTP/SW cache. */
export async function fetchLiveVersion(timeoutMs = 4000): Promise<LiveVersion | null> {
  if (typeof fetch === 'undefined') return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl
    ? window.setTimeout(() => ctrl.abort(), timeoutMs)
    : 0;
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<LiveVersion>;
    if (!data?.buildId || typeof data.buildId !== 'string') return null;
    return { buildId: data.buildId, builtAt: data.builtAt };
  } catch {
    return null;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

function alreadyReloadedFor(buildId: string): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FOR_KEY) === buildId;
  } catch {
    return false;
  }
}

function markReloadedFor(buildId: string): void {
  try {
    sessionStorage.setItem(RELOAD_FOR_KEY, buildId);
  } catch {
    /* private mode */
  }
}

export function clearCoherenceReloadMarks(): void {
  try {
    sessionStorage.removeItem(RELOAD_FOR_KEY);
    sessionStorage.removeItem(SW_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Hard navigation so the browser discards the in-memory module graph and
 * loads index.html + entry JS for the live deploy as one unit.
 * Returns true if a reload was triggered (caller should stop booting).
 */
export function hardReloadForBuild(liveBuildId: string, reason: string): boolean {
  if (!liveBuildId) return false;
  if (alreadyReloadedFor(liveBuildId)) {
    console.warn(
      `[Noodl] version skew persists after reload (live=${liveBuildId}, reason=${reason}); not looping`
    );
    return false;
  }
  markReloadedFor(liveBuildId);
  console.info(`[Noodl] hard reload for build coherence: ${reason} → ${liveBuildId}`);
  const { pathname, search, hash } = window.location;
  // replace avoids stacking history entries on repeated deploys
  window.location.replace(`${pathname}${search}${hash}`);
  return true;
}

/**
 * Compare embedded bundle id vs live version.json.
 * If they differ, hard-reload once for the live id and return false.
 * Offline / fetch failure → allow boot (true) so local-first still works.
 */
export async function ensureBuildCoherence(): Promise<boolean> {
  const embedded = getEmbeddedBuildId();
  if (!embedded) return true;

  const live = await fetchLiveVersion();
  if (!live?.buildId) {
    // Offline or version endpoint missing — do not block the app.
    return true;
  }

  if (live.buildId === embedded) {
    clearCoherenceReloadMarks();
    return true;
  }

  const started = hardReloadForBuild(
    live.buildId,
    `embedded=${embedded} live=${live.buildId}`
  );
  return !started;
}

/**
 * After a chunk load failure: re-check live version and hard-reload if skewed.
 * Does not unregister service workers (that was patchwork).
 */
export async function recoverFromChunkFailure(chunkName: string): Promise<boolean> {
  const embedded = getEmbeddedBuildId();
  const live = await fetchLiveVersion();
  if (live?.buildId && embedded && live.buildId !== embedded) {
    return hardReloadForBuild(live.buildId, `chunk-fail:${chunkName}`);
  }
  // Same build id but chunk missing (rare partial deploy) — one hard reload.
  const fallbackId = live?.buildId || embedded || `chunk:${chunkName}`;
  return hardReloadForBuild(fallbackId, `chunk-fail-same-build:${chunkName}`);
}

/**
 * When a new service worker takes control of an already-controlled page,
 * force one hard reload so entry + lazy graph match the new precache shell.
 */
export function installServiceWorkerControllerReload(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      // First SW install / claim — page already loaded from network; no reload.
      hadController = true;
      return;
    }
    try {
      if (sessionStorage.getItem(SW_RELOAD_KEY) === '1') return;
      sessionStorage.setItem(SW_RELOAD_KEY, '1');
    } catch {
      /* ignore */
    }
    console.info('[Noodl] service worker controller changed → hard reload');
    window.location.reload();
  });
}
