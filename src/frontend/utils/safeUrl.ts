// Turns a user-entered link into something safe to put in an href: only
// http(s) URLs are allowed (no javascript:/data: links), and a bare
// "example.com" gets https:// added. Returns null when it isn't a web link.
// (Same rules as the server's profileUrl validation.)
export function safeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  // Browsers quietly percent-encode spaces in hosts; treat them as invalid.
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
    return isWeb && url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

// "https://www.artstation.com/someone/" -> "artstation.com/someone"
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

// For link inputs: empty is fine (removes the link), otherwise it must be a
// web address.
export function validateLink(value: string): string | null {
  return value.trim() === '' || safeUrl(value) ? null : 'Enter a web address, e.g. example.com';
}
