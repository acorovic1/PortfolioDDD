import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import { findUserByUsername } from '../repositories/users.repository.ts';
import { addFollow, removeFollow, listFollows, countFollows, isFollowing } from '../repositories/follows.repository.ts';
import { listedCondition } from '../repositories/artworks.repository.ts';
import { pool } from '../config/db.ts';
import { isBlockedEitherWay, blockState } from '../repositories/moderation.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { parsePagination } from '../utils/pagination.util.ts';

export async function followUser(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const target = await findUserByUsername(req.params.username as string);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === authReq.user!.id) {
    res.status(400).json({ error: "You can't follow yourself" });
    return;
  }
  if (await isBlockedEitherWay(authReq.user!.id, target.id)) {
    res.status(403).json({ error: "You can't follow this user" });
    return;
  }

  const isNew = await addFollow(authReq.user!.id, target.id);
  if (isNew) {
    await createNotification({
      id: uuidv4(),
      userId: target.id,
      actorUsername: authReq.user!.username,
      type: 'follow',
      message: `@${authReq.user!.username} started following you`,
    });
  }

  res.status(isNew ? 201 : 200).json({ isFollowing: true, ...(await countFollows(target.id)) });
}

export async function unfollowUser(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const target = await findUserByUsername(req.params.username as string);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await removeFollow(authReq.user!.id, target.id);
  res.json({ isFollowing: false, ...(await countFollows(target.id)) });
}

function followList(direction: 'followers' | 'following') {
  return async (req: Request, res: Response): Promise<void> => {
    const user = await findUserByUsername(req.params.username as string);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { limit, offset } = parsePagination(req.query);
    res.json({ users: await listFollows(user.id, direction, limit, offset) });
  };
}

export const listFollowers = followList('followers');
export const listFollowing = followList('following');

// Profile header numbers plus the caller's relationship to the profile.
export async function getProfileSummary(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const user = await findUserByUsername(req.params.username as string);
  if (!user || user.suspended_at) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const blocks = viewerId && viewerId !== user.id
    ? await blockState(viewerId, user.id)
    : { hasBlocked: false, isBlockedBy: false };
  if (blocks.isBlockedBy) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { rows } = await pool.query<{ artworks: number; views: number; likes: number }>(
    `SELECT COUNT(*)::int AS artworks,
            COALESCE(SUM(a.view_count), 0)::int AS views,
            COALESCE(SUM((SELECT COUNT(*) FROM likes l WHERE l.artwork_id = a.id)), 0)::int AS likes
     FROM artworks a
     WHERE a.user_id = $1 AND ${listedCondition('a')}`,
    [user.id]
  );

  res.json({
    username: user.username,
    noAiTraining: user.no_ai_training,
    availableForWork: user.available_for_work,
    workTypes: user.work_types ?? [],
    stats: { ...(await countFollows(user.id)), ...rows[0] },
    viewer: {
      isSelf: viewerId === user.id,
      isFollowing: viewerId && viewerId !== user.id ? await isFollowing(viewerId, user.id) : false,
      hasBlocked: blocks.hasBlocked,
    },
  });
}
