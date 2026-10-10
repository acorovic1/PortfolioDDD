import { API_BASE_URL } from '@/frontend/config/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
};

// JSON request to the backend. Throws ApiError with the server's `error`
// message on a non-2xx response.
export async function apiFetch<T>(path: string, { method = 'GET', token, body, signal }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// Full URL for a stored file: local uploads are paths on the API server
// ("/uploads/..."); files in S3/a CDN are already absolute URLs.
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`;
}

// Set by the server when the app is served from an artist's own domain
// (portfolio.example.com), whose root is their profile.
export const customDomainOwner: string | null =
  typeof document === 'undefined'
    ? null
    : document.querySelector('meta[name="portfolio-domain-owner"]')?.getAttribute('content') ?? null;

// A profile's address: /@username (or / for the owner of this custom domain).
export function profilePath(username: string): string {
  if (username === customDomainOwner) return '/';
  return `/@${encodeURIComponent(username)}`;
}

export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}
