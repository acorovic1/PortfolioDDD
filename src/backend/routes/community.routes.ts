import { Router } from 'express';
import { authenticateToken, optionalAuth, requireAdmin } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  createJobSchema,
  updateJobSchema,
  applyJobSchema,
  listingSchema,
  purchaseRequestSchema,
  createChallengeSchema,
  challengeEntrySchema,
} from '../validation/schemas.ts';
import { getJobs, getJob, postJob, editJob, removeJob, applyToJob, getApplications } from '../controllers/jobs.controller.ts';
import {
  getMarketplace,
  getArtworkListing,
  saveArtworkListing,
  removeArtworkListing,
  downloadListing,
  requestPurchase,
} from '../controllers/marketplace.controller.ts';
import {
  getChallenges,
  getChallenge,
  postChallenge,
  removeChallenge,
  submitEntry,
  withdrawEntry,
  voteForEntry,
  unvoteEntry,
} from '../controllers/challenges.controller.ts';

export const jobsRoutes = Router();
jobsRoutes.get('/', optionalAuth, getJobs);
jobsRoutes.post('/', authenticateToken, validateBody(createJobSchema), postJob);
jobsRoutes.get('/:jobId', optionalAuth, getJob);
jobsRoutes.put('/:jobId', authenticateToken, validateBody(updateJobSchema), editJob);
jobsRoutes.delete('/:jobId', authenticateToken, removeJob);
jobsRoutes.post('/:jobId/apply', authenticateToken, validateBody(applyJobSchema), applyToJob);
jobsRoutes.get('/:jobId/applications', authenticateToken, getApplications);

export const marketplaceRoutes = Router();
marketplaceRoutes.get('/', optionalAuth, getMarketplace);
marketplaceRoutes.get('/artworks/:artworkId', optionalAuth, getArtworkListing);
marketplaceRoutes.put('/artworks/:artworkId', authenticateToken, validateBody(listingSchema), saveArtworkListing);
marketplaceRoutes.delete('/artworks/:artworkId', authenticateToken, removeArtworkListing);
marketplaceRoutes.post('/listings/:listingId/download', authenticateToken, downloadListing);
marketplaceRoutes.post('/listings/:listingId/purchase-request', authenticateToken, validateBody(purchaseRequestSchema), requestPurchase);

export const challengesRoutes = Router();
challengesRoutes.get('/', getChallenges);
challengesRoutes.post('/', authenticateToken, requireAdmin, validateBody(createChallengeSchema), postChallenge);
challengesRoutes.get('/:challengeId', optionalAuth, getChallenge);
challengesRoutes.delete('/:challengeId', authenticateToken, requireAdmin, removeChallenge);
challengesRoutes.post('/:challengeId/entries', authenticateToken, validateBody(challengeEntrySchema), submitEntry);
challengesRoutes.delete('/:challengeId/entries/mine', authenticateToken, withdrawEntry);
challengesRoutes.post('/:challengeId/entries/:artworkId/vote', authenticateToken, voteForEntry);
challengesRoutes.delete('/:challengeId/entries/:artworkId/vote', authenticateToken, unvoteEntry);
