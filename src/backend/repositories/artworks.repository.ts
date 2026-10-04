import { pool } from '../config/db.ts';
import type { ArtworkRecord, ArtworkDTO, RenderRecord } from '../types.ts';
import { toRenderDTO } from './renders.repository.ts';
import { parseJsonArray } from '../utils/json.util.ts';

export function toArtworkDTO(
  row: ArtworkRecord,
  renders: RenderRecord[],
  likeCount = 0,
  username?: string
): ArtworkDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    year: row.year ?? '',
    category: row.category ?? '',
    tools: parseJsonArray(row.tools),
    modelUrl: row.model_path,
    renders: renders.map(toRenderDTO),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likeCount,
    ...(username !== undefined ? { username } : {}),
  };
}

export async function findArtworksByUserId(
  userId: string,
  limit?: number,
  offset?: number
): Promise<ArtworkRecord[]> {
  // No limit means "all of this user's artworks" - used to rebuild someone's
  // own 3D scene, which must never be silently truncated by pagination.
  // Artworks created in the same instant tie on `created_at` - `id` as a
  // secondary key keeps the order stable across requests instead of
  // shuffling (which visibly reshuffles the 3D carousel between page loads).
  if (limit === undefined) {
    const { rows } = await pool.query<ArtworkRecord>(
      'SELECT * FROM artworks WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
      [userId]
    );
    return rows;
  }

  const { rows } = await pool.query<ArtworkRecord>(
    'SELECT * FROM artworks WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3',
    [userId, limit, offset ?? 0]
  );
  return rows;
}

export async function findArtworkById(id: string): Promise<ArtworkRecord | null> {
  const { rows } = await pool.query<ArtworkRecord>(
    'SELECT * FROM artworks WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export type ArtworkRecordWithOwner = ArtworkRecord & { username: string };

// Looks artworks up across all users (e.g. resolving a liked-posts or saved
// list, whose entries may belong to anyone), so each row carries its owner's
// username along with it.
export async function findArtworksByIds(ids: string[]): Promise<ArtworkRecordWithOwner[]> {
  if (ids.length === 0) return [];

  const { rows } = await pool.query<ArtworkRecordWithOwner>(
    `SELECT artworks.*, users.username AS username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE artworks.id = ANY($1)`,
    [ids]
  );
  return rows;
}

export async function createArtwork(artwork: {
  id: string;
  userId: string;
  title: string;
  description: string;
  year: string;
  category: string;
  tools: string[];
  modelPath: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO artworks (id, user_id, title, description, year, category, tools, model_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      artwork.id,
      artwork.userId,
      artwork.title,
      artwork.description,
      artwork.year,
      artwork.category,
      JSON.stringify(artwork.tools),
      artwork.modelPath,
    ]
  );
}

export async function updateArtwork(
  id: string,
  fields: Partial<{ title: string; description: string; year: string; category: string; tools: string[] }>
): Promise<void> {
  const columnMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    year: 'year',
    category: 'category',
    tools: 'tools',
  };

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const setClause = entries.map(([key], i) => `${columnMap[key]} = $${i + 1}`).join(', ');
  const values = entries.map(([key, value]) => (key === 'tools' ? JSON.stringify(value) : value));

  await pool.query(
    `UPDATE artworks SET ${setClause}, updated_at = NOW() WHERE id = $${values.length + 1}`,
    [...values, id]
  );
}

export async function deleteArtwork(id: string): Promise<void> {
  await pool.query('DELETE FROM artworks WHERE id = $1', [id]);
}

export type ArtworkSearchResult = {
  id: string;
  title: string;
  category: string;
  year: string;
  username: string;
};

export async function searchArtworks(query: string, limit: number, offset: number): Promise<ArtworkSearchResult[]> {
  const like = `%${query}%`;
  // Postgres LIKE is case-sensitive; ILIKE keeps search case-insensitive.
  const { rows } = await pool.query<ArtworkSearchResult>(
    `SELECT artworks.id, artworks.title, artworks.category, artworks.year, users.username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE artworks.title ILIKE $1 OR artworks.category ILIKE $1 OR artworks.description ILIKE $1
     ORDER BY artworks.created_at DESC
     LIMIT $2 OFFSET $3`,
    [like, limit, offset]
  );
  return rows;
}
