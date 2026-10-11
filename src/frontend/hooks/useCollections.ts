import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/frontend/config/api';
import type { Collection } from '@/types/Collection';

// The signed-in user's collections (`token` is null while signed out).
// Changes are optimistic; renames roll back if the server refuses them.
export function useCollections(token: string | null) {
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollections([]);
      return;
    }
    fetch(`${API_BASE_URL}/api/collections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Collection[]) => setCollections(data))
      .catch(err => console.error('Failed to load collections:', err));
  }, [token]);

  const createCollection = (name: string) => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
      .then(res => (res.ok ? res.json() : null))
      .then((collection: Collection | null) => {
        if (collection) setCollections(prev => [...prev, collection]);
      })
      .catch(err => console.error('Failed to create collection:', err));
  };

  const renameCollection = (collectionId: string, name: string) => {
    const previousName = collections.find(c => c.id === collectionId)?.name;
    setCollections(prev => prev.map(c => (c.id === collectionId ? { ...c, name } : c)));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }).then(res => {
      if (!res.ok && previousName !== undefined) {
        console.error('Failed to rename collection: server returned', res.status);
        setCollections(prev => prev.map(c => (c.id === collectionId ? { ...c, name: previousName } : c)));
      }
    }).catch(err => console.error('Failed to rename collection:', err));
  };

  const deleteCollection = (collectionId: string) => {
    setCollections(prev => prev.filter(c => c.id !== collectionId));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to delete collection:', err));
  };

  const toggleArtworkInCollection = (collectionId: string, artworkId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    const wasInCollection = collection?.artworkIds.includes(artworkId) ?? false;

    setCollections(prev => prev.map(c => {
      if (c.id !== collectionId) return c;
      return {
        ...c,
        artworkIds: wasInCollection
          ? c.artworkIds.filter(id => id !== artworkId)
          : [...c.artworkIds, artworkId],
      };
    }));

    if (!token) return;
    fetch(`${API_BASE_URL}/api/collections/${collectionId}/artworks/${artworkId}`, {
      method: wasInCollection ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(err => console.error('Failed to sync collection:', err));
  };

  return { collections, createCollection, renameCollection, deleteCollection, toggleArtworkInCollection };
}
