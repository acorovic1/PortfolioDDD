import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComments } from './useComments';
import type { Comment } from '@/types/Comment';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

const serverComment: Comment = { id: 'c1', author: 'bob', text: 'Nice topology', postedAt: '2026-01-01', artworkId: 'a1' };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useComments', () => {
  it('loads an artwork’s comments only once', async () => {
    fetchMock.mockImplementation(() => jsonResponse([serverComment]));
    const { result } = renderHook(() => useComments('tok', 'alice'));

    act(() => result.current.loadComments('a1'));
    act(() => result.current.loadComments('a1'));

    await waitFor(() => expect(result.current.commentsByArtwork.a1).toEqual([serverComment]));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('shows a new comment at once, then swaps in the saved one', async () => {
    let respond!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { respond = resolve; }));
    const { result } = renderHook(() => useComments('tok', 'alice'));

    act(() => result.current.addComment('a1', 'Love the bevels'));
    const optimistic = result.current.commentsByArtwork.a1[0];
    expect(optimistic).toMatchObject({ author: 'alice', text: 'Love the bevels', postedAt: 'Just now' });

    const saved = { ...optimistic, id: 'server-id', postedAt: '2026-10-11' };
    await act(async () => respond({ ok: true, status: 201, json: () => Promise.resolve(saved) } as Response));

    expect(result.current.commentsByArtwork.a1).toEqual([saved]);
  });

  it('rolls back a comment the server rejects', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ error: 'Spam' }, false, 400));
    const { result } = renderHook(() => useComments('tok', 'alice'));

    act(() => result.current.addComment('a1', 'Buy followers'));
    expect(result.current.commentsByArtwork.a1).toHaveLength(1);

    await waitFor(() => expect(result.current.commentsByArtwork.a1).toHaveLength(0));
  });

  it('restores a deleted comment if the delete fails', async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse([serverComment]))
      .mockImplementationOnce(() => jsonResponse(null, false, 403));
    const { result } = renderHook(() => useComments('tok', 'alice'));

    act(() => result.current.loadComments('a1'));
    await waitFor(() => expect(result.current.commentsByArtwork.a1).toHaveLength(1));

    act(() => result.current.deleteComment('a1', 'c1'));
    expect(result.current.commentsByArtwork.a1).toHaveLength(0);
    await waitFor(() => expect(result.current.commentsByArtwork.a1).toEqual([serverComment]));
  });

  it('needs a signed-in user to comment', () => {
    const { result } = renderHook(() => useComments(null, null));
    act(() => result.current.addComment('a1', 'hi'));
    expect(result.current.commentsByArtwork.a1).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forgets everything on sign-out', async () => {
    fetchMock.mockImplementation(() => jsonResponse([serverComment]));
    const { result, rerender } = renderHook(({ user }) => useComments(user ? 'tok' : null, user), {
      initialProps: { user: 'alice' as string | null },
    });

    act(() => result.current.loadComments('a1'));
    await waitFor(() => expect(result.current.commentsByArtwork.a1).toHaveLength(1));

    rerender({ user: null });
    expect(result.current.commentsByArtwork).toEqual({});

    // ...and fetches afresh for the next session.
    act(() => result.current.loadComments('a1'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
