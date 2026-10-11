import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useModelJobs } from './useModelJobs';
import { pickModelFile, type RemoteArtwork } from '@/types/PortfolioPiece';
import { uploadModel, deleteArtwork } from '@/frontend/utils/modelUpload';
import { waitForModelProcessing } from '@/frontend/utils/modelProcessing';

vi.mock('@/types/PortfolioPiece', () => ({ pickModelFile: vi.fn() }));
vi.mock('@/frontend/utils/modelUpload', () => ({ uploadModel: vi.fn(), deleteArtwork: vi.fn() }));
vi.mock('@/frontend/utils/modelProcessing', () => ({ waitForModelProcessing: vi.fn() }));

const pick = vi.mocked(pickModelFile);
const upload = vi.mocked(uploadModel);
const remove = vi.mocked(deleteArtwork);
const waitForProcessing = vi.mocked(waitForModelProcessing);

const file = new File(['glb'], 'robot.glb');
const ready = { id: 'a1', title: 'Robot', processingStatus: 'ready' } as RemoteArtwork;
const failed = { id: 'a1', title: 'Robot', processingStatus: 'failed', processingError: 'Bad mesh' } as RemoteArtwork;

beforeEach(() => {
  vi.resetAllMocks();
  pick.mockResolvedValue(file);
});

// Starts uploadNewArtwork and answers its dialog.
async function uploadNew(result: { current: ReturnType<typeof useModelJobs> }, answer: Parameters<ReturnType<typeof useModelJobs>['answerUploadDialog']>[0]) {
  let promise!: Promise<RemoteArtwork | null>;
  act(() => { promise = result.current.uploadNewArtwork(); });
  await waitFor(() => expect(result.current.uploadRequest?.fileName).toBe('robot.glb'));
  act(() => result.current.answerUploadDialog(answer));
  let processed: RemoteArtwork | null = null;
  await act(async () => { processed = await promise; });
  return processed;
}

describe('useModelJobs', () => {
  it('uploads a new artwork with the chosen title and publishing options', async () => {
    upload.mockImplementation(async (options) => {
      options.onProgress?.(50);
      options.onProcessing?.();
      return ready;
    });
    const { result } = renderHook(() => useModelJobs('tok', true));

    const processed = await uploadNew(result, { title: 'Robot', when: 'draft' } as never);

    expect(processed).toBe(ready);
    const form = upload.mock.calls[0][0].formData;
    expect(form.get('title')).toBe('Robot');
    expect(form.get('draft')).toBe('true');
    // Left up until the caller has loaded the model.
    expect(result.current.notice).toEqual({ kind: 'processing', title: 'Robot' });
    expect(result.current.busy).toBe(true);

    act(() => result.current.finish());
    expect(result.current.notice).toBeNull();
  });

  it('does nothing when the dialog is cancelled', async () => {
    const { result } = renderHook(() => useModelJobs('tok', true));
    expect(await uploadNew(result, null)).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows a processing failure and deletes the empty artwork', async () => {
    upload.mockResolvedValue(failed);
    const { result } = renderHook(() => useModelJobs('tok', true));

    expect(await uploadNew(result, { title: 'Robot', when: 'now' } as never)).toBeNull();
    expect(result.current.notice).toEqual({ kind: 'error', title: 'Robot', message: 'Bad mesh' });
    expect(result.current.busy).toBe(false);
    expect(remove).toHaveBeenCalledWith('a1', 'tok');
  });

  it('keeps the previous version when a new version fails', async () => {
    upload.mockResolvedValue(failed);
    const { result } = renderHook(() => useModelJobs('tok', true));

    let processed: RemoteArtwork | null = ready;
    await act(async () => { processed = await result.current.uploadNewVersion('a1', 'Robot'); });

    expect(processed).toBeNull();
    expect(upload.mock.calls[0][0]).toMatchObject({ method: 'PUT', artworkId: 'a1' });
    expect(result.current.notice).toMatchObject({ kind: 'error', message: 'Bad mesh - the previous version is still live' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('shows a refused upload’s message', async () => {
    upload.mockRejectedValue(new Error('File too large'));
    const { result } = renderHook(() => useModelJobs('tok', true));

    await act(async () => { await result.current.uploadNewVersion('a1', 'Robot'); });
    expect(result.current.notice).toMatchObject({ kind: 'error', message: 'File too large' });
  });

  it('stays quiet when the scene unmounts mid-upload', async () => {
    upload.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const { result } = renderHook(() => useModelJobs('tok', true));

    await act(async () => { await result.current.uploadNewVersion('a1', 'Robot'); });
    expect(result.current.notice?.kind).not.toBe('error');
  });

  it('needs a signed-in user', async () => {
    const { result } = renderHook(() => useModelJobs(null, true));
    let processed: RemoteArtwork | null = ready;
    await act(async () => { processed = await result.current.uploadNewVersion('a1', 'Robot'); });
    expect(processed).toBeNull();
    expect(pick).not.toHaveBeenCalled();
  });

  it('waits for pending processing, and reports a failure to the owner', async () => {
    waitForProcessing.mockResolvedValueOnce(ready).mockResolvedValueOnce(failed);
    const { result } = renderHook(() => useModelJobs('tok', true));
    const signal = new AbortController().signal;

    let first: RemoteArtwork | null = null;
    await act(async () => { first = await result.current.waitUntilProcessed(ready, signal); });
    expect(first).toBe(ready);

    await act(async () => { await result.current.waitUntilProcessed(failed, signal); });
    expect(result.current.notice).toBeNull();
    expect(result.current.failedUploads).toEqual([{ id: 'a1', title: 'Robot', error: 'Bad mesh' }]);
  });

  it('only lists failures for the owner, and removes them on request', () => {
    const visitor = renderHook(() => useModelJobs('tok', false));
    act(() => visitor.result.current.reportFailed([failed]));
    expect(visitor.result.current.failedUploads).toEqual([]);

    const owner = renderHook(() => useModelJobs('tok', true));
    act(() => owner.result.current.reportFailed([failed]));
    act(() => owner.result.current.removeFailed('a1'));
    expect(owner.result.current.failedUploads).toEqual([]);
    expect(remove).toHaveBeenCalledWith('a1', 'tok');
  });
});
