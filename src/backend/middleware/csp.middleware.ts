import { storageOrigin } from '../storage/storage.ts';

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// The content security policy for the pages this server serves (the built
// frontend in dist/). It's the backstop if an XSS bug ever slips in: scripts
// only from this origin, and data only sent to the places the app talks to,
// so an injected script can't load more code or ship a session token off.
// (In dev the page comes from Vite, which sends no policy.)
//
// Besides this origin, the page talks to the API (VITE_API_URL - on an
// artist's custom domain it's a different origin) and loads uploads from the
// bucket/CDN when storage is S3.
export function contentSecurityPolicy(): Record<string, string[] | null> {
  const others = [...new Set([
    originOf(process.env.PUBLIC_URL),
    originOf(process.env.VITE_API_URL),
    storageOrigin(),
  ].filter((origin): origin is string => origin !== null))];

  return {
    'default-src': ["'self'"],
    // WebAssembly: the Meshopt and Draco model decoders.
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    // The Draco decoder runs in a worker created from a blob: URL.
    'worker-src': ["'self'", 'blob:'],
    // React and three set inline styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    // blob:/data: - local previews of files being uploaded, textures inside
    // models, the two-factor QR code.
    'img-src': ["'self'", 'data:', 'blob:', ...others],
    'media-src': ["'self'", 'blob:', ...others],
    // Models (and their textures, read with fetch) and the API, incl. SSE.
    'connect-src': ["'self'", 'data:', 'blob:', ...others],
    'font-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    // Only on an https site: on plain-http localhost it would break every request.
    'upgrade-insecure-requests': process.env.PUBLIC_URL?.startsWith('https://') ? [] : null,
  };
}
