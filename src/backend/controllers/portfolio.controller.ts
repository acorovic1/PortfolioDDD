import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest, ArtworkRecord, CanvasSettings } from '../types.ts';
import {
  createArtwork,
  createImageArtwork,
  findArtworkById,
  findArtworksByUserId,
  reorderArtworks,
  isFlatKind,
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
import crypto from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import sharp from 'sharp';
import { MAX_POSTER_BYTES, MAX_RENDER_IMAGE_BYTES } from '../utils/upload.util.ts';
import { isVideoFileName, looksLikeVideo } from '../utils/video.util.ts';
import { enqueueModelJob } from '../pipeline/processor.ts';
import { takeStorageReservation } from '../services/storage-quota.ts';
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

// The upload's extension without the dot ('obj', 'zip', ...).
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

// The upload form's publishing choice: draft=true keeps it a draft;
// publishAt (ISO time) schedules it; otherwise it goes live right away (a
// model: as soon as it has processed). 'invalid' for an unreadable publishAt.
function publishedAtFromForm(draft: unknown, publishAt: unknown): Date | null | 'invalid' {
  if (draft === 'true') return null;
  if (!publishAt) return new Date();
  const when = new Date(String(publishAt));
  if (Number.isNaN(when.getTime())) return 'invalid';
  return when.getTime() > Date.now() ? when : new Date();
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

  const publishedAt = publishedAtFromForm(draft, publishAt);
  if (publishedAt === 'invalid') {
    await rm(file.path, { force: true });
    res.status(400).json({ error: 'publishAt must be a date and time' });
    return;
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
  enqueueModelJob({ artworkId: id, sourcePath: file.path, originalName: file.originalname, reservationId: takeStorageReservation(req) });

  const artwork = await findArtworkById(id);
  res.status(201).json(toArtworkDTO(artwork!, []));
}

const THUMBNAIL_SIZE = 640;

// A card-sized WebP of the image (a path, or its bytes), saved under
// uploads/thumbnails. Returns the file name; throws when the image can't be
// read.
async function makeThumbnail(source: string | Buffer): Promise<string> {
  const thumbnailName = `${crypto.randomUUID()}.webp`;
  const thumbnailPath = path.join('uploads', 'thumbnails', thumbnailName);
  await mkdir(path.dirname(thumbnailPath), { recursive: true });
  try {
    await sharp(source)
      .rotate()
      .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(thumbnailPath);
  } catch (error) {
    await rm(thumbnailPath, { force: true });
    throw error;
  }
  return thumbnailName;
}

// Creates a 2D artwork from an uploaded image. Nothing to convert: the image
// is stored as is (viewers can zoom in to its pixels), with a thumbnail for
// cards and feeds.
export async function createArtworkWithImage(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'Image file is required' });
    return;
  }

  const { title, description, year, category, tools, draft, publishAt, edge, medium } = req.body;
  const publishedAt = publishedAtFromForm(draft, publishAt);
  if (publishedAt === 'invalid') {
    await rm(file.path, { force: true });
    res.status(400).json({ error: 'publishAt must be a date and time' });
    return;
  }

  let width: number;
  let height: number;
  let thumbnailName: string;
  try {
    const metadata = await sharp(file.path).metadata();
    if (!metadata.width || !metadata.height) throw new Error('No size');
    // EXIF orientations 5-8 turn the image a quarter, so width and height swap.
    const turned = (metadata.orientation ?? 1) >= 5;
    width = turned ? metadata.height : metadata.width;
    height = turned ? metadata.width : metadata.height;
    thumbnailName = await makeThumbnail(file.path);
  } catch {
    await rm(file.path, { force: true });
    res.status(400).json({ error: 'The image could not be read' });
    return;
  }

  const canvas: CanvasSettings = {
    edge: edge || 'black',
    medium: medium || null,
  };

  const id = uuidv4();
  await createImageArtwork({
    id,
    userId: authReq.user!.id,
    title: title || 'Untitled',
    description: description || '',
    year: year || '',
    category: category || '',
    tools: parseTools(tools),
    imagePath: await persistUpload('images', file.filename, authReq.user!.id),
    imageWidth: width,
    imageHeight: height,
    thumbnailPath: await persistUpload('thumbnails', thumbnailName, authReq.user!.id),
    canvas,
    publishedAt,
  });
  // Live right away, unless it's a draft or scheduled.
  announceNewlyPublishedInBackground();

  const artwork = await findArtworkById(id);
  res.status(201).json(toArtworkDTO(artwork!, []));
}

