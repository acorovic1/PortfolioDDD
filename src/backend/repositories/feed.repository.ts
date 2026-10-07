import { pool } from '../config/db.ts';
import { listedCondition } from './artworks.repository.ts';
import { notBlockedCondition } from './moderation.repository.ts';

export type FeedTab = 'trending' | 'latest' | 'following';

export type FeedQuery = {
  tab: FeedTab;
  viewerId: string | null;
  category?: string;
  tag?: string;
  tool?: string;
  q?: string;
  hideAi: boolean;
  limit: number;
  offset: number;
};

export type FeedArtwork = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  name: string;
  avatarUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
  publishedAt: string;
};

// Engagement over the last week, decayed by age: a steady stream of fresh
// likes/comments/views beats a big total from long ago.
const TRENDING_SCORE = `
  (
    (SELECT COUNT(*) FROM likes l WHERE l.artwork_id = a.id AND l.created_at > NOW() - INTERVAL '7 days') * 4
    + (SELECT COUNT(*) FROM comments c WHERE c.artwork_id = a.id AND c.created_at > NOW() - INTERVAL '7 days') * 3
    + (SELECT COUNT(*) FROM artwork_views v WHERE v.artwork_id = a.id AND v.created_at > NOW() - INTERVAL '7 days')
    + 1
  ) / POWER(EXTRACT(EPOCH FROM (NOW() - a.published_at)) / 3600 + 2, 0.8)`;

// Filters shared by the feed and the filter facets: what any viewer may see,
// minus what this viewer opted out of.
type AddParam = (value: unknown) => string;

function paramList(): { params: unknown[]; param: AddParam } {
  const params: unknown[] = [];
  return {
    params,
    param: (value) => {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

function baseConditions(query: Pick<FeedQuery, 'viewerId' | 'hideAi'>, param: AddParam): string[] {
  const conditions = [listedCondition('a')];
  if (query.hideAi) conditions.push('NOT a.ai_generated');
  if (query.viewerId) conditions.push(notBlockedCondition('a.user_id', param(query.viewerId)));
  return conditions;
}

export async function findFeed(query: FeedQuery): Promise<{ artworks: FeedArtwork[]; hasMore: boolean }> {
  const { params, param } = paramList();
  const conditions = baseConditions(query, param);

  if (query.tab === 'following') {
    if (!query.viewerId) return { artworks: [], hasMore: false };
    conditions.push(`a.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ${param(query.viewerId)})`);
  }
  if (query.category) conditions.push(`LOWER(a.category) = LOWER(${param(query.category)})`);
  if (query.tag) conditions.push(`${param(query.tag.toLowerCase())} = ANY(a.tags)`);
  if (query.tool) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(a.tools, '[]'::jsonb)) AS t(tool)
      WHERE LOWER(t.tool) = LOWER(${param(query.tool)})
    )`);
  }
  if (query.q) {
    const like = param(`%${query.q}%`);
    conditions.push(`(a.title ILIKE ${like} OR a.description ILIKE ${like} OR u.username ILIKE ${like})`);
  }

  const order = query.tab === 'trending'
    ? `${TRENDING_SCORE} DESC, a.published_at DESC, a.id DESC`
    : 'a.published_at DESC, a.id DESC';

  // One extra row tells whether there's another page.
  const { rows } = await pool.query<FeedArtwork>(
    `SELECT a.id, a.title, COALESCE(a.category, '') AS category, a.tags,
            a.thumbnail_path AS "thumbnailUrl",
            (SELECT r.url FROM renders r WHERE r.artwork_id = a.id ORDER BY r.created_at LIMIT 1) AS "coverUrl",
            u.username, u.name, u.avatar_url AS "avatarUrl",
            (SELECT COUNT(*)::int FROM likes l WHERE l.artwork_id = a.id) AS "likeCount",
            (SELECT COUNT(*)::int FROM comments c WHERE c.artwork_id = a.id) AS "commentCount",
            a.view_count AS "viewCount", a.is_mature AS "isMature", a.ai_generated AS "aiGenerated",
            a.published_at AS "publishedAt"
     FROM artworks a
     JOIN users u ON u.id = a.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${order}
     LIMIT ${param(query.limit + 1)} OFFSET ${param(query.offset)}`,
    params
  );

  return { artworks: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
}

export type FeedFacets = {
  categories: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  tools: { name: string; count: number }[];
};

// The most used categories/tags/tools across listed artworks, for the
// explore page's filter chips.
export async function findFeedFacets(query: Pick<FeedQuery, 'viewerId' | 'hideAi'>): Promise<FeedFacets> {
  const { params, param } = paramList();
  const where = baseConditions(query, param).join(' AND ');

  const [categories, tags, tools] = await Promise.all([
    pool.query<{ name: string; count: number }>(
      `SELECT MIN(a.category) AS name, COUNT(*)::int AS count
       FROM artworks a JOIN users u ON u.id = a.user_id
       WHERE ${where} AND COALESCE(a.category, '') <> ''
       GROUP BY LOWER(a.category) ORDER BY count DESC LIMIT 20`,
      params
    ),
    pool.query<{ name: string; count: number }>(
      `SELECT tag AS name, COUNT(*)::int AS count
       FROM artworks a JOIN users u ON u.id = a.user_id, unnest(a.tags) AS tag
       WHERE ${where}
       GROUP BY tag ORDER BY count DESC, tag LIMIT 30`,
      params
    ),
    pool.query<{ name: string; count: number }>(
      `SELECT MIN(t.tool) AS name, COUNT(*)::int AS count
       FROM artworks a JOIN users u ON u.id = a.user_id,
            jsonb_array_elements_text(COALESCE(a.tools, '[]'::jsonb)) AS t(tool)
       WHERE ${where} AND t.tool <> ''
       GROUP BY LOWER(t.tool) ORDER BY count DESC LIMIT 20`,
      params
    ),
  ]);

  return { categories: categories.rows, tags: tags.rows, tools: tools.rows };
}
