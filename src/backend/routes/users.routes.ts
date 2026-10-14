import { Router } from 'express';
import {
  search,
  getPublicPortfolio,
  updateProfile,
  changeUsername,
  changeEmail,
  deleteAccount,
  uploadAvatar,
  uploadCover,
  getMyStorage,
} from '../controllers/users.controller.ts';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware.ts';
import { followUser, unfollowUser, listFollowers, listFollowing, getProfileSummary } from '../controllers/follows.controller.ts';
import { blockUser, unblockUser, listMyBlocks } from '../controllers/moderation.controller.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { getMyDomain, setMyDomain, verifyMyDomain, removeMyDomain } from '../controllers/domains.controller.ts';
import {
  updateProfileSchema,
  updateUsernameSchema,
  updateEmailSchema,
  deleteAccountSchema,
  customDomainSchema,
} from '../validation/schemas.ts';
import { uploadAvatar as uploadAvatarMiddleware, uploadCover as uploadCoverMiddleware } from '../utils/upload.util.ts';
import { authRateLimiter, mediaUploadRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { requireStorageRoom, enforceStorageQuota } from '../services/storage-quota.ts';
import type { AuthRequest } from '../types.ts';
import { findUserById } from '../repositories/users.repository.ts';
import type { Request } from 'express';

// The profile image an upload replaces (freed once the new one is in).
const replacesProfileImage = (column: 'avatar_url' | 'cover_url') => async (req: Request) =>
  [(await findUserById((req as AuthRequest).user!.id))?.[column]];

export const usersRoutes = Router();

usersRoutes.get('/search', authenticateToken, search);
usersRoutes.put('/me', authenticateToken, validateBody(updateProfileSchema), updateProfile);
usersRoutes.put('/me/username', authenticateToken, validateBody(updateUsernameSchema), changeUsername);
usersRoutes.put('/me/email', authRateLimiter, authenticateToken, validateBody(updateEmailSchema), changeEmail);
usersRoutes.delete('/me', authenticateToken, validateBody(deleteAccountSchema), deleteAccount);
usersRoutes.get('/me/blocks', authenticateToken, listMyBlocks);
usersRoutes.get('/me/storage', authenticateToken, getMyStorage);
usersRoutes.get('/me/domain', authenticateToken, getMyDomain);
usersRoutes.put('/me/domain', authenticateToken, validateBody(customDomainSchema), setMyDomain);
usersRoutes.post('/me/domain/verify', authenticateToken, verifyMyDomain);
usersRoutes.delete('/me/domain', authenticateToken, removeMyDomain);
usersRoutes.post('/me/cover', authenticateToken, mediaUploadRateLimiter, requireStorageRoom,
  uploadCoverMiddleware.single('cover'), enforceStorageQuota(replacesProfileImage('cover_url')), uploadCover);
usersRoutes.post('/me/avatar', authenticateToken, mediaUploadRateLimiter, requireStorageRoom,
  uploadAvatarMiddleware.single('avatar'), enforceStorageQuota(replacesProfileImage('avatar_url')), uploadAvatar);
usersRoutes.get('/:username/portfolio', optionalAuth, getPublicPortfolio);
usersRoutes.post('/:username/follow', authenticateToken, followUser);
usersRoutes.post('/:username/block', authenticateToken, blockUser);
usersRoutes.delete('/:username/block', authenticateToken, unblockUser);
usersRoutes.delete('/:username/follow', authenticateToken, unfollowUser);
usersRoutes.get('/:username/summary', optionalAuth, getProfileSummary);
usersRoutes.get('/:username/followers', listFollowers);
usersRoutes.get('/:username/following', listFollowing);
