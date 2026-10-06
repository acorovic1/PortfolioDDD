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
import { findArtworksByUserId, searchArtworks as searchArtworksRepo } from '../repositories/artworks.repository.ts';
import { findRendersByArtworkIds } from '../repositories/renders.repository.ts';
import { toArtworkDTO } from '../repositories/artworks.repository.ts';
import { countLikesForArtworkIds } from '../repositories/likes.repository.ts';
import { toPublicPath, deletePublicFile } from '../utils/upload.util.ts';
import { parsePagination } from '../utils/pagination.util.ts';

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
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // `all=true` skips pagination entirely - used to rebuild another user's
  // full 3D scene, which (like the owner's own) must never be truncated.
  const wantsAll = req.query.all === 'true';
  let artworks;
  if (wantsAll) {
    artworks = await findArtworksByUserId(user.id, undefined, undefined, { viewableOnly: true });
  } else {
    const { limit, offset } = parsePagination(req.query);
    artworks = await findArtworksByUserId(user.id, limit, offset, { viewableOnly: true });
  }
  const rendersByArtwork = await findRendersByArtworkIds(artworks.map(a => a.id));
  const likeCounts = await countLikesForArtworkIds(artworks.map(a => a.id));

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
    },
    artworks: artworks.map(a => toArtworkDTO(a, rendersByArtwork.get(a.id) ?? [], likeCounts.get(a.id) ?? 0)),
  });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { name, avatarUrl, title, bio, location, github, linkedin, skills } = req.body;

  await updateUserProfile(authReq.user!.id, { name, avatarUrl, title, bio, location, github, linkedin, skills });

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
    ...artworks.map(a => a.model_path),
    ...artworks.map(a => a.thumbnail_path),
    ...[...rendersByArtwork.values()].flat().map(r => r.url),
  ];
  await Promise.all(filesToDelete.map(f => deletePublicFile(f)));

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

export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const avatarUrl = toPublicPath('avatars', file.filename);
  await updateUserProfile(authReq.user!.id, { avatarUrl });

  const user = await findUserById(authReq.user!.id);
  res.json(toPublicUser(user!));
}
