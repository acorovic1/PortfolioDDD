import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/db.ts';
import { publish } from '../services/realtime.ts';

export type MessageKind = 'message' | 'hire';

export type MessageDTO = {
  id: string;
  body: string;
  kind: MessageKind;
  meta: Record<string, unknown> | null;
  createdAt: string;
  fromMe: boolean;
};

export type ConversationSummary = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: { body: string; kind: MessageKind; createdAt: string; fromMe: boolean };
  unread: number;
};

// Conversations store the pair ordered (user_a < user_b).
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// The column holding `userId`'s read marker in conversation alias `c`.
function readColumn(userParam: string): string {
  return `CASE WHEN c.user_a = ${userParam} THEN c.user_a_read_at ELSE c.user_b_read_at END`;
}

export async function findConversationId(userId: string, otherId: string): Promise<string | null> {
  const [a, b] = orderPair(userId, otherId);
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM conversations WHERE user_a = $1 AND user_b = $2',
    [a, b]
  );
  return rows[0]?.id ?? null;
}

async function getOrCreateConversationId(userId: string, otherId: string): Promise<string> {
  const [a, b] = orderPair(userId, otherId);
  await pool.query(
    `INSERT INTO conversations (id, user_a, user_b) VALUES ($1, $2, $3)
     ON CONFLICT (user_a, user_b) DO NOTHING`,
    [uuidv4(), a, b]
  );
  return (await findConversationId(userId, otherId))!;
}

// Number of messages from the other person that `userId` hasn't read yet.
export async function countUnreadInConversation(conversationId: string, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.id = $1 AND m.sender_id <> $2 AND m.created_at > ${readColumn('$2')}`,
    [conversationId, userId]
  );
  return rows[0]?.count ?? 0;
}

export async function sendMessage(message: {
  senderId: string;
  recipientId: string;
  body: string;
  kind: MessageKind;
  meta?: Record<string, unknown> | null;
}): Promise<{ conversationId: string; message: MessageDTO; recipientHadUnread: boolean }> {
  const conversationId = await getOrCreateConversationId(message.senderId, message.recipientId);
  const recipientHadUnread = (await countUnreadInConversation(conversationId, message.recipientId)) > 0;

  const { rows } = await pool.query<{ id: string; body: string; kind: MessageKind; meta: Record<string, unknown> | null; created_at: string }>(
    `INSERT INTO messages (id, conversation_id, sender_id, body, kind, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, body, kind, meta, created_at`,
    [uuidv4(), conversationId, message.senderId, message.body, message.kind, message.meta ? JSON.stringify(message.meta) : null]
  );

  // Sending also means you've read everything up to now.
  await pool.query(
    `UPDATE conversations c SET last_message_at = NOW(),
       user_a_read_at = CASE WHEN c.user_a = $2 THEN NOW() ELSE c.user_a_read_at END,
       user_b_read_at = CASE WHEN c.user_b = $2 THEN NOW() ELSE c.user_b_read_at END
     WHERE c.id = $1`,
    [conversationId, message.senderId]
  );

  // The recipient's inbox, and the sender's other tabs/devices.
  publish(message.recipientId, 'message', { conversationId });
  publish(message.senderId, 'message', { conversationId });

  const row = rows[0];
  return {
    conversationId,
    recipientHadUnread,
    message: { id: row.id, body: row.body, kind: row.kind, meta: row.meta, createdAt: row.created_at, fromMe: true },
  };
}

export async function listMessages(conversationId: string, userId: string, before: string | null, limit: number): Promise<MessageDTO[]> {
  const { rows } = await pool.query<MessageDTO>(
    `SELECT id, body, kind, meta, created_at AS "createdAt", sender_id = $2 AS "fromMe"
     FROM messages
     WHERE conversation_id = $1 AND ($3::timestamptz IS NULL OR created_at < $3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [conversationId, userId, before, limit]
  );
  return rows.reverse();
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await pool.query(
    `UPDATE conversations c SET
       user_a_read_at = CASE WHEN c.user_a = $2 THEN NOW() ELSE c.user_a_read_at END,
       user_b_read_at = CASE WHEN c.user_b = $2 THEN NOW() ELSE c.user_b_read_at END
     WHERE c.id = $1`,
    [conversationId, userId]
  );
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationSummary & { last_body: string; last_kind: MessageKind; last_at: string; last_from_me: boolean }>(
    `SELECT c.id, other.username, other.name, other.avatar_url AS "avatarUrl",
            lm.body AS last_body, lm.kind AS last_kind, lm.created_at AS last_at, lm.sender_id = $1 AS last_from_me,
            (SELECT COUNT(*)::int FROM messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.created_at > ${readColumn('$1')}) AS unread
     FROM conversations c
     JOIN users other ON other.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
     JOIN LATERAL (
       SELECT body, kind, created_at, sender_id FROM messages m
       WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
     ) lm ON TRUE
     WHERE $1 IN (c.user_a, c.user_b)
     ORDER BY c.last_message_at DESC
     LIMIT 100`,
    [userId]
  );
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    name: r.name,
    avatarUrl: r.avatarUrl,
    unread: r.unread,
    lastMessage: { body: r.last_body, kind: r.last_kind, createdAt: r.last_at, fromMe: r.last_from_me },
  }));
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE $1 IN (c.user_a, c.user_b) AND m.sender_id <> $1 AND m.created_at > ${readColumn('$1')}`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}
