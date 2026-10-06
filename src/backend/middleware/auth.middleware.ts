import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../types.ts';

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
    (req as AuthRequest).user = decoded as { id: string; email: string; username: string };
    next();
  });
}
