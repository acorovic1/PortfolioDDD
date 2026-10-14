import { FocusIcon, CubeIcon, PlayIcon, PauseIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';

type CarouselControlsProps = {
  onRotateCounterClockwise: () => void;
  onRotateClockwise: () => void;
  onCenter: () => void;
  onInspect: () => void;
  canInspect: boolean;
  // Edit mode with several models: they can be dragged into a new order.
  canReorder?: boolean;
  // Set when the front artwork is a video: pauses or resumes it.
  video?: { playing: boolean; toggle: () => void };
};

// Buttons over the carousel, plus the mouse controls hint.
export default function CarouselControls({
  onRotateCounterClockwise, onRotateClockwise, onCenter, onInspect, canInspect, canReorder = false, video,
}: CarouselControlsProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="rotateButtons">
        <button onClick={onRotateCounterClockwise} title="Rotate carousel counter-clockwise">⟲</button>
        <button onClick={onRotateClockwise} title="Rotate carousel clockwise">⟳</button>
        <button onClick={onCenter} title="Center camera on active artwork">
          <FocusIcon />
        </button>
        {video && (
          <button
            onClick={video.toggle}
            title={t(video.playing ? 'video.pause' : 'video.play')}
            aria-label={t(video.playing ? 'video.pause' : 'video.play')}
          >
            {video.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
        )}
        <button
          className="inspect-btn"
          onClick={onInspect}
          disabled={!canInspect}
          title="Inspect the front model (or double-click it)"
        >
          <CubeIcon />
          Inspect
        </button>
      </div>

      <div className="controls-hint">
        {canReorder && <div>Drag a model sideways to reorder</div>}
        <div>Drag to rotate view</div>
        <div>Right-click + drag to pan</div>
        <div>Ctrl + Scroll to zoom, or click here first</div>
        <div>Double-click the front model to inspect it</div>
      </div>
    </>
  );
}
