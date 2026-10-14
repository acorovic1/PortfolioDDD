import { useState } from 'react';
import { CloseIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';
import { ARTWORK_MEDIUMS, CANVAS_EDGES, DEFAULT_CANVAS, type ArtworkMedium, type CanvasEdge, type CanvasSettings } from '@/frontend/three/easelCanvas';
import type { ArtworkKind } from '@/types/PortfolioPiece';
import '@/frontend/css/Community.css';
import '@/frontend/css/UploadDialog.css';

export type UploadOptions = {
  title: string;
  // 'now' = goes live once processed; 'schedule' = at publishAt.
  when: 'now' | 'draft' | 'schedule';
  publishAt?: string;
  // 2D and video artworks only.
  canvas?: CanvasSettings;
};

type UploadDialogProps = {
  fileName: string;
  // An image becomes a 2D artwork, a video a video artwork; both get the
  // canvas settings.
  kind?: ArtworkKind;
  // A local preview of the image or video.
  previewUrl?: string;
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

// The picked image (or playing video) as a small canvas, turned to show the
// chosen edge.
function CanvasPreview({ url, edge, video }: { url: string; edge: CanvasEdge; video: boolean }) {
  return (
    <div className="canvas-preview" aria-hidden="true">
      <div className="canvas-preview-board">
        {video
          ? <video src={url} className="canvas-preview-face" autoPlay muted loop playsInline />
          : <img src={url} alt="" className="canvas-preview-face" />}
        <span className={`canvas-preview-side ${edge}`} />
      </div>
    </div>
  );
}

// Asked right after a file is picked: its title and when it goes live, and
// for a 2D artwork how its canvas looks.
export default function UploadDialog({ fileName, kind = 'model', previewUrl, onSubmit, onCancel }: UploadDialogProps) {
  const { t } = useI18n();
  const isVideo = kind === 'video';
  // Both stand on an easel as a canvas.
  const isImage = kind === 'image' || isVideo;
  const dialogTitle = t(isVideo ? 'upload.titleVideo' : isImage ? 'upload.titleImage' : 'upload.title');
  const [title, setTitle] = useState(() => titleFromFileName(fileName));
  const [when, setWhen] = useState<UploadOptions['when']>('now');
  // Render stays pure: "now" is when the dialog opened. (A time that has
  // passed by the time it's submitted just publishes right away.)
  const [openedAt] = useState(() => Date.now());
  const [publishAt, setPublishAt] = useState(() => toLocalInput(new Date(openedAt + 86_400_000)));
  const [edge, setEdge] = useState<CanvasEdge>(DEFAULT_CANVAS.edge);
  const [medium, setMedium] = useState<ArtworkMedium | ''>('');

  const scheduleInPast = when === 'schedule' && new Date(publishAt).getTime() <= openedAt;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: title.trim() || t('common.untitled'),
      when,
      publishAt: when === 'schedule' ? new Date(publishAt).toISOString() : undefined,
      canvas: isImage
        ? { edge, medium: medium || null }
        : undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={dialogTitle}>
        <header>
          <h3>{dialogTitle}</h3>
          <button className="modal-close" onClick={onCancel} aria-label={t('common.close')}><CloseIcon /></button>
        </header>
        <form className="modal-form" onSubmit={submit}>
          <div className="modal-body">
            <p className="upload-dialog-file">{fileName}</p>
            <label className="form-field">
              {t('upload.name')}
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} autoFocus placeholder={t('common.untitled')} />
            </label>

            {isImage && (
              <fieldset className="upload-canvas">
                <legend>{t('upload.canvas')}</legend>
                <div className="upload-canvas-top">
                  {previewUrl && <CanvasPreview url={previewUrl} edge={edge} video={isVideo} />}
                  <div className="upload-canvas-edges">
                    <p className="upload-hint">{t(isVideo ? 'upload.canvasHintVideo' : 'upload.canvasHint')}</p>
                    <span className="upload-canvas-label" id="upload-edges">{t('upload.edges')}</span>
                    <div className="segmented" role="radiogroup" aria-labelledby="upload-edges">
                      {CANVAS_EDGES.map(value => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={edge === value}
                          className={edge === value ? 'active' : ''}
                          onClick={() => setEdge(value)}
                        >
                          {t(`canvas.edge.${value}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="form-field">
                  {t('upload.medium')}
                  <select value={medium} onChange={(e) => setMedium(e.target.value as ArtworkMedium | '')}>
                    <option value="">{t('upload.mediumNone')}</option>
                    {ARTWORK_MEDIUMS.map(value => <option key={value} value={value}>{t(`medium.${value}`)}</option>)}
                  </select>
                </label>
                <p className="upload-hint">{t(isVideo ? 'upload.videoHint' : 'upload.processHint')}</p>
              </fieldset>
            )}

            <fieldset className="report-reasons">
              <legend>{t('upload.when')}</legend>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'now'} onChange={() => setWhen('now')} />
                {t(isImage ? 'upload.nowImage' : 'upload.now')}
              </label>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'draft'} onChange={() => setWhen('draft')} />
                {t('upload.draft')}
              </label>
              <label className="form-check">
                <input type="radio" name="when" checked={when === 'schedule'} onChange={() => setWhen('schedule')} />
                {t('upload.schedule')}
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
            {scheduleInPast && <p className="form-error">{t('upload.pastTime')}</p>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onCancel}>{t('common.cancel')}</button>
            <button type="submit" className="btn primary" disabled={scheduleInPast || (when === 'schedule' && !publishAt)}>
              {t('upload.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
