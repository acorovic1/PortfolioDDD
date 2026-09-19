import { pool } from '../config/db.ts';
import type { ArtworkRecord, ArtworkDTO, RenderRecord } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
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
  // `created_at` only has second-level precision, so artworks created within
  // the same second tie - `id` as a secondary key keeps the order stable
  // across requests instead of shuffling (which visibly reshuffles the 3D
  // carousel between page loads).
  if (limit === undefined) {
    const [rows] = await pool.query<(ArtworkRecord & RowDataPacket)[]>(
      'SELECT * FROM artworks WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [userId]
    );
    return rows;
  }

  const [rows] = await pool.query<(ArtworkRecord & RowDataPacket)[]>(
    'SELECT * FROM artworks WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    [userId, limit, offset ?? 0]
  );
  return rows;
}

export async function findArtworkById(id: string): Promise<ArtworkRecord | null> {
  const [rows] = await pool.query<(ArtworkRecord & RowDataPacket)[]>(
    'SELECT * FROM artworks WHERE id = ? LIMIT 1',
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

  const [rows] = await pool.query<(ArtworkRecordWithOwner & RowDataPacket)[]>(
    `SELECT artworks.*, users.username AS username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE artworks.id IN (?)`,
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
  await pool.query<ResultSetHeader>(
    `INSERT INTO artworks (id, user_id, title, description, year, category, tools, model_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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

  const setClause = entries.map(([key]) => `${columnMap[key]} = ?`).join(', ');
  const values = entries.map(([key, value]) => (key === 'tools' ? JSON.stringify(value) : value));

  await pool.query(`UPDATE artworks SET ${setClause} WHERE id = ?`, [...values, id]);
}

export async function deleteArtwork(id: string): Promise<void> {
  await pool.query('DELETE FROM artworks WHERE id = ?', [id]);
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
  const [rows] = await pool.query<(ArtworkSearchResult & RowDataPacket)[]>(
    `SELECT artworks.id, artworks.title, artworks.category, artworks.year, users.username
     FROM artworks
     JOIN users ON users.id = artworks.user_id
     WHERE artworks.title LIKE ? OR artworks.category LIKE ? OR artworks.description LIKE ?
     ORDER BY artworks.created_at DESC
     LIMIT ? OFFSET ?`,
    [like, like, like, limit, offset]
  );
  return rows;
}
