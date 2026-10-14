import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/frontend/hooks/useI18n';
import { CloseIcon, ExitFullscreenIcon, FullscreenIcon } from '@/frontend/svg/Icons';
import { CANVAS_EDGES, type CanvasSettings } from '@/frontend/three/easelCanvas';
import { isVideoUrl, type PieceImage, type PortfolioImage } from '@/types/PortfolioPiece';
import VideoPlayer from '@/frontend/components/VideoPlayer';
import { formatVideoTime } from '@/frontend/utils/videoTime';
import ImageDeepZoom from './ImageDeepZoom';
import ProcessSteps from './ProcessSteps';
import '@/frontend/css/ImageViewer.css';

type ImageFocusViewerProps = {
  title: string;
  image: PieceImage;
  // The artwork's renders, shown as its process steps (oldest first).
  renders: PortfolioImage[];
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
  // Owner only: changes the canvas on the easel.
  onCanvasChange?: (canvas: CanvasSettings) => void;
  // Video artworks: where the player was when it closed, so the carousel
  // carries on from there.
  onVideoLeave?: (time: number) => void;
};

// Focus mode for a 2D artwork: the image flat on screen (perspective would
// soften the brushwork), zoomable to single pixels, and its process steps
// when the artist added any. A video artwork gets a video player instead.
export default function ImageFocusViewer({
  title, image, renders, isFullscreen, onToggleFullscreen, onClose, onCanvasChange, onVideoLeave,
}: ImageFocusViewerProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'artwork' | 'process'>('artwork');
  const { canvas, video } = image;
  // Process steps compare stills; video renders play in the render gallery.
  const stills = renders.filter(render => !isVideoUrl(render.url));
  // A video's final step is its poster frame.
  const finalStill = video ? video.posterUrl : image.url;
  const hasProcess = stills.length > 0 && !!finalStill;

  // Esc closes (the browser handles Esc for fullscreen itself).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // The 3D scene's wheel zoom listens on the container this sits in; keep
  // scrolling in here from reaching it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stop = (event: WheelEvent) => event.stopPropagation();
    root.addEventListener('wheel', stop);
    return () => root.removeEventListener('wheel', stop);
  }, []);

  const meta = [
    t('imageViewer.pixels', { width: image.width, height: image.height }),
    video ? formatVideoTime(video.duration) : null,
    canvas.medium ? t(`medium.${canvas.medium}`) : null,
  ].filter(Boolean).join(' · ');

  const steps = [
    ...stills.map(render => ({ label: render.caption, url: render.url })),
    { label: t('imageViewer.final'), url: finalStill ?? image.url },
  ];

  return (
    <div ref={rootRef} className="image-viewer" role="dialog" aria-label={t(video ? 'video.viewerLabel' : 'imageViewer.label')}>
      <header className="image-viewer-bar">
        <div className="image-viewer-title">
          <h3>{title || t('common.untitled')}</h3>
          <p>{meta}</p>
        </div>

        {hasProcess && (
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'artwork'} className={tab === 'artwork' ? 'active' : ''} onClick={() => setTab('artwork')}>
              {t('imageViewer.artwork')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'process'} className={tab === 'process' ? 'active' : ''} onClick={() => setTab('process')}>
              {t('imageViewer.process')} ({stills.length + 1})
            </button>
          </div>
        )}

        {onCanvasChange && (
          <div className="image-viewer-edges">
            <span id="viewer-edges">{t('imageViewer.edges')}</span>
            <div className="segmented" role="radiogroup" aria-labelledby="viewer-edges">
              {CANVAS_EDGES.map(edge => (
                <button
                  key={edge}
                  type="button"
                  role="radio"
                  aria-checked={canvas.edge === edge}
                  className={canvas.edge === edge ? 'active' : ''}
                  onClick={() => { if (canvas.edge !== edge) onCanvasChange({ ...canvas, edge }); }}
                >
                  {t(`canvas.edge.${edge}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="image-viewer-actions">
          <button
            type="button"
            className="viewer-btn icon"
            onClick={onToggleFullscreen}
            title={t(isFullscreen ? 'imageViewer.exitFullscreen' : 'imageViewer.fullscreen')}
            aria-label={t(isFullscreen ? 'imageViewer.exitFullscreen' : 'imageViewer.fullscreen')}
          >
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
          <button type="button" className="viewer-btn icon" onClick={onClose} title={t('imageViewer.close')} aria-label={t('imageViewer.close')}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="image-viewer-body">
        {tab === 'process' && hasProcess
          ? <ProcessSteps steps={steps} />
          : video
            ? (
              <VideoPlayer
                src={image.url}
                poster={video.posterUrl}
                label={title || t('common.untitled')}
                // Carries on from where it was playing in the carousel.
                startAt={video.element.currentTime}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
                onLeave={onVideoLeave}
              />
            )
            : <ImageDeepZoom url={image.url} width={image.width} height={image.height} />}
      </div>
    </div>
  );
}
