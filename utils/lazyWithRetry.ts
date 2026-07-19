import React from 'react';

/**
 * Lazy-load a route chunk with one automatic full reload when the hashed
 * module is missing (typical after a deploy while an old tab / SW still
 * points at previous asset hashes).
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName = 'chunk'
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const storageKey = `noodl_chunk_reload_${chunkName}`;
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* private mode */
      }
      return mod;
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d]+ failed|ChunkLoadError/i.test(
          message
        );

      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(storageKey) === '1';
      } catch {
        /* ignore */
      }

      if (isChunkError && !alreadyReloaded && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(storageKey, '1');
        } catch {
          /* ignore */
        }
        // Drop stale service-worker caches before hard reload when possible.
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          const regs = await navigator.serviceWorker?.getRegistrations?.();
          if (regs) {
            await Promise.all(regs.map((r) => r.unregister()));
          }
        } catch {
          /* best-effort */
        }
        window.location.reload();
        // Suspend forever until the reload replaces this document.
        return new Promise(() => undefined) as Promise<{ default: T }>;
      }

      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      throw error;
    }
  });
}
