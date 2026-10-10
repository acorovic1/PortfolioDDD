import { useState } from 'react';
import { CloseIcon } from '@/frontend/svg/Icons';
import '@/frontend/css/Community.css';

export type UploadOptions = {
  title: string;
  // 'now' = goes live once processed; 'schedule' = at publishAt.
  when: 'now' | 'draft' | 'schedule';
  publishAt?: string;
};

type UploadDialogProps = {
  fileName: string;
  onSubmit: (options: UploadOptions) => void;
  onCancel: () => void;
};

// "helmet_v2-final.glb" -> "Helmet v2 final"
function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : '';
}

// <input type="datetime-local"> works in local time without a zone.
function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

// Asked right after a model file is picked: its title and when it goes live.
export default function UploadDialog({ fileName, onSubmit, onCancel }: UploadDialogProps) {
  const [title, setTitle] = useState(() => titleFromFileName(fileName));
  const [when, setWhen] = useState<UploadOptions['when']>('now');
  // Render stays pure: "now" is when the dialog opened. (A time that has
  // passed by the time it's submitted just publishes right away.)
  const [openedAt] = useState(() => Date.now());
  const [publishAt, setPublishAt] = useState(() => toLocalInput(new Date(openedAt + 86_400_000)));

  const scheduleInPast = when === 'schedule' && new Date(publishAt).getTime() <= openedAt;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: title.trim() || 'Untitled',
      when,
      publishAt: when === 'schedule' ? new Date(publishAt).toISOString() : undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Upload a model">
        <header>
          <h3>Upload a model</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close"><CloseIcon /></button>
        </header>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="upload-dialog-file">{fileName}</p>
            <label className="form-field">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} autoFocus placeholder="Untitled" />
            </label>

            <fieldset className="report-reasons">
              <legend>When should it go live?</legend>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
                As soon as it has processed
              </label>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'draft'} onChange={() => setWhen('draft')} />
                Save as a draft - only you can see it until you publish it
              </label>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'schedule'} onChange={() => setWhen('schedule')} />
                Schedule it
              </label>
              {when === 'schedule' && (
                <input
                  type="datetime-local"
                  className="upload-dialog-schedule"
                  value={publishAt}
                  min={toLocalInput(new Date(openedAt))}
                  onChange={(e) => setPublishAt(e.target.value)}
                  required
                />
              )}
            </fieldset>
            {scheduleInPast && <p className="form-error">Pick a time in the future.</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn primary" disabled={scheduleInPast || (when === 'schedule' && !publishAt)}>
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
