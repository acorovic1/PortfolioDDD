import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { pool } from '../config/db.ts';
import { findUserByUsername, findRenamedUser } from '../repositories/users.repository.ts';
import { findArtworkById, canViewArtwork, listedCondition } from '../repositories/artworks.repository.ts';
import { readStoredFile } from '../storage/storage.ts';
import { domainOwner } from '../services/custom-domains.ts';

// Server-side page metadata for crawlers and link previews (Slack, X,
// Discord, iMessage...), which don't run the React app: the built
// index.html gets a per-page <title>, description, Open Graph/Twitter tags,
// canonical URL and structured data injected before it's sent.

export const SITE_NAME = 'PortfolioDDD';
const SITE_DESCRIPTION = '3D artists showcase interactive models, renders and breakdowns - explore portfolios, hire artists and find 3D assets.';

// Pages that are per-user and shouldn't be indexed.
const PRIVATE_PATHS = ['/portfolio', '/settings', '/messages', '/admin', '/analytics', '/liked-posts', '/my-comments', '/saved', '/login', '/reset-password'];

export type PageMeta = {
  title: string;
  description: string;
  // Path (on this site) or absolute URL of the preview image.
  image: string | null;
  type: 'website' | 'profile' | 'article';
  noindex: boolean;
  noai: boolean;
  jsonLd: Record<string, unknown> | null;
  canonicalPath: string;
  // Set when the page lives elsewhere now (a renamed profile): answered with
  // a permanent redirect instead of a page.
  redirectTo?: string;
};

// Profiles live at /@username (canonical) and /u/username.
const PROFILE_PATH = /^\/(?:@|u\/)([^/]+)$/;

export function profilePath(username: string): string {
  return `/@${encodeURIComponent(username)}`;
}

