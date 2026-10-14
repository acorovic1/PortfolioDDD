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
import { contentSecurityPolicy } from './middleware/csp.middleware.ts';
import { resizeImage } from './services/images.ts';
import { serveAppHtml, artworkOgImage, userOgImage, robotsTxt, sitemapXml } from './seo/seo.ts';
import { generalApiRateLimiter, imageResizeRateLimiter } from './middleware/rate-limit.middleware.ts';
import { resumeInterruptedModelJobs } from './pipeline/processor.ts';
import { startPublisher } from './services/publisher.ts';
import { backfillStorageLedger } from './services/storage-quota.ts';
import { startNotificationMailer } from './services/notification-mailer.ts';
import { domainOwner } from './services/custom-domains.ts';
import { checkDomain } from './controllers/domains.controller.ts';
import { MulterError } from 'multer';
import { UploadRejectedError } from './utils/upload.util.ts';

dotenv.config();

export const app = express();

// Behind a reverse proxy (Render, Fly, nginx, a load balancer...) every
// request arrives from the proxy's address, so all visitors would share one
// rate-limit budget. TRUST_PROXY is how many proxies sit in front: Express
// then takes the visitor's address from X-Forwarded-For. Off by default -
// without a proxy in front, anyone could fake that header.
const trustedProxies = Number(process.env.TRUST_PROXY) || 0;
if (trustedProxies > 0) app.set('trust proxy', trustedProxies);

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// The CSP matters for the built frontend this server serves from dist/ (see
// csp.middleware.ts); on JSON responses it's harmless.
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: contentSecurityPolicy() },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// The configured origins, plus artists' verified custom domains (their
// profile pages call the API from there).
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    let host: string;
    try {
      host = new URL(origin).hostname;
    } catch {
      callback(null, false);
      return;
    }
    domainOwner(host).then(owner => callback(null, owner !== null), () => callback(null, false));
  },
}));
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
// Only new variants - an actual resize - count against their own limit.
app.get('/img', imageResizeRateLimiter, resizeImage);

// Crawlers and link previews.
app.get('/robots.txt', robotsTxt);
app.get('/sitemap.xml', sitemapXml);
app.get('/og/artwork/:artworkId', artworkOgImage);
app.get('/og/user/:username', userOgImage);
app.use('/api', generalApiRateLimiter);

// Asked by the TLS proxy before it gets a certificate for a custom domain.
app.get('/api/domains/check', checkDomain);

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
  // Vite's hashed bundles never change; index.html is served (with page
  // metadata injected) by the fallback below, never as a static file.
  app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '365d' }));
  app.use(express.static(distPath, { index: false }));
  const appHtml = serveAppHtml(distPath);
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    appHtml(req, res).catch(next);
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
        backfillStorageLedger().catch(err => console.error('Failed to count existing files towards storage:', err));
        startPublisher();
        startNotificationMailer();
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

  // Only errors meant for the client say what went wrong; anything else
  // (a database or library error) could reveal internals, so it stays in the
  // log above.
  if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
    return;
  }
  // Postgres rejecting malformed input (e.g. a non-UUID id in the URL) is
  // the client's mistake, not a server failure.
  if ((err as { code?: string }).code === '22P02') {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  if (err instanceof UploadRejectedError) {
    res.status(400).json({ error: err.message });
    return;
  }
  // body-parser's errors (malformed JSON, a body too large) carry their
  // status and are marked safe to show.
  const status = (err as { status?: number }).status;
  if ((err as { expose?: boolean }).expose && typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Server error' });
});
