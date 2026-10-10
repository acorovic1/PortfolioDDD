import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import type { AuthRequest, UserRecord } from '../types.ts';
import {
  findUserById,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
  claimTotpStep,
  consumeRecoveryCode,
  setRecoveryCodes,
  bumpTokenVersion,
} from '../repositories/users.repository.ts';
import { signToken } from '../middleware/auth.middleware.ts';
import {
  generateTotpSecret,
  verifyTotp,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../utils/totp.util.ts';
import { sendMailInBackground } from '../services/mail.ts';
import { twoFactorChangedMail } from '../services/mail-templates.ts';

const ISSUER = 'PortfolioDDD';

// Checks an authenticator code (or, failing that, a recovery code, which is
// used up) for an account with two-factor on.
export async function checkSecondFactor(user: UserRecord, rawCode: string): Promise<'totp' | 'recovery' | null> {
  const code = rawCode.trim().replace(/\s/g, '');
  if (!user.totp_secret) return null;

  if (/^\d{6}$/.test(code)) {
    const lastStep = user.totp_last_step === null ? null : Number(user.totp_last_step);
    const step = verifyTotp(decryptSecret(user.totp_secret), code, lastStep);
    return step !== null && (await claimTotpStep(user.id, step)) ? 'totp' : null;
  }

  return (await consumeRecoveryCode(user.id, hashRecoveryCode(code))) ? 'recovery' : null;
}

async function currentUser(req: Request, res: Response): Promise<UserRecord | null> {
  const user = await findUserById((req as AuthRequest).user!.id);
  if (!user) res.status(404).json({ error: 'User not found' });
  return user;
}

export async function twoFactorStatus(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  res.json({
    enabled: user.totp_enabled_at !== null,
    enabledAt: user.totp_enabled_at,
    recoveryCodesLeft: user.totp_recovery_hashes.length,
  });
}

// Step 1: a new secret, shown as a QR code. Nothing changes until it's
// confirmed with a code (enableTwoFactor).
export async function setupTwoFactor(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  if (user.totp_enabled_at) {
    res.status(400).json({ error: 'Two-factor authentication is already on' });
    return;
  }

  const secret = generateTotpSecret();
  await setPendingTotpSecret(user.id, encryptSecret(secret));
  const url = otpauthUrl(secret, user.email, ISSUER);
  res.json({ secret, otpauthUrl: url, qrCode: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
}

// Step 2: a code from the app proves it's set up right. Turns two-factor on,
// hands out recovery codes and signs out every other session.
export async function enableTwoFactor(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  if (user.totp_enabled_at) {
    res.status(400).json({ error: 'Two-factor authentication is already on' });
    return;
  }
  if (!user.totp_pending_secret) {
    res.status(400).json({ error: 'Start the setup first' });
    return;
  }

  const secret = decryptSecret(user.totp_pending_secret);
  const step = verifyTotp(secret, String(req.body.code).trim(), null);
  if (step === null) {
    res.status(400).json({ error: "That code doesn't match - check the time on your phone and try again" });
    return;
  }

  const recoveryCodes = generateRecoveryCodes();
  await enableTotp(user.id, encryptSecret(secret), step, recoveryCodes.map(hashRecoveryCode));
  const tokenVersion = await bumpTokenVersion(user.id);
  sendMailInBackground(twoFactorChangedMail(user.email, user.username, true));

  res.json({
    recoveryCodes,
    token: signToken({ id: user.id, email: user.email, username: user.username, tokenVersion }),
  });
}

// Needs the password and a current code (or a recovery code).
export async function disableTwoFactor(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  if (!user.totp_enabled_at) {
    res.status(400).json({ error: 'Two-factor authentication is not on' });
    return;
  }
  if (!(await bcrypt.compare(req.body.password, user.password_hash))) {
    res.status(401).json({ error: 'Password is incorrect' });
    return;
  }
  if (!(await checkSecondFactor(user, req.body.code))) {
    res.status(401).json({ error: 'That code is incorrect' });
    return;
  }

  await disableTotp(user.id);
  sendMailInBackground(twoFactorChangedMail(user.email, user.username, false));
  res.json({ success: true });
}

// A fresh set of recovery codes; the old ones stop working.
export async function regenerateRecoveryCodes(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  if (!user.totp_enabled_at) {
    res.status(400).json({ error: 'Two-factor authentication is not on' });
    return;
  }
  if (!(await bcrypt.compare(req.body.password, user.password_hash))) {
    res.status(401).json({ error: 'Password is incorrect' });
    return;
  }

  const recoveryCodes = generateRecoveryCodes();
  await setRecoveryCodes(user.id, recoveryCodes.map(hashRecoveryCode));
  res.json({ recoveryCodes });
}
