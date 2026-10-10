import { pool } from '../config/db.ts';
import { listedCondition } from '../repositories/artworks.repository.ts';
import { publish } from './realtime.ts';

// Tells followers about artworks that just went live - right after upload
// processing, on "publish now", or when a scheduled publish time passes.
// Each artwork is announced once (followers_notified). Returns how many
// artworks were announced.
export async function announceNewlyPublished(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; user_id: string; title: string }>(
      `UPDATE artworks SET followers_notified = TRUE
       WHERE NOT followers_notified AND ${listedCondition()}
       RETURNING id, user_id, title`
    );

    const notified = new Set<string>();
    for (const artwork of rows) {
      const inserted = await client.query<{ user_id: string }>(
        `INSERT INTO notifications (id, user_id, actor_username, type, message, artwork_id)
         SELECT gen_random_uuid()::text, f.follower_id, u.username, 'new_artwork',
                '@' || u.username || ' published "' || $3 || '"', $1
         FROM follows f
         JOIN users u ON u.id = $2
         WHERE f.followee_id = $2
         RETURNING user_id`,
        [artwork.id, artwork.user_id, artwork.title || 'a new artwork']
      );
      inserted.rows.forEach(row => notified.add(row.user_id));
    }

    await client.query('COMMIT');
    notified.forEach(userId => publish(userId, 'notification', { type: 'new_artwork' }));
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Fire-and-forget variant for request handlers.
export function announceNewlyPublishedInBackground(): void {
  announceNewlyPublished().catch(err => console.error('Failed to announce published artworks:', err));
}

let timer: NodeJS.Timeout | null = null;

// Scheduled publishes have no request to hang off, so they're picked up by a
// once-a-minute sweep.
export function startPublisher(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(announceNewlyPublishedInBackground, intervalMs);
  timer.unref();
  announceNewlyPublishedInBackground();
}
