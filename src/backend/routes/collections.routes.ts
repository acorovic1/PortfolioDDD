import { Router } from 'express';
import {
  listOwnCollections,
  createOwnCollection,
  renameOwnCollection,
  deleteOwnCollection,
  addArtwork,
  removeArtwork,
} from '../controllers/collections.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createCollectionSchema } from '../validation/schemas.ts';

export const collectionsRoutes = Router();

collectionsRoutes.use(authenticateToken);

collectionsRoutes.get('/', listOwnCollections);
collectionsRoutes.post('/', validateBody(createCollectionSchema), createOwnCollection);
collectionsRoutes.put('/:collectionId', validateBody(createCollectionSchema), renameOwnCollection);
collectionsRoutes.delete('/:collectionId', deleteOwnCollection);
collectionsRoutes.post('/:collectionId/artworks/:artworkId', addArtwork);
collectionsRoutes.delete('/:collectionId/artworks/:artworkId', removeArtwork);
