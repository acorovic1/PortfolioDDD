import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import { findUserByUsername, findUserById } from '../repositories/users.repository.ts';
import { findArtworkById } from '../repositories/artworks.repository.ts';
import { findCommentById, deleteComment } from '../repositories/comments.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { findMessageWithParticipants, deleteMessage } from '../repositories/messages.repository.ts';
import {
  addBlock,
  removeBlock,
  listBlockedUsers,
  createReport,
  listReports,
  findReportById,
  closeReportsOnTarget,
  setSuspended,
  moderationCounts,
  searchUsersForAdmin,
  type ReportTargetType,
} from '../repositories/moderation.repository.ts';
import { deleteArtworkWithFiles } from './portfolio.controller.ts';
import { parsePagination } from '../utils/pagination.util.ts';
import { pool } from '../config/db.ts';

const REASON_LABELS: Record<string, string> = {
  spam: 'spam',
  harassment: 'harassment or bullying',
  hate: 'hateful content',
  unlabeled_mature: 'mature content not marked as 18+',
  violence: 'violence or threats',
  stolen_work: 'stolen or uncredited work',
  unlabeled_ai: 'AI-generated work not labelled as AI',
  impersonation: 'impersonation',
  other: 'breaking the community guidelines',
};

// --- Blocking ---

export async function blockUser(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const target = await findUserByUsername(req.params.username as string);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === authReq.user!.id) {
    res.status(400).json({ error: "You can't block yourself" });
    return;
  }

  await addBlock(authReq.user!.id, target.id);
  res.json({ hasBlocked: true });
}

export async function unblockUser(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const target = await findUserByUsername(req.params.username as string);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await removeBlock(authReq.user!.id, target.id);
  res.json({ hasBlocked: false });
}

export async function listMyBlocks(req: Request, res: Response): Promise<void> {
  res.json({ users: await listBlockedUsers((req as AuthRequest).user!.id) });
}

// --- Reporting ---

// Resolves the reported thing to its author and a short snapshot for the
// moderation queue (the content may be deleted as a result). `reporterId`
// matters for messages: they're private, so only the person they were sent
// to can report them (and so share them with moderators).
async function describeTarget(
  type: ReportTargetType,
  id: string,
  reporterId: string
): Promise<{ userId: string; summary: string } | null> {
  if (type === 'message') {
    const message = await findMessageWithParticipants(id);
    if (!message || !message.participants.includes(reporterId)) return null;
    return { userId: message.senderId, summary: message.body.slice(0, 300) };
  }
  if (type === 'artwork') {
    const artwork = await findArtworkById(id);
    return artwork ? { userId: artwork.user_id, summary: artwork.title || 'Untitled artwork' } : null;
  }
  if (type === 'comment') {
    const comment = await findCommentById(id);
    return comment ? { userId: comment.user_id, summary: comment.text.slice(0, 300) } : null;
  }
  const user = await findUserById(id);
  return user ? { userId: user.id, summary: `@${user.username}` } : null;
}

export async function submitReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const { targetType, targetId, reason, details } = req.body as {
    targetType: ReportTargetType; targetId: string; reason: string; details?: string;
  };

  // Users are reported by username from the UI.
  let resolvedId = targetId;
  if (targetType === 'user') {
    const user = await findUserByUsername(targetId) ?? await findUserById(targetId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    resolvedId = user.id;
  }

  const target = await describeTarget(targetType, resolvedId, authReq.user!.id);
  if (!target) {
    res.status(404).json({ error: 'Nothing to report here - it may have been removed' });
    return;
  }
  if (target.userId === authReq.user!.id) {
    res.status(400).json({ error: "You can't report your own content" });
    return;
  }

  const created = await createReport({
    id: uuidv4(),
    reporterId: authReq.user!.id,
    targetType,
    targetId: resolvedId,
    targetUserId: target.userId,
    reason: reason as never,
    details: details?.trim() || null,
    targetSummary: target.summary,
  });

  // Reporting the same thing twice just keeps the first (still open) report.
  res.status(created ? 201 : 200).json({ success: true, alreadyReported: !created });
}

