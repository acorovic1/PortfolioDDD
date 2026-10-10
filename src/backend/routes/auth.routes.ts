import { Router } from 'express';
import {
  register, login, loginTwoFactor, logoutEverywhere, me, refresh, forgotPassword, resetPassword, verifyEmail,
  resendVerification,
} from '../controllers/auth.controller.ts';
import {
  twoFactorStatus, setupTwoFactor, enableTwoFactor, disableTwoFactor, regenerateRecoveryCodes,
} from '../controllers/two-factor.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { authRateLimiter } from '../middleware/rate-limit.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import {
  registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema,
  twoFactorLoginSchema, twoFactorEnableSchema, twoFactorDisableSchema, passwordConfirmSchema,
} from '../validation/schemas.ts';

export const authRoutes = Router();

authRoutes.post('/register', authRateLimiter, validateBody(registerSchema), register);
authRoutes.post('/login', authRateLimiter, validateBody(loginSchema), login);
authRoutes.post('/login/2fa', authRateLimiter, validateBody(twoFactorLoginSchema), loginTwoFactor);
authRoutes.post('/logout-everywhere', authenticateToken, logoutEverywhere);

authRoutes.get('/2fa', authenticateToken, twoFactorStatus);
authRoutes.post('/2fa/setup', authenticateToken, setupTwoFactor);
authRoutes.post('/2fa/enable', authRateLimiter, authenticateToken, validateBody(twoFactorEnableSchema), enableTwoFactor);
authRoutes.post('/2fa/disable', authRateLimiter, authenticateToken, validateBody(twoFactorDisableSchema), disableTwoFactor);
authRoutes.post('/2fa/recovery-codes', authRateLimiter, authenticateToken, validateBody(passwordConfirmSchema),
  regenerateRecoveryCodes);
authRoutes.post('/forgot-password', authRateLimiter, validateBody(forgotPasswordSchema), forgotPassword);
authRoutes.post('/reset-password', authRateLimiter, validateBody(resetPasswordSchema), resetPassword);
authRoutes.post('/verify-email', authRateLimiter, validateBody(verifyEmailSchema), verifyEmail);
authRoutes.post('/resend-verification', authRateLimiter, authenticateToken, resendVerification);
authRoutes.get('/me', authenticateToken, me);
authRoutes.post('/refresh', authenticateToken, refresh);
