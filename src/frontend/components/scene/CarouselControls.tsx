import { FocusIcon, CubeIcon } from '@/frontend/svg/Icons';

type CarouselControlsProps = {
  onRotateCounterClockwise: () => void;
  onRotateClockwise: () => void;
  onCenter: () => void;
  onInspect: () => void;
  canInspect: boolean;
};

// Buttons over the carousel, plus the mouse controls hint.
export default function CarouselControls({
  onRotateCounterClockwise, onRotateClockwise, onCenter, onInspect, canInspect,
}: CarouselControlsProps) {
  return (
    <>
      <div className="rotateButtons">
        <button onClick={onRotateCounterClockwise} title="Rotate carousel counter-clockwise">⟲</button>
        <button onClick={onRotateClockwise} title="Rotate carousel clockwise">⟳</button>
        <button onClick={onCenter} title="Center camera on active artwork">
          <FocusIcon />
        </button>
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
        <div>Drag to rotate view</div>
        <div>Right-click + drag to pan</div>
        <div>Ctrl + Scroll to zoom, or click here first</div>
        <div>Double-click the front model to inspect it</div>
      </div>
    </>
  );
}
