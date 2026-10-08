import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import { findArtworkById, canViewArtwork } from '../repositories/artworks.repository.ts';
import { findUserById } from '../repositories/users.repository.ts';
import { isBlockedEitherWay } from '../repositories/moderation.repository.ts';
import { sendMessage } from '../repositories/messages.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import {
  findListingByArtwork,
  findListing,
  upsertListing,
  deleteListing,
  recordDownload,
  browseMarketplace,
  type MarketplaceSort,
} from '../repositories/marketplace.repository.ts';
import { parsePagination } from '../utils/pagination.util.ts';

const SORTS: MarketplaceSort[] = ['newest', 'popular', 'price_asc', 'price_desc'];

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export async function getMarketplace(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const viewer = viewerId ? await findUserById(viewerId) : null;
  const { limit, offset } = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

  res.json(await browseMarketplace({
    viewerId,
    hideAi: viewer?.hide_ai ?? false,
    q: q || undefined,
    price: req.query.price === 'free' || req.query.price === 'paid' ? req.query.price : undefined,
    license: typeof req.query.license === 'string' && req.query.license ? req.query.license : undefined,
    sort: SORTS.includes(req.query.sort as MarketplaceSort) ? (req.query.sort as MarketplaceSort) : 'newest',
    limit,
    offset,
  }));
}

// The listing for one artwork (shown on the artwork page), or null - most
// artworks aren't for sale, so that's a normal answer rather than a 404.
export async function getArtworkListing(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const artwork = await findArtworkById(req.params.artworkId as string);
  const listing = artwork && canViewArtwork(artwork, viewerId)
    ? await findListingByArtwork(artwork.id)
    : null;
  // Inactive listings are only shown to their seller.
  if (!listing || (!listing.isActive && listing.sellerId !== viewerId)) {
    res.json(null);
    return;
  }
  const { sellerId, ...dto } = listing;
  res.json({ ...dto, isSeller: sellerId === viewerId });
}

export async function saveArtworkListing(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthRequest).user!.id;
  const artwork = await findArtworkById(req.params.artworkId as string);
  if (!artwork || artwork.user_id !== userId) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  const existing = await findListingByArtwork(artwork.id);
  const { priceCents, currency, license, description, isActive } = req.body;
  await upsertListing({
    id: existing?.id ?? uuidv4(),
    artworkId: artwork.id,
    sellerId: userId,
    priceCents,
    currency: currency ?? 'USD',
    license,
    description: description?.trim() || null,
    isActive: isActive ?? true,
  });

  const { sellerId, ...listing } = (await findListingByArtwork(artwork.id))!;
  res.json({ ...listing, isSeller: sellerId === userId });
}

export async function removeArtworkListing(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthRequest).user!.id;
  const artwork = await findArtworkById(req.params.artworkId as string);
  if (!artwork || artwork.user_id !== userId) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }
  await deleteListing(artwork.id);
  res.json({ success: true });
}

// Free listings: returns the model file (and counts the download).
export async function downloadListing(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthRequest).user!.id;
  const listing = await findListing(req.params.listingId as string);
  if (!listing || !listing.isActive) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }
  if (listing.priceCents > 0 && listing.sellerId !== userId) {
    res.status(402).json({ error: 'This is a paid asset - request a purchase from the seller' });
    return;
  }
  await recordDownload(listing.id, userId);
  res.json({ url: listing.modelPath, fileName: `${listing.title || 'model'}.glb` });
}

// Paid listings: there's no payment processor wired up, so buying starts a
// conversation with the seller (who arranges payment and sends the file).
export async function requestPurchase(req: Request, res: Response): Promise<void> {
  const buyer = (req as AuthRequest).user!;
  const listing = await findListing(req.params.listingId as string);
  if (!listing || !listing.isActive) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }
  if (listing.sellerId === buyer.id) {
    res.status(400).json({ error: "That's your own listing" });
    return;
  }
  if (await isBlockedEitherWay(buyer.id, listing.sellerId)) {
    res.status(403).json({ error: "You can't buy from this seller" });
    return;
  }

  const note = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
  await sendMessage({
    senderId: buyer.id,
    recipientId: listing.sellerId,
    body: `I'd like to buy "${listing.title}" (${formatPrice(listing.priceCents, listing.currency)}, ${listing.license} license).${note ? `\n\n${note}` : ''}`,
    kind: 'message',
  });
  await createNotification({
    id: uuidv4(),
    userId: listing.sellerId,
    actorUsername: buyer.username,
    type: 'message',
    message: `@${buyer.username} wants to buy "${listing.title}"`,
  });
  res.status(201).json({ success: true });
}
