import { useEffect, useState } from 'react';
import ConfirmDialog from '@/frontend/components/ConfirmDialog';
import { useI18n } from '@/frontend/hooks/useI18n';
import { isVideoFile } from '@/types/PortfolioPiece';

// "turntable_final-v2.png" -> "Turntable final v2"
function captionFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : '';
}

type AddRenderDialogProps = {
  file: File;
  onAdd: (caption: string) => Promise<void> | void;
  onClose: () => void;
};

// Shows a picked render (image or video) and asks for its caption before
// uploading it.
export default function AddRenderDialog({ file, onAdd, onClose }: AddRenderDialogProps) {
  const { t } = useI18n();
  const video = isVideoFile(file);
  const [caption, setCaption] = useState(() => captionFromFileName(file.name));
  // A local preview, let go of when the card closes.
  const [previewUrl] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <ConfirmDialog
      title={t(video ? 'addRender.titleVideo' : 'addRender.title')}
      confirmLabel={t('addRender.confirm')}
      busyLabel={t('addRender.busy')}
      initialFocus="field"
      onConfirm={() => onAdd(caption.trim() || t('common.untitled'))}
      onClose={onClose}
    >
      {video
        ? <video className="confirm-media-preview" src={previewUrl} autoPlay muted loop playsInline />
        : <img className="confirm-media-preview" src={previewUrl} alt="" />}
      <label className="confirm-field">
        {t('addRender.caption')}
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={255} placeholder={t('common.untitled')} />
      </label>
    </ConfirmDialog>
  );
}