// The public origin used in absolute URLs (og:url, og:image, sitemap).
// PUBLIC_URL is the reliable choice behind a proxy/CDN.
export function publicOrigin(req: Request): string {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function excerpt(text: string | null | undefined, max = 200): string | null {
  const clean = text?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function pageMeta(pathname: string, query: Record<string, unknown>): Promise<PageMeta> {
  const base: PageMeta = {
    title: `${SITE_NAME} - 3D art portfolios`,
    description: SITE_DESCRIPTION,
    image: null,
    type: 'website',
    noindex: false,
    noai: false,
    jsonLd: null,
    canonicalPath: pathname,
  };

  if (PRIVATE_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    return { ...base, noindex: true };
  }
  if (pathname === '/jobs') {
    return { ...base, title: `3D art jobs · ${SITE_NAME}`, description: 'Studios and clients hiring 3D artists - full-time, contract and freelance roles.' };
  }
  if (pathname === '/marketplace') {
    return { ...base, title: `3D model marketplace · ${SITE_NAME}`, description: 'Game-ready models, kitbash parts and props - free downloads and assets for sale.' };
  }

  const profile = PROFILE_PATH.exec(pathname);
  if (!profile) return base;

  const username = decodeURIComponent(profile[1]);
  const user = await findUserByUsername(username);
  if (!user) {
    const renamed = await findRenamedUser(username);
    if (renamed && !renamed.suspended_at) {
      const search = new URLSearchParams(query as Record<string, string>).toString();
      return { ...base, redirectTo: `${profilePath(renamed.username)}${search ? `?${search}` : ''}` };
    }
  }
  if (!user || user.suspended_at) return { ...base, title: `Profile not found · ${SITE_NAME}`, noindex: true };
  const canonicalProfile = profilePath(user.username);

  const displayName = user.name && user.name !== user.username ? `${user.name} (@${user.username})` : `@${user.username}`;
  const artworkId = typeof query.artwork === 'string' ? query.artwork : null;

  if (artworkId) {
    const artwork = await findArtworkById(artworkId);
    if (artwork && artwork.user_id === user.id && canViewArtwork(artwork, null)) {
      const title = artwork.title || 'Untitled';
      return {
        ...base,
        title: `${title} by ${displayName} · ${SITE_NAME}`,
        description: excerpt(artwork.description) ?? `${title} - an interactive 3D artwork by ${displayName}.`,
        image: `/og/artwork/${artwork.id}.jpg`,
        type: 'article',
        // Unlisted work is reachable by link but shouldn't be indexed.
        noindex: artwork.visibility !== 'public',
        noai: user.no_ai_training,
        canonicalPath: `${canonicalProfile}?artwork=${artwork.id}`,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'VisualArtwork',
          name: title,
          description: excerpt(artwork.description, 500) ?? undefined,
          artMedium: '3D model',
          keywords: artwork.tags?.join(', ') || undefined,
          dateCreated: artwork.published_at ?? artwork.created_at,
          creator: { '@type': 'Person', name: user.name || user.username, alternateName: `@${user.username}` },
        },
      };
    }
  }

  const tagline = [user.title, user.location].filter(Boolean).join(' · ');
  return {
    ...base,
    title: `${displayName}${user.title ? ` - ${user.title}` : ''} · ${SITE_NAME}`,
    description: excerpt(user.bio) ?? (tagline ? `${tagline}. 3D portfolio on ${SITE_NAME}.` : `3D portfolio of ${displayName} on ${SITE_NAME}.`),
    image: `/og/user/${encodeURIComponent(user.username)}.jpg`,
    type: 'profile',
    noai: user.no_ai_training,
    canonicalPath: canonicalProfile,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        name: user.name || user.username,
        alternateName: `@${user.username}`,
        jobTitle: user.title ?? undefined,
        description: excerpt(user.bio, 500) ?? undefined,
      },
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderHead(meta: PageMeta, origin: string): string {
  const url = `${origin}${meta.canonicalPath}`;
  const image = meta.image ? (meta.image.startsWith('http') ? meta.image : `${origin}${meta.image}`) : null;
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ];
  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    );
  }
  const robots = [meta.noindex && 'noindex', meta.noai && 'noai', meta.noai && 'noimageai'].filter(Boolean);
  if (robots.length) tags.push(`<meta name="robots" content="${robots.join(', ')}" />`);
  if (meta.jsonLd) {
    // "<" escaped so a title can't close the script tag.
    tags.push(`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

let template: string | null = null;

// Express handler for app routes in production (serves the built SPA).
export function serveAppHtml(distPath: string) {
  return async (req: Request, res: Response): Promise<void> => {
    template ??= readFileSync(path.join(distPath, 'index.html'), 'utf-8');
    let head: string;
    try {
      // On an artist's custom domain, its root is their profile, and the
      // app is told whose it is.
      const owner = await domainOwner(req.hostname);
      const atDomainRoot = owner !== null && req.path === '/';
      const meta = await pageMeta(atDomainRoot ? profilePath(owner) : req.path, req.query);
      if (meta.redirectTo) {
        res.redirect(301, meta.redirectTo);
        return;
      }
      if (atDomainRoot) meta.canonicalPath = meta.canonicalPath.replace(/^\/@[^?]*/, '/');
      head = renderHead(meta, owner ? `${req.protocol}://${req.get('host')}` : publicOrigin(req));
      if (owner) head += `\n    <meta name="portfolio-domain-owner" content="${escapeHtml(owner)}" />`;
    } catch (error) {
      // Never fail the page over metadata (e.g. the database is down).
      console.error('Failed to build page metadata:', error);
      head = renderHead(await pageMeta('/', {}), publicOrigin(req));
    }
    // Swap the build's default title/description for this page's metadata.
    const html = template
      .replace(/<meta name="description"[^>]*>\s*/, '')
      .replace(/<title>[\s\S]*?<\/title>/, head);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html);
  };
}

// --- Preview images (1200x630 JPEG, what link previews expect) ---

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_CACHE_DIR = path.join('uploads', 'cache', 'og');

