import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { isDbConnectionError } from './config/db.ts';
import { runMigrations } from './db/migrate.ts';
import { authRoutes } from './routes/auth.routes.ts';
import { usersRoutes } from './routes/users.routes.ts';
import { portfolioRoutes } from './routes/portfolio.routes.ts';
import { collectionsRoutes } from './routes/collections.routes.ts';
import { artworksRoutes } from './routes/artworks.routes.ts';
import { notificationsRoutes } from './routes/notifications.routes.ts';
import { feedRoutes } from './routes/feed.routes.ts';
import { reportsRoutes, adminRoutes } from './routes/moderation.routes.ts';
import { messagesRoutes } from './routes/messages.routes.ts';
import { jobsRoutes, marketplaceRoutes } from './routes/community.routes.ts';
import { analyticsRoutes } from './routes/analytics.routes.ts';
import { eventsRoutes } from './routes/events.routes.ts';
import { noAiHeaders } from './middleware/noai.middleware.ts';
import { resizeImage } from './services/images.ts';
import { generalApiRateLimiter } from './middleware/rate-limit.middleware.ts';
import { resumeInterruptedModelJobs } from './pipeline/processor.ts';
import { startPublisher } from './services/publisher.ts';

dotenv.config();

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// CSP is left off: this app's frontend can be served from a different origin
// than the API in dev (Vite on :5173 vs Express on :3001), and a strict
// default-src 'self' policy can't be verified here without a real browser.
// The rest of helmet's defaults (X-Content-Type-Options, X-Frame-Options,
// HSTS, etc.) are safe, non-visual hardening with no such risk.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
// Raw model uploads and the pipeline's scratch space live under uploads/ too,
// but only the processed output is meant to be served.
app.use(['/uploads/sources', '/uploads/tmp'], (_req: Request, res: Response) => {
  res.status(404).end();
});
// Upload names are random UUIDs - a URL's content never changes, so
// browsers and CDNs may cache them forever.
app.use('/uploads', noAiHeaders, express.static('uploads', { immutable: true, maxAge: '365d' }));
// Responsive image variants (outside /api: a gallery page requests many,
// and they're cached hard, so they shouldn't count against API limits).
app.get('/img', resizeImage);
app.use('/api', generalApiRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/artworks', artworksRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/events', eventsRoutes);

let dbReady = false;
let reconnecting = false;
let resumedModelJobs = false;

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(dbReady ? 200 : 503).json({ status: dbReady ? 'ok' : 'degraded', database: dbReady });
});

// In production, the frontend is built to dist/ and served from the same
// process/port as the API - no separate static host or reverse proxy needed.
// Registered last (as a fallback) so it never shadows an actual API route.
const distPath = path.join(process.cwd(), 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/*splat', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export function scheduleReconnect(delayMs = 2000): void {
  if (reconnecting) return;
  reconnecting = true;

  const attempt = async (delay: number) => {
    try {
      await runMigrations();
      dbReady = true;
      reconnecting = false;
      console.log('Database connection (re)established');

      // Only on the first connection: later reconnects mean the process kept
      // running, so its queue is still intact.
      if (!resumedModelJobs) {
        resumedModelJobs = true;
        resumeInterruptedModelJobs().catch(err => console.error('Failed to resume model processing:', err));
        startPublisher();
      }
    } catch (err) {
      console.error(`Database unreachable, retrying in ${delay}ms:`, (err as Error).message);
      setTimeout(() => attempt(Math.min(delay * 2, 30_000)), delay);
    }
  };

  attempt(delayMs);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires 4 params to detect error-handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);

  if (isDbConnectionError(err)) {
    if (dbReady) {
      dbReady = false;
      scheduleReconnect();
    }
    res.status(503).json({ error: 'Database temporarily unavailable, please try again shortly' });
    return;
  }

  res.status(400).json({ error: err.message || 'Server error' });
});
