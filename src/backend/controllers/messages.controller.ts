import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest, UserRecord } from '../types.ts';
import { findUserByUsername } from '../repositories/users.repository.ts';
import { blockState } from '../repositories/moderation.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { isFollowing } from '../repositories/follows.repository.ts';
import {
  findConversationId,
  conversationState,
  countConversationsStartedSince,
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

// Until the recipient writes back, a conversation is only a request: it needs
// their "who can message me" setting to allow it, and the sender gets a few
// messages, not an unlimited stream.
const UNANSWERED_LIMIT = 3;
// New conversations one account may start per day, against mass spam (the
// per-route rate limit alone allows thousands of first messages a day).
const NEW_CONVERSATIONS_PER_DAY = 20;

// Why `me` can't write to `other` right now, or null if they can.
type Restriction = 'blocked' | 'not_accepting' | 'awaiting_reply' | null;

// Whether `recipient`'s setting lets `senderId` start a conversation. Artists
// who are available for work always take hire requests (unless "nobody").
async function acceptsFrom(recipient: UserRecord, senderId: string, kind: MessageKind): Promise<boolean> {
  if (recipient.messages_from === 'nobody') return false;
  if (recipient.messages_from === 'everyone') return true;
  if (kind === 'hire' && recipient.available_for_work) return true;
  return isFollowing(recipient.id, senderId);
}

async function writeRestriction(
  me: string,
  other: UserRecord,
  blocked: boolean,
  kind: MessageKind
): Promise<{ restriction: Restriction; startsConversation: boolean }> {
  if (blocked) return { restriction: 'blocked', startsConversation: false };
  const state = await conversationState(me, other.id);
  // Once they've written back, it's a normal conversation.
  if (state.recipientHasWritten) return { restriction: null, startsConversation: false };
  if (!(await acceptsFrom(other, me, kind))) return { restriction: 'not_accepting', startsConversation: !state.exists };
  if (state.sentBySender >= UNANSWERED_LIMIT) return { restriction: 'awaiting_reply', startsConversation: false };
  return { restriction: null, startsConversation: !state.exists };
}

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

  const before = typeof req.query.before === 'string' ? req.query.before : null;
  if (before !== null && Number.isNaN(Date.parse(before))) {
    res.status(400).json({ error: '"before" must be a date' });
    return;
  }

  const conversationId = await findConversationId(me, other.id);
  const messages = conversationId ? await listMessages(conversationId, me, before, 50) : [];
  if (conversationId && !before) await markConversationRead(conversationId, me);
  const { restriction } = await writeRestriction(me, other, blocked, 'message');

  res.json({
    user: {
      username: other.username,
      name: other.name,
      avatarUrl: other.avatar_url,
      title: other.title,
      availableForWork: other.available_for_work,
      workTypes: other.work_types ?? [],
    },
    // You can't write to someone you've blocked (unblock first), to someone
    // who doesn't take messages from you, or more than a few times unanswered.
    canMessage: restriction === null,
    restriction,
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
  const { restriction, startsConversation } = await writeRestriction(me, other, blocked, kind);
  if (restriction === 'blocked') {
    res.status(403).json({ error: 'Unblock this user to message them', restriction });
    return;
  }
  if (restriction === 'not_accepting') {
    const error = other.messages_from === 'following'
      ? `@${other.username} only accepts messages from people they follow`
      : `@${other.username} isn't accepting messages`;
    res.status(403).json({ error, restriction });
    return;
  }
  if (restriction === 'awaiting_reply') {
    res.status(429).json({ error: `Wait for @${other.username} to reply before sending more messages`, restriction });
    return;
  }
  if (startsConversation && (await countConversationsStartedSince(me, 24)) >= NEW_CONVERSATIONS_PER_DAY) {
    res.status(429).json({ error: "You've started too many new conversations today - try again tomorrow" });
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
