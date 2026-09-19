import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import {
  createArtwork,
  findArtworkById,
  findArtworksByUserId,
  findArtworksByIds,
  updateArtwork,
  deleteArtwork,
  toArtworkDTO,
} from '../repositories/artworks.repository.ts';
import {
  createRender,
  deleteRender,
  findRendersByArtworkId,
  findRendersByArtworkIds,
  toRenderDTO,
} from '../repositories/renders.repository.ts';
import { countLikes, countLikesForArtworkIds } from '../repositories/likes.repository.ts';
import { toPublicPath, deletePublicFile } from '../utils/upload.util.ts';

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
// each annotated with its owner's username and current like count.
export async function listArtworksByIds(req: Request, res: Response): Promise<void> {
  const idsParam = req.query.ids;
  const ids = typeof idsParam === 'string'
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const artworks = await findArtworksByIds(ids);
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

  const { title, description, year, category, tools } = req.body;
  const id = uuidv4();
  const modelPath = toPublicPath('models', file.filename);

  await createArtwork({
    id,
    userId: authReq.user!.id,
    title: title || 'Untitled',
    description: description || '',
    year: year || '',
    category: category || '',
    tools: parseTools(tools),
    modelPath,
  });

  const artwork = await findArtworkById(id);
  res.status(201).json(toArtworkDTO(artwork!, []));
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

  const { title, description, year, category, tools } = req.body;
  await updateArtwork(artworkId, {
    title,
    description,
    year,
    category,
    tools: tools !== undefined ? parseTools(tools) : undefined,
  });

  const updated = await findArtworkById(artworkId);
  const renders = await findRendersByArtworkId(artworkId);
  const likeCount = await countLikes(artworkId);
  res.json(toArtworkDTO(updated!, renders, likeCount));
}

export async function deleteOwnArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const artworkId = req.params.artworkId as string;

  const artwork = await assertOwnedArtwork(authReq.user!.id, artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  const renders = await findRendersByArtworkId(artworkId);
  await deleteArtwork(artworkId);

  await deletePublicFile(artwork.model_path);
  await Promise.all(renders.map(r => deletePublicFile(r.url)));

  res.json({ success: true });
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
  const url = toPublicPath('renders', file.filename);
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

  if (render) await deletePublicFile(render.url);

  res.json({ success: true });
}
