import rateLimit from 'express-rate-limit';

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
// (this is a portfolio site, not a high-traffic API) - the stricter
// authRateLimiter above still applies on top of this for auth endpoints.
// Status polls are left to statusPollRateLimiter, so waiting on a long model
// conversion doesn't use up the budget for normal browsing.
export const generalApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
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
