import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import {
  findCollectionsByUserId,
  findCollectionById,
  createCollection,
  renameCollection,
  deleteCollection,
  addArtworkToCollection,
  removeArtworkFromCollection,
} from '../repositories/collections.repository.ts';
import { findArtworkById } from '../repositories/artworks.repository.ts';

async function assertOwnedCollection(userId: string, collectionId: string) {
  const collection = await findCollectionById(collectionId);
  if (!collection || collection.user_id !== userId) return null;
  return collection;
}

export async function listOwnCollections(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const collections = await findCollectionsByUserId(authReq.user!.id);
  res.json(collections);
}

export async function createOwnCollection(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { name } = req.body;

  const id = uuidv4();
  await createCollection({ id, userId: authReq.user!.id, name });
  res.status(201).json({ id, name, artworkIds: [], createdAt: new Date().toISOString() });
}

export async function renameOwnCollection(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const collectionId = req.params.collectionId as string;
  const { name } = req.body;

  const collection = await assertOwnedCollection(authReq.user!.id, collectionId);
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  await renameCollection(collectionId, name);
  res.json({ success: true });
}

export async function deleteOwnCollection(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const collectionId = req.params.collectionId as string;

  const collection = await assertOwnedCollection(authReq.user!.id, collectionId);
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  await deleteCollection(collectionId);
  res.json({ success: true });
}

export async function addArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const collectionId = req.params.collectionId as string;
  const artworkId = req.params.artworkId as string;

  const collection = await assertOwnedCollection(authReq.user!.id, collectionId);
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  const artwork = await findArtworkById(artworkId);
  if (!artwork) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }

  await addArtworkToCollection(collectionId, artworkId);
  res.status(201).json({ success: true });
}

export async function removeArtwork(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const collectionId = req.params.collectionId as string;
  const artworkId = req.params.artworkId as string;

  const collection = await assertOwnedCollection(authReq.user!.id, collectionId);
  if (!collection) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  await removeArtworkFromCollection(collectionId, artworkId);
  res.json({ success: true });
}
