import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/frontend/config/api';
import type { Comment } from '@/types/Comment';
import { randomId } from '@/types/PortfolioPiece';

// Comments per artwork, fetched the first time each artwork is viewed.
// Posting and deleting are optimistic and roll back on failure. `username`
// is null while signed out; signing out clears everything.
export function useComments(token: string | null, username: string | null) {
  const [commentsByArtwork, setCommentsByArtwork] = useState<Record<string, Comment[]>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (username) return;
    fetchedRef.current.clear();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommentsByArtwork({});
  }, [username]);

  // The token is optional (comments on public work are public) but lets
  // owners read comments on their own drafts/private work.
  const loadComments = useCallback((artworkId: string) => {
    if (fetchedRef.current.has(artworkId)) return;
    fetchedRef.current.add(artworkId);

    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/comments`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => (res.ok ? res.json() : null))
      .then((serverComments: Comment[] | null) => {
        if (!serverComments) return;
        setCommentsByArtwork(prev => {
          const existing = prev[artworkId] ?? [];
          const serverIds = new Set(serverComments.map(c => c.id));
          // Keep any comment not yet reflected on the server (e.g. one whose
          // POST is still in flight) instead of dropping it on overwrite.
          const localOnly = existing.filter(c => !serverIds.has(c.id));
          return { ...prev, [artworkId]: [...serverComments, ...localOnly] };
        });
      })
      .catch(err => console.error('Failed to load comments:', err));
  }, [token]);

  const addComment = (artworkId: string, text: string) => {
    if (!username) return;

    const tempId = randomId();
    const comment: Comment = { id: tempId, author: username, text, postedAt: 'Just now', artworkId };
    setCommentsByArtwork(prev => ({ ...prev, [artworkId]: [...(prev[artworkId] ?? []), comment] }));

    if (!token) return;

    const rollback = () => {
      setCommentsByArtwork(prev => ({
        ...prev,
        [artworkId]: (prev[artworkId] ?? []).filter(c => c.id !== tempId),
      }));
    };

    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    })
      .then(async res => {
        if (!res.ok) {
          console.error('Failed to persist comment: server returned', res.status);
          rollback();
          return;
        }

        // Swap the optimistic temp id/timestamp for the backend's real ones,
        // so later actions (e.g. deleting this comment) target the right record.
        const saved: Comment = await res.json();
        setCommentsByArtwork(prev => ({
          ...prev,
          [artworkId]: (prev[artworkId] ?? []).map(c => (c.id === tempId ? saved : c)),
        }));
      })
      .catch(err => {
        console.error('Failed to persist comment:', err);
        rollback();
      });
  };

  const deleteComment = (artworkId: string, commentId: string) => {
    const previous = commentsByArtwork[artworkId] ?? [];
    setCommentsByArtwork(prev => ({
      ...prev,
      [artworkId]: (prev[artworkId] ?? []).filter(c => c.id !== commentId),
    }));

    if (!token) return;
    const restore = () => setCommentsByArtwork(prev => ({ ...prev, [artworkId]: previous }));
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      if (!res.ok) {
        console.error('Failed to delete comment: server returned', res.status);
        restore();
      }
    }).catch(err => {
      console.error('Failed to delete comment:', err);
      restore();
    });
  };

  return { commentsByArtwork, loadComments, addComment, deleteComment };
}
