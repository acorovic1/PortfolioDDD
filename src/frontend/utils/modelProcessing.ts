import { API_BASE_URL } from '@/frontend/config/api';
import type { RemoteArtwork } from '@/types/PortfolioPiece';

// Quick first checks (small models finish in a second or two), then backing
// off for long conversions (e.g. Blender) to keep request volume low.
const POLL_INITIAL_MS = 1000;
const POLL_MAX_MS = 5000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

// Polls an artwork's processing status until the server has finished
// converting its latest upload. Resolves with the final artwork record
// (processingStatus 'ready' or 'failed'); rejects on network errors, a
// timeout, or when `signal` is aborted.
export async function waitForModelProcessing(
  artworkId: string,
  token: string,
  signal?: AbortSignal
): Promise<RemoteArtwork> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INITIAL_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const res = await fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) throw new Error(`Status check failed (${res.status})`);

    const artwork = await res.json() as RemoteArtwork;
    if (artwork.processingStatus !== 'processing') return artwork;

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, interval);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    interval = Math.min(interval * 1.5, POLL_MAX_MS);
  }

  throw new Error('Model processing is taking too long - check back later');
}
