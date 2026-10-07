import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import {
  findCommentsByArtworkId,
  findCommentById,
  createComment,
  deleteComment,
  toCommentDTO,
} from '../repositories/comments.repository.ts';
import { findArtworkById, canViewArtwork } from '../repositories/artworks.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { isBlockedEitherWay, findBlockRelations } from '../repositories/moderation.repository.ts';

export async function listComments(req: Request, res: Response): Promise<void> {
  const artworkId = req.params.artworkId as string;

  const artwork = await findArtworkById(artworkId);
  if (!artwork || !canViewArtwork(artwork, (req as AuthRequest).user?.id ?? null)) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  // Comments to and from people the viewer blocked (or who blocked them)
  // aren't shown.
  const viewerId = (req as AuthRequest).user?.id;
  const hidden = viewerId ? await findBlockRelations(viewerId) : new Set<string>();
  const comments = await findCommentsByArtworkId(artworkId);
  res.json(comments.filter(c => !hidden.has(c.user_id)).map(toCommentDTO));
}

export async function addComment(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;
  const { text } = req.body;

  const artwork = await findArtworkById(artworkId);
  if (!artwork || !canViewArtwork(artwork, authReq.user!.id)) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  if (await isBlockedEitherWay(authReq.user!.id, artwork.user_id)) {
    res.status(403).json({ error: "You can't comment on this artwork" });
    return;
  }

  const id = uuidv4();
  await createComment({ id, artworkId, userId: authReq.user!.id, text });

  if (artwork.user_id !== authReq.user!.id) {
    await createNotification({
      id: uuidv4(),
      userId: artwork.user_id,
      actorUsername: authReq.user!.username,
      type: 'comment',
      message: `@${authReq.user!.username} commented on your artwork "${artwork.title}"`,
      artworkId,
    });
  }

  const comment = await findCommentById(id);
  res.status(201).json(toCommentDTO(comment!));
}

export async function removeComment(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const commentId = req.params.commentId as string;

  const comment = await findCommentById(commentId);
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  const artwork = await findArtworkById(comment.artwork_id);
  const isCommentAuthor = comment.user_id === authReq.user!.id;
  const isArtworkOwner = artwork?.user_id === authReq.user!.id;

  if (!isCommentAuthor && !isArtworkOwner) {
    res.status(403).json({ error: 'Not allowed to delete this comment' });
    return;
  }

  await deleteComment(commentId);
  res.json({ success: true });
}
