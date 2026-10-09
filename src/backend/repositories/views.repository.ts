import { pool } from '../config/db.ts';

export const VIEW_SOURCES = ['explore', 'following', 'search', 'profile', 'notification', 'marketplace', 'external', 'direct'] as const;
export type ViewSource = (typeof VIEW_SOURCES)[number];

// Counts at most one view per viewer per artwork per day. Returns whether
// this was a new view.
export async function recordView(artworkId: string, viewerKey: string, source: ViewSource): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO artwork_views (artwork_id, viewer_key, source) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [artworkId, viewerKey, source]
    );
    const isNew = (inserted.rowCount ?? 0) > 0;
    if (isNew) {
      await client.query('UPDATE artworks SET view_count = view_count + 1 WHERE id = $1', [artworkId]);
    }
    await client.query('COMMIT');
    return isNew;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
