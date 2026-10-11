import { EyeIcon, PencilIcon } from '@/frontend/svg/Icons';
import { useI18n } from '@/frontend/hooks/useI18n';

type ViewModeToggleProps = {
  mode: 'view' | 'edit';
  onToggle: () => void;
};

export default function ViewModeToggle({ mode, onToggle }: ViewModeToggleProps) {
  const isEdit = mode === 'edit';
  const { t } = useI18n();

  return (
    <button
      className={`view-mode-toggle ${mode}`}
      onClick={onToggle}
      role="switch"
      aria-checked={isEdit}
      title={isEdit ? t('viewMode.toView') : t('viewMode.toEdit')}
    >
      <span className="view-mode-toggle-track">
        <span className="view-mode-toggle-thumb">
          {isEdit ? <PencilIcon width={11} height={11} /> : <EyeIcon width={11} height={11} />}
        </span>
      </span>
      <span>{isEdit ? t('viewMode.edit') : t('viewMode.view')}</span>
    </button>
  );
}
