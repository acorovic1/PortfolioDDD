import { pool } from '../config/db.ts';
import type { NotificationRecord, NotificationDTO } from '../types.ts';

export function toNotificationDTO(row: NotificationRecord): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    artworkId: row.artwork_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function createNotification(notification: {
  id: string;
  userId: string;
  actorUsername: string;
  type: string;
  message: string;
  artworkId?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (id, user_id, actor_username, type, message, artwork_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      notification.id,
      notification.userId,
      notification.actorUsername,
      notification.type,
      notification.message,
      notification.artworkId ?? null,
    ]
  );
}

export async function findNotificationsByUserId(
  userId: string,
  limit: number,
  offset: number
): Promise<NotificationRecord[]> {
  const { rows } = await pool.query<NotificationRecord>(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND NOT is_read',
    [userId]
  );
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
}
