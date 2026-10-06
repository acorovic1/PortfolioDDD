import { Router } from 'express';
import {
  search,
  getPublicPortfolio,
  updateProfile,
  changeUsername,
  changeEmail,
  changePassword,
  deleteAccount,
  uploadAvatar,
} from '../controllers/users.controller.ts';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware.ts';
import { followUser, unfollowUser, listFollowers, listFollowing, getProfileSummary } from '../controllers/follows.controller.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  updateProfileSchema,
  updateUsernameSchema,
  updateEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from '../validation/schemas.ts';
import { uploadAvatar as uploadAvatarMiddleware } from '../utils/upload.util.ts';

export const usersRoutes = Router();

usersRoutes.get('/search', authenticateToken, search);
usersRoutes.put('/me', authenticateToken, validateBody(updateProfileSchema), updateProfile);
usersRoutes.put('/me/username', authenticateToken, validateBody(updateUsernameSchema), changeUsername);
usersRoutes.put('/me/email', authenticateToken, validateBody(updateEmailSchema), changeEmail);
usersRoutes.post('/me/password', authenticateToken, validateBody(changePasswordSchema), changePassword);
usersRoutes.delete('/me', authenticateToken, validateBody(deleteAccountSchema), deleteAccount);
usersRoutes.post('/me/avatar', authenticateToken, uploadAvatarMiddleware.single('avatar'), uploadAvatar);
usersRoutes.get('/:username/portfolio', optionalAuth, getPublicPortfolio);
usersRoutes.post('/:username/follow', authenticateToken, followUser);
usersRoutes.delete('/:username/follow', authenticateToken, unfollowUser);
usersRoutes.get('/:username/summary', optionalAuth, getProfileSummary);
usersRoutes.get('/:username/followers', listFollowers);
usersRoutes.get('/:username/following', listFollowing);