// Creates a video artwork. The video is stored as uploaded (browsers play
// MP4/WebM themselves); its size, length and a poster frame come from the
// uploader's browser, which has already decoded it. The poster becomes the
// thumbnail.
export async function createArtworkWithVideo(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const video = files?.video?.[0];
  const poster = files?.poster?.[0];
  const discard = () => Promise.all([video, poster].map(f => (f ? rm(f.path, { force: true }) : undefined)));

  if (!video || !poster) {
    await discard();
    res.status(400).json({ error: 'A video file and its poster frame are required' });
    return;
  }

  const { title, description, year, category, tools, draft, publishAt, edge, medium, width, height, duration } = req.body;
  const publishedAt = publishedAtFromForm(draft, publishAt);
  if (publishedAt === 'invalid') {
    await discard();
    res.status(400).json({ error: 'publishAt must be a date and time' });
    return;
  }
  if (!(await looksLikeVideo(video.path))) {
    await discard();
    res.status(400).json({ error: 'The file is not an MP4 or WebM video' });
    return;
  }
  if (poster.size > MAX_POSTER_BYTES) {
    await discard();
    res.status(400).json({ error: 'The poster frame is too large' });
    return;
  }

  let thumbnailName: string;
  try {
    // From memory: sharp would keep the file open, and Windows can't delete
    // an open file.
    thumbnailName = await makeThumbnail(await readFile(poster.path));
  } catch {
    await discard();
    res.status(400).json({ error: 'The poster frame could not be read' });
    return;
  }
  await rm(poster.path, { force: true });

  const id = uuidv4();
  await createImageArtwork({
    id,
    userId: authReq.user!.id,
    title: title || 'Untitled',
    description: description || '',
    year: year || '',
    category: category || '',
    tools: parseTools(tools),
    kind: 'video',
    imagePath: await persistUpload('videos', video.filename, authReq.user!.id),
    imageWidth: Number(width),
    imageHeight: Number(height),
    videoDuration: Number(duration),
    thumbnailPath: await persistUpload('thumbnails', thumbnailName, authReq.user!.id),
    canvas: { edge: edge || 'black', medium: medium || null },
    publishedAt,
  });
  announceNewlyPublishedInBackground();

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

  if (isFlatKind(artwork.kind)) {
    await discardUpload();
    res.status(400).json({ error: 'A 2D or video artwork has no model to replace' });
    return;
  }

  const started = await startModelReprocessing(artworkId, file.path, uploadFormat(file));
  if (!started) {
    await discardUpload();
    res.status(409).json({ error: 'A previous upload for this artwork is still processing' });
    return;
  }
  enqueueModelJob({ artworkId, sourcePath: file.path, originalName: file.originalname, reservationId: takeStorageReservation(req) });

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

  // A 2D or video artwork's thumbnail is made when it's uploaded.
  if (isFlatKind(artwork.kind)) {
    await rm(file.path, { force: true });
    res.status(400).json({ error: 'A 2D artwork already has a thumbnail' });
    return;
  }

  const thumbnailUrl = await persistUpload('thumbnails', file.filename, authReq.user!.id);
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

  const { title, description, year, category, tools, tags, visibility, publishedAt, isMature, aiGenerated, viewerSettings, modelRotation, canvas } = req.body;
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
    // Only 2D and video artworks have a canvas.
    canvas: isFlatKind(artwork.kind) ? canvas : undefined,
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
  await deleteStoredFile(artwork.image_path);
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
    res.status(400).json({ error: 'Image or video file is required' });
    return;
  }

  // Images and videos share the upload's (video-sized) limit.
  const isVideo = isVideoFileName(file.filename);
  if (isVideo && !(await looksLikeVideo(file.path))) {
    await rm(file.path, { force: true });
    res.status(400).json({ error: 'The file is not an MP4 or WebM video' });
    return;
  }
  if (!isVideo && (await stat(file.path)).size > MAX_RENDER_IMAGE_BYTES) {
    await rm(file.path, { force: true });
    res.status(400).json({ error: `Images can be at most ${MAX_RENDER_IMAGE_BYTES / 1024 / 1024} MB` });
    return;
  }

  const id = uuidv4();
  const url = await persistUpload('renders', file.filename, authReq.user!.id);
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
