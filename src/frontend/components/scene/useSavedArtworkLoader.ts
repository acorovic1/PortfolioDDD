import { useEffect } from 'react';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import type { ModelJobs } from './useModelJobs';

type SavedArtworkLoaderOptions = {
  isLoaded: (id: string) => boolean;
  // Builds the artwork's 3D object and adds it to the carousel, unless
  // `signal` was aborted by the time the model arrived.
  load: (remote: RemoteArtwork, signal: AbortSignal) => Promise<void>;
  jobs: ModelJobs;
};

// Loads artworks the user saved previously (e.g. right after login) into the
// scene, in order. Ones still being processed server-side are loaded once
// processing finishes; ones that failed are reported to their owner.
export function useSavedArtworkLoader(
  remoteArtworks: RemoteArtwork[] | null,
  { isLoaded, load, jobs }: SavedArtworkLoaderOptions
) {
  useEffect(() => {
    if (!remoteArtworks || remoteArtworks.length === 0) return;

    const run = new AbortController();
    const { signal } = run;

    (async () => {
      const pending: RemoteArtwork[] = [];
      const failed: RemoteArtwork[] = [];

      for (const remote of remoteArtworks) {
        if (signal.aborted) return;
        if (isLoaded(remote.id)) continue;

        if (!remote.modelUrl) {
          (remote.processingStatus === 'processing' ? pending : failed).push(remote);
          continue;
        }

        try {
          await load(remote, signal);
        } catch (error) {
          console.error('Failed to load a saved artwork into the scene:', error);
        }
      }

      jobs.reportFailed(failed);

      for (const remote of pending) {
        if (signal.aborted) return;
        const processed = await jobs.waitUntilProcessed(remote, signal);
        if (!processed || signal.aborted) continue;
        try {
          await load(processed, signal);
        } catch (error) {
          console.error('Failed to load a processed artwork into the scene:', error);
        }
      }
    })();

    return () => run.abort();
    // Intentionally only depends on the list: this should run once as a
    // continuous sequence when it first arrives, not restart every time a
    // load changes the parent's artworks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteArtworks]);
}
