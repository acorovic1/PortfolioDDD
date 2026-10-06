import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { AuthRequest } from '../types.ts';
import { findFeed, findFeedFacets, type FeedTab } from '../repositories/feed.repository.ts';
import { findArtworkById, canViewArtwork } from '../repositories/artworks.repository.ts';
import { findUserById } from '../repositories/users.repository.ts';
import { recordView, VIEW_SOURCES, type ViewSource } from '../repositories/views.repository.ts';
import { parsePagination } from '../utils/pagination.util.ts';

const FEED_TABS: FeedTab[] = ['trending', 'latest', 'following'];

function queryString(value: unknown, maxLength = 100): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

// Signed-in viewers' content preferences; anonymous viewers see AI work.
async function viewerPreferences(viewerId: string | null): Promise<{ hideAi: boolean }> {
  if (!viewerId) return { hideAi: false };
  const viewer = await findUserById(viewerId);
  return { hideAi: viewer?.hide_ai ?? false };
}

export async function getFeed(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const tab = FEED_TABS.includes(req.query.tab as FeedTab) ? (req.query.tab as FeedTab) : 'trending';

  if (tab === 'following' && !viewerId) {
    res.status(401).json({ error: 'Sign in to see artworks from people you follow' });
    return;
  }

  const { limit, offset } = parsePagination(req.query);
  const feed = await findFeed({
    tab,
    viewerId,
    category: queryString(req.query.category),
    tag: queryString(req.query.tag, 32),
    tool: queryString(req.query.tool),
    q: queryString(req.query.q),
    hideAi: (await viewerPreferences(viewerId)).hideAi,
    limit,
    offset,
  });

  res.json(feed);
}

export async function getFeedFacets(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  res.json(await findFeedFacets({ viewerId, ...(await viewerPreferences(viewerId)) }));
}

// Anonymous viewers are told apart by a one-way hash of IP + user agent, so
// no raw IP is stored.
function viewerKey(req: Request): string {
  const userId = (req as AuthRequest).user?.id;
  if (userId) return userId;
  const fingerprint = `${req.ip ?? ''}|${req.headers['user-agent'] ?? ''}`;
  return `anon:${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 40)}`;
}

export async function recordArtworkView(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const artwork = await findArtworkById(req.params.artworkId as string);
  if (!artwork || !canViewArtwork(artwork, viewerId)) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  // Creators looking at their own work don't inflate their numbers.
  if (artwork.user_id === viewerId) {
    res.json({ counted: false, viewCount: artwork.view_count });
    return;
  }

  const source: ViewSource = VIEW_SOURCES.includes(req.body?.source) ? req.body.source : 'direct';
  const counted = await recordView(artwork.id, viewerKey(req), source);
  res.json({ counted, viewCount: artwork.view_count + (counted ? 1 : 0) });
}
