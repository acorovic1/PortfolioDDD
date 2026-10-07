import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest, UserRecord } from '../types.ts';
import { findUserByUsername } from '../repositories/users.repository.ts';
import { blockState } from '../repositories/moderation.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import {
  findConversationId,
  sendMessage,
  listMessages,
  markConversationRead,
  listConversations,
  countUnreadMessages,
  type MessageKind,
} from '../repositories/messages.repository.ts';

const WORK_TYPE_LABELS: Record<string, string> = {
  freelance: 'Freelance',
  full_time: 'Full-time',
  contract: 'Contract',
  commissions: 'Commission',
};

// The other participant, if the caller may talk to them at all.
async function resolveCounterpart(req: Request, res: Response): Promise<{ me: string; other: UserRecord; blocked: boolean } | null> {
  const me = (req as AuthRequest).user!.id;
  const other = await findUserByUsername(req.params.username as string);
  if (!other || other.suspended_at) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  if (other.id === me) {
    res.status(400).json({ error: "You can't message yourself" });
    return null;
  }
  const blocks = await blockState(me, other.id);
  if (blocks.isBlockedBy) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return { me, other, blocked: blocks.hasBlocked };
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  res.json({ conversations: await listConversations((req as AuthRequest).user!.id) });
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  res.json({ count: await countUnreadMessages((req as AuthRequest).user!.id) });
}

// The thread with one person (opening it marks it read).
export async function getThread(req: Request, res: Response): Promise<void> {
  const counterpart = await resolveCounterpart(req, res);
  if (!counterpart) return;
  const { me, other, blocked } = counterpart;

  const conversationId = await findConversationId(me, other.id);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const messages = conversationId ? await listMessages(conversationId, me, before, 50) : [];
  if (conversationId && !before) await markConversationRead(conversationId, me);

  res.json({
    user: {
      username: other.username,
      name: other.name,
      avatarUrl: other.avatar_url,
      title: other.title,
      availableForWork: other.available_for_work,
      workTypes: other.work_types ?? [],
    },
    // You can't write to someone you've blocked (unblock first).
    canMessage: !blocked,
    messages,
  });
}

async function deliver(
  req: Request,
  res: Response,
  body: string,
  kind: MessageKind,
  meta: Record<string, unknown> | null
): Promise<void> {
  const counterpart = await resolveCounterpart(req, res);
  if (!counterpart) return;
  const { me, other, blocked } = counterpart;
  if (blocked) {
    res.status(403).json({ error: 'Unblock this user to message them' });
    return;
  }

  const sent = await sendMessage({ senderId: me, recipientId: other.id, body, kind, meta });

  // One notification per unread streak (not one per message), but always
  // for hire requests.
  if (kind === 'hire' || !sent.recipientHadUnread) {
    const sender = (req as AuthRequest).user!.username;
    await createNotification({
      id: uuidv4(),
      userId: other.id,
      actorUsername: sender,
      type: kind,
      message: kind === 'hire'
        ? `@${sender} wants to hire you: "${String(meta?.projectTitle ?? '').slice(0, 80)}"`
        : `@${sender} sent you a message`,
    });
  }

  res.status(201).json(sent.message);
}

export async function postMessage(req: Request, res: Response): Promise<void> {
  await deliver(req, res, req.body.body, 'message', null);
}

export async function postHireRequest(req: Request, res: Response): Promise<void> {
  const { projectTitle, workType, budget, timeline, details } = req.body as {
    projectTitle: string; workType?: string; budget?: string; timeline?: string; details: string;
  };

  // The readable version goes in the body (so it reads fine anywhere); the
  // structured fields go in meta for the hire-request card.
  const lines = [
    `Hire request: ${projectTitle}`,
    workType ? `Type: ${WORK_TYPE_LABELS[workType] ?? workType}` : null,
    budget ? `Budget: ${budget}` : null,
    timeline ? `Timeline: ${timeline}` : null,
    '',
    details,
  ].filter(line => line !== null);

  await deliver(req, res, lines.join('\n'), 'hire', { projectTitle, workType, budget, timeline });
}
