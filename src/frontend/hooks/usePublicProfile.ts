import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '@/frontend/config/api';
import { apiFetch, profilePath } from '@/frontend/utils/api';
import type { User } from '@/frontend/contexts/auth-types';
import type { PortfolioPiece, RemoteArtwork } from '@/types/PortfolioPiece';
import type { ViewSource } from '@/types/Feed';

// Read-only view of another user's portfolio (/@username): mirrors the
// owner's own scene state, but hydrated from the public portfolio API. Also
// records views and follows ?artwork= deep links.
export function usePublicProfile(username: string | null, token: string | null) {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [artworks, setArtworks] = useState<PortfolioPiece[]>([]);
  const [remoteArtworksToLoad, setRemoteArtworksToLoad] = useState<RemoteArtwork[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('');
    setProfileUser(null);
    setArtworks([]);
    setRemoteArtworksToLoad(null);
    setSelectedIndex(0);

    // A linked artwork (?artwork=id) is requested explicitly, so unlisted
    // artworks open from their share link.
    // (Read from window.location: a ?artwork= switch within the same profile
    // is handled by the deep-link effect below, not by refetching.)
    const linkedArtwork = new URLSearchParams(window.location.search).get('artwork');
    const linkedParam = linkedArtwork ? `&artwork=${encodeURIComponent(linkedArtwork)}` : '';
    fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(username)}/portfolio?all=true${linkedParam}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // Renamed since this link was made: follow it to the new name.
          if (body.movedTo) {
            navigate(`${profilePath(body.movedTo)}${window.location.search}`, { replace: true });
            return null;
          }
          throw new Error(body.error || 'User not found');
        }
        return res.json();
      })
      .then((body: { user: User; artworks: RemoteArtwork[] } | null) => {
        if (cancelled || !body) return;
        setProfileUser(body.user);
        setRemoteArtworksToLoad(body.artworks);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      });

    return () => {
      cancelled = true;
    };
  }, [username, token, navigate]);

  // View tracking. The first artwork seen gets the source it was opened from
  // (?src=, e.g. explore/search), or external/direct; moving around the
  // carousel afterwards counts as 'profile'.
  const viewedArtworkIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    viewedArtworkIdsRef.current = new Set();
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const artwork = artworks[selectedIndex];
    if (!artwork || viewedArtworkIdsRef.current.has(artwork.id)) return;

    const isFirst = viewedArtworkIdsRef.current.size === 0;
    viewedArtworkIdsRef.current.add(artwork.id);

    const params = new URLSearchParams(window.location.search);
    const linkedSource = params.get('artwork') === artwork.id ? params.get('src') as ViewSource | null : null;
    let source: ViewSource = 'profile';
    if (linkedSource) {
      source = linkedSource;
    } else if (isFirst) {
      const fromElsewhere = document.referrer && new URL(document.referrer).origin !== window.location.origin;
      source = fromElsewhere ? 'external' : 'direct';
    }

    apiFetch<{ counted: boolean; viewCount: number }>(`/api/artworks/${artwork.id}/view`, {
      method: 'POST',
      token,
      body: { source },
    })
      .then(({ viewCount }) => {
        setArtworks(prev => prev.map(a => (
          a.id === artwork.id && a.publishing ? { ...a, publishing: { ...a.publishing, viewCount } } : a
        )));
      })
      .catch(err => console.error('Failed to record view:', err));
  }, [artworks, selectedIndex, username, token]);

  // Deep-link to a specific artwork (e.g. from search), once that artwork
  // has loaded into the scene.
  useEffect(() => {
    if (!username) return;
    const highlightId = new URLSearchParams(location.search).get('artwork');
    if (!highlightId) return;
    const index = artworks.findIndex(a => a.id === highlightId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (index >= 0) setSelectedIndex(index);
  }, [artworks, username, location.search]);

  const addArtwork = (artwork: PortfolioPiece) => {
    setArtworks(prev => [...prev, artwork]);
  };

  return {
    profileUser,
    artworks,
    setArtworks,
    remoteArtworksToLoad,
    selectedIndex,
    setSelectedIndex,
    error,
    addArtwork,
  };
}
