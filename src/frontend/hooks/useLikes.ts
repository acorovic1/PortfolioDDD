import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/frontend/config/api';

// The signed-in user's likes (`token` is null while signed out). Toggling is
// optimistic and synced in the background.
export function useLikes(token: string | null) {
  const [likedArtworkIds, setLikedArtworkIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLikedArtworkIds({});
      return;
    }
    fetch(`${API_BASE_URL}/api/portfolio/likes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then((ids: string[]) => setLikedArtworkIds(Object.fromEntries(ids.map(id => [id, true]))))
      .catch(err => console.error('Failed to load likes:', err));
  }, [token]);

  // Returns the change in like count (+1 or -1) for the caller to show.
  const toggleLike = (artworkId: string): 1 | -1 => {
    const wasLiked = !!likedArtworkIds[artworkId];
    setLikedArtworkIds(prev => ({ ...prev, [artworkId]: !wasLiked }));

    if (token) {
      fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(err => console.error('Failed to sync like:', err));
    }
    return wasLiked ? -1 : 1;
  };

  return { likedArtworkIds, toggleLike };
}
