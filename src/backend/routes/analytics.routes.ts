import { Router } from 'express';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../types.ts';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { getCreatorAnalytics } from '../repositories/analytics.repository.ts';

const RANGES = [7, 30, 90];

export const analyticsRoutes = Router();

// The signed-in creator's own numbers for the last 7/30/90 days.
analyticsRoutes.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const days = RANGES.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(await getCreatorAnalytics((req as AuthRequest).user!.id, days));
});
