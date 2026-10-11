import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCollections } from './useCollections';
import type { Collection } from '@/types/Collection';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

const refs = { id: 'col1', name: 'Refs', artworkIds: ['a1'] } as Collection;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderLoaded() {
  fetchMock.mockImplementationOnce(() => jsonResponse([refs]));
  const hook = renderHook(({ token }) => useCollections(token), { initialProps: { token: 'tok' as string | null } });
  await waitFor(() => expect(hook.result.current.collections).toEqual([refs]));
  return hook;
}

describe('useCollections', () => {
  it('loads collections for a signed-in user, and nothing while signed out', async () => {
    renderHook(() => useCollections(null));
    expect(fetchMock).not.toHaveBeenCalled();

    const { rerender, result } = await renderLoaded();
    rerender({ token: null });
    expect(result.current.collections).toEqual([]);
  });

  it('adds and removes artworks optimistically', async () => {
    const { result } = await renderLoaded();
    fetchMock.mockImplementation(() => jsonResponse(null));

    act(() => result.current.toggleArtworkInCollection('col1', 'a2'));
    expect(result.current.collections[0].artworkIds).toEqual(['a1', 'a2']);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/collections\/col1\/artworks\/a2$/), expect.objectContaining({ method: 'POST' }));

    act(() => result.current.toggleArtworkInCollection('col1', 'a1'));
    expect(result.current.collections[0].artworkIds).toEqual(['a2']);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/collections\/col1\/artworks\/a1$/), expect.objectContaining({ method: 'DELETE' }));
  });

  it('rolls a rename back if the server refuses it', async () => {
    const { result } = await renderLoaded();
    fetchMock.mockImplementation(() => jsonResponse({ error: 'Taken' }, false, 409));

    act(() => result.current.renameCollection('col1', 'References'));
    expect(result.current.collections[0].name).toBe('References');

    await waitFor(() => expect(result.current.collections[0].name).toBe('Refs'));
  });

  it('appends a created collection once the server returns it', async () => {
    const { result } = await renderLoaded();
    const created = { id: 'col2', name: 'Props', artworkIds: [] } as unknown as Collection;
    fetchMock.mockImplementation(() => jsonResponse(created, true, 201));

    act(() => result.current.createCollection('Props'));
    await waitFor(() => expect(result.current.collections).toEqual([refs, created]));
  });
});
