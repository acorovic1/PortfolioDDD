import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import { findLikedArtworkIds, addLike, removeLike } from '../repositories/likes.repository.ts';
import { findArtworkById, canViewArtwork } from '../repositories/artworks.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';

export async function listMyLikes(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkIds = await findLikedArtworkIds(authReq.user!.id);
  res.json(artworkIds);
}

export async function likeArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  const artwork = await findArtworkById(artworkId);
  if (!artwork || !canViewArtwork(artwork, authReq.user!.id)) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  await addLike(authReq.user!.id, artworkId);

  if (artwork.user_id !== authReq.user!.id) {
    await createNotification({
      id: uuidv4(),
      userId: artwork.user_id,
      actorUsername: authReq.user!.username,
      type: 'like',
      message: `@${authReq.user!.username} liked your artwork "${artwork.title}"`,
      artworkId,
    });
  }

  res.status(201).json({ success: true });
}

export async function unlikeArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  await removeLike(authReq.user!.id, artworkId);
  res.json({ success: true });
}
