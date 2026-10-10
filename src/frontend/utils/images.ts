import { API_BASE_URL } from '@/frontend/config/api';

// Widths the server's /img resizer produces (src/backend/services/images.ts).
type Width = 96 | 160 | 320 | 480 | 640 | 960 | 1280 | 1920;

// The stored URL behind `url` ("/uploads/..." or a bucket/CDN URL), or null
// for anything that isn't a stored upload (blob: previews, /vite.svg, ...).
function storedSource(url: string): string | null {
  if (url.startsWith(`${API_BASE_URL}/uploads/`)) return url.slice(API_BASE_URL.length);
  if (url.startsWith('/uploads/')) return url;
  if (/^https?:\/\//.test(url) && !url.startsWith(API_BASE_URL)) return url;
  return null;
}

// A WebP variant of a stored image, at most `width` px wide.
export function resizedUrl(url: string, width: Width): string {
  const source = storedSource(url);
  return source ? `${API_BASE_URL}/img?src=${encodeURIComponent(source)}&w=${width}` : url;
}

// src/srcSet for an <img>: the browser picks the smallest variant that's
// sharp at its rendered size (pair with a `sizes` attribute). Images that
// aren't stored uploads are passed through untouched.
export function responsiveImage(url: string, widths: Width[]): { src: string; srcSet?: string } {
  if (!storedSource(url)) return { src: url };
  return {
    src: resizedUrl(url, widths[Math.min(1, widths.length - 1)]),
    srcSet: widths.map(w => `${resizedUrl(url, w)} ${w}w`).join(', '),
  };
}
