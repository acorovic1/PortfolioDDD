import { Router } from 'express';
import { authenticateToken, optionalAuth, requireVerifiedEmail } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  createJobSchema,
  updateJobSchema,
  applyJobSchema,
  listingSchema,
  purchaseRequestSchema,
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

export const jobsRoutes = Router();
jobsRoutes.get('/', optionalAuth, getJobs);
jobsRoutes.post('/', authenticateToken, requireVerifiedEmail, validateBody(createJobSchema), postJob);
jobsRoutes.get('/:jobId', optionalAuth, getJob);
jobsRoutes.put('/:jobId', authenticateToken, validateBody(updateJobSchema), editJob);
jobsRoutes.delete('/:jobId', authenticateToken, removeJob);
jobsRoutes.post('/:jobId/apply', authenticateToken, requireVerifiedEmail, validateBody(applyJobSchema), applyToJob);
jobsRoutes.get('/:jobId/applications', authenticateToken, getApplications);

export const marketplaceRoutes = Router();
marketplaceRoutes.get('/', optionalAuth, getMarketplace);
marketplaceRoutes.get('/artworks/:artworkId', optionalAuth, getArtworkListing);
marketplaceRoutes.put('/artworks/:artworkId', authenticateToken, validateBody(listingSchema), saveArtworkListing);
marketplaceRoutes.delete('/artworks/:artworkId', authenticateToken, removeArtworkListing);
marketplaceRoutes.post('/listings/:listingId/download', authenticateToken, downloadListing);
marketplaceRoutes.post('/listings/:listingId/purchase-request', authenticateToken, requireVerifiedEmail, validateBody(purchaseRequestSchema), requestPurchase);

