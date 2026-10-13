import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@/frontend/config/api';
import { apiFetch, assetUrl } from '@/frontend/utils/api';
import { deleteArtwork as deleteArtworkRequest } from '@/frontend/utils/modelUpload';
import { pickPortfolioImage, type PortfolioPiece, type PublishingState, type RemoteArtwork } from '@/types/PortfolioPiece';
import type { ArtworkInfoData } from '@/types/ArtworkInfoData';

// The signed-in user's own artworks (`token` is null while signed out) and
// the edits they can make to them. The saved artworks are fetched once per
// login and handed to the 3D scene, which reconstructs and adds them.
export function useOwnPortfolio(token: string | null) {
  const [artworks, setArtworks] = useState<PortfolioPiece[]>([]);
  const [remoteArtworksToLoad, setRemoteArtworksToLoad] = useState<RemoteArtwork[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Guarded so navigating between pages doesn't keep re-fetching/re-adding
  // the same artworks.
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      // Signed out: a different user signing in afterwards (without a full
      // page reload) gets a clean slate.
      hasFetchedRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtworks([]);
      setRemoteArtworksToLoad(null);
      return;
    }
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetch(`${API_BASE_URL}/api/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then((data: RemoteArtwork[]) => setRemoteArtworksToLoad(data))
      .catch(err => console.error('Failed to load saved artworks:', err));
  }, [token]);

  const selected = selectedIndex >= 0 && selectedIndex < artworks.length ? artworks[selectedIndex] : undefined;

  const updateArtwork = (artworkId: string, update: (artwork: PortfolioPiece) => PortfolioPiece) => {
    setArtworks(prev => prev.map(a => (a.id === artworkId ? update(a) : a)));
  };

  const addArtwork = (artwork: PortfolioPiece) => {
    setArtworks(prev => [...prev, artwork]);
  };

  // New carousel order (ids, front to back), from dragging in edit mode.
  const reorderArtworks = (artworkIds: string[]) => {
    setArtworks(prev => {
      const byId = new Map(prev.map(a => [a.id, a]));
      const ordered = artworkIds.flatMap(id => byId.get(id) ?? []);
      return [...ordered, ...prev.filter(a => !artworkIds.includes(a.id))];
    });

    if (!token) return;
    apiFetch('/api/portfolio/order', { method: 'PUT', token, body: { artworkIds } })
      .catch(err => console.error('Failed to save the artwork order:', err));
  };

  const addRender = async () => {
    const picked = await pickPortfolioImage();
    if (!picked || !selected || !token) return;

    const formData = new FormData();
    formData.append('image', picked.file);
    formData.append('caption', picked.image.caption);

    try {
      const res = await fetch(`${API_BASE_URL}/api/portfolio/artworks/${selected.id}/renders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        console.error('Failed to upload render:', res.status);
        return;
      }

      const saved = await res.json();
      // Use the backend's persisted render (real URL + id) rather than the
      // local blob URL, so it's still valid after this session ends.
      updateArtwork(selected.id, a => ({
        ...a,
        renders: [...a.renders, { id: saved.id, url: assetUrl(saved.url)!, caption: saved.caption }],
      }));
    } catch (error) {
      console.error('Failed to upload render:', error);
    }
  };

  const deleteRender = (renderId: string) => {
    if (!selected) return;
    updateArtwork(selected.id, a => ({ ...a, renders: a.renders.filter(r => r.id !== renderId) }));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/portfolio/artworks/${selected.id}/renders/${renderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to delete render:', err));
  };

  const deleteArtwork = (artworkId: string) => {
    setArtworks(prev => prev.filter(a => a.id !== artworkId));
    setSelectedIndex(0);
    if (token) deleteArtworkRequest(artworkId, token);
  };

  const updatePublishing = (artworkId: string, fields: Partial<PublishingState>) => {
    const previous = artworks.find(a => a.id === artworkId)?.publishing;
    updateArtwork(artworkId, a => (a.publishing ? { ...a, publishing: { ...a.publishing, ...fields } } : a));

    if (!token) return;
    const body: Record<string, unknown> = {};
    if (fields.visibility !== undefined) body.visibility = fields.visibility;
    if (fields.publishedAt !== undefined) body.publishedAt = fields.publishedAt;
    if (fields.isMature !== undefined) body.isMature = fields.isMature;
    if (fields.aiGenerated !== undefined) body.aiGenerated = fields.aiGenerated;

    apiFetch(`/api/portfolio/artworks/${artworkId}`, { method: 'PUT', token, body }).catch(err => {
      console.error('Failed to update publishing settings:', err);
      if (previous) updateArtwork(artworkId, a => ({ ...a, publishing: previous }));
    });
  };

  const infoUpdateTimeoutRef = useRef<number | null>(null);

  const updateInfo = (key: keyof ArtworkInfoData, value: string | string[]) => {
    if (!selected) return;
    const artworkId = selected.id;
    updateArtwork(artworkId, a => ({ ...a, infoData: { ...a.infoData, [key]: value } }));

    if (!token) return;

    // Debounce: these fields update on every keystroke, so wait for a pause
    // before persisting instead of firing a request per character typed.
    if (infoUpdateTimeoutRef.current) window.clearTimeout(infoUpdateTimeoutRef.current);
    infoUpdateTimeoutRef.current = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/api/portfolio/artworks/${artworkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      }).catch(err => console.error('Failed to persist artwork info:', err));
    }, 600);
  };

  return {
    artworks,
    setArtworks,
    remoteArtworksToLoad,
    selectedIndex,
    setSelectedIndex,
    addArtwork,
    reorderArtworks,
    addRender,
    deleteRender,
    deleteArtwork,
    updatePublishing,
    updateInfo,
  };
}