function placeholderSvg(title: string, subtitle: string): Buffer {
  const esc = (s: string) => escapeHtml(s.length > 60 ? `${s.slice(0, 59)}…` : s);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a8a"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="80" y="300" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${esc(title)}</text>
    <text x="80" y="380" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="36" fill="#93c5fd">${esc(subtitle)}</text>
    <text x="80" y="560" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#cbd5e1">${SITE_NAME}</text>
  </svg>`);
}

// Renders (and caches) a preview from the source image, or a branded
// placeholder when there isn't one. The cache key includes the source, so a
// new render/cover produces a new preview.
async function ogImage(source: string | null, title: string, subtitle: string): Promise<Buffer> {
  const key = crypto.createHash('sha256').update(`${source ?? ''}|${title}|${subtitle}`).digest('hex').slice(0, 32);
  const cached = path.join(OG_CACHE_DIR, `${key}.jpg`);
  try {
    return await readFile(cached);
  } catch {
    // not cached yet
  }

  let image: Buffer;
  try {
    if (!source) throw new Error('no source');
    image = await sharp(await readStoredFile(source))
      .rotate()
      .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
      .flatten({ background: '#0f172a' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    image = await sharp(placeholderSvg(title, subtitle)).jpeg({ quality: 85 }).toBuffer();
  }

  await mkdir(OG_CACHE_DIR, { recursive: true });
  await writeFile(cached, image);
  return image;
}

function sendOg(res: Response, image: Buffer): void {
  res.setHeader('Content-Type', 'image/jpeg');
  // Previews can change (new render/cover), so cache for a day, not forever.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(image);
}

export async function artworkOgImage(req: Request, res: Response): Promise<void> {
  const artwork = await findArtworkById(String(req.params.artworkId).replace(/\.jpg$/, ''));
  if (!artwork || !canViewArtwork(artwork, null)) {
    res.status(404).end();
    return;
  }
  const { rows } = await pool.query<{ url: string; username: string }>(
    `SELECT (SELECT r.url FROM renders r WHERE r.artwork_id = $1 ORDER BY r.created_at LIMIT 1) AS url,
            (SELECT u.username FROM users u WHERE u.id = $2) AS username`,
    [artwork.id, artwork.user_id]
  );
  sendOg(res, await ogImage(rows[0]?.url ?? artwork.thumbnail_path, artwork.title || 'Untitled', `by @${rows[0]?.username ?? ''}`));
}

export async function userOgImage(req: Request, res: Response): Promise<void> {
  const user = await findUserByUsername(decodeURIComponent(String(req.params.username).replace(/\.jpg$/, '')));
  if (!user || user.suspended_at) {
    res.status(404).end();
    return;
  }
  // Their cover, else their most recent artwork's render or thumbnail.
  const { rows } = await pool.query<{ url: string | null }>(
    `SELECT COALESCE(
       (SELECT r.url FROM renders r JOIN artworks a ON a.id = r.artwork_id
        WHERE a.user_id = $1 AND ${listedCondition('a')} ORDER BY a.published_at DESC LIMIT 1),
       (SELECT a.thumbnail_path FROM artworks a WHERE a.user_id = $1 AND ${listedCondition('a')}
        AND a.thumbnail_path IS NOT NULL ORDER BY a.published_at DESC LIMIT 1)
     ) AS url`,
    [user.id]
  );
  sendOg(res, await ogImage(user.cover_url ?? rows[0]?.url ?? null, user.name || `@${user.username}`, user.title || '3D artist'));
}

// --- Crawler files ---

export function robotsTxt(req: Request, res: Response): void {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    ...['/api/', ...PRIVATE_PATHS].map(p => `Disallow: ${p}`),
    '',
    `Sitemap: ${publicOrigin(req)}/sitemap.xml`,
    '',
  ].join('\n'));
}

export async function sitemapXml(req: Request, res: Response): Promise<void> {
  const origin = publicOrigin(req);
  const [profiles, artworks] = await Promise.all([
    pool.query<{ username: string; lastmod: string }>(
      `SELECT u.username, MAX(a.published_at) AS lastmod
       FROM users u JOIN artworks a ON a.user_id = u.id
       WHERE ${listedCondition('a')}
       GROUP BY u.username ORDER BY lastmod DESC LIMIT 10000`
    ),
    pool.query<{ id: string; username: string; lastmod: string }>(
      `SELECT a.id, u.username, a.updated_at AS lastmod
       FROM artworks a JOIN users u ON u.id = a.user_id
       WHERE ${listedCondition('a')}
       ORDER BY a.published_at DESC LIMIT 40000`
    ),
  ]);

  const entry = (loc: string, lastmod?: string) =>
    `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;
  const urls = [
    entry(`${origin}/`),
    entry(`${origin}/jobs`),
    entry(`${origin}/marketplace`),
    ...profiles.rows.map(p => entry(`${origin}${profilePath(p.username)}`, p.lastmod)),
    ...artworks.rows.map(a => entry(`${origin}${profilePath(a.username)}?artwork=${a.id}`, a.lastmod)),
  ];

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`);
}
