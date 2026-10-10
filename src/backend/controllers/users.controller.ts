import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import type { AuthRequest } from '../types.ts';
import {
  searchUsers,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  updateUserProfile,
  updateUsername as updateUsernameRepo,
  updateEmail as updateEmailRepo,
  updatePasswordHash,
  deleteUser,
  toPublicUser,
} from '../repositories/users.repository.ts';
import {
  findArtworksByUserId,
  findArtworkById,
  canViewArtwork,
  searchArtworks as searchArtworksRepo,
} from '../repositories/artworks.repository.ts';
import { countFollows, isFollowing } from '../repositories/follows.repository.ts';
import type { ArtworkRecord } from '../types.ts';
import { findRendersByArtworkIds } from '../repositories/renders.repository.ts';
import { toArtworkDTO } from '../repositories/artworks.repository.ts';
import { countLikesForArtworkIds } from '../repositories/likes.repository.ts';
import { persistUpload, deleteStoredFile } from '../storage/storage.ts';
import { parsePagination } from '../utils/pagination.util.ts';
import { clearNoAiCache } from '../middleware/noai.middleware.ts';
import { blockState } from '../repositories/moderation.repository.ts';

export async function search(req: Request, res: Response): Promise<void> {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    res.json({ users: [] });
    return;
  }

  const { limit, offset } = parsePagination(req.query);
  const users = await searchUsers(q, limit, offset);
  res.json({ users });
}

export async function getPublicPortfolio(req: Request, res: Response): Promise<void> {
  const username = req.params.username as string;

  const user = await findUserByUsername(username);
  const viewerId = (req as AuthRequest).user?.id ?? null;
  // Suspended accounts, and people who blocked the viewer, aren't viewable.
  const hidden = !user || user.suspended_at !== null
    || (viewerId !== null && viewerId !== user.id && (await blockState(viewerId, user.id)).isBlockedBy);
  if (hidden) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // `all=true` skips pagination entirely - used to rebuild another user's
  // full 3D scene, which (like the owner's own) must never be truncated.
  const wantsAll = req.query.all === 'true';
  let artworks: ArtworkRecord[];
  if (wantsAll) {
    artworks = await findArtworksByUserId(user.id, undefined, undefined, { viewableOnly: true });
  } else {
    const { limit, offset } = parsePagination(req.query);
    artworks = await findArtworksByUserId(user.id, limit, offset, { viewableOnly: true });
  }

  // An unlisted artwork isn't in listings, but a link to it (?artwork=id)
  // must still open it on the profile.
  const linkedId = typeof req.query.artwork === 'string' ? req.query.artwork : null;
  if (linkedId && !artworks.some(a => a.id === linkedId)) {
    const linked = await findArtworkById(linkedId);
    if (linked && linked.user_id === user.id && canViewArtwork(linked, viewerId)) artworks.push(linked);
  }

  const rendersByArtwork = await findRendersByArtworkIds(artworks.map(a => a.id));
  const likeCounts = await countLikesForArtworkIds(artworks.map(a => a.id));
  const follows = await countFollows(user.id);

  const publicUser = toPublicUser(user);
  res.json({
    user: {
      username: publicUser.username,
      name: publicUser.name,
      avatarUrl: publicUser.avatarUrl,
      title: publicUser.title,
      bio: publicUser.bio,
      location: publicUser.location,
      github: publicUser.github,
      linkedin: publicUser.linkedin,
      skills: publicUser.skills,
      noAiTraining: publicUser.noAiTraining,
      coverUrl: publicUser.coverUrl,
      website: publicUser.website,
      socialLinks: publicUser.socialLinks,
      availableForWork: publicUser.availableForWork,
      workTypes: publicUser.workTypes,
      experience: publicUser.experience,
    },
    stats: {
      followers: follows.followers,
      following: follows.following,
      artworks: artworks.length,
      views: artworks.reduce((sum, a) => sum + a.view_count, 0),
      likes: [...likeCounts.values()].reduce((sum, n) => sum + n, 0),
    },
    viewer: {
      isSelf: viewerId === user.id,
      isFollowing: viewerId && viewerId !== user.id ? await isFollowing(viewerId, user.id) : false,
    },
    artworks: artworks.map(a => toArtworkDTO(a, rendersByArtwork.get(a.id) ?? [], likeCounts.get(a.id) ?? 0)),
  });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const {
    name, avatarUrl, title, bio, location, github, linkedin, skills, showMature, hideAi, noAiTraining,
    website, socialLinks, availableForWork, workTypes, experience,
  } = req.body;

  // Empty social links are dropped rather than stored as "".
  const links = socialLinks === undefined
    ? undefined
    : Object.fromEntries(Object.entries(socialLinks as Record<string, string>).filter(([, url]) => url));

  await updateUserProfile(authReq.user!.id, {
    name, avatarUrl, title, bio, location, github, linkedin, skills, showMature, hideAi, noAiTraining,
    website, socialLinks: links, availableForWork, workTypes, experience,
  });
  // Uploads' X-Robots-Tag headers depend on the NoAI flag.
  if (noAiTraining !== undefined) clearNoAiCache();

  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}

export async function changeUsername(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { username } = req.body;

  const existing = await findUserByUsername(username);
  if (existing && existing.id !== authReq.user!.id) {
    res.status(400).json({ error: 'Username is already taken' });
    return;
  }

  await updateUsernameRepo(authReq.user!.id, username);
  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}

export async function changeEmail(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { email } = req.body;

  const existing = await findUserByEmail(email);
  if (existing && existing.id !== authReq.user!.id) {
    res.status(400).json({ error: 'Email is already in use' });
    return;
  }

  await updateEmailRepo(authReq.user!.id, email);
  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { currentPassword, newPassword } = req.body;

  const user = await findUserById(authReq.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!validPassword) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await updatePasswordHash(user.id, newHash);
  res.json({ success: true });
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { password } = req.body;

  const user = await findUserById(authReq.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    res.status(401).json({ error: 'Password is incorrect' });
    return;
  }

  const artworks = await findArtworksByUserId(user.id);
  const rendersByArtwork = await findRendersByArtworkIds(artworks.map(a => a.id));

  // Delete the DB row first (cascades artworks/renders/comments/likes/collections),
  // then clean up the files those rows referenced on disk.
  await deleteUser(user.id);

  const filesToDelete = [
    ...(user.avatar_url ? [user.avatar_url] : []),
    ...(user.cover_url ? [user.cover_url] : []),
    ...artworks.map(a => a.model_path),
    ...artworks.map(a => a.thumbnail_path),
    ...[...rendersByArtwork.values()].flat().map(r => r.url),
  ];
  await Promise.all(filesToDelete.map(f => deleteStoredFile(f)));

  res.json({ success: true });
}

export async function searchArtworks(req: Request, res: Response): Promise<void> {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.length < 2) {
    res.json({ artworks: [] });
    return;
  }

  const { limit, offset } = parsePagination(req.query);
  const artworks = await searchArtworksRepo(q, limit, offset);
  res.json({ artworks });
}

export async function uploadCover(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const previous = await findUserById(authReq.user!.id);
  await updateUserProfile(authReq.user!.id, { coverUrl: await persistUpload('covers', file.filename) });
  await deleteStoredFile(previous?.cover_url);

  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const avatarUrl = await persistUpload('avatars', file.filename);
  await updateUserProfile(authReq.user!.id, { avatarUrl });

  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}
