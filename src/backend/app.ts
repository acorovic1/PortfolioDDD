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
import { generalApiRateLimiter } from './middleware/rate-limit.middleware.ts';

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
app.use('/uploads', express.static('uploads'));
app.use('/api', generalApiRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/artworks', artworksRoutes);
app.use('/api/notifications', notificationsRoutes);

let dbReady = false;
let reconnecting = false;

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
