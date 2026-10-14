import rateLimit from 'express-rate-limit';
import { isVariantReady } from '../services/images.ts';
import type { AuthRequest } from '../types.ts';

// Off for automated tests: vitest (NODE_ENV=test) and the Playwright e2e
// servers (DISABLE_RATE_LIMIT=true), which send every request from one IP.
export function rateLimitsDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true';
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
  skip: rateLimitsDisabled,
});

// Model-processing status polls (GET /api/portfolio/artworks/:id/status).
const STATUS_POLL_PATH = /^\/portfolio\/artworks\/[^/]+\/status$/;

// Defense-in-depth applied to every /api route, well above normal usage
// (a page load makes dozens of API calls, so a visitor clicking around and
// refreshing stays far below it) - the stricter
// authRateLimiter above still applies on top of this for auth endpoints.
// Status polls are left to statusPollRateLimiter, so waiting on a long model
// conversion doesn't use up the budget for normal browsing.
export const generalApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => rateLimitsDisabled() || (req.method === 'GET' && STATUS_POLL_PATH.test(req.path)),
});

// The client backs off to one poll every few seconds, so this comfortably
// covers several long conversions at once.
export const statusPollRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: rateLimitsDisabled,
});

// New image variants (/img): each one reads the original from storage and
// resizes it, the most expensive request there is. Variants already made are
// cached for everyone and don't count, so normal browsing never gets near
// this; a bot asking for every image at every size does.
export const imageResizeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => rateLimitsDisabled() || isVariantReady(req),
});

// Per-account caps on uploads (they come after authenticateToken, and before
// multer so a rejected upload is never written to disk). Model uploads are
// the costliest: each is converted and optimized on the server, one at a time,
// so a single account flooding them would hold up everyone else's.
export const modelUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user!.id,
  message: { error: "You've uploaded a lot of models recently - try again in a while" },
  skip: rateLimitsDisabled,
});

// Images, videos, renders, thumbnails, avatars and covers.
export const mediaUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user!.id,
  message: { error: "You've uploaded a lot of files recently - try again in a while" },
  skip: rateLimitsDisabled,
});
