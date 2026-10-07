import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getConversations, getUnreadCount, getThread, postMessage, postHireRequest } from '../controllers/messages.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { sendMessageSchema, hireRequestSchema } from '../validation/schemas.ts';
import type { AuthRequest } from '../types.ts';

// Per-account cap on outgoing messages, against spam.
const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user!.id,
  message: { error: "You're sending messages too quickly - try again in a few minutes" },
  skip: () => process.env.NODE_ENV === 'test',
});

export const messagesRoutes = Router();

messagesRoutes.use(authenticateToken);
messagesRoutes.get('/', getConversations);
messagesRoutes.get('/unread', getUnreadCount);
messagesRoutes.get('/:username', getThread);
messagesRoutes.post('/:username', sendLimiter, validateBody(sendMessageSchema), postMessage);
messagesRoutes.post('/:username/hire', sendLimiter, validateBody(hireRequestSchema), postHireRequest);
