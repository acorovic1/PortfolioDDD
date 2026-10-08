import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../types.ts';
import { findArtworkById, canViewArtwork } from '../repositories/artworks.repository.ts';
import {
  listChallenges,
  findChallenge,
  createChallenge,
  deleteChallenge,
  listEntries,
  findEntryByUser,
  addEntry,
  removeEntry,
  findEntryOwner,
  setVote,
} from '../repositories/challenges.repository.ts';

export async function getChallenges(_req: Request, res: Response): Promise<void> {
  res.json({ challenges: await listChallenges() });
}

export async function getChallenge(req: Request, res: Response): Promise<void> {
  const viewerId = (req as AuthRequest).user?.id ?? null;
  const challenge = await findChallenge(req.params.challengeId as string);
  if (!challenge) {
    res.status(404).json({ error: 'Challenge not found' });
    return;
  }
  res.json({
    challenge,
    entries: await listEntries(challenge.id, viewerId),
    myEntry: viewerId ? (await findEntryByUser(challenge.id, viewerId))?.artworkId ?? null : null,
  });
}

export async function postChallenge(req: Request, res: Response): Promise<void> {
  const id = uuidv4();
  await createChallenge({ id, ...req.body, createdBy: (req as AuthRequest).user!.id });
  res.status(201).json(await findChallenge(id));
}

export async function removeChallenge(req: Request, res: Response): Promise<void> {
  await deleteChallenge(req.params.challengeId as string);
  res.json({ success: true });
}

async function activeChallenge(req: Request, res: Response) {
  const challenge = await findChallenge(req.params.challengeId as string);
  if (!challenge) {
    res.status(404).json({ error: 'Challenge not found' });
    return null;
  }
  if (challenge.status !== 'active') {
    res.status(409).json({ error: challenge.status === 'upcoming' ? "This challenge hasn't started yet" : 'This challenge has ended' });
    return null;
  }
  return challenge;
}

export async function submitEntry(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthRequest).user!.id;
  const challenge = await activeChallenge(req, res);
  if (!challenge) return;

  const artwork = await findArtworkById(req.body.artworkId);
  if (!artwork || artwork.user_id !== userId) {
    res.status(404).json({ error: 'Artwork not found' });
    return;
  }
  // Entries must be visible to everyone voting on them.
  if (artwork.visibility !== 'public' || !canViewArtwork(artwork, null)) {
    res.status(400).json({ error: 'Only published, public artworks can be entered' });
    return;
  }
  if (await findEntryByUser(challenge.id, userId)) {
    res.status(409).json({ error: 'You already have an entry - withdraw it first to enter another artwork' });
    return;
  }

  await addEntry(challenge.id, artwork.id, userId);
  res.status(201).json({ success: true });
}

export async function withdrawEntry(req: Request, res: Response): Promise<void> {
  const challenge = await activeChallenge(req, res);
  if (!challenge) return;
  await removeEntry(challenge.id, (req as AuthRequest).user!.id);
  res.json({ success: true });
}

function voteHandler(voted: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthRequest).user!.id;
    const challenge = await activeChallenge(req, res);
    if (!challenge) return;

    const owner = await findEntryOwner(challenge.id, req.params.artworkId as string);
    if (!owner) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (owner === userId) {
      res.status(400).json({ error: "You can't vote for your own entry" });
      return;
    }

    await setVote(challenge.id, req.params.artworkId as string, userId, voted);
    res.json({ voted });
  };
}

export const voteForEntry = voteHandler(true);
export const unvoteEntry = voteHandler(false);
