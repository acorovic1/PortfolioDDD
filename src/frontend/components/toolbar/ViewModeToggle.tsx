import { EyeIcon, PencilIcon } from '@/frontend/svg/Icons';

type ViewModeToggleProps = {
  mode: 'view' | 'edit';
  onToggle: () => void;
};

export default function ViewModeToggle({ mode, onToggle }: ViewModeToggleProps) {
  const isEdit = mode === 'edit';

  return (
    <button
      className={`view-mode-toggle ${mode}`}
      onClick={onToggle}
      role="switch"
      aria-checked={isEdit}
      title={isEdit ? 'Switch to View Mode' : 'Switch to Edit Mode'}
    >
      <span className="view-mode-toggle-track">
        <span className="view-mode-toggle-thumb">
          {isEdit ? <PencilIcon width={11} height={11} /> : <EyeIcon width={11} height={11} />}
        </span>
      </span>
      <span>{isEdit ? 'Edit' : 'View'}</span>
    </button>
  );
}
