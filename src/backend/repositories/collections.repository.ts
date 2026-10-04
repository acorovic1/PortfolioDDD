import { pool } from '../config/db.ts';
import type { CollectionRecord, CollectionDTO } from '../types.ts';

export async function findCollectionsByUserId(userId: string): Promise<CollectionDTO[]> {
  const { rows: collections } = await pool.query<CollectionRecord>(
    'SELECT * FROM collections WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  if (collections.length === 0) return [];

  const { rows: links } = await pool.query<{ collection_id: string; artwork_id: string }>(
    `SELECT collection_id, artwork_id FROM collection_artworks WHERE collection_id = ANY($1)`,
    [collections.map(c => c.id)]
  );

  const artworkIdsByCollection = new Map<string, string[]>();
  for (const link of links) {
    const list = artworkIdsByCollection.get(link.collection_id) ?? [];
    list.push(link.artwork_id);
    artworkIdsByCollection.set(link.collection_id, list);
  }

  return collections.map(c => ({
    id: c.id,
    name: c.name,
    artworkIds: artworkIdsByCollection.get(c.id) ?? [],
    createdAt: c.created_at,
  }));
}

export async function findCollectionById(id: string): Promise<CollectionRecord | null> {
  const { rows } = await pool.query<CollectionRecord>(
    'SELECT * FROM collections WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function createCollection(collection: { id: string; userId: string; name: string }): Promise<void> {
  await pool.query(
    'INSERT INTO collections (id, user_id, name) VALUES ($1, $2, $3)',
    [collection.id, collection.userId, collection.name]
  );
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await pool.query('UPDATE collections SET name = $1 WHERE id = $2', [name, id]);
}

export async function deleteCollection(id: string): Promise<void> {
  await pool.query('DELETE FROM collections WHERE id = $1', [id]);
}

export async function addArtworkToCollection(collectionId: string, artworkId: string): Promise<void> {
  await pool.query(
    'INSERT INTO collection_artworks (collection_id, artwork_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [collectionId, artworkId]
  );
}

export async function removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<void> {
  await pool.query(
    'DELETE FROM collection_artworks WHERE collection_id = $1 AND artwork_id = $2',
    [collectionId, artworkId]
  );
}
