import { pool } from '../config/db.ts';

export type Totals = { views: number; likes: number; comments: number; followers: number; downloads: number };

export type CreatorAnalytics = {
  days: number;
  current: Totals;
  previous: Totals;
  allTime: { views: number; likes: number; followers: number; artworks: number };
  // One row per day (oldest first), in UTC.
  daily: { date: string; views: number; likes: number; followers: number }[];
  sources: { source: string; views: number }[];
  topArtworks: { id: string; title: string; views: number; likes: number; comments: number }[];
};

// Engagement on `userId`'s work between `from` and `to` (half-open).
// Their own likes/comments/views aren't counted.
async function totalsBetween(userId: string, from: string, to: string): Promise<Totals> {
  const { rows } = await pool.query<Totals>(
    `SELECT
       (SELECT COUNT(*)::int FROM artwork_views v JOIN artworks a ON a.id = v.artwork_id
        WHERE a.user_id = $1 AND v.created_at >= $2 AND v.created_at < $3) AS views,
       (SELECT COUNT(*)::int FROM likes l JOIN artworks a ON a.id = l.artwork_id
        WHERE a.user_id = $1 AND l.user_id <> $1 AND l.created_at >= $2 AND l.created_at < $3) AS likes,
       (SELECT COUNT(*)::int FROM comments c JOIN artworks a ON a.id = c.artwork_id
        WHERE a.user_id = $1 AND c.user_id <> $1 AND c.created_at >= $2 AND c.created_at < $3) AS comments,
       (SELECT COUNT(*)::int FROM follows f
        WHERE f.followee_id = $1 AND f.created_at >= $2 AND f.created_at < $3) AS followers,
       (SELECT COUNT(*)::int FROM listing_downloads d JOIN listings ls ON ls.id = d.listing_id
        WHERE ls.seller_id = $1 AND d.created_at >= $2 AND d.created_at < $3) AS downloads`,
    [userId, from, to]
  );
  return rows[0];
}

export async function getCreatorAnalytics(userId: string, days: number): Promise<CreatorAnalytics> {
  // Whole UTC days: today plus the (days - 1) before it.
  const { rows: [range] } = await pool.query<{ start: string; end: string; prev_start: string }>(
    `SELECT (date_trunc('day', NOW() AT TIME ZONE 'UTC') - make_interval(days => $1 - 1)) AT TIME ZONE 'UTC' AS start,
            (date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC' AS "end",
            (date_trunc('day', NOW() AT TIME ZONE 'UTC') - make_interval(days => 2 * $1 - 1)) AT TIME ZONE 'UTC' AS prev_start`,
    [days]
  );

  const [current, previous, allTime, daily, sources, topArtworks] = await Promise.all([
    totalsBetween(userId, range.start, range.end),
    totalsBetween(userId, range.prev_start, range.start),
    pool.query<CreatorAnalytics['allTime']>(
      `SELECT COALESCE(SUM(a.view_count), 0)::int AS views,
              (SELECT COUNT(*)::int FROM likes l JOIN artworks a2 ON a2.id = l.artwork_id
               WHERE a2.user_id = $1 AND l.user_id <> $1) AS likes,
              (SELECT COUNT(*)::int FROM follows WHERE followee_id = $1) AS followers,
              COUNT(a.id)::int AS artworks
       FROM artworks a WHERE a.user_id = $1`,
      [userId]
    ).then(r => r.rows[0]),
    pool.query<CreatorAnalytics['daily'][number]>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              (SELECT COUNT(*)::int FROM artwork_views v JOIN artworks a ON a.id = v.artwork_id
               WHERE a.user_id = $1 AND v.created_at >= d.day AT TIME ZONE 'UTC'
                 AND v.created_at < (d.day + INTERVAL '1 day') AT TIME ZONE 'UTC') AS views,
              (SELECT COUNT(*)::int FROM likes l JOIN artworks a ON a.id = l.artwork_id
               WHERE a.user_id = $1 AND l.user_id <> $1 AND l.created_at >= d.day AT TIME ZONE 'UTC'
                 AND l.created_at < (d.day + INTERVAL '1 day') AT TIME ZONE 'UTC') AS likes,
              (SELECT COUNT(*)::int FROM follows f
               WHERE f.followee_id = $1 AND f.created_at >= d.day AT TIME ZONE 'UTC'
                 AND f.created_at < (d.day + INTERVAL '1 day') AT TIME ZONE 'UTC') AS followers
       FROM generate_series(($2::timestamptz AT TIME ZONE 'UTC'), ($3::timestamptz AT TIME ZONE 'UTC') - INTERVAL '1 day', INTERVAL '1 day') AS d(day)
       ORDER BY d.day`,
      [userId, range.start, range.end]
    ).then(r => r.rows),
    pool.query<CreatorAnalytics['sources'][number]>(
      `SELECT v.source, COUNT(*)::int AS views
       FROM artwork_views v JOIN artworks a ON a.id = v.artwork_id
       WHERE a.user_id = $1 AND v.created_at >= $2 AND v.created_at < $3
       GROUP BY v.source ORDER BY views DESC`,
      [userId, range.start, range.end]
    ).then(r => r.rows),
    pool.query<CreatorAnalytics['topArtworks'][number]>(
      `SELECT a.id, a.title,
              (SELECT COUNT(*)::int FROM artwork_views v WHERE v.artwork_id = a.id AND v.created_at >= $2 AND v.created_at < $3) AS views,
              (SELECT COUNT(*)::int FROM likes l WHERE l.artwork_id = a.id AND l.user_id <> $1 AND l.created_at >= $2 AND l.created_at < $3) AS likes,
              (SELECT COUNT(*)::int FROM comments c WHERE c.artwork_id = a.id AND c.user_id <> $1 AND c.created_at >= $2 AND c.created_at < $3) AS comments
       FROM artworks a WHERE a.user_id = $1
       ORDER BY views DESC, likes DESC, a.published_at DESC NULLS LAST
       LIMIT 10`,
      [userId, range.start, range.end]
    ).then(r => r.rows),
  ]);

  return { days, current, previous, allTime, daily, sources, topArtworks };
}
