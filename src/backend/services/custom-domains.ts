import crypto from 'node:crypto';
import { promises as dns } from 'node:dns';
import { pool } from '../config/db.ts';

// Artists can serve their profile from their own domain. They point the
// domain at this site (CNAME/A record) and prove they own it with a TXT
// record; only then does the site answer for it. HTTPS for these domains is
// up to the proxy in front (e.g. Caddy's on-demand TLS, which asks
// GET /api/domains/check before issuing a certificate).

const TXT_PREFIX = '_portfolioddd';
const TXT_VALUE_PREFIX = 'portfolioddd-verification=';

export function verificationRecord(domain: string, token: string): { name: string; value: string } {
  return { name: `${TXT_PREFIX}.${domain}`, value: `${TXT_VALUE_PREFIX}${token}` };
}

export function newVerificationToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// The site's own hostname (never claimable).
export function siteHostname(): string | null {
  try {
    return process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).hostname : null;
  } catch {
    return null;
  }
}

// "https://Portfolio.Example.com/foo" -> "portfolio.example.com", or null if
// it isn't a usable public hostname.
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (host.length > 253 || !host.includes('.')) return null;
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const labels = host.split('.');
  if (!labels.every(l => label.test(l))) return null;
  // Not an IP address, and the top-level domain has letters.
  if (/^\d+$/.test(labels[labels.length - 1])) return null;
  if (host === 'localhost' || host.endsWith('.localhost')) return null;
  const site = siteHostname();
  if (site && (host === site || host.endsWith(`.${site}`))) return null;
  return host;
}

type TxtResolver = (name: string) => Promise<string[][]>;
let resolveTxt: TxtResolver = (name) => dns.resolveTxt(name);

// Tests swap in a fake DNS.
export function setTxtResolver(resolver: TxtResolver | null): void {
  resolveTxt = resolver ?? ((name) => dns.resolveTxt(name));
}

export async function hasVerificationRecord(domain: string, token: string): Promise<boolean> {
  const { name, value } = verificationRecord(domain, token);
  try {
    const records = await resolveTxt(name);
    // A TXT record may arrive split into several strings.
    return records.some(parts => parts.join('').trim() === value);
  } catch {
    return false;
  }
}

// --- Which profile a request's Host belongs to ---

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { username: string | null; expires: number }>();

export function clearDomainCache(): void {
  cache.clear();
}

// The username whose verified custom domain `host` is, or null.
export async function domainOwner(host: string | undefined): Promise<string | null> {
  if (!host) return null;
  const domain = host.toLowerCase().replace(/:\d+$/, '');
  if (domain === siteHostname()) return null;

  const hit = cache.get(domain);
  if (hit && hit.expires > Date.now()) return hit.username;

  const { rows } = await pool.query<{ username: string }>(
    `SELECT username FROM users
     WHERE custom_domain = $1 AND custom_domain_verified_at IS NOT NULL AND suspended_at IS NULL`,
    [domain]
  );
  const username = rows[0]?.username ?? null;
  cache.set(domain, { username, expires: Date.now() + CACHE_TTL_MS });
  return username;
}
