import { Router } from 'express';
import { getFeed, getFeedFacets } from '../controllers/discovery.controller.ts';
import { optionalAuth } from '../middleware/auth.middleware.ts';

export const feedRoutes = Router();

feedRoutes.get('/', optionalAuth, getFeed);
feedRoutes.get('/facets', optionalAuth, getFeedFacets);
