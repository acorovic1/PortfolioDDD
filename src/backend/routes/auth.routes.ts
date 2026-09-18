import { Router } from 'express';
import { register, login, me, refresh, forgotPassword, resetPassword } from '../controllers/auth.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { authRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validation/schemas.ts';

export const authRoutes = Router();

authRoutes.post('/register', authRateLimiter, validateBody(registerSchema), register);
authRoutes.post('/login', authRateLimiter, validateBody(loginSchema), login);
authRoutes.post('/forgot-password', authRateLimiter, validateBody(forgotPasswordSchema), forgotPassword);
authRoutes.post('/reset-password', authRateLimiter, validateBody(resetPasswordSchema), resetPassword);
authRoutes.get('/me', authenticateToken, me);
authRoutes.post('/refresh', authenticateToken, refresh);
