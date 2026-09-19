import { pool } from '../config/db.ts';
import type { CollectionRecord, CollectionDTO } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function findCollectionsByUserId(userId: string): Promise<CollectionDTO[]> {
  const [collections] = await pool.query<(CollectionRecord & RowDataPacket)[]>(
    'SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );

  if (collections.length === 0) return [];

  const [links] = await pool.query<({ collection_id: string; artwork_id: string } & RowDataPacket)[]>(
    `SELECT collection_id, artwork_id FROM collection_artworks WHERE collection_id IN (?)`,
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
  const [rows] = await pool.query<(CollectionRecord & RowDataPacket)[]>(
    'SELECT * FROM collections WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function createCollection(collection: { id: string; userId: string; name: string }): Promise<void> {
  await pool.query<ResultSetHeader>(
    'INSERT INTO collections (id, user_id, name) VALUES (?, ?, ?)',
    [collection.id, collection.userId, collection.name]
  );
}

export async function renameCollection(id: string, name: string): Promise<void> {
  await pool.query('UPDATE collections SET name = ? WHERE id = ?', [name, id]);
}

export async function deleteCollection(id: string): Promise<void> {
  await pool.query('DELETE FROM collections WHERE id = ?', [id]);
}

export async function addArtworkToCollection(collectionId: string, artworkId: string): Promise<void> {
  await pool.query(
    'INSERT IGNORE INTO collection_artworks (collection_id, artwork_id) VALUES (?, ?)',
    [collectionId, artworkId]
  );
}

export async function removeArtworkFromCollection(collectionId: string, artworkId: string): Promise<void> {
  await pool.query(
    'DELETE FROM collection_artworks WHERE collection_id = ? AND artwork_id = ?',
    [collectionId, artworkId]
  );
}
