import { GizmoIcon, ResetViewIcon } from '@/frontend/svg/Icons';

type ModelToolbarProps = {
  // The rotate gizmo on the front model.
  rotating: boolean;
  onToggleRotate: () => void;
  onResetRotation: () => void;
  disabled: boolean;
};

// Edit-mode tools for the front model, kept apart from the carousel controls.
export default function ModelToolbar({ rotating, onToggleRotate, onResetRotation, disabled }: ModelToolbarProps) {
  return (
    <div className="model-toolbar" role="toolbar" aria-label="Model tools">
      <button
        className={rotating ? 'active' : undefined}
        onClick={onToggleRotate}
        disabled={disabled}
        aria-pressed={rotating}
        title="Rotate the front model with a gizmo"
      >
        <GizmoIcon />
        <span>Rotate model</span>
      </button>
      {rotating && (
        <>
          <button onClick={onResetRotation} title="Reset model rotation">
            <ResetViewIcon />
            <span>Reset</span>
          </button>
          <span className="model-toolbar-hint">Drag the rings · saved automatically</span>
        </>
      )}
    </div>
  );
}
