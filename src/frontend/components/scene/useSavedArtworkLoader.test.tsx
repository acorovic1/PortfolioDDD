import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSavedArtworkLoader } from './useSavedArtworkLoader';
import type { ModelJobs } from './useModelJobs';
import type { RemoteArtwork } from '@/types/PortfolioPiece';

const artwork = (id: string, fields: Partial<RemoteArtwork> = {}) =>
  ({ id, title: id, modelUrl: `/uploads/${id}.glb`, processingStatus: 'ready', ...fields }) as RemoteArtwork;

function fakeJobs(overrides: Partial<ModelJobs> = {}) {
  return {
    reportFailed: vi.fn(),
    waitUntilProcessed: vi.fn(async (remote: RemoteArtwork) => ({ ...remote, modelUrl: '/uploads/done.glb' })),
    ...overrides,
  } as unknown as ModelJobs;
}

describe('useSavedArtworkLoader', () => {
  it('loads ready artworks in order, skipping ones already in the scene', async () => {
    const load = vi.fn<(remote: RemoteArtwork, signal: AbortSignal) => Promise<void>>(async () => {});
    const jobs = fakeJobs();
    const list = [artwork('a'), artwork('b'), artwork('c')];

    renderHook(() => useSavedArtworkLoader(list, { isLoaded: id => id === 'b', load, jobs }));

    await waitFor(() => expect(jobs.reportFailed).toHaveBeenCalled());
    expect(load.mock.calls.map(([remote]) => remote.id)).toEqual(['a', 'c']);
  });

  it('reports failed artworks, then waits for processing ones and loads them', async () => {
    const load = vi.fn<(remote: RemoteArtwork, signal: AbortSignal) => Promise<void>>(async () => {});
    const jobs = fakeJobs();
    const broken = artwork('broken', { modelUrl: undefined, processingStatus: 'failed' });
    const pending = artwork('pending', { modelUrl: undefined, processingStatus: 'processing' });

    renderHook(() => useSavedArtworkLoader([pending, broken, artwork('ok')], { isLoaded: () => false, load, jobs }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(jobs.reportFailed).toHaveBeenCalledWith([broken]);
    expect(jobs.waitUntilProcessed).toHaveBeenCalledWith(pending, expect.any(AbortSignal));
    expect(load.mock.calls.map(([remote]) => remote.id)).toEqual(['ok', 'pending']);
  });

  it('keeps going when one artwork fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('corrupt'))
      .mockResolvedValue(undefined);

    renderHook(() => useSavedArtworkLoader([artwork('a'), artwork('b')], { isLoaded: () => false, load, jobs: fakeJobs() }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('stops and aborts in-flight loads on unmount', async () => {
    let signal!: AbortSignal;
    const load = vi.fn((_remote: RemoteArtwork, s: AbortSignal) => {
      signal = s;
      return new Promise<void>(() => {}); // never finishes
    });

    const { unmount } = renderHook(() =>
      useSavedArtworkLoader([artwork('a'), artwork('b')], { isLoaded: () => false, load, jobs: fakeJobs() })
    );
    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('does nothing until there is a list', () => {
    const load = vi.fn();
    renderHook(() => useSavedArtworkLoader(null, { isLoaded: () => false, load, jobs: fakeJobs() }));
    expect(load).not.toHaveBeenCalled();
  });
});
