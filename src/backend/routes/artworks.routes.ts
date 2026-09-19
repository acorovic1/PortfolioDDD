import { Router } from 'express';
import { searchArtworks } from '../controllers/users.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';

export const artworksRoutes = Router();

artworksRoutes.get('/search', authenticateToken, searchArtworks);