// --- Admin ---

export async function getModerationOverview(_req: Request, res: Response): Promise<void> {
  res.json(await moderationCounts());
}

export async function getReports(req: Request, res: Response): Promise<void> {
  const status = req.query.status === 'closed' ? 'closed' : 'open';
  const { limit, offset } = parsePagination(req.query);
  res.json({ reports: await listReports(status, limit, offset) });
}

type ModerationAction = 'dismiss' | 'remove_content' | 'suspend_user' | 'remove_and_suspend';

export async function resolveReport(req: Request, res: Response): Promise<void> {
  const admin = (req as AuthRequest).user!;
  const action = req.body.action as ModerationAction;
  const note: string | null = req.body.note?.trim() || null;

  const report = await findReportById(req.params.reportId as string);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  if (report.status !== 'open') {
    res.status(409).json({ error: 'This report has already been handled' });
    return;
  }

  const removes = action === 'remove_content' || action === 'remove_and_suspend';
  const suspends = action === 'suspend_user' || action === 'remove_and_suspend';
  if (removes && report.target_type === 'user') {
    res.status(400).json({ error: 'Users are suspended rather than removed' });
    return;
  }

  const reasonLabel = REASON_LABELS[report.reason] ?? 'breaking the community guidelines';

  if (removes) {
    if (report.target_type === 'artwork') {
      const artwork = await findArtworkById(report.target_id);
      if (artwork) await deleteArtworkWithFiles(artwork);
    } else if (report.target_type === 'message') {
      await deleteMessage(report.target_id);
    } else {
      await deleteComment(report.target_id);
    }
    if (report.target_user_id) {
      await createNotification({
        id: uuidv4(),
        userId: report.target_user_id,
        actorUsername: admin.username,
        type: 'moderation',
        message: `Your ${report.target_type} "${(report.target_summary ?? '').slice(0, 60)}" was removed for ${reasonLabel}`,
      });
    }
  }

  if (suspends && report.target_user_id) {
    await setSuspended(report.target_user_id, true, note ?? reasonLabel);
  }

  const reporters = await closeReportsOnTarget(report.target_type, report.target_id, {
    status: action === 'dismiss' ? 'dismissed' : 'resolved',
    resolution: action,
    note,
    resolvedBy: admin.id,
  });

  // Let reporters know their report was looked at.
  await Promise.all([...new Set(reporters)].map(reporterId => createNotification({
    id: uuidv4(),
    userId: reporterId,
    actorUsername: admin.username,
    type: 'report_update',
    message: action === 'dismiss'
      ? `We reviewed your report about "${(report.target_summary ?? '').slice(0, 60)}" and didn't find a violation`
      : `Thanks for your report about "${(report.target_summary ?? '').slice(0, 60)}" - we've taken action`,
  })));

  res.json({ success: true, closedReports: reporters.length });
}

export async function getAdminUsers(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  res.json({ users: await searchUsersForAdmin(q, 50) });
}

export async function suspendUser(req: Request, res: Response): Promise<void> {
  const admin = (req as AuthRequest).user!;
  const user = await findUserById(req.params.userId as string);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.id === admin.id) {
    res.status(400).json({ error: "You can't suspend yourself" });
    return;
  }

  const suspend = req.body.suspended !== false;
  await setSuspended(user.id, suspend, suspend ? (req.body.reason?.trim() || 'Community guidelines violation') : null);
  res.json({ success: true, suspended: suspend });
}

export async function setUserRole(req: Request, res: Response): Promise<void> {
  const admin = (req as AuthRequest).user!;
  if (req.params.userId === admin.id) {
    res.status(400).json({ error: "You can't change your own role" });
    return;
  }
  const result = await pool.query('UPDATE users SET role = $1 WHERE id = $2', [req.body.role, req.params.userId]);
  if ((result.rowCount ?? 0) === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ success: true, role: req.body.role });
}
