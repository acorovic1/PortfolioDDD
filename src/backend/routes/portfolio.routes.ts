import { Router } from 'express';
import {
  listOwnArtworks,
  listArtworksByIds,
  createArtworkWithModel,
  createArtworkWithImage,
  createArtworkWithVideo,
  updateOwnArtwork,
  reorderOwnArtworks,
  deleteOwnArtwork,
  addRender,
  removeRender,
  replaceArtworkModel,
  getArtworkStatus,
  uploadArtworkThumbnail,
} from '../controllers/portfolio.controller.ts';
import { listComments, addComment, removeComment } from '../controllers/comments.controller.ts';
import { listMyLikes, likeArtwork, unlikeArtwork } from '../controllers/likes.controller.ts';
import { authenticateToken, optionalAuth, requireVerifiedEmail } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { uploadArtworkSchema, uploadImageArtworkSchema, uploadVideoArtworkSchema, updateArtworkSchema, addCommentSchema, reorderArtworksSchema } from '../validation/schemas.ts';
import { uploadModel, uploadRender, uploadThumbnail, uploadArtworkImage, uploadArtworkVideo } from '../utils/upload.util.ts';
import { statusPollRateLimiter, modelUploadRateLimiter, mediaUploadRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { requireStorageRoom, enforceStorageQuota } from '../services/storage-quota.ts';
import { findArtworkById } from '../repositories/artworks.repository.ts';
import type { Request } from 'express';

// The artwork file an upload replaces (freed once the new one is in).
const replacesArtworkFile = (column: 'model_path' | 'thumbnail_path') => async (req: Request) =>
  [(await findArtworkById(req.params.artworkId as string))?.[column]];

export const portfolioRoutes = Router();

portfolioRoutes.get('/', authenticateToken, listOwnArtworks);
portfolioRoutes.get('/artworks/batch', optionalAuth, listArtworksByIds);
portfolioRoutes.post('/artworks',
  authenticateToken,
  modelUploadRateLimiter,
  requireStorageRoom,
  uploadModel.single('model'),
  enforceStorageQuota(),
  validateBody(uploadArtworkSchema),
  createArtworkWithModel
);
// A 2D artwork: an image, shown as a canvas on an easel.
portfolioRoutes.post('/artworks/image',
  authenticateToken,
  mediaUploadRateLimiter,
  requireStorageRoom,
  uploadArtworkImage.single('image'),
  enforceStorageQuota(),
  validateBody(uploadImageArtworkSchema),
  createArtworkWithImage
);
// A video artwork: a video playing on such a canvas.
portfolioRoutes.post('/artworks/video',
  authenticateToken,
  mediaUploadRateLimiter,
  requireStorageRoom,
  uploadArtworkVideo.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]),
  enforceStorageQuota(),
  validateBody(uploadVideoArtworkSchema),
  createArtworkWithVideo
);
portfolioRoutes.put('/order', authenticateToken, validateBody(reorderArtworksSchema), reorderOwnArtworks);
portfolioRoutes.put('/artworks/:artworkId', authenticateToken, validateBody(updateArtworkSchema), updateOwnArtwork);
portfolioRoutes.put('/artworks/:artworkId/model', authenticateToken, modelUploadRateLimiter, requireStorageRoom,
  uploadModel.single('model'), enforceStorageQuota(replacesArtworkFile('model_path')), replaceArtworkModel);
portfolioRoutes.get('/artworks/:artworkId/status', statusPollRateLimiter, authenticateToken, getArtworkStatus);
portfolioRoutes.post('/artworks/:artworkId/thumbnail', authenticateToken, mediaUploadRateLimiter, requireStorageRoom,
  uploadThumbnail.single('image'), enforceStorageQuota(replacesArtworkFile('thumbnail_path')), uploadArtworkThumbnail);
portfolioRoutes.delete('/artworks/:artworkId', authenticateToken, deleteOwnArtwork);
portfolioRoutes.post('/artworks/:artworkId/renders', authenticateToken, mediaUploadRateLimiter, requireStorageRoom,
  uploadRender.single('image'), enforceStorageQuota(), addRender);
portfolioRoutes.delete('/artworks/:artworkId/renders/:renderId', authenticateToken, removeRender);

portfolioRoutes.get('/artworks/:artworkId/comments', optionalAuth, listComments);
portfolioRoutes.post('/artworks/:artworkId/comments',
  authenticateToken,
  requireVerifiedEmail,
  validateBody(addCommentSchema),
  addComment
);
portfolioRoutes.delete('/artworks/:artworkId/comments/:commentId', authenticateToken, removeComment);

portfolioRoutes.get('/likes', authenticateToken, listMyLikes);
portfolioRoutes.post('/artworks/:artworkId/like', authenticateToken, likeArtwork);
portfolioRoutes.delete('/artworks/:artworkId/like', authenticateToken, unlikeArtwork);
