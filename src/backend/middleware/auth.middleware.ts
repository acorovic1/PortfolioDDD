import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../types.ts';
import { pool } from '../config/db.ts';

const envSecret = process.env.JWT_SECRET;
if (!envSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = envSecret;

type SessionClaims = { id: string; email: string; username: string };

// `tv` is the account's token_version: bumping it (password change, "sign
// out everywhere") makes every older token invalid.
export function signToken(user: SessionClaims & { tokenVersion: number }): string {
  const { id, email, username, tokenVersion } = user;
  return jwt.sign({ id, email, username, tv: tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
}

// Proof that the password step of a two-factor login passed. Only accepted
// by the code step, never as a session.
export function signTwoFactorChallenge(userId: string): string {
  return jwt.sign({ sub: userId, purpose: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyTwoFactorChallenge(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'string' || decoded.purpose !== '2fa' || typeof decoded.sub !== 'string') return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

function isSessionToken(decoded: string | jwt.JwtPayload | undefined): decoded is jwt.JwtPayload & SessionClaims {
  return !!decoded && typeof decoded !== 'string' && typeof decoded.id === 'string' && decoded.purpose === undefined;
}

// For public endpoints that personalize when the caller is signed in (feeds,
// profiles, view counting): attaches req.user for a valid token, otherwise
// carries on anonymously instead of rejecting.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    next();
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && isSessionToken(decoded)) {
      (req as AuthRequest).user = { id: decoded.id, email: decoded.email, username: decoded.username };
    }
    next();
  });
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !isSessionToken(decoded)) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    const user = { id: decoded.id, email: decoded.email, username: decoded.username };
    (req as AuthRequest).user = user;
    // Tokens from before session versions existed count as version 0.
    const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;

    // Suspensions and roles are checked live, so they take effect without
    // waiting for the 7-day token to expire. (A deleted user falls through:
    // handlers answer those with 404.)
    pool.query<{ role: string; suspended_at: string | null; email_verified_at: string | null; token_version: number }>(
      'SELECT role, suspended_at, email_verified_at, token_version FROM users WHERE id = $1',
      [user.id]
    )
      .then(({ rows }) => {
        if (rows[0] && rows[0].token_version !== tokenVersion) {
          res.status(401).json({ error: 'Your session has ended - please sign in again', sessionRevoked: true });
          return;
        }
        if (rows[0]?.suspended_at) {
          res.status(403).json({ error: 'This account has been suspended', suspended: true });
          return;
        }
        (req as AuthRequest).user!.role = rows[0]?.role ?? 'user';
        (req as AuthRequest).user!.emailVerified = !!rows[0]?.email_verified_at;
        (req as AuthRequest).user!.tokenVersion = rows[0]?.token_version ?? 0;
        next();
      })
      .catch(next);
  });
}

// For actions spammers go for (messages, comments, job posts...). Only
// enforced with REQUIRE_EMAIL_VERIFICATION=true. Must come after
// authenticateToken.
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !(req as AuthRequest).user?.emailVerified) {
    res.status(403).json({ error: 'Please confirm your email address first', emailUnverified: true });
    return;
  }
  next();
}

// Must come after authenticateToken.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthRequest).user?.role !== 'admin') {
    res.status(403).json({ error: 'Admins only' });
    return;
  }
  next();
}
