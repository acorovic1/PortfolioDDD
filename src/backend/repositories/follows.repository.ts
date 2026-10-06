import { pool } from '../config/db.ts';

export type FollowListUser = {
  username: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  followedAt: string;
};

// Returns false when already following (nothing changed).
export async function addFollow(followerId: string, followeeId: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [followerId, followeeId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function removeFollow(followerId: string, followeeId: string): Promise<void> {
  await pool.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [followerId, followeeId]);
}

export async function isFollowing(followerId: string, followeeId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2',
    [followerId, followeeId]
  );
  return rows.length > 0;
}

export async function countFollows(userId: string): Promise<{ followers: number; following: number }> {
  const { rows } = await pool.query<{ followers: number; following: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM follows WHERE followee_id = $1) AS followers,
       (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1) AS following`,
    [userId]
  );
  return rows[0];
}

// `direction` 'followers' lists who follows userId; 'following' who userId follows.
export async function listFollows(
  userId: string,
  direction: 'followers' | 'following',
  limit: number,
  offset: number
): Promise<FollowListUser[]> {
  const [matchColumn, userColumn] = direction === 'followers'
    ? ['followee_id', 'follower_id']
    : ['follower_id', 'followee_id'];

  const { rows } = await pool.query<FollowListUser>(
    `SELECT u.username, u.name, u.avatar_url AS "avatarUrl", u.title, f.created_at AS "followedAt"
     FROM follows f
     JOIN users u ON u.id = f.${userColumn}
     WHERE f.${matchColumn} = $1
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}
