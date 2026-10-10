import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { signToken, signTwoFactorChallenge, verifyTwoFactorChallenge } from '../middleware/auth.middleware.ts';
import type { AuthRequest, UserRecord } from '../types.ts';
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
  bumpTokenVersion,
  isUsernameReserved,
} from '../repositories/users.repository.ts';
import { checkSecondFactor } from './two-factor.controller.ts';
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
    if (existingUser || (await isUsernameReserved(username, null))) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await createUser({ id, email, username, name, passwordHash });
    await sendVerificationEmail({ id, email, username });

    const token = signToken({ id, email, username, tokenVersion: 0 });
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

    // With two-factor on, the password alone only earns a short-lived
    // challenge, traded for a session at /login/2fa with a code.
    if (user.totp_enabled_at) {
      res.json({ twoFactorRequired: true, challengeToken: signTwoFactorChallenge(user.id) });
      return;
    }

    res.json(sessionResponse(user));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

function sessionResponse(user: UserRecord) {
  return {
    token: signToken({ id: user.id, email: user.email, username: user.username, tokenVersion: user.token_version }),
    user: { id: user.id, email: user.email, username: user.username, name: user.name },
  };
}

// Second step of a two-factor login: an authenticator code or a recovery code.
export async function loginTwoFactor(req: Request, res: Response): Promise<void> {
  const { challengeToken, code } = req.body;
  const userId = verifyTwoFactorChallenge(challengeToken);
  const user = userId ? await findUserById(userId) : null;
  if (!user || !user.totp_enabled_at) {
    res.status(401).json({ error: 'Your sign-in attempt expired - please start again', challengeExpired: true });
    return;
  }
  if (user.suspended_at) {
    res.status(403).json({ error: 'This account has been suspended', suspended: true });
    return;
  }

  const result = await checkSecondFactor(user, code);
  if (!result) {
    res.status(401).json({ error: 'That code is incorrect' });
    return;
  }

  res.json({ ...sessionResponse(user), usedRecoveryCode: result === 'recovery' });
}

// "Sign out everywhere": every existing token stops working; this session
// gets a fresh one.
export async function logoutEverywhere(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest;
  const user = await findUserById(authReq.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const tokenVersion = await bumpTokenVersion(user.id);
  res.json({ token: signToken({ id: user.id, email: user.email, username: user.username, tokenVersion }) });
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
  // Whoever knew the old password is signed out.
  await bumpTokenVersion(user.id);
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
  const { id, email, username, tokenVersion } = authReq.user!;
  const token = signToken({ id, email, username, tokenVersion: tokenVersion ?? 0 });
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
