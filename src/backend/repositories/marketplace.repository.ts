import { pool } from '../config/db.ts';
import { listedCondition } from './artworks.repository.ts';
import { imageRenderCondition } from './renders.repository.ts';
import { notBlockedCondition } from './moderation.repository.ts';

export type License = 'personal' | 'commercial' | 'editorial' | 'cc_by' | 'cc0';

export type ListingDTO = {
  id: string;
  artworkId: string;
  priceCents: number;
  currency: string;
  license: License;
  description: string | null;
  isActive: boolean;
  downloads: number;
  createdAt: string;
};

// A listing with its artwork, as shown on marketplace cards.
export type MarketplaceItem = ListingDTO & {
  title: string;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  username: string;
  avatarUrl: string | null;
  likeCount: number;
  viewCount: number;
  isMature: boolean;
  aiGenerated: boolean;
};

const LISTING_COLUMNS = `
  l.id, l.artwork_id AS "artworkId", l.price_cents AS "priceCents", l.currency, l.license,
  l.description, l.is_active AS "isActive", l.created_at AS "createdAt",
  (SELECT COUNT(*)::int FROM listing_downloads d WHERE d.listing_id = l.id) AS downloads`;

export async function findListingByArtwork(artworkId: string): Promise<(ListingDTO & { sellerId: string }) | null> {
  const { rows } = await pool.query<ListingDTO & { sellerId: string }>(
    `SELECT ${LISTING_COLUMNS}, l.seller_id AS "sellerId" FROM listings l WHERE l.artwork_id = $1`,
    [artworkId]
  );
  return rows[0] ?? null;
}

export async function findListing(id: string): Promise<(ListingDTO & { sellerId: string; modelPath: string; title: string }) | null> {
  const { rows } = await pool.query<ListingDTO & { sellerId: string; modelPath: string; title: string }>(
    `SELECT ${LISTING_COLUMNS}, l.seller_id AS "sellerId", a.model_path AS "modelPath", a.title
     FROM listings l JOIN artworks a ON a.id = l.artwork_id
     WHERE l.id = $1 AND ${listedCondition('a')}`,
    [id]
  );
  return rows[0] ?? null;
}

// Creates or updates the listing for an artwork.
export async function upsertListing(listing: {
  id: string;
  artworkId: string;
  sellerId: string;
  priceCents: number;
  currency: string;
  license: License;
  description: string | null;
  isActive: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO listings (id, artwork_id, seller_id, price_cents, currency, license, description, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (artwork_id) DO UPDATE
     SET price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency, license = EXCLUDED.license,
         description = EXCLUDED.description, is_active = EXCLUDED.is_active`,
    [listing.id, listing.artworkId, listing.sellerId, listing.priceCents, listing.currency,
      listing.license, listing.description, listing.isActive]
  );
}

export async function deleteListing(artworkId: string): Promise<void> {
  await pool.query('DELETE FROM listings WHERE artwork_id = $1', [artworkId]);
}

export async function recordDownload(listingId: string, userId: string): Promise<void> {
  await pool.query(
    'INSERT INTO listing_downloads (listing_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [listingId, userId]
  );
}

export type MarketplaceSort = 'newest' | 'popular' | 'price_asc' | 'price_desc';

export async function browseMarketplace(filters: {
  viewerId: string | null;
  hideAi: boolean;
  q?: string;
  price?: 'free' | 'paid';
  license?: string;
  sort: MarketplaceSort;
  limit: number;
  offset: number;
}): Promise<{ items: MarketplaceItem[]; hasMore: boolean }> {
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const conditions = ['l.is_active', listedCondition('a')];
  if (filters.viewerId) conditions.push(notBlockedCondition('a.user_id', param(filters.viewerId)));
  if (filters.hideAi) conditions.push('NOT a.ai_generated');
  if (filters.q) {
    const like = param(`%${filters.q}%`);
    conditions.push(`(a.title ILIKE ${like} OR l.description ILIKE ${like} OR ${param(filters.q.toLowerCase())} = ANY(a.tags))`);
  }
  if (filters.price === 'free') conditions.push('l.price_cents = 0');
  if (filters.price === 'paid') conditions.push('l.price_cents > 0');
  if (filters.license) conditions.push(`l.license = ${param(filters.license)}`);

  const order = {
    newest: 'l.created_at DESC',
    popular: 'downloads DESC, l.created_at DESC',
    price_asc: 'l.price_cents ASC, l.created_at DESC',
    price_desc: 'l.price_cents DESC, l.created_at DESC',
  }[filters.sort];

  const { rows } = await pool.query<MarketplaceItem>(
    `SELECT ${LISTING_COLUMNS},
            a.title, a.thumbnail_path AS "thumbnailUrl",
            (SELECT r.url FROM renders r WHERE r.artwork_id = a.id AND ${imageRenderCondition()} ORDER BY r.created_at LIMIT 1) AS "coverUrl",
            u.username, u.avatar_url AS "avatarUrl",
            (SELECT COUNT(*)::int FROM likes lk WHERE lk.artwork_id = a.id) AS "likeCount",
            a.view_count AS "viewCount", a.is_mature AS "isMature", a.ai_generated AS "aiGenerated"
     FROM listings l
     JOIN artworks a ON a.id = l.artwork_id
     JOIN users u ON u.id = a.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${order}, l.id
     LIMIT ${param(filters.limit + 1)} OFFSET ${param(filters.offset)}`,
    params
  );
  return { items: rows.slice(0, filters.limit), hasMore: rows.length > filters.limit };
}
