import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
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
  setEmailVerifyToken,
  verifyEmailByTokenHash,
  markEmailVerified,
} from '../repositories/users.repository.ts';
import { sendMailInBackground } from '../services/mail.ts';
import { verifyEmailMail, passwordResetMail, passwordChangedMail } from '../services/mail-templates.ts';
import { createEmailToken, hashEmailToken } from '../utils/token.util.ts';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Emails a fresh verification link (replacing any earlier one).
export async function sendVerificationEmail(user: { id: string; email: string; username: string }): Promise<void> {
  const { token, hash } = createEmailToken();
  await setEmailVerifyToken(user.id, hash, new Date(Date.now() + VERIFY_TOKEN_TTL_MS));
  sendMailInBackground(verifyEmailMail(user.email, user.username, token));
}


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
    await sendVerificationEmail({ id, email, username });

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
    const { token, hash } = createEmailToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await setResetToken(user.id, hash, expiresAt);
    sendMailInBackground(passwordResetMail(user.email, user.username, token));
  }

  res.json({ success: true });
}





export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body;
  const user = await findUserByResetTokenHash(hashEmailToken(token));
  if (!user) {
    res.status(400).json({ error: 'This reset link is invalid or has expired' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await updatePasswordHash(user.id, newHash);
  await clearResetToken(user.id);
  // The link arrived by email, so the address is evidently theirs.
  await markEmailVerified(user.id);
  sendMailInBackground(passwordChangedMail(user.email, user.username));

  res.json({ success: true });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const user = await verifyEmailByTokenHash(hashEmailToken(req.body.token));
  if (!user) {
    res.status(400).json({ error: 'This confirmation link is invalid or has expired' });
    return;
  }
  res.json({ success: true, email: user.email });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const user = await findUserById((req as AuthRequest).user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.email_verified_at) {
    res.status(400).json({ error: 'Your email is already confirmed' });
    return;
  }
  await sendVerificationEmail(user);
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
