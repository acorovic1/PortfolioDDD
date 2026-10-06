import { Router } from 'express';
import { searchArtworks } from '../controllers/users.controller.ts';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware.ts';
import { recordArtworkView } from '../controllers/discovery.controller.ts';

export const artworksRoutes = Router();

artworksRoutes.get('/search', authenticateToken, searchArtworks);
artworksRoutes.post('/:artworkId/view', optionalAuth, recordArtworkView);
