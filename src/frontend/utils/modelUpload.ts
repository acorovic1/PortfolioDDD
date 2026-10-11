import { API_BASE_URL } from '@/frontend/config/api';
import type { RemoteArtwork } from '@/types/PortfolioPiece';
import { uploadWithProgress } from './uploadWithProgress';
import { waitForModelProcessing } from './modelProcessing';

type UploadModelOptions = {
  // API path to send the form to: POST creates an artwork, PUT replaces the
  // model of `artworkId`.
  path: string;
  method?: 'POST' | 'PUT';
  artworkId?: string;
  formData: FormData;
  token: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  onProcessing?: () => void;
};

// Uploads a model, then waits for the server to convert/optimize it - the
// scene only ever loads the processed GLB. Resolves with the final artwork
// record (processingStatus 'ready' or 'failed'); rejects when the server
// refuses the upload, on network errors, or when `signal` is aborted.
export async function uploadModel({
  path, method = 'POST', artworkId, formData, token, signal, onProgress, onProcessing,
}: UploadModelOptions): Promise<RemoteArtwork> {
  const res = await uploadWithProgress(
    `${API_BASE_URL}${path}`,
    formData,
    { Authorization: `Bearer ${token}` },
    onProgress,
    method
  );
  if (!res.ok) {
    throw new Error((res.body as { error?: string } | null)?.error ?? `Upload failed (${res.status})`);
  }

  onProcessing?.();
  const id = artworkId ?? (res.body as RemoteArtwork).id;
  return waitForModelProcessing(id, token, signal);
}

// Fire-and-forget delete, e.g. for an artwork whose first upload failed.
export function deleteArtwork(id: string, token: string): void {
  fetch(`${API_BASE_URL}/api/portfolio/artworks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(err => console.error('Failed to delete the artwork:', err));
}
