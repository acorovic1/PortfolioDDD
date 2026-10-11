import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadModel } from './modelUpload';
import { uploadWithProgress } from './uploadWithProgress';
import { waitForModelProcessing } from './modelProcessing';
import type { RemoteArtwork } from '@/types/PortfolioPiece';

vi.mock('./uploadWithProgress', () => ({ uploadWithProgress: vi.fn() }));
vi.mock('./modelProcessing', () => ({ waitForModelProcessing: vi.fn() }));

const upload = vi.mocked(uploadWithProgress);
const waitForProcessing = vi.mocked(waitForModelProcessing);
const processed = { id: 'art-1', processingStatus: 'ready' } as RemoteArtwork;

beforeEach(() => {
  upload.mockReset();
  waitForProcessing.mockReset().mockResolvedValue(processed);
});

describe('uploadModel', () => {
  it('uploads, reports progress, then waits for the created artwork to be processed', async () => {
    upload.mockImplementation(async (_url, _form, _headers, onProgress) => {
      onProgress?.(40);
      return { ok: true, status: 201, body: { id: 'art-1' } };
    });
    const onProgress = vi.fn();
    const onProcessing = vi.fn();
    const signal = new AbortController().signal;

    const result = await uploadModel({
      path: '/api/portfolio/artworks', formData: new FormData(), token: 't0k', signal, onProgress, onProcessing,
    });

    expect(result).toBe(processed);
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/portfolio\/artworks$/),
      expect.any(FormData),
      { Authorization: 'Bearer t0k' },
      onProgress,
      'POST'
    );
    expect(onProgress).toHaveBeenCalledWith(40);
    expect(onProcessing).toHaveBeenCalledOnce();
    expect(waitForProcessing).toHaveBeenCalledWith('art-1', 't0k', signal);
  });

  it('waits on the given artwork when replacing its model', async () => {
    upload.mockResolvedValue({ ok: true, status: 202, body: null });

    await uploadModel({
      path: '/api/portfolio/artworks/art-9/model', method: 'PUT', artworkId: 'art-9', formData: new FormData(), token: 't',
    });

    expect(upload.mock.calls[0][4]).toBe('PUT');
    expect(waitForProcessing).toHaveBeenCalledWith('art-9', 't', undefined);
  });

  it('rejects with the server’s message when the upload is refused', async () => {
    upload.mockResolvedValue({ ok: false, status: 413, body: { error: 'File too large' } });
    const onProcessing = vi.fn();

    await expect(uploadModel({ path: '/x', formData: new FormData(), token: 't', onProcessing }))
      .rejects.toThrow('File too large');
    expect(onProcessing).not.toHaveBeenCalled();
    expect(waitForProcessing).not.toHaveBeenCalled();
  });

  it('falls back to the status code when the server gives no message', async () => {
    upload.mockResolvedValue({ ok: false, status: 500, body: null });
    await expect(uploadModel({ path: '/x', formData: new FormData(), token: 't' }))
      .rejects.toThrow('Upload failed (500)');
  });
});
