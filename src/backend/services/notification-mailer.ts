import { pool } from '../config/db.ts';
import { sendMail } from './mail.ts';
import { notificationDigestMail } from './mail-templates.ts';

// Emails people the notifications they haven't seen. A notification is only
// emailed once it has sat unread for a while (someone active on the site
// sees it there first), and everything pending for a person goes out as a
// single digest. Only verified addresses that haven't opted out get mail.

const ITEMS_PER_DIGEST = 10;

type ClaimedRow = { user_id: string; message: string; created_at: string; email: string; username: string };

// Returns how many digests were sent.
export async function sendNotificationDigests(minAgeSeconds = 10 * 60): Promise<number> {
  // Claiming (emailed_at) and selecting in one statement: several server
  // instances can run this at once without double-sending.
  const { rows } = await pool.query<ClaimedRow>(
    `WITH claimed AS (
       UPDATE notifications SET emailed_at = NOW()
       WHERE emailed_at IS NULL AND created_at <= NOW() - make_interval(secs => $1)
       RETURNING user_id, message, is_read, created_at
     )
     SELECT c.user_id, c.message, c.created_at, u.email, u.username
     FROM claimed c
     JOIN users u ON u.id = c.user_id
     WHERE NOT c.is_read
       AND u.email_notifications
       AND u.email_verified_at IS NOT NULL
       AND u.suspended_at IS NULL
     ORDER BY c.created_at DESC`,
    [minAgeSeconds]
  );

  const byUser = new Map<string, ClaimedRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let sent = 0;
  for (const items of byUser.values()) {
    const { email, username } = items[0];
    const mail = notificationDigestMail(
      email,
      username,
      items.slice(0, ITEMS_PER_DIGEST).map(i => ({ message: i.message, createdAt: i.created_at })),
      items.length
    );
    try {
      await sendMail(mail);
      sent++;
    } catch (err) {
      console.error(`Failed to send notification digest to ${email}:`, err);
    }
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

export function startNotificationMailer(intervalMs = 5 * 60_000): void {
  if (timer) return;
  timer = setInterval(() => {
    sendNotificationDigests().catch(err => console.error('Notification digest run failed:', err));
  }, intervalMs);
  timer.unref();
}

export function stopNotificationMailer(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
