import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import {
  listJobs,
  findJob,
  createJob,
  updateJob,
  deleteJob,
  addApplication,
  listApplications,
} from '../repositories/jobs.repository.ts';
import { sendMessage } from '../repositories/messages.repository.ts';
import { createNotification } from '../repositories/notifications.repository.ts';
import { isBlockedEitherWay } from '../repositories/moderation.repository.ts';
import { parsePagination } from '../utils/pagination.util.ts';

const text = (value: unknown, max = 100) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

export async function getJobs(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const mine = req.query.mine === 'true';
  if (mine && !viewerId) {
    res.status(401).json({ error: 'Sign in to see your postings' });
    return;
  }

  const { limit, offset } = parsePagination(req.query);
  res.json(await listJobs({
    viewerId,
    q: text(req.query.q),
    employmentType: text(req.query.type, 16),
    workplace: text(req.query.workplace, 16),
    skill: text(req.query.skill, 64),
    mine,
    limit,
    offset,
  }));
}

export async function getJob(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const job = await findJob(req.params.jobId as string, viewerId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const { posterId, live, ...dto } = job;
  // Closed/expired postings stay visible to their poster only.
  if (!live && posterId !== viewerId) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(dto);
}

export async function postJob(req: Request, res: Response): Promise<void> {
  const id = uuidv4();
  await createJob(id, (req as AuthRequest).user!.id, req.body);
  res.status(201).json(await findJob(id, (req as AuthRequest).user!.id));
}

async function ownJob(req: Request, res: Response) {
  const userId = (req as AuthRequest).user!.id;
  const job = await findJob(req.params.jobId as string, userId);
  if (!job || job.posterId !== userId) {
    res.status(404).json({ error: 'Job not found' });
    return null;
  }
  return job;
}

export async function editJob(req: Request, res: Response): Promise<void> {
  const job = await ownJob(req, res);
  if (!job) return;
  await updateJob(job.id, req.body);
  res.json(await findJob(job.id, (req as AuthRequest).user!.id));
}

export async function removeJob(req: Request, res: Response): Promise<void> {
  const job = await ownJob(req, res);
  if (!job) return;
  await deleteJob(job.id);
  res.json({ success: true });
}

// Applying sends the poster a message (so the conversation can continue in
// the inbox) and records the application.
export async function applyToJob(req: Request, res: Response): Promise<void> {
  const applicant = (req as AuthRequest).user!;
  const job = await findJob(req.params.jobId as string, applicant.id);
  if (!job || !job.live) {
    res.status(404).json({ error: 'This job is no longer open' });
    return;
  }
  if (job.posterId === applicant.id) {
    res.status(400).json({ error: "You can't apply to your own posting" });
    return;
  }
  if (await isBlockedEitherWay(applicant.id, job.posterId)) {
    res.status(403).json({ error: "You can't apply to this posting" });
    return;
  }

  const message = String(req.body.message).trim();
  const isNew = await addApplication(job.id, applicant.id, message);
  if (!isNew) {
    res.status(409).json({ error: "You've already applied to this job" });
    return;
  }

  await sendMessage({
    senderId: applicant.id,
    recipientId: job.posterId,
    body: `Application for "${job.title}" at ${job.company}\n\n${message}`,
    kind: 'message',
  });
  await createNotification({
    id: uuidv4(),
    userId: job.posterId,
    actorUsername: applicant.username,
    type: 'message',
    message: `@${applicant.username} applied to "${job.title}"`,
  });

  res.status(201).json({ success: true });
}

export async function getApplications(req: Request, res: Response): Promise<void> {
  const job = await ownJob(req, res);
  if (!job) return;
  res.json({ applications: await listApplications(job.id) });
}
