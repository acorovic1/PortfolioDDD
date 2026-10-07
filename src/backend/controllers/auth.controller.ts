import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { signToken } from '../middleware/auth.middleware.ts';
import type { AuthRequest } from '../types.ts';
import {
  createUser,
  findUserByEmailOrUsername,
  findUserByEmail,
  findUserById,
  setResetToken,
  findUserByResetTokenHash,
  clearResetToken,
  updatePasswordHash,
  toPublicUser,
} from '../repositories/users.repository.ts';


export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, username } = req.body;
    const name = req.body.name || username;

    const existingUser = await findUserByEmailOrUsername(email, username);
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await createUser({ id, email, username, name, passwordHash });

    const token = signToken({ id, email, username });
    res.status(201).json({ token, user: { id, email, username, name } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}




export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.suspended_at) {
      res.status(403).json({
        error: `This account has been suspended${user.suspension_reason ? `: ${user.suspension_reason}` : ''}`,
        suspended: true,
      });
      return;
    }

    const token = signToken({ id: user.id, email: user.email, username: user.username });
    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, name: user.name },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}





export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  const user = await findUserByEmail(email);

  // Always respond the same way regardless of whether the email exists,
  // so this endpoint can't be used to enumerate registered accounts.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await setResetToken(user.id, tokenHash, expiresAt);

    // No email service is configured in this project - the reset link is
    // logged here as a stand-in for actually emailing it to the user.
    const frontendUrl = process.env.CORS_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
    console.log(`[password reset] ${user.email} -> ${frontendUrl}/reset-password?token=${token}`);
  }

  res.json({ success: true });
}





export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await findUserByResetTokenHash(tokenHash);
  if (!user) {
    res.status(400).json({ error: 'This reset link is invalid or has expired' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await updatePasswordHash(user.id, newHash);
  await clearResetToken(user.id);

  res.json({ success: true });
}





export async function refresh(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  // authenticateToken already required a currently-valid token to reach here,
  // so this is a sliding session: an active user is silently re-issued a
  // fresh 7-day token instead of ever hitting a hard cutoff. An abandoned
  // session still expires normally once nothing calls this in time.
  const token = signToken({ id: authReq.user!.id, email: authReq.user!.email, username: authReq.user!.username });
  res.json({ token });
}




export async function me(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const user = await findUserById(authReq.user!.id);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(toPublicUser(user));
}
