import type { Request, Response } from 'express';
import type { AuthRequest } from '../types.ts';
import {
  findNotificationsByUserId,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  toNotificationDTO,
} from '../repositories/notifications.repository.ts';
import { parsePagination } from '../utils/pagination.util.ts';

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { limit, offset } = parsePagination(req.query);

  const [notifications, unreadCount] = await Promise.all([
    findNotificationsByUserId(authReq.user!.id, limit, offset),
    countUnreadNotifications(authReq.user!.id),
  ]);

  res.json({
    notifications: notifications.map(toNotificationDTO),
    unreadCount,
  });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const notificationId = req.params.notificationId as string;

  await markNotificationRead(notificationId, authReq.user!.id);
  res.json({ success: true });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  await markAllNotificationsRead(authReq.user!.id);
  res.json({ success: true });
}
