import { pool } from '../config/db.ts';

// --- Blocks ---

// SQL condition: neither user has blocked the other. `a` and `b` are SQL
// expressions (columns or $n params) for the two user ids.
export function notBlockedCondition(a: string, b: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM blocks bl
    WHERE (bl.blocker_id = ${a} AND bl.blocked_id = ${b})
       OR (bl.blocker_id = ${b} AND bl.blocked_id = ${a})
  )`;
}

export async function addBlock(blockerId: string, blockedId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [blockerId, blockedId]
    );
    // Blocking cuts the connection both ways.
    await client.query(
      `DELETE FROM follows
       WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)`,
      [blockerId, blockedId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeBlock(blockerId: string, blockedId: string): Promise<void> {
  await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
}

export async function blockState(viewerId: string, otherId: string): Promise<{ hasBlocked: boolean; isBlockedBy: boolean }> {
  const { rows } = await pool.query<{ blocker_id: string }>(
    `SELECT blocker_id FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [viewerId, otherId]
  );
  return {
    hasBlocked: rows.some(r => r.blocker_id === viewerId),
    isBlockedBy: rows.some(r => r.blocker_id === otherId),
  };
}

export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const state = await blockState(a, b);
  return state.hasBlocked || state.isBlockedBy;
}

// Everyone `userId` has blocked or been blocked by.
export async function findBlockRelations(userId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ other_id: string }>(
    `SELECT blocked_id AS other_id FROM blocks WHERE blocker_id = $1
     UNION SELECT blocker_id FROM blocks WHERE blocked_id = $1`,
    [userId]
  );
  return new Set(rows.map(r => r.other_id));
}

export async function listBlockedUsers(blockerId: string): Promise<{ username: string; avatarUrl: string | null; blockedAt: string }[]> {
  const { rows } = await pool.query(
    `SELECT u.username, u.avatar_url AS "avatarUrl", b.created_at AS "blockedAt"
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC`,
    [blockerId]
  );
  return rows;
}

// --- Reports ---

export const REPORT_REASONS = [
  'spam', 'harassment', 'hate', 'unlabeled_mature', 'violence',
  'stolen_work', 'unlabeled_ai', 'impersonation', 'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = 'artwork' | 'comment' | 'user';

export type ReportRecord = {
  id: string;
  reporter_id: string | null;
  target_type: ReportTargetType;
  target_id: string;
  target_user_id: string | null;
  reason: ReportReason;
  details: string | null;
  target_summary: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  resolution: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

// Returns false if this person already has an open report on the target.
export async function createReport(report: {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string | null;
  reason: ReportReason;
  details: string | null;
  targetSummary: string | null;
}): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, target_user_id, reason, details, target_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [report.id, report.reporterId, report.targetType, report.targetId, report.targetUserId,
      report.reason, report.details, report.targetSummary]
  );
  return (result.rowCount ?? 0) > 0;
}

export type ReportListItem = {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetSummary: string | null;
  targetUsername: string | null;
  targetUserSuspended: boolean;
  // Whether the reported artwork/comment still exists.
  targetExists: boolean;
  reason: ReportReason;
  details: string | null;
  reporterUsername: string | null;
  // Open reports on the same target (from anyone).
  openReportsOnTarget: number;
  status: string;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedByUsername: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export async function listReports(status: 'open' | 'closed', limit: number, offset: number): Promise<ReportListItem[]> {
  const { rows } = await pool.query<ReportListItem>(
    `SELECT r.id, r.target_type AS "targetType", r.target_id AS "targetId", r.target_summary AS "targetSummary",
            tu.username AS "targetUsername", (tu.suspended_at IS NOT NULL) AS "targetUserSuspended",
            CASE r.target_type
              WHEN 'artwork' THEN EXISTS (SELECT 1 FROM artworks a WHERE a.id = r.target_id)
              WHEN 'comment' THEN EXISTS (SELECT 1 FROM comments c WHERE c.id = r.target_id)
              ELSE EXISTS (SELECT 1 FROM users u WHERE u.id = r.target_id)
            END AS "targetExists",
            r.reason, r.details, ru.username AS "reporterUsername",
            (SELECT COUNT(*)::int FROM reports o
             WHERE o.target_type = r.target_type AND o.target_id = r.target_id AND o.status = 'open') AS "openReportsOnTarget",
            r.status, r.resolution, r.resolution_note AS "resolutionNote",
            rb.username AS "resolvedByUsername", r.resolved_at AS "resolvedAt", r.created_at AS "createdAt"
     FROM reports r
     LEFT JOIN users ru ON ru.id = r.reporter_id
     LEFT JOIN users tu ON tu.id = r.target_user_id
     LEFT JOIN users rb ON rb.id = r.resolved_by
     WHERE ${status === 'open' ? "r.status = 'open'" : "r.status <> 'open'"}
     ORDER BY ${status === 'open' ? 'r.created_at ASC' : 'r.resolved_at DESC'}
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function findReportById(id: string): Promise<ReportRecord | null> {
  const { rows } = await pool.query<ReportRecord>('SELECT * FROM reports WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// Closes every open report on the same target and returns their reporters,
// so they can be told the outcome.
export async function closeReportsOnTarget(
  targetType: ReportTargetType,
  targetId: string,
  outcome: { status: 'resolved' | 'dismissed'; resolution: string; note: string | null; resolvedBy: string }
): Promise<string[]> {
  const { rows } = await pool.query<{ reporter_id: string | null }>(
    `UPDATE reports
     SET status = $3, resolution = $4, resolution_note = $5, resolved_by = $6, resolved_at = NOW()
     WHERE target_type = $1 AND target_id = $2 AND status = 'open'
     RETURNING reporter_id`,
    [targetType, targetId, outcome.status, outcome.resolution, outcome.note, outcome.resolvedBy]
  );
  return rows.map(r => r.reporter_id).filter((id): id is string => id !== null);
}

// --- Suspensions ---

export async function setSuspended(userId: string, suspended: boolean, reason: string | null): Promise<void> {
  await pool.query(
    `UPDATE users SET suspended_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
                      suspension_reason = CASE WHEN $2 THEN $3 ELSE NULL END
     WHERE id = $1`,
    [userId, suspended, reason]
  );
}

export async function moderationCounts(): Promise<{ openReports: number; suspendedUsers: number; users: number; artworks: number }> {
  const { rows } = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM reports WHERE status = 'open') AS "openReports",
            (SELECT COUNT(*)::int FROM users WHERE suspended_at IS NOT NULL) AS "suspendedUsers",
            (SELECT COUNT(*)::int FROM users) AS users,
            (SELECT COUNT(*)::int FROM artworks) AS artworks`
  );
  return rows[0];
}

export async function searchUsersForAdmin(query: string, limit: number): Promise<{
  id: string; username: string; email: string; role: string; suspendedAt: string | null;
  suspensionReason: string | null; createdAt: string; artworks: number; reportsAgainst: number;
}[]> {
  const like = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.suspended_at AS "suspendedAt",
            u.suspension_reason AS "suspensionReason", u.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM artworks a WHERE a.user_id = u.id) AS artworks,
            (SELECT COUNT(*)::int FROM reports r WHERE r.target_user_id = u.id) AS "reportsAgainst"
     FROM users u
     WHERE $1 = '%%' OR u.username ILIKE $1 OR u.email ILIKE $1
     ORDER BY u.suspended_at DESC NULLS LAST, u.created_at DESC
     LIMIT $2`,
    [like, limit]
  );
  return rows;
}
