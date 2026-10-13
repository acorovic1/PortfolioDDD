import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest, ArtworkRecord } from '../types.ts';
import {
  createArtwork,
  findArtworkById,
  findArtworksByUserId,
  reorderArtworks,
  findArtworksByIds,
  updateArtwork,
  deleteArtwork,
  toArtworkDTO,
  startModelReprocessing,
  setThumbnail,
  canViewArtwork,
} from '../repositories/artworks.repository.ts';
import {
  createRender,
  deleteRender,
  findRendersByArtworkId,
  findRendersByArtworkIds,
  toRenderDTO,
} from '../repositories/renders.repository.ts';
import { countLikes, countLikesForArtworkIds } from '../repositories/likes.repository.ts';
import { persistUpload, deleteStoredFile } from '../storage/storage.ts';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { enqueueModelJob } from '../pipeline/processor.ts';
import { announceNewlyPublishedInBackground } from '../services/publisher.ts';

// Tags are stored normalized ("Hard Surface" / "#hard-surface" -> "hard-surface")
// so filtering by them is exact and case-insensitive.
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map(tag => tag.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter(tag => tag.length > 0)
    .map(tag => tag.slice(0, 32));
  return [...new Set(normalized)].slice(0, 15);
}

// The upload's extension without the dot ('fbx', 'zip', ...).
function uploadFormat(file: Express.Multer.File): string {
  return path.extname(file.originalname).toLowerCase().slice(1);
}

function parseTools(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export async function listOwnArtworks(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworks = await findArtworksByUserId(authReq.user!.id);
  const rendersByArtwork = await findRendersByArtworkIds(artworks.map(a => a.id));
  const likeCounts = await countLikesForArtworkIds(artworks.map(a => a.id));

  res.json(artworks.map(a => toArtworkDTO(a, rendersByArtwork.get(a.id) ?? [], likeCounts.get(a.id) ?? 0)));
}

// Resolves artworks by id across all users (e.g. someone's liked-posts or
// saved-collection list, which can reference artworks other than their own),
// each annotated with its owner's username and current like count. Artworks
// the caller may not open (other people's drafts, scheduled or private work)
// are left out, as if they didn't exist.
export async function listArtworksByIds(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const idsParam = req.query.ids;
  const ids = typeof idsParam === 'string'
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const artworks = (await findArtworksByIds(ids)).filter(a => canViewArtwork(a, viewerId));
  const rendersByArtwork = await findRendersByArtworkIds(artworks.map(a => a.id));
  const likeCounts = await countLikesForArtworkIds(artworks.map(a => a.id));

  res.json(artworks.map(a => toArtworkDTO(a, rendersByArtwork.get(a.id) ?? [], likeCounts.get(a.id) ?? 0, a.username)));
}

export async function createArtworkWithModel(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'Model file is required' });
    return;
  }

  const { title, description, year, category, tools, draft, publishAt } = req.body;
  const id = uuidv4();

  // draft=true keeps it a draft; publishAt (ISO time) schedules it; otherwise
  // it goes live as soon as it has processed.
  let publishedAt: Date | null = new Date();
  if (draft === 'true') {
    publishedAt = null;
  } else if (publishAt) {
    const when = new Date(String(publishAt));
    if (Number.isNaN(when.getTime())) {
      await rm(file.path, { force: true });
      res.status(400).json({ error: 'publishAt must be a date and time' });
      return;
    }
    if (when.getTime() > Date.now()) publishedAt = when;
  }

  // The artwork exists right away (status 'processing'); the upload is
  // converted/optimized in the background - poll GET .../status for the result.
  await createArtwork({
    id,
    userId: authReq.user!.id,
    title: title || 'Untitled',
    description: description || '',
    year: year || '',
    category: category || '',
    tools: parseTools(tools),
    pendingSourcePath: file.path,
    sourceFormat: uploadFormat(file),
    publishedAt,
  });
  enqueueModelJob({ artworkId: id, sourcePath: file.path, originalName: file.originalname });

  const artwork = await findArtworkById(id);
  res.status(201).json(toArtworkDTO(artwork!, []));
}

