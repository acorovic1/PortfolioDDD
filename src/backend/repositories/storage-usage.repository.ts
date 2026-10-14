import crypto from 'node:crypto';
import { pool } from '../config/db.ts';

const MB = 1024 * 1024;

// Every account's storage allowance unless it has its own (an upgrade).
export function defaultStorageQuotaBytes(): number {
  return (Number(process.env.STORAGE_QUOTA_MB) || 250) * MB;
}

export async function recordStoredFile(url: string, userId: string, sizeBytes: number): Promise<void> {
  await pool.query(
    `INSERT INTO stored_files (url, user_id, size_bytes) VALUES ($1, $2, $3)
     ON CONFLICT (url) DO UPDATE SET user_id = EXCLUDED.user_id, size_bytes = EXCLUDED.size_bytes`,
    [url, userId, sizeBytes]
  );
}

export async function forgetStoredFile(url: string): Promise<void> {
  await pool.query('DELETE FROM stored_files WHERE url = $1', [url]);
}

// A file moved to a new URL (the local-to-bucket storage migration).
export async function renameStoredFile(oldUrl: string, newUrl: string): Promise<void> {
  await pool.query('UPDATE stored_files SET url = $1 WHERE url = $2', [newUrl, oldUrl]);
}

export type StorageUsage = { usedBytes: number; quotaBytes: number };

type Queryable = Pick<typeof pool, 'query'>;

// Reservations this old are leftovers from a crash, not uploads in flight.
const LIVE_RESERVATION = "created_at > NOW() - INTERVAL '1 hour'";

// Stored files plus space reserved for uploads in flight.
export async function storageUsage(userId: string, db: Queryable = pool): Promise<StorageUsage> {
  const { rows } = await db.query<{ used: string; quota: string | null }>(
    `SELECT COALESCE((SELECT SUM(size_bytes) FROM stored_files WHERE user_id = $1), 0)
            + COALESCE((SELECT SUM(size_bytes) FROM storage_reservations WHERE user_id = $1 AND ${LIVE_RESERVATION}), 0) AS used,
            (SELECT storage_quota_bytes FROM users WHERE id = $1) AS quota`,
    [userId]
  );
  return {
    usedBytes: Number(rows[0]?.used ?? 0),
    quotaBytes: rows[0]?.quota != null ? Number(rows[0].quota) : defaultStorageQuotaBytes(),
  };
}

export type ReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; usedBytes: number; quotaBytes: number };

// Reserves `bytes` for an upload if they fit, crediting `freedUrls` (files
// the upload replaces). The account's row is locked meanwhile, so two
// uploads at once take turns instead of both seeing the same free space.
export async function reserveStorage(userId: string, bytes: number, freedUrls: string[]): Promise<ReservationResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { usedBytes, quotaBytes } = await storageUsage(userId, client);
    const freed = await sizeOfOwnedFiles(userId, freedUrls, client);
    if (usedBytes - freed + bytes > quotaBytes) {
      await client.query('ROLLBACK');
      return { ok: false, usedBytes, quotaBytes };
    }
    const reservationId = crypto.randomUUID();
    await client.query(
      'INSERT INTO storage_reservations (id, user_id, size_bytes) VALUES ($1, $2, $3)',
      [reservationId, userId, bytes]
    );
    await client.query('COMMIT');
    return { ok: true, reservationId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseStorageReservation(id: string): Promise<void> {
  await pool.query('DELETE FROM storage_reservations WHERE id = $1', [id]);
}

export async function deleteExpiredReservations(): Promise<void> {
  await pool.query(`DELETE FROM storage_reservations WHERE NOT (${LIVE_RESERVATION})`);
}

// How much of the account's usage these files make up (files that aren't
// the account's count for nothing).
export async function sizeOfOwnedFiles(userId: string, urls: string[], db: Queryable = pool): Promise<number> {
  if (urls.length === 0) return 0;
  const { rows } = await db.query<{ total: string }>(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM stored_files WHERE user_id = $1 AND url = ANY($2)',
    [userId, urls]
  );
  return Number(rows[0].total);
}

// Files the database points at that the ledger doesn't know yet (stored
// before it existed), with their owner.
export async function findUnrecordedFiles(): Promise<{ url: string; userId: string }[]> {
  const { rows } = await pool.query<{ url: string; user_id: string }>(
    `SELECT f.url, f.user_id FROM (
       SELECT model_path AS url, user_id FROM artworks
       UNION ALL SELECT thumbnail_path, user_id FROM artworks
       UNION ALL SELECT image_path, user_id FROM artworks
       UNION ALL SELECT r.url, a.user_id FROM renders r JOIN artworks a ON a.id = r.artwork_id
       UNION ALL SELECT avatar_url, id FROM users
       UNION ALL SELECT cover_url, id FROM users
     ) f
     WHERE f.url IS NOT NULL AND f.url <> ''
       AND NOT EXISTS (SELECT 1 FROM stored_files s WHERE s.url = f.url)`
  );
  return rows.map(row => ({ url: row.url, userId: row.user_id }));
}
