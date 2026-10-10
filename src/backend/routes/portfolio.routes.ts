import { Router } from 'express';
import {
  listOwnArtworks,
  listArtworksByIds,
  createArtworkWithModel,
  updateOwnArtwork,
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
import { uploadArtworkSchema, updateArtworkSchema, addCommentSchema } from '../validation/schemas.ts';
import { uploadModel, uploadImage, uploadThumbnail } from '../utils/upload.util.ts';
import { statusPollRateLimiter } from '../middleware/rate-limit.middleware.ts';

export const portfolioRoutes = Router();

portfolioRoutes.get('/', authenticateToken, listOwnArtworks);
portfolioRoutes.get('/artworks/batch', listArtworksByIds);
portfolioRoutes.post('/artworks',
  authenticateToken,
  uploadModel.single('model'),
  validateBody(uploadArtworkSchema),
  createArtworkWithModel
);
portfolioRoutes.put('/artworks/:artworkId', authenticateToken, validateBody(updateArtworkSchema), updateOwnArtwork);
portfolioRoutes.put('/artworks/:artworkId/model', authenticateToken, uploadModel.single('model'), replaceArtworkModel);
portfolioRoutes.get('/artworks/:artworkId/status', statusPollRateLimiter, authenticateToken, getArtworkStatus);
portfolioRoutes.post('/artworks/:artworkId/thumbnail', authenticateToken, uploadThumbnail.single('image'), uploadArtworkThumbnail);
portfolioRoutes.delete('/artworks/:artworkId', authenticateToken, deleteOwnArtwork);
portfolioRoutes.post('/artworks/:artworkId/renders', authenticateToken, uploadImage.single('image'), addRender);
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
