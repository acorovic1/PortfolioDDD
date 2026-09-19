import { Router } from 'express';
import {
  listOwnArtworks,
  listArtworksByIds,
  createArtworkWithModel,
  updateOwnArtwork,
  deleteOwnArtwork,
  addRender,
  removeRender,
} from '../controllers/portfolio.controller.ts';
import { listComments, addComment, removeComment } from '../controllers/comments.controller.ts';
import { listMyLikes, likeArtwork, unlikeArtwork } from '../controllers/likes.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { createArtworkSchema, updateArtworkSchema, addCommentSchema } from '../validation/schemas.ts';
import { uploadModel, uploadImage } from '../utils/upload.util.ts';

export const portfolioRoutes = Router();

portfolioRoutes.get('/', authenticateToken, listOwnArtworks);
portfolioRoutes.get('/artworks/batch', listArtworksByIds);
portfolioRoutes.post('/artworks',
  authenticateToken,
  uploadModel.single('model'),
  validateBody(createArtworkSchema),
  createArtworkWithModel
);
portfolioRoutes.put('/artworks/:artworkId', authenticateToken, validateBody(updateArtworkSchema), updateOwnArtwork);
portfolioRoutes.delete('/artworks/:artworkId', authenticateToken, deleteOwnArtwork);
portfolioRoutes.post('/artworks/:artworkId/renders', authenticateToken, uploadImage.single('image'), addRender);
portfolioRoutes.delete('/artworks/:artworkId/renders/:renderId', authenticateToken, removeRender);

portfolioRoutes.get('/artworks/:artworkId/comments', listComments);
portfolioRoutes.post('/artworks/:artworkId/comments',
  authenticateToken,
  validateBody(addCommentSchema),
  addComment
);
portfolioRoutes.delete('/artworks/:artworkId/comments/:commentId', authenticateToken, removeComment);

portfolioRoutes.get('/likes', authenticateToken, listMyLikes);
portfolioRoutes.post('/artworks/:artworkId/like', authenticateToken, likeArtwork);
portfolioRoutes.delete('/artworks/:artworkId/like', authenticateToken, unlikeArtwork);
