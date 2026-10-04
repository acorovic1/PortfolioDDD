import { pool } from '../config/db.ts';

export async function findLikedArtworkIds(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ artwork_id: string }>(
    'SELECT artwork_id FROM likes WHERE user_id = $1',
    [userId]
  );
  return rows.map(r => r.artwork_id);
}

export async function addLike(userId: string, artworkId: string): Promise<void> {
  await pool.query(
    'INSERT INTO likes (user_id, artwork_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, artworkId]
  );
}

export async function removeLike(userId: string, artworkId: string): Promise<void> {
  await pool.query('DELETE FROM likes WHERE user_id = $1 AND artwork_id = $2', [userId, artworkId]);
}

// COUNT(*) is a bigint, which pg returns as a string - cast it to int.
export async function countLikes(artworkId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM likes WHERE artwork_id = $1',
    [artworkId]
  );
  return rows[0]?.count ?? 0;
}

export async function countLikesForArtworkIds(artworkIds: string[]): Promise<Map<string, number>> {
  if (artworkIds.length === 0) return new Map();

  const { rows } = await pool.query<{ artwork_id: string; count: number }>(
    'SELECT artwork_id, COUNT(*)::int AS count FROM likes WHERE artwork_id = ANY($1) GROUP BY artwork_id',
    [artworkIds]
  );
  return new Map(rows.map(r => [r.artwork_id, r.count]));
}
