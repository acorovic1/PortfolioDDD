import type { Request, Response } from 'express';
import type { AuthRequest, UserRecord } from '../types.ts';
import { pool } from '../config/db.ts';
import { findUserById } from '../repositories/users.repository.ts';
import {
  normalizeDomain,
  newVerificationToken,
  verificationRecord,
  hasVerificationRecord,
  siteHostname,
  clearDomainCache,
} from '../services/custom-domains.ts';

function domainStatus(user: UserRecord, req: Request) {
  if (!user.custom_domain) return { domain: null };
  return {
    domain: user.custom_domain,
    verified: user.custom_domain_verified_at !== null,
    verifiedAt: user.custom_domain_verified_at,
    txtRecord: verificationRecord(user.custom_domain, user.custom_domain_token ?? ''),
    // Where the domain's CNAME should point.
    target: siteHostname() ?? req.hostname,
  };
}

async function currentUser(req: Request, res: Response): Promise<UserRecord | null> {
  const user = await findUserById((req as AuthRequest).user!.id);
  if (!user) res.status(404).json({ error: 'User not found' });
  return user;
}

export async function getMyDomain(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (user) res.json(domainStatus(user, req));
}

// Claims a domain (unverified until its TXT record checks out).
export async function setMyDomain(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;

  const domain = normalizeDomain(String(req.body.domain ?? ''));
  if (!domain) {
    res.status(400).json({ error: 'Enter a domain you own, like portfolio.example.com' });
    return;
  }
  if (domain === user.custom_domain) {
    res.json(domainStatus(user, req));
    return;
  }

  const taken = await pool.query('SELECT 1 FROM users WHERE custom_domain = $1 AND id <> $2', [domain, user.id]);
  if (taken.rowCount) {
    res.status(400).json({ error: 'That domain is already connected to another account' });
    return;
  }

  await pool.query(
    `UPDATE users SET custom_domain = $1, custom_domain_token = $2, custom_domain_verified_at = NULL WHERE id = $3`,
    [domain, newVerificationToken(), user.id]
  );
  clearDomainCache();
  res.json(domainStatus((await findUserById(user.id))!, req));
}

export async function verifyMyDomain(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  if (!user.custom_domain || !user.custom_domain_token) {
    res.status(400).json({ error: 'Add a domain first' });
    return;
  }

  if (!(await hasVerificationRecord(user.custom_domain, user.custom_domain_token))) {
    const { name } = verificationRecord(user.custom_domain, user.custom_domain_token);
    res.status(400).json({
      error: `The TXT record for ${name} wasn't found yet. DNS changes can take a while to spread - try again in a few minutes.`,
    });
    return;
  }

  await pool.query('UPDATE users SET custom_domain_verified_at = NOW() WHERE id = $1', [user.id]);
  clearDomainCache();
  res.json(domainStatus((await findUserById(user.id))!, req));
}

export async function removeMyDomain(req: Request, res: Response): Promise<void> {
  const user = await currentUser(req, res);
  if (!user) return;
  await pool.query(
    'UPDATE users SET custom_domain = NULL, custom_domain_token = NULL, custom_domain_verified_at = NULL WHERE id = $1',
    [user.id]
  );
  clearDomainCache();
  res.json({ domain: null });
}

// For a TLS proxy issuing certificates on demand (Caddy's `ask`): 200 only
// for verified domains, so it never requests certificates for random hosts.
export async function checkDomain(req: Request, res: Response): Promise<void> {
  const domain = normalizeDomain(String(req.query.domain ?? ''));
  if (!domain) {
    res.status(404).end();
    return;
  }
  const { rowCount } = await pool.query(
    'SELECT 1 FROM users WHERE custom_domain = $1 AND custom_domain_verified_at IS NOT NULL AND suspended_at IS NULL',
    [domain]
  );
  res.status(rowCount ? 200 : 404).end();
}