// Uploads a new version of an artwork's model. The current model keeps being
// served until the new one is ready, and likes/comments/renders stay put.
export async function replaceArtworkModel(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;
  const file = req.file;

  const discardUpload = () => (file ? rm(file.path, { force: true }) : Promise.resolve());

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    await discardUpload();
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'Model file is required' });
    return;
  }

  const started = await startModelReprocessing(artworkId, file.path, uploadFormat(file));
  if (!started) {
    await discardUpload();
    res.status(409).json({ error: 'A previous upload for this artwork is still processing' });
    return;
  }
  enqueueModelJob({ artworkId, sourcePath: file.path, originalName: file.originalname });

  const updated = await findArtworkById(artworkId);
  const renders = await findRendersByArtworkId(artworkId);
  const likeCount = await countLikes(artworkId);
  res.status(202).json(toArtworkDTO(updated!, renders, likeCount));
}

// Lightweight polling endpoint for an upload's processing state.
export async function getArtworkStatus(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  const renders = await findRendersByArtworkId(artworkId);
  const likeCount = await countLikes(artworkId);
  res.json(toArtworkDTO(artwork, renders, likeCount));
}

// Stores a preview image of the model, rendered client-side once the model
// has processed (used for cards in liked/saved lists).
export async function uploadArtworkThumbnail(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;
  const file = req.file;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    if (file) await rm(file.path, { force: true });
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const thumbnailUrl = await persistUpload('thumbnails', file.filename);
  const previous = await setThumbnail(artworkId, thumbnailUrl);
  await deleteStoredFile(previous);

  res.json({ thumbnailUrl });
}

async function assertOwnedArtwork(userId: string, artworkId: string) {
  const artwork = await findArtworkById(artworkId);
  if (!artwork || artwork.user_id !== userId) return null;
  return artwork;
}

export async function updateOwnArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  const { title, description, year, category, tools, tags, visibility, publishedAt, isMature, aiGenerated, viewerSettings, modelRotation } = req.body;
  await updateArtwork(artworkId, {
    title,
    description,
    year,
    category,
    tools: tools !== undefined ? parseTools(tools) : undefined,
    tags: tags !== undefined ? normalizeTags(tags) : undefined,
    visibility,
    publishedAt,
    isMature,
    aiGenerated,
    viewerSettings,
    modelRotation,
  });

  // Publishing (now, or by making it public) may have put it live.
  if (publishedAt !== undefined || visibility !== undefined) announceNewlyPublishedInBackground();

  const updated = await findArtworkById(artworkId);
  const renders = await findRendersByArtworkId(artworkId);
  const likeCount = await countLikes(artworkId);
  res.json(toArtworkDTO(updated!, renders, likeCount));
}

// Saves the order of the user's artworks (dragged around in edit mode).
export async function reorderOwnArtworks(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const ok = await reorderArtworks(authReq.user!.id, req.body.artworkIds);
  if (!ok) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }
  res.json({ success: true });
}

export async function deleteOwnArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  await deleteArtworkWithFiles(artwork);
  res.json({ success: true });
}

// Deletes the artwork row (cascading likes/comments/renders) and its files.
// Shared with moderation, which can remove artworks too.
export async function deleteArtworkWithFiles(artwork: ArtworkRecord): Promise<void> {
  const renders = await findRendersByArtworkId(artwork.id);
  await deleteArtwork(artwork.id);

  await deleteStoredFile(artwork.model_path);
  await deleteStoredFile(artwork.thumbnail_path);
  await Promise.all(renders.map(r => deleteStoredFile(r.url)));
}

export async function addRender(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;
  const file = req.file;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const id = uuidv4();
  const url = await persistUpload('renders', file.filename);
  const caption = req.body.caption || 'Untitled';

  await createRender({ id, artworkId, url, caption });
  res.status(201).json(toRenderDTO({ id, artwork_id: artworkId, url, caption, created_at: new Date().toISOString() }));
}

export async function removeRender(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;
  const renderId = req.params.renderId as string;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  const renders = await findRendersByArtworkId(artworkId);
  const render = renders.find(r => r.id === renderId);

  const deleted = await deleteRender(renderId, artworkId);
  if (!deleted) {
    res.status(404).json({ error: 'Render not found' });
    return;
  }

  if (render) await deleteStoredFile(render.url);

  res.json({ success: true });
}
