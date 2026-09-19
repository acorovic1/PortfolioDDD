import { Router } from 'express';
import { listNotifications, markRead, markAllRead } from '../controllers/notifications.controller.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';

export const notificationsRoutes = Router();

notificationsRoutes.use(authenticateToken);

notificationsRoutes.get('/', listNotifications);
notificationsRoutes.post('/read-all', markAllRead);
notificationsRoutes.post('/:notificationId/read', markRead);
