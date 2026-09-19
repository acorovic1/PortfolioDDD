import { pool } from '../config/db.ts';
import type { NotificationRecord, NotificationDTO } from '../types.ts';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export function toNotificationDTO(row: NotificationRecord): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    artworkId: row.artwork_id,
    isRead: !!row.is_read,
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
  await pool.query<ResultSetHeader>(
    `INSERT INTO notifications (id, user_id, actor_username, type, message, artwork_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
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
  const [rows] = await pool.query<(NotificationRecord & RowDataPacket)[]>(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return rows;
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [rows] = await pool.query<({ count: number } & RowDataPacket)[]>(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return rows[0]?.count ?? 0;
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
}
