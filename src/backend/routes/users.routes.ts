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
import { authenticateToken } from '../middleware/auth.middleware.ts';
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
usersRoutes.get('/:username/portfolio', getPublicPortfolio);
