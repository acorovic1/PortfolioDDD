import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../types.ts';
import { pool } from '../config/db.ts';

const envSecret = process.env.JWT_SECRET;
if (!envSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = envSecret;

export function signToken(payload: { id: string; email: string; username: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
    if (!err && decoded && typeof decoded !== 'string') {
      (req as AuthRequest).user = decoded as { id: string; email: string; username: string };
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
    if (err || !decoded || typeof decoded === 'string') {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    const user = decoded as { id: string; email: string; username: string };
    (req as AuthRequest).user = user;

    // Suspensions and roles are checked live, so they take effect without
    // waiting for the 7-day token to expire. (A deleted user falls through:
    // handlers answer those with 404.)
    pool.query<{ role: string; suspended_at: string | null }>(
      'SELECT role, suspended_at FROM users WHERE id = $1',
      [user.id]
    )
      .then(({ rows }) => {
        if (rows[0]?.suspended_at) {
          res.status(403).json({ error: 'This account has been suspended', suspended: true });
          return;
        }
        (req as AuthRequest).user!.role = rows[0]?.role ?? 'user';
        next();
      })
      .catch(next);
  });
}

// Must come after authenticateToken.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthRequest).user?.role !== 'admin') {
    res.status(403).json({ error: 'Admins only' });
    return;
  }
  next();
}
