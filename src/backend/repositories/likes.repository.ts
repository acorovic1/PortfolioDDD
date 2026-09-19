import { pool } from '../config/db.ts';
import type { RowDataPacket } from 'mysql2';

export async function findLikedArtworkIds(userId: string): Promise<string[]> {
  const [rows] = await pool.query<({ artwork_id: string } & RowDataPacket)[]>(
    'SELECT artwork_id FROM likes WHERE user_id = ?',
    [userId]
  );
  return rows.map(r => r.artwork_id);
}

export async function addLike(userId: string, artworkId: string): Promise<void> {
  await pool.query(
    'INSERT IGNORE INTO likes (user_id, artwork_id) VALUES (?, ?)',
    [userId, artworkId]
  );
}

export async function removeLike(userId: string, artworkId: string): Promise<void> {
  await pool.query('DELETE FROM likes WHERE user_id = ? AND artwork_id = ?', [userId, artworkId]);
}

export async function countLikes(artworkId: string): Promise<number> {
  const [rows] = await pool.query<({ count: number } & RowDataPacket)[]>(
    'SELECT COUNT(*) AS count FROM likes WHERE artwork_id = ?',
    [artworkId]
  );
  return rows[0]?.count ?? 0;
}

export async function countLikesForArtworkIds(artworkIds: string[]): Promise<Map<string, number>> {
  if (artworkIds.length === 0) return new Map();

  const [rows] = await pool.query<({ artwork_id: string; count: number } & RowDataPacket)[]>(
    'SELECT artwork_id, COUNT(*) AS count FROM likes WHERE artwork_id IN (?) GROUP BY artwork_id',
    [artworkIds]
  );
  return new Map(rows.map(r => [r.artwork_id, r.count]));
}
