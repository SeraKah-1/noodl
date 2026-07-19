import React from 'react';
import { recoverFromChunkFailure } from '../services/buildCoherence';

/**
 * Thin safety net around React.lazy.
 * On hashed-chunk fetch failure, ask buildCoherence for a hard reload
 * (full module graph), instead of unregistering SW / blind session reloads.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName = 'chunk'
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d]+ failed|ChunkLoadError/i.test(
          message
        );

      if (isChunkError && typeof window !== 'undefined') {
        const reloading = await recoverFromChunkFailure(chunkName);
        if (reloading) {
          // Suspend until the navigation replaces this document.
          return new Promise(() => undefined) as Promise<{ default: T }>;
        }
      }
      throw error;
    }
  });
}
