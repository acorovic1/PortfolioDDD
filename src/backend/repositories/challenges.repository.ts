import { pool } from '../config/db.ts';
import { listedCondition } from './artworks.repository.ts';

export type ChallengeStatus = 'upcoming' | 'active' | 'ended';

export type ChallengeDTO = {
  id: string;
  title: string;
  brief: string;
  rules: string | null;
  prize: string | null;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  entryCount: number;
};

export type ChallengeEntry = {
  artworkId: string;
  title: string;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  avatarUrl: string | null;
  likeCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
  votes: number;
  rank: number;
  votedByViewer: boolean;
  submittedAt: string;
};

const STATUS = `CASE WHEN NOW() < c.starts_at THEN 'upcoming' WHEN NOW() < c.ends_at THEN 'active' ELSE 'ended' END`;

const CHALLENGE_COLUMNS = `
  c.id, c.title, c.brief, c.rules, c.prize, c.starts_at AS "startsAt", c.ends_at AS "endsAt",
  ${STATUS} AS status,
  (SELECT COUNT(*)::int FROM challenge_entries e WHERE e.challenge_id = c.id) AS "entryCount"`;

export async function listChallenges(): Promise<ChallengeDTO[]> {
  const { rows } = await pool.query<ChallengeDTO>(
    `SELECT ${CHALLENGE_COLUMNS} FROM challenges c
     ORDER BY CASE ${STATUS} WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
              CASE WHEN NOW() < c.ends_at THEN c.ends_at END ASC,
              c.ends_at DESC
     LIMIT 100`
  );
  return rows;
}

export async function findChallenge(id: string): Promise<ChallengeDTO | null> {
  const { rows } = await pool.query<ChallengeDTO>(`SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createChallenge(challenge: {
  id: string; title: string; brief: string; rules?: string; prize?: string;
  startsAt: string; endsAt: string; createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO challenges (id, title, brief, rules, prize, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [challenge.id, challenge.title, challenge.brief, challenge.rules || null, challenge.prize || null,
      challenge.startsAt, challenge.endsAt, challenge.createdBy]
  );
}

export async function deleteChallenge(id: string): Promise<void> {
  await pool.query('DELETE FROM challenges WHERE id = $1', [id]);
}

// Entries ranked by votes (ties: earlier submission first). Entries whose
// artwork is no longer listed (unpublished, made private, suspended author)
// drop out.
export async function listEntries(challengeId: string, viewerId: string | null): Promise<ChallengeEntry[]> {
  const { rows } = await pool.query<ChallengeEntry>(
    `SELECT a.id AS "artworkId", a.title, a.thumbnail_path AS "thumbnailUrl",
            (SELECT r.url FROM renders r WHERE r.artwork_id = a.id ORDER BY r.created_at LIMIT 1) AS "coverUrl",
            u.username, u.avatar_url AS "avatarUrl",
            (SELECT COUNT(*)::int FROM likes l WHERE l.artwork_id = a.id) AS "likeCount",
            a.view_count AS "viewCount", a.is_mature AS "isMature", a.ai_generated AS "aiGenerated",
            (SELECT COUNT(*)::int FROM challenge_votes v WHERE v.challenge_id = e.challenge_id AND v.artwork_id = e.artwork_id) AS votes,
            EXISTS (SELECT 1 FROM challenge_votes v
                    WHERE v.challenge_id = e.challenge_id AND v.artwork_id = e.artwork_id AND v.voter_id = $2) AS "votedByViewer",
            e.submitted_at AS "submittedAt"
     FROM challenge_entries e
     JOIN artworks a ON a.id = e.artwork_id
     JOIN users u ON u.id = a.user_id
     WHERE e.challenge_id = $1 AND ${listedCondition('a')}
     ORDER BY votes DESC, e.submitted_at ASC`,
    [challengeId, viewerId]
  );
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export async function findEntryByUser(challengeId: string, userId: string): Promise<{ artworkId: string } | null> {
  const { rows } = await pool.query<{ artworkId: string }>(
    'SELECT artwork_id AS "artworkId" FROM challenge_entries WHERE challenge_id = $1 AND user_id = $2',
    [challengeId, userId]
  );
  return rows[0] ?? null;
}

export async function addEntry(challengeId: string, artworkId: string, userId: string): Promise<void> {
  await pool.query(
    'INSERT INTO challenge_entries (challenge_id, artwork_id, user_id) VALUES ($1, $2, $3)',
    [challengeId, artworkId, userId]
  );
}

export async function removeEntry(challengeId: string, userId: string): Promise<void> {
  await pool.query('DELETE FROM challenge_entries WHERE challenge_id = $1 AND user_id = $2', [challengeId, userId]);
}

export async function findEntryOwner(challengeId: string, artworkId: string): Promise<string | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM challenge_entries WHERE challenge_id = $1 AND artwork_id = $2',
    [challengeId, artworkId]
  );
  return rows[0]?.user_id ?? null;
}

export async function setVote(challengeId: string, artworkId: string, voterId: string, voted: boolean): Promise<void> {
  if (voted) {
    await pool.query(
      `INSERT INTO challenge_votes (challenge_id, artwork_id, voter_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [challengeId, artworkId, voterId]
    );
  } else {
    await pool.query(
      'DELETE FROM challenge_votes WHERE challenge_id = $1 AND artwork_id = $2 AND voter_id = $3',
      [challengeId, artworkId, voterId]
    );
  }
}
