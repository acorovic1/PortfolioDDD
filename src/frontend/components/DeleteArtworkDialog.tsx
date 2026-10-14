import ConfirmDialog from '@/frontend/components/ConfirmDialog';
import { useI18n } from '@/frontend/hooks/useI18n';
import { assetUrl } from '@/frontend/utils/api';
import { resizedUrl } from '@/frontend/utils/images';
import { CubeIcon } from '@/frontend/svg/Icons';
import type { PortfolioPiece } from '@/types/PortfolioPiece';

// A still of the artwork: a model's thumbnail, a 2D artwork's image or a
// video's poster frame.
function previewUrl(piece: PortfolioPiece): string | null {
  const url = piece.image
    ? (piece.image.video ? piece.image.video.posterUrl : piece.image.url)
    : assetUrl(piece.modelInfo?.thumbnailUrl);
  return url ? resizedUrl(url, 160) : null;
}

type DeleteArtworkDialogProps = {
  artwork: PortfolioPiece;
  // When they're loaded (unknown counts aren't shown).
  commentCount?: number;
  onDelete: () => Promise<void>;
  onClose: () => void;
};

// Asks before deleting an artwork for good, showing which one and what
// goes with it.
export default function DeleteArtworkDialog({ artwork, commentCount, onDelete, onClose }: DeleteArtworkDialogProps) {
  const { t, tp } = useI18n();
  const title = artwork.infoData.title || t('common.untitled');
  const preview = previewUrl(artwork);
  const facts = [
    tp('deleteArtwork.renders', artwork.renders.length),
    tp('deleteArtwork.likes', artwork.likeCount),
    commentCount !== undefined ? tp('deleteArtwork.comments', commentCount) : null,
  ].filter(Boolean).join(' · ');

  return (
    <ConfirmDialog
      title={t('deleteArtwork.title')}
      confirmLabel={t('deleteArtwork.confirm')}
      busyLabel={t('deleteArtwork.busy')}
      danger
      onConfirm={onDelete}
      onClose={onClose}
    >
      <div className="confirm-artwork">
        {preview
          ? <img className="confirm-artwork-thumb" src={preview} alt="" />
          : <span className="confirm-artwork-thumb placeholder" aria-hidden="true"><CubeIcon /></span>}
        <div className="confirm-artwork-text">
          <strong>{title}</strong>
          <span>{facts}</span>
        </div>
      </div>
      <p className="confirm-warning">{t('deleteArtwork.warning')}</p>
    </ConfirmDialog>
  );
}
