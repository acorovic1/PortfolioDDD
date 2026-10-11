// Background model work shown in the scene overlay: an upload in flight,
// server-side processing, or a failure the owner should know about.
export type ModelJobNotice =
  | { kind: 'uploading'; title: string; progress: number }
  | { kind: 'processing'; title: string }
  | { kind: 'error'; title: string; message: string };

// First uploads that failed to process: the artwork has no model to show, so
// it's surfaced in a notice (with a way to remove it) instead of the carousel.
export type FailedUpload = { id: string; title: string; error: string };

type ModelJobOverlayProps = {
  notice: ModelJobNotice | null;
  failedUploads: FailedUpload[];
  onDismiss: () => void;
  onRemoveFailed: (id: string) => void;
};

export default function ModelJobOverlay({ notice, failedUploads, onDismiss, onRemoveFailed }: ModelJobOverlayProps) {
  if (notice) {
    return (
      <div className={`upload-progress-overlay ${notice.kind === 'error' ? 'error' : ''}`} role="status">
        {notice.kind === 'uploading' && (
          <>
            <div className="upload-progress-label">Uploading “{notice.title}”… {notice.progress}%</div>
            <div className="upload-progress-track">
              <div className="upload-progress-fill" style={{ width: `${notice.progress}%` }} />
            </div>
          </>
        )}
        {notice.kind === 'processing' && (
          <>
            <div className="upload-progress-label">Processing “{notice.title}”…</div>
            <div className="upload-progress-hint">Converting and optimizing the model on the server</div>
            <div className="upload-progress-track">
              <div className="upload-progress-fill indeterminate" />
            </div>
          </>
        )}
        {notice.kind === 'error' && (
          <>
            <div className="upload-progress-label">Couldn't process “{notice.title}”</div>
            <div className="upload-progress-hint">{notice.message}</div>
            <button className="upload-progress-dismiss" onClick={onDismiss}>Dismiss</button>
          </>
        )}
      </div>
    );
  }

  if (failedUploads.length === 0) return null;

  return (
    <div className="upload-progress-overlay error" role="alert">
      <div className="upload-progress-label">
        {failedUploads.length === 1 ? 'An upload' : `${failedUploads.length} uploads`} failed to process
      </div>
      {failedUploads.map(f => (
        <div key={f.id} className="failed-upload-row">
          <span title={f.error}><strong>{f.title || 'Untitled'}</strong> — {f.error}</span>
          <button className="upload-progress-dismiss" onClick={() => onRemoveFailed(f.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
